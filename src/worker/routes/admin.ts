import { Hono } from "hono";
import type { Env } from "../lib/config";
import {
  SETTING_ENROLLMENT_PRICE_USDT,
  SETTING_REFERENCE_PRICE_USDT,
  SETTING_FREE_LESSON_COUNT,
  SETTING_INTRO_VIDEO_EMBED_URL,
  getEnrollmentAmount,
  getReferenceAmount,
  getFreeLessonCount,
  getIntroVideoEmbedUrl
} from "../lib/config";
import type { AdminVariables } from "../middleware/adminSession";
import { requireAdmin } from "../middleware/adminSession";
import {
  buildAdminLogoutCookie,
  buildAdminSessionCookie,
  createAdminSession,
  revokeAdminSession
} from "../authAdmin";
import { readCookie } from "../auth";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/config";
import { verifyPassword } from "../lib/crypto";
import {
  archiveLesson,
  checkRateLimit,
  createChapter,
  createLesson,
  deleteChapter,
  deleteLesson,
  findAdminByEmail,
  listAdminLessons,
  listChapters,
  listStudents,
  logAuditEvent,
  reorderChapters,
  reorderLessons,
  reorderLessonsWithChapters,
  setSetting,
  setUserCourseStatus,
  touchAdminLastLogin,
  updateChapter,
  updateLesson
} from "../db";
import { sha256Hex } from "../lib/crypto";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

adminRoutes.post("/login", async (c) => {
  const body = await c.req
    .json<{ email?: string; password?: string }>()
    .catch(() => ({}) as { email?: string; password?: string });
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return c.json({ error: "invalid_input", message: "Email and password are required." }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);

  // Rate-limit by IP and by email separately — same pattern as student OTP
  // verify, so admin login can't be brute-forced either.
  const perIp = await checkRateLimit(c.env, `admin_login:ip:${ipHash}`, 20, 600);
  const perEmail = await checkRateLimit(c.env, `admin_login:email:${email}`, 10, 600);
  if (!perIp.allowed || !perEmail.allowed) {
    return c.json({ error: "rate_limited", message: "Too many attempts. Please try again shortly." }, 429);
  }

  const admin = await findAdminByEmail(c.env, email);
  // Always run verifyPassword even on a miss (against a dummy hash) so the
  // response time doesn't reveal whether the email exists.
  const ok = admin
    ? await verifyPassword(password, admin.password_hash)
    : await verifyPassword(password, "pbkdf2:100000:00000000000000000000000000000000:0");

  if (!admin || !ok) {
    await logAuditEvent(c.env, "admin_login_failed", { ipHash, metadata: { email } });
    return c.json({ error: "invalid_credentials", message: "Incorrect email or password." }, 401);
  }

  const token = await createAdminSession(c.env, admin.id);
  c.header("Set-Cookie", buildAdminSessionCookie(c.env, token));
  await touchAdminLastLogin(c.env, admin.id);
  await logAuditEvent(c.env, "admin_login", { ipHash, metadata: { adminId: admin.id, email } });

  return c.json({ ok: true, admin: { email: admin.email } });
});

adminRoutes.post("/logout", async (c) => {
  const token = readCookie(c.req.header("cookie") ?? null, ADMIN_SESSION_COOKIE_NAME);
  if (token) await revokeAdminSession(c.env, token);
  c.header("Set-Cookie", buildAdminLogoutCookie(c.env));
  return c.json({ ok: true });
});

adminRoutes.get("/me", async (c) => {
  const admin = c.get("admin");
  if (!admin) return c.json({ authenticated: false });
  return c.json({ authenticated: true, email: admin.email });
});

// Everything below requires an active admin session.
adminRoutes.use("/*", requireAdmin);

// ---------------------------------------------------------------------------
// Student directory
// ---------------------------------------------------------------------------

adminRoutes.get("/students", async (c) => {
  const students = await listStudents(c.env);
  return c.json({
    students: students.map((s) => ({
      id: s.id,
      email: s.email,
      name: s.name,
      createdAt: s.created_at,
      currentLesson: s.current_lesson,
      courseStatus: s.course_status,
      paidAt: s.paid_at,
      completedLessons: s.completed_lessons,
      totalLessons: s.total_lessons,
      latestPaymentStatus: s.latest_payment_status
    }))
  });
});

