import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getFreeLessonCount } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import { canAccessLesson, computeNextCurrentLesson, lessonState, shouldShowPremiumGate } from "../lib/course";
import { listChapters, logAuditEvent } from "../db";

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

  const allowed = canAccessLesson({ lessonNumber, currentLesson, courseStatus, freeLessonCount });

  // A premium class the learner has sequentially reached (finished
  // everything before it) but hasn't paid for yet is still openable — just
  // as a locked preview (thumbnail + unlock prompt, no real video sent to
  // the client) rather than a dead-end 403. This is what lets "Next" stay
  // clickable right after the last free class, for every premium class,
  // not just one hardcoded lesson.
  const sequentiallyReached = lessonNumber <= currentLesson;
  const isPreviewGate = !allowed && sequentiallyReached && courseStatus !== "paid";

  if (!allowed && !isPreviewGate) {
    const reason = lessonNumber > freeLessonCount && courseStatus !== "paid" ? "payment_required" : "locked";
    return c.json({ error: reason, message: "This lesson isn't unlocked yet." }, 403);
  }

  if (isPreviewGate) {
    return c.json({
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      description: lesson.description,
      videoEmbedUrl: null,
      videoCompleted: false,
      isLastFreeLesson: false,
      isLocked: true
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
    videoEmbedUrl: lesson.video_embed_url,
    videoCompleted: Boolean(progress?.video_completed),
    isLastFreeLesson: lessonNumber === freeLessonCount,
    isLocked: false
  });
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
