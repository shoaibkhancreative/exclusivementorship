import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getFreeLessonCount } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import {
  canAccessLesson,
  computeNextCurrentLesson,
  lessonState,
  lockReasonForLesson,
  shouldShowPremiumGate
} from "../lib/course";
import { listChapters, logAuditEvent, checkRateLimit } from "../db";
import { RATE_LIMITS } from "../lib/config";
import { isBunnyEmbedUrl, signBunnyEmbedUrl, VIDEO_TOKEN_TTL_SECONDS } from "../lib/bunny";
import { getCached, CACHE_KEYS } from "../lib/cache";

export const lessonRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface LessonRow {
  id: number;
  lesson_number: number;
  title: string;
  chapter_name: string;
  thumbnail_url: string | null;
  video_embed_url: string | null;
  description: string | null;
  tagline: string | null;
  is_free: number;
  is_active: number;
  sort_order: number;
  watermark_enabled: number;
  duration_label: string | null;
}

interface ProgressRow {
  lesson_id: number;
  video_completed: number;
}

lessonRoutes.get("/", async (c) => {
  const user = c.get("user");
  const { lessons, chapters, freeLessonCount } = await getCached(c.env, CACHE_KEYS.lessonsOutline, async () => {
    const [lessonsResult, chaptersResult, freeLessonCountResult] = await Promise.all([
      c.env.DB.prepare("SELECT * FROM lessons WHERE is_active = 1 ORDER BY sort_order ASC").all<LessonRow>(),
      listChapters(c.env),
      getFreeLessonCount(c.env)
    ]);
    return { lessons: lessonsResult.results, chapters: chaptersResult, freeLessonCount: freeLessonCountResult };
  });

  let progressByLessonId = new Map<number, ProgressRow>();
  if (user) {
    const progress = await c.env.DB.prepare("SELECT lesson_id, video_completed FROM lesson_progress WHERE user_id = ?")
      .bind(user.id)
      .all<ProgressRow>();
    progressByLessonId = new Map(progress.results.map((p) => [p.lesson_id, p]));
  }

  const currentLesson = user?.current_lesson ?? 1;
  const courseStatus = user?.course_status ?? "free";

  const outline = lessons.map((lesson) => {
    const progress = progressByLessonId.get(lesson.id);
    const completed = Boolean(progress?.video_completed);
    const state = lessonState(lesson.lesson_number, completed, {
      lessonNumber: lesson.lesson_number,
      currentLesson,
      courseStatus,
      freeLessonCount
    });
    return {
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      thumbnailUrl: lesson.thumbnail_url,
      durationLabel: lesson.duration_label,
      isFree: lesson.lesson_number <= freeLessonCount,
      state
    };
  });

  return c.json({
    outline,
    currentLesson,
    courseStatus,
    freeLessonCount,
    semesters: chapters.map((ch) => ({
      number: ch.sort_order,
      chapterName: ch.name,
      name: ch.name,
      tagline: ch.tagline ?? ""
    }))
  });
});

