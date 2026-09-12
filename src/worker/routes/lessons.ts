import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getFreeLessonCount } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import { canAccessLesson, computeNextCurrentLesson, lessonState, lockReasonForLesson, shouldShowPremiumGate } from "../lib/course";
import { listChapters, logAuditEvent, checkRateLimit } from "../db";
import { RATE_LIMITS } from "../lib/config";
import { isBunnyEmbedUrl, signBunnyEmbedUrl, VIDEO_TOKEN_TTL_SECONDS } from "../lib/bunny";

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
  /** Admin-entered display label like "12:45" — see migration 0018. Never auto-detected. */
  duration_label: string | null;
}

interface ProgressRow {
  lesson_id: number;
  video_completed: number;
}

/** Public outline — safe for logged-out visitors too. */
lessonRoutes.get("/", async (c) => {
  const user = c.get("user");
  const [lessons, chapters, freeLessonCount] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM lessons WHERE is_active = 1 ORDER BY sort_order ASC").all<LessonRow>(),
    listChapters(c.env),
    getFreeLessonCount(c.env)
  ]);

  let progressByLessonId = new Map<number, ProgressRow>();
  if (user) {
    const progress = await c.env.DB.prepare(
      "SELECT lesson_id, video_completed FROM lesson_progress WHERE user_id = ?"
    )
      .bind(user.id)
      .all<ProgressRow>();
    progressByLessonId = new Map(progress.results.map((p) => [p.lesson_id, p]));
  }

  const currentLesson = user?.current_lesson ?? 1;
  const courseStatus = user?.course_status ?? "free";

  const outline = lessons.results.map((lesson) => {
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
    semesters: chapters.map((ch) => ({ number: ch.sort_order, chapterName: ch.name, name: ch.name, tagline: ch.tagline ?? "" }))
  });
});

/** Single lesson detail — server enforces access, never trusts the client. */
lessonRoutes.get("/:number", async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const lesson = await c.env.DB.prepare(
    "SELECT * FROM lessons WHERE lesson_number = ? AND is_active = 1"
  )
    .bind(lessonNumber)
    .first<LessonRow>();

  if (!lesson) return c.json({ error: "not_found" }, 404);

  const user = c.get("user");
  const currentLesson = user?.current_lesson ?? 1;
  const courseStatus = user?.course_status ?? "free";
  const freeLessonCount = await getFreeLessonCount(c.env);

  const lockReason = lockReasonForLesson({ lessonNumber, currentLesson, courseStatus, freeLessonCount });

  // Every lesson's page is openable — including ones the learner can't
  // watch yet — so the outline can link straight to it, with the class's
  // thumbnail and title visible and a locked overlay explaining why (finish
  // the previous class, or unlock the mentorship). No real video content
  // (embedUrl, signed token) or lesson description is ever included here
  // when locked — those still require canAccessLesson to pass, re-checked
  // independently by /video-token and /complete-video below. Nothing here
  // is more than what the public outline (GET /) already exposes for every
  // lesson regardless of lock state.
  if (lockReason) {
    return c.json({
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      description: null,
      thumbnailUrl: lesson.thumbnail_url,
      durationLabel: lesson.duration_label,
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

  return c.json({
    lessonNumber: lesson.lesson_number,
    title: lesson.title,
    chapterName: lesson.chapter_name,
    tagline: lesson.tagline,
    description: lesson.description,
    thumbnailUrl: lesson.thumbnail_url,
    durationLabel: lesson.duration_label,
    videoEmbedUrl: lesson.video_embed_url,
    videoCompleted: Boolean(progress?.video_completed),
    isLastFreeLesson: lessonNumber === freeLessonCount,
    isLocked: false,
    lockReason: null,
    watermarkEnabled: Boolean(lesson.watermark_enabled)
  });
});

/**
 * Issues a short-lived, signed Bunny Stream embed URL for `lessonNumber`.
 *
 * The client sends a lesson number, never a raw Bunny video ID — so there
 * is nothing here for a caller to probe for someone else's video ID. This
 * route re-runs the exact same `canAccessLesson` check as GET /:number
 * independently (it does not trust that the client already saw the video
 * through that route), so a signed link can never be minted for a lesson
 * the requesting user isn't actually allowed to watch. Rate-limited per
 * user on top of that as defense in depth. The security key itself never
 * enters the response, is never logged, and — on any signing failure — the
 * client gets a generic "video_unavailable" error rather than a hint about
 * what went wrong.
 */
lessonRoutes.post("/:number/video-token", requireAuth, async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  if (!Number.isInteger(lessonNumber) || lessonNumber < 1) {
    return c.json({ error: "not_found" }, 404);
  }

  const user = c.get("user")!;

  const rate = await checkRateLimit(
    c.env,
    `video_token:user:${user.id}`,
    RATE_LIMITS.videoTokenPerUserPerHour,
    3600
  );
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Too many requests. Please try again shortly." }, 429);
  }

  const lesson = await c.env.DB.prepare(
    "SELECT id, video_embed_url FROM lessons WHERE lesson_number = ? AND is_active = 1"
  )
    .bind(lessonNumber)
    .first<{ id: number; video_embed_url: string | null }>();
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
    // Not every lesson is Bunny-hosted (some use YouTube) — the frontend
    // should only call this endpoint for lessons whose embedUrl is a Bunny
    // URL, so reaching this branch means something upstream is confused,
    // not a security issue.
    return c.json({ error: "not_bunny_video", message: "This lesson doesn't use a signed video." }, 400);
  }

  let signedEmbedUrl: string;
  try {
    signedEmbedUrl = await signBunnyEmbedUrl(c.env, lesson.video_embed_url);
  } catch {
    return c.json({ error: "video_unavailable", message: "This video can't be played right now." }, 500);
  }

  await logAuditEvent(c.env, "video_token_issued", { userId: user.id, metadata: { lessonNumber } });

  return c.json({ embedUrl: signedEmbedUrl, expiresInSeconds: VIDEO_TOKEN_TTL_SECONDS });
});

/**
 * Marks the video for `lessonNumber` as watched to the end, and — this is
 * the entire "must finish this video before moving on" mechanism — is the
 * ONLY thing that advances `users.current_lesson`. The client only calls
 * this once its player actually reports the video ended (YouTube's IFrame
 * API "ended" state, or Bunny.net's player.js "ended" event — see
 * Lesson.tsx), never on page load. As with every other lesson route, the
 * server still re-checks `canAccessLesson` itself — a client that calls
 * this out of turn cannot unlock anything it wasn't already allowed to
 * reach.
 */
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
