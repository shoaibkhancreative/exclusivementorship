import { Hono } from "hono";
import type { Env } from "../lib/config";
import { FREE_LESSON_COUNT } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import { canAccessLesson, computeNextCurrentLesson, lessonState, shouldShowPremiumGate } from "../lib/course";
import { randomUuid } from "../lib/crypto";
import { logAuditEvent } from "../db";

export const lessonRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface LessonRow {
  id: number;
  lesson_number: number;
  title: string;
  chapter_name: string;
  thumbnail_url: string | null;
  youtube_video_id: string;
  description: string | null;
  is_free: number;
  is_active: number;
  sort_order: number;
  assignment_title: string | null;
  assignment_instruction: string | null;
}

interface ProgressRow {
  lesson_id: number;
  video_completed: number;
  assignment_submitted: number;
}

/** Public outline — safe for logged-out visitors too. */
lessonRoutes.get("/", async (c) => {
  const user = c.get("user");
  const lessons = await c.env.DB.prepare(
    "SELECT * FROM lessons WHERE is_active = 1 ORDER BY sort_order ASC"
  ).all<LessonRow>();

  let progressByLessonId = new Map<number, ProgressRow>();
  if (user) {
    const progress = await c.env.DB.prepare(
      "SELECT lesson_id, video_completed, assignment_submitted FROM lesson_progress WHERE user_id = ?"
    )
      .bind(user.id)
      .all<ProgressRow>();
    progressByLessonId = new Map(progress.results.map((p) => [p.lesson_id, p]));
  }

  const currentLesson = user?.current_lesson ?? 1;
  const courseStatus = user?.course_status ?? "free";

  const outline = lessons.results.map((lesson) => {
    const progress = progressByLessonId.get(lesson.id);
    const completed = Boolean(progress?.assignment_submitted);
    const state = lessonState(lesson.lesson_number, completed, {
      lessonNumber: lesson.lesson_number,
      currentLesson,
      courseStatus
    });
    return {
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      thumbnailUrl: lesson.thumbnail_url,
      isFree: Boolean(lesson.is_free),
      state
    };
  });

  return c.json({
    outline,
    currentLesson,
    courseStatus,
    freeLessonCount: FREE_LESSON_COUNT
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

  const allowed = canAccessLesson({ lessonNumber, currentLesson, courseStatus });
  if (!allowed) {
    const reason = lessonNumber > FREE_LESSON_COUNT && courseStatus !== "paid" ? "payment_required" : "locked";
    return c.json({ error: reason, message: "This lesson isn't unlocked yet." }, 403);
  }

  let progress: ProgressRow | null = null;
  if (user) {
    progress = await c.env.DB.prepare(
      "SELECT lesson_id, video_completed, assignment_submitted FROM lesson_progress WHERE user_id = ? AND lesson_id = ?"
    )
      .bind(user.id, lesson.id)
      .first<ProgressRow>();
  }

  return c.json({
    lessonNumber: lesson.lesson_number,
    title: lesson.title,
    chapterName: lesson.chapter_name,
    description: lesson.description,
    youtubeVideoId: lesson.youtube_video_id,
    assignmentTitle: lesson.assignment_title,
    assignmentInstruction: lesson.assignment_instruction,
    videoCompleted: Boolean(progress?.video_completed),
    assignmentSubmitted: Boolean(progress?.assignment_submitted),
    isLastFreeLesson: lessonNumber === FREE_LESSON_COUNT
  });
});

lessonRoutes.post("/:number/complete-video", requireAuth, async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  const user = c.get("user")!;

  const lesson = await c.env.DB.prepare("SELECT id FROM lessons WHERE lesson_number = ?")
    .bind(lessonNumber)
    .first<{ id: number }>();
  if (!lesson) return c.json({ error: "not_found" }, 404);

  const allowed = canAccessLesson({
    lessonNumber,
    currentLesson: user.current_lesson,
    courseStatus: user.course_status
  });
  if (!allowed) return c.json({ error: "locked" }, 403);

  await c.env.DB.prepare(
    `INSERT INTO lesson_progress (user_id, lesson_id, video_completed, updated_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET video_completed = 1, updated_at = datetime('now')`
  )
    .bind(user.id, lesson.id)
    .run();

  return c.json({ ok: true });
});

lessonRoutes.post("/:number/submit-assignment", requireAuth, async (c) => {
  const lessonNumber = Number(c.req.param("number"));
  const user = c.get("user")!;
  const body = await c.req.json<{ fileName?: string }>().catch(() => ({}) as { fileName?: string });

  const lesson = await c.env.DB.prepare("SELECT id FROM lessons WHERE lesson_number = ?")
    .bind(lessonNumber)
    .first<{ id: number }>();
  if (!lesson) return c.json({ error: "not_found" }, 404);

  const allowed = canAccessLesson({
    lessonNumber,
    currentLesson: user.current_lesson,
    courseStatus: user.course_status
  });
  if (!allowed) return c.json({ error: "locked" }, 403);

  // Record the submission event (metadata only — no file is ever stored,
  // per product spec: assignments are an engagement mechanic, not
  // human-reviewed submissions).
  await c.env.DB.prepare(
    `INSERT INTO assignments (id, user_id, lesson_id, file_name) VALUES (?, ?, ?, ?)`
  )
    .bind(randomUuid(), user.id, lesson.id, body.fileName ?? null)
    .run();

  await c.env.DB.prepare(
    `INSERT INTO lesson_progress (user_id, lesson_id, assignment_submitted, completed_at, updated_at)
     VALUES (?, ?, 1, datetime('now'), datetime('now'))
     ON CONFLICT(user_id, lesson_id) DO UPDATE SET assignment_submitted = 1, completed_at = datetime('now'), updated_at = datetime('now')`
  )
    .bind(user.id, lesson.id)
    .run();

  const nextCurrentLesson = computeNextCurrentLesson(lessonNumber, user.current_lesson);
  await c.env.DB.prepare("UPDATE users SET current_lesson = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(nextCurrentLesson, user.id)
    .run();

  await logAuditEvent(c.env, "assignment_submitted", { userId: user.id, metadata: { lessonNumber } });

  return c.json({
    ok: true,
    message: "Assignment submitted. Your next lesson is now unlocked.",
    nextLessonNumber: nextCurrentLesson,
    showPremiumGate: shouldShowPremiumGate(lessonNumber, user.course_status)
  });
});