lessonRoutes.get("/:number", async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const lesson = await c.env.DB.prepare("SELECT * FROM lessons WHERE lesson_number = ? AND is_active = 1")
    .bind(lessonNumber)
    .first<LessonRow>();

  if (!lesson) return c.json({ error: "not_found" }, 404);

  const user = c.get("user");
  const currentLesson = user?.current_lesson ?? 1;
  const courseStatus = user?.course_status ?? "free";
  const freeLessonCount = await getFreeLessonCount(c.env);

  const lockReason = lockReasonForLesson({ lessonNumber, currentLesson, courseStatus, freeLessonCount });

  if (lockReason) {
    return c.json({
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      description: null,
      thumbnailUrl: lesson.thumbnail_url,
      durationLabel: lesson.duration_label,
      // Phase 3: never expose the raw Bunny embed URL in a locked-lesson
      // response. (It was already null here in Phase 1/2 due to the lockReason
      // guard, but stated explicitly for auditability.)
      videoEmbedUrl: null,
      videoCompleted: false,
      isLastFreeLesson: false,
      isLocked: true,
      lockReason,
      watermarkEnabled: Boolean(lesson.watermark_enabled)
    });
  }

  let progress: ProgressRow | null = null;
  if (user) {
    progress = await c.env.DB.prepare(
      "SELECT lesson_id, video_completed FROM lesson_progress WHERE user_id = ? AND lesson_id = ?"
    )
      .bind(user.id, lesson.id)
      .first<ProgressRow>();
  }

  // Phase 3: never send the raw Bunny embed URL to the client in GET /lessons/:number.
  // The client must call POST /lessons/:number/video-token to get a short-lived
  // signed URL.  Sending the raw URL here would let any authenticated user
  // (even a browser session) copy it from the Network tab and construct their
  // own signed URL offline.
  //
  // We still expose a boolean flag `hasBunnyVideo` so the client knows to
  // show a video player UI and fetch the token when the user presses Play.
  const hasBunnyVideo = Boolean(lesson.video_embed_url && isBunnyEmbedUrl(lesson.video_embed_url));

  return c.json({
    lessonNumber: lesson.lesson_number,
    title: lesson.title,
    chapterName: lesson.chapter_name,
    tagline: lesson.tagline,
    description: lesson.description,
    thumbnailUrl: lesson.thumbnail_url,
    durationLabel: lesson.duration_label,
    // videoEmbedUrl is intentionally omitted — clients must use /video-token.
    hasBunnyVideo,
    videoCompleted: Boolean(progress?.video_completed),
    isLastFreeLesson: lessonNumber === freeLessonCount,
    isLocked: false,
    lockReason: null,
    watermarkEnabled: Boolean(lesson.watermark_enabled)
  });
});

// POST /lessons/:number/video-token
//
// Phase 3 hardening:
//   1. Paid users: only app sessions receive a token (browser sessions get a
//      distinct error code the client maps to the "download the app" modal).
//      Free-lesson tokens continue to be issued regardless of platform so
//      that new visitors can preview content in their browser.
//   2. The raw Bunny embed URL is never returned; only the signed URL with a
//      short TTL (VIDEO_TOKEN_TTL_SECONDS = 5 min) is returned.
//   3. The signed URL is returned once and never cached server-side — each
//      play tap generates a fresh token, so there is no stable URL to share.
//   4. App sessions additionally must send the X-Device-Trusted: true header
//      (set by VideoStage.tsx after calling DeviceIdentityPlugin.getDeviceId()
//      and checking isTrusted).  This is a best-effort client-reported signal
//      — it is NOT a cryptographic proof — but it adds another layer of
//      friction and creates an audit trail (see the logAuditEvent call below).
//
// Security limitations (honest accounting):
//   - The signed URL is still visible in the app's webview Network traffic if
//     a dev build / USB debugging is active and DevTools are attached.  This
//     is mitigated by the short TTL and the isTrusted check that rejects
//     debuggable builds.
//   - A rooted device running Magisk DenyList can hide root from our
//     SecurityChecks.kt heuristics, so isTrusted can be spoofed at the OS
//     level.  Play Integrity (planned for Phase 4) would largely close this
//     gap.  FLAG_SECURE (Phase 2) makes screen-recording harder but is not
//     immune to hardware capture methods.
//   - Even with all checks passing, Bunny Stream does not support per-segment
//     token signing on the non-enterprise tier, so once the player is
//     bootstrapped with a valid signed URL the HLS segments themselves are
//     fetched without per-request re-validation.
lessonRoutes.post("/:number/video-token", requireAuth, async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const user = c.get("user")!;
  const sessionPlatform = c.get("sessionPlatform");

  const rate = await checkRateLimit(c.env, `video_token:user:${user.id}`, RATE_LIMITS.videoTokenPerUserPerHour, 3600);
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Too many requests. Please try again shortly." }, 429);
  }

  const lesson = await c.env.DB.prepare(
    "SELECT id, video_embed_url, is_free FROM lessons WHERE lesson_number = ? AND is_active = 1"
  )
    .bind(lessonNumber)
    .first<{ id: number; video_embed_url: string | null; is_free: number }>();
  if (!lesson) return c.json({ error: "not_found" }, 404);

  const freeLessonCount = await getFreeLessonCount(c.env);
  const allowed = canAccessLesson({
    lessonNumber,
    currentLesson: user.current_lesson,
    courseStatus: user.course_status,
    freeLessonCount
  });
  if (!allowed) return c.json({ error: "locked", message: "This lesson isn't unlocked yet." }, 403);

  if (!lesson.video_embed_url || !isBunnyEmbedUrl(lesson.video_embed_url)) {
    return c.json({ error: "not_bunny_video", message: "This lesson doesn't use a signed video." }, 400);
  }

  // Phase 3: Paid lessons require an app session.
  //
  // Free / preview lessons are served regardless of platform so that
  // visitors can evaluate the course in their browser before enrolling.
  // Once a user is paid, every gated lesson is app-only.
  const isPaidLesson = lessonNumber > freeLessonCount;
  if (isPaidLesson && user.course_status === "paid" && sessionPlatform !== "app") {
    await logAuditEvent(c.env, "video_token_denied_browser", {
      userId: user.id,
      metadata: { lessonNumber, reason: "paid_lesson_requires_app_session" }
    });
    return c.json(
      {
        error: "app_required",
        message: "Paid lessons can only be played in the app. Please download the app to continue."
      },
      403
    );
  }

  // Phase 3: Within an app session, also check the client-reported device
  // trust signal (X-Device-Trusted header set by VideoStage.tsx only when
  // DeviceIdentityPlugin.getDeviceId() returns isTrusted === true).
  //
  // This is a *best-effort* check — a patched client can always send the
  // header regardless of the actual device state.  Its value is:
  //   a) It forces even a lightly-modified app to actively lie, rather than
  //      just omit a check.
  //   b) It generates a distinct audit event for untrusted devices so we can
  //      monitor for anomalies.
  //   c) It is consistent with the front-end guard in VideoStage.tsx that
  //      refuses to call fetchToken() at all for untrusted devices —
  //      the server-side check closes the gap for modified clients that
  //      bypass the front-end guard.
  if (isPaidLesson && sessionPlatform === "app") {
    const deviceTrusted = c.req.header("X-Device-Trusted");
    if (deviceTrusted !== "true") {
      await logAuditEvent(c.env, "video_token_denied_untrusted_device", {
        userId: user.id,
        metadata: { lessonNumber, reason: "device_not_trusted" }
      });
      return c.json(
        {
          error: "device_not_trusted",
          message: "Video playback is not available on this device."
        },
        403
      );
    }
  }

  let signedEmbedUrl: string;
  try {
    signedEmbedUrl = await signBunnyEmbedUrl(c.env, lesson.video_embed_url);
  } catch {
    return c.json({ error: "video_unavailable", message: "This video can't be played right now." }, 500);
  }

  await logAuditEvent(c.env, "video_token_issued", {
    userId: user.id,
    metadata: { lessonNumber, platform: sessionPlatform }
  });

  return c.json({ embedUrl: signedEmbedUrl, expiresInSeconds: VIDEO_TOKEN_TTL_SECONDS });
});