/**
 * Manually grants or revokes paid (Exclusive Mentorship) access for a
 * student, independent of the normal NOWPayments checkout flow — e.g. a
 * student who paid outside the site. Grants are indistinguishable from a
 * confirmed checkout once applied (same users.course_status/paid_at
 * fields the webhook writes to — see routes/webhooks.ts).
 */
adminRoutes.post("/students/:id/access", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const body = await c.req.json<{ status?: "free" | "paid" }>().catch(() => ({}) as { status?: "free" | "paid" });

  if (body.status !== "free" && body.status !== "paid") {
    return c.json({ error: "invalid_input", message: "status must be 'free' or 'paid'." }, 400);
  }

  await setUserCourseStatus(c.env, id, body.status);
  await logAuditEvent(c.env, "admin_access_changed", {
    userId: id,
    metadata: { adminId: admin.id, status: body.status }
  });

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Chapters — add/edit/reorder
// ---------------------------------------------------------------------------

adminRoutes.get("/chapters", async (c) => {
  const chapters = await listChapters(c.env);
  return c.json({
    chapters: chapters.map((ch) => ({ id: ch.id, name: ch.name, tagline: ch.tagline, sortOrder: ch.sort_order }))
  });
});

adminRoutes.post("/chapters", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{ name?: string; tagline?: string }>()
    .catch(() => ({}) as { name?: string; tagline?: string });
  const name = (body.name ?? "").trim();
  if (!name) return c.json({ error: "invalid_input", message: "Chapter name is required." }, 400);

  const chapter = await createChapter(c.env, name, body.tagline?.trim() || null);
  await logAuditEvent(c.env, "admin_chapter_created", { metadata: { adminId: admin.id, chapterId: chapter.id } });
  return c.json({
    ok: true,
    chapter: { id: chapter.id, name: chapter.name, tagline: chapter.tagline, sortOrder: chapter.sort_order }
  });
});

adminRoutes.patch("/chapters/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = Number(c.req.param("id"));
  const body = await c.req
    .json<{ name?: string; tagline?: string | null }>()
    .catch(() => ({}) as { name?: string; tagline?: string | null });

  try {
    await updateChapter(c.env, id, { name: body.name, tagline: body.tagline });
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
  await logAuditEvent(c.env, "admin_chapter_updated", { metadata: { adminId: admin.id, chapterId: id } });
  return c.json({ ok: true });
});

adminRoutes.post("/chapters/reorder", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json<{ orderedIds?: number[] }>().catch(() => ({}) as { orderedIds?: number[] });
  if (!Array.isArray(body.orderedIds) || body.orderedIds.length === 0) {
    return c.json({ error: "invalid_input", message: "orderedIds must be a non-empty array." }, 400);
  }
  await reorderChapters(c.env, body.orderedIds);
  await logAuditEvent(c.env, "admin_chapters_reordered", { metadata: { adminId: admin.id } });
  return c.json({ ok: true });
});

/**
 * Deletes a chapter. Refuses with 409 while it still has any lessons — the
 * admin has to move (edit lesson → Chapter) or delete those lessons first,
 * so a chapter is never removed along with content nobody meant to lose.
 */