lessonRoutes.post("/:number/complete-video", requireAuth, async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  const user = c.get("user")!;
  const freeLessonCount = await getFreeLessonCount(c.env);

  const lesson = await c.env.DB.prepare("SELECT id FROM lessons WHERE lesson_number = ? AND is_active = 1")
    .bind(lessonNumber)
    .first<{ id: number }>();
  if (!lesson) return c.json({ error: "not_found" }, 404);

  const allowed = canAccessLesson({
    lessonNumber,
    currentLesson: user.current_lesson,
    courseStatus: user.course_status,
    freeLessonCount
  });
  if (!allowed) return c.json({ error: "locked" }, 403);

  await c.env.DB.prepare(
    `INSERT INTO lesson_progress (user_id, lesson_id, video_completed, completed_at, updated_at)
     VALUES (?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET video_completed = 1, completed_at = datetime('now'), updated_at = datetime('now')`
  )
    .bind(user.id, lesson.id)
    .run();

  const nextCurrentLesson = computeNextCurrentLesson(lessonNumber, user.current_lesson);
  await c.env.DB.prepare("UPDATE users SET current_lesson = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(nextCurrentLesson, user.id)
    .run();

  await logAuditEvent(c.env, "video_completed", {
    userId: user.id,
    metadata: { lessonNumber }
  });

  return c.json({
    ok: true,
    nextLessonNumber: nextCurrentLesson,
    showPremiumGate: shouldShowPremiumGate(lessonNumber, user.course_status, freeLessonCount)
  });
});