adminRoutes.delete("/chapters/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = Number(c.req.param("id"));
  try {
    await deleteChapter(c.env, id);
  } catch (err) {
    if (err instanceof Error && err.message === "chapter_not_empty") {
      return c.json(
        { error: "chapter_not_empty", message: "Move or delete this chapter's classes before deleting it." },
        409
      );
    }
    return c.json({ error: "not_found" }, 404);
  }
  await logAuditEvent(c.env, "admin_chapter_deleted", { metadata: { adminId: admin.id, chapterId: id } });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Lessons — add/edit/reorder. Only presentation fields (title, tagline,
// description, chapter, video embed link, thumbnail, active/inactive) are
// ever editable here — never lesson_number/sort_order directly (use
// /reorder for that) and never a free/paid flag per lesson (that's
// controlled site-wide by the free-lesson-count course setting below).
// ---------------------------------------------------------------------------

adminRoutes.get("/lessons", async (c) => {
  const [lessons, freeLessonCount] = await Promise.all([listAdminLessons(c.env), getFreeLessonCount(c.env)]);
  return c.json({
    freeLessonCount,
    lessons: lessons.map((l) => ({
      id: l.id,
      lessonNumber: l.lesson_number,
      title: l.title,
      chapterName: l.chapter_name,
      tagline: l.tagline,
      description: l.description,
      thumbnailUrl: l.thumbnail_url,
      videoEmbedUrl: l.video_embed_url,
      isFree: l.lesson_number <= freeLessonCount,
      isActive: Boolean(l.is_active)
    }))
  });
});

adminRoutes.post("/lessons", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{ title?: string; chapterName?: string; tagline?: string; description?: string; videoEmbedUrl?: string }>()
    .catch(
      () =>
        ({}) as {
          title?: string;
          chapterName?: string;
          tagline?: string;
          description?: string;
          videoEmbedUrl?: string;
        }
    );

  const title = (body.title ?? "").trim();
  const chapterName = (body.chapterName ?? "").trim();
  if (!title || !chapterName) {
    return c.json({ error: "invalid_input", message: "Title and chapter are required." }, 400);
  }

  const lesson = await createLesson(c.env, {
    title,
    chapterName,
    tagline: body.tagline?.trim() || null,
    description: body.description?.trim() || null,
    videoEmbedUrl: body.videoEmbedUrl?.trim() || null
  });

  await logAuditEvent(c.env, "admin_lesson_created", { metadata: { adminId: admin.id, lessonId: lesson.id } });

  return c.json({
    ok: true,
    lesson: {
      id: lesson.id,
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      description: lesson.description,
      videoEmbedUrl: lesson.video_embed_url,
      isActive: Boolean(lesson.is_active)
    }
  });
});

adminRoutes.patch("/lessons/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = Number(c.req.param("id"));
  const body = await c.req
    .json<{
      title?: string;
      chapterName?: string;
      tagline?: string | null;
      description?: string | null;
      videoEmbedUrl?: string | null;
      thumbnailUrl?: string | null;
      isActive?: boolean;
    }>()
    .catch(() => ({}) as Record<string, never>);

  if (body.title !== undefined && !body.title.trim()) {
    return c.json({ error: "invalid_input", message: "Title can't be empty." }, 400);
  }
  if (body.chapterName !== undefined && !body.chapterName.trim()) {
    return c.json({ error: "invalid_input", message: "Chapter is required." }, 400);
  }

  try {
    await updateLesson(c.env, id, {
      ...body,
      title: body.title?.trim(),
      chapterName: body.chapterName?.trim()
    });
  } catch {
    return c.json({ error: "not_found" }, 404);
  }

  await logAuditEvent(c.env, "admin_lesson_updated", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

adminRoutes.post("/lessons/:id/archive", async (c) => {
  const admin = c.get("admin")!;
  const id = Number(c.req.param("id"));
  await archiveLesson(c.env, id);
  await logAuditEvent(c.env, "admin_lesson_archived", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

/**
 * Permanently deletes a lesson (unlike /archive, which only hides it). This
 * also discards any student's saved progress against that specific lesson
 * (see db.ts deleteLesson) — the admin UI's confirm dialog warns about that
 * before calling this.
 */
adminRoutes.delete("/lessons/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = Number(c.req.param("id"));
  try {
    await deleteLesson(c.env, id);
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
  await logAuditEvent(c.env, "admin_lesson_deleted", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

/**
 * Reorders (and, inseparably, renumbers 1..N) every lesson to match the
 * given order — see db.ts reorderLessons for why renumbering is unavoidable
 * given lesson_number doubles as the progress pointer.
 *
 * Accepts either shape:
 *   - `orderedIds`: plain id order, same chapter assignments as today (the
 *     up/down arrows use this).
 *   - `orderedLessons`: `{ id, chapterName }[]` — used by the admin panel's
 *     drag-and-drop, which also lets a lesson be dropped into a different
 *     chapter's section. Every chapterName must be a chapter that currently
 *     exists.
 */
adminRoutes.post("/lessons/reorder", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{ orderedIds?: number[]; orderedLessons?: { id: number; chapterName: string }[] }>()
    .catch(() => ({}) as { orderedIds?: number[]; orderedLessons?: { id: number; chapterName: string }[] });

  if (Array.isArray(body.orderedLessons) && body.orderedLessons.length > 0) {
    const chapters = await listChapters(c.env);
    const validNames = new Set(chapters.map((ch) => ch.name));
    for (const item of body.orderedLessons) {
      if (!item.chapterName || !validNames.has(item.chapterName)) {
        return c.json({ error: "invalid_input", message: `Unknown chapter: ${item.chapterName}` }, 400);
      }
    }
    await reorderLessonsWithChapters(c.env, body.orderedLessons);
  } else if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
    await reorderLessons(c.env, body.orderedIds);
  } else {
    return c.json(
      { error: "invalid_input", message: "orderedIds or orderedLessons must be a non-empty array." },
      400
    );
  }

  await logAuditEvent(c.env, "admin_lessons_reordered", { metadata: { adminId: admin.id } });
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Settings — price/discount, free-lesson count, and the homepage intro
// video. All admin-editable, all backend-driven (nothing hardcoded).
// ---------------------------------------------------------------------------

adminRoutes.get("/settings", async (c) => {
  const [enrollmentPrice, referencePrice, freeLessonCount, introVideoEmbedUrl] = await Promise.all([
    getEnrollmentAmount(c.env),
    getReferenceAmount(c.env),
    getFreeLessonCount(c.env),
    getIntroVideoEmbedUrl(c.env)
  ]);
  return c.json({
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl
  });
});

adminRoutes.post("/settings", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{
      enrollmentPrice?: number;
      referencePrice?: number;
      freeLessonCount?: number;
      introVideoEmbedUrl?: string | null;
    }>()
    .catch(() => ({}) as Record<string, never>);

  const updates: Array<Promise<void>> = [];

  if (body.enrollmentPrice !== undefined) {
    const n = Number(body.enrollmentPrice);
    if (!Number.isFinite(n) || n <= 0) {
      return c.json({ error: "invalid_input", message: "Enrollment price must be a positive number." }, 400);
    }
    updates.push(setSetting(c.env, SETTING_ENROLLMENT_PRICE_USDT, String(n), admin.id));
  }

  if (body.referencePrice !== undefined) {
    const n = Number(body.referencePrice);
    if (!Number.isFinite(n) || n <= 0) {
      return c.json({ error: "invalid_input", message: "Reference price must be a positive number." }, 400);
    }
    updates.push(setSetting(c.env, SETTING_REFERENCE_PRICE_USDT, String(n), admin.id));
  }

  if (body.freeLessonCount !== undefined) {
    const n = Number(body.freeLessonCount);
    if (!Number.isFinite(n) || n < 0) {
      return c.json({ error: "invalid_input", message: "Free lesson count must be zero or a positive number." }, 400);
    }
    updates.push(setSetting(c.env, SETTING_FREE_LESSON_COUNT, String(Math.floor(n)), admin.id));
  }

  if (body.introVideoEmbedUrl !== undefined) {
    updates.push(setSetting(c.env, SETTING_INTRO_VIDEO_EMBED_URL, (body.introVideoEmbedUrl ?? "").trim(), admin.id));
  }

  if (updates.length === 0) {
    return c.json({ error: "invalid_input", message: "Nothing to update." }, 400);
  }

  await Promise.all(updates);
  await logAuditEvent(c.env, "admin_settings_updated", { metadata: { adminId: admin.id, ...body } });

  const [enrollmentPrice, referencePrice, freeLessonCount, introVideoEmbedUrl] = await Promise.all([
    getEnrollmentAmount(c.env),
    getReferenceAmount(c.env),
    getFreeLessonCount(c.env),
    getIntroVideoEmbedUrl(c.env)
  ]);
  return c.json({
    ok: true,
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl
  });
});
