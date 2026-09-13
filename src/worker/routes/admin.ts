import { Hono } from "hono";
import type { Env } from "../lib/config";
import {
  SETTING_ENROLLMENT_PRICE_USDT,
  SETTING_REFERENCE_PRICE_USDT,
  SETTING_FREE_LESSON_COUNT,
  SETTING_INTRO_VIDEO_EMBED_URL,
  SETTING_SITE_LOGO_URL,
  SETTING_SITE_FAVICON_URL,
  getEnrollmentAmount,
  getReferenceAmount,
  getFreeLessonCount,
  getIntroVideoEmbedUrl,
  getSiteLogoUrl,
  getSiteFaviconUrl
} from "../lib/config";
import type { AdminVariables } from "../middleware/adminSession";
import { requireAdmin } from "../middleware/adminSession";
import { buildAdminLogoutCookie, buildAdminSessionCookie, createAdminSession, revokeAdminSession } from "../authAdmin";
import { readCookie } from "../auth";
import { ADMIN_SESSION_COOKIE_NAME } from "../lib/config";
import { verifyPassword } from "../lib/crypto";
import {
  archiveLesson,
  bulkUpdateLessons,
  checkRateLimit,
  createChapter,
  createLesson,
  deleteChapter,
  deleteLesson,
  deleteUser,
  duplicateLesson,
  findAdminByEmail,
  getAdvancedAnalytics,
  getRevenueAnalytics,
  ORDER_STATUSES,
  listAdminLessons,
  listChapters,
  listContentAdmin,
  listLayoutsAdmin,
  listStudents,
  logAuditEvent,
  resetContentValue,
  reorderChapters,
  reorderLessons,
  reorderLessonsWithChapters,
  setContentValue,
  setLayout,
  setSetting,
  setUserCourseStatus,
  touchAdminLastLogin,
  updateChapter,
  updateLesson,
  wipeAllUsers
} from "../db";
import { CONTENT_FIELDS, CONTENT_DEFAULTS } from "../lib/content";
import { PAGE_BLOCKS, PAGE_LABELS, reconcileLayout, type LayoutBlockState } from "../lib/layout";
import { purgeCache, CACHE_KEYS } from "../lib/cache";
import { sha256Hex } from "../lib/crypto";
import {
  normalizeLessonDuration,
  normalizeLessonThumbnail,
  normalizeOptionalUrl,
  parsePositiveIntId,
  validateIdArray
} from "../lib/validation";
import { LESSON_THUMBNAIL_ALLOWED_MIME_TYPES, LESSON_THUMBNAIL_MAX_BYTES } from "../lib/config";
import { fetchBunnyThumbnailUrl } from "../lib/bunny";

export const adminRoutes = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

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

  const perIp = await checkRateLimit(c.env, `admin_login:ip:${ipHash}`, 20, 600);
  const perEmail = await checkRateLimit(c.env, `admin_login:email:${email}`, 10, 600);
  if (!perIp.allowed || !perEmail.allowed) {
    return c.json({ error: "rate_limited", message: "Too many attempts. Please try again shortly." }, 429);
  }

  const admin = await findAdminByEmail(c.env, email);
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

adminRoutes.use("/*", requireAdmin);

adminRoutes.get("/analytics", async (c) => {
  const analytics = await getRevenueAnalytics(c.env);
  return c.json(analytics);
});

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GRANULARITIES = new Set(["day", "week", "month"]);
const COURSE_STATUS_FILTERS = new Set(["all", "free", "paid"]);

adminRoutes.get("/analytics/advanced", async (c) => {
  const q = c.req.query();

  const todayIso = new Date().toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const dateFrom = ISO_DATE_RE.test(q.dateFrom ?? "") ? q.dateFrom! : defaultFrom;
  const dateTo = ISO_DATE_RE.test(q.dateTo ?? "") ? q.dateTo! : todayIso;
  const [from, to] = dateFrom <= dateTo ? [dateFrom, dateTo] : [dateTo, dateFrom];

  const granularity = GRANULARITIES.has(q.granularity ?? "") ? (q.granularity as "day" | "week" | "month") : "day";
  const courseStatus = COURSE_STATUS_FILTERS.has(q.courseStatus ?? "")
    ? (q.courseStatus as "all" | "free" | "paid")
    : "all";
  const currency = (q.currency ?? "all").trim() || "all";

  const paymentStatuses = (q.paymentStatus ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is (typeof ORDER_STATUSES)[number] => (ORDER_STATUSES as readonly string[]).includes(s));

  const analytics = await getAdvancedAnalytics(c.env, {
    dateFrom: from,
    dateTo: to,
    granularity,
    courseStatus,
    currency,
    paymentStatuses
  });
  return c.json(analytics);
});

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

adminRoutes.delete("/students/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = c.req.param("id");
  const body = await c.req.json<{ confirmEmail?: string }>().catch(() => ({}) as { confirmEmail?: string });

  const students = await listStudents(c.env);
  const student = students.find((s) => s.id === id);
  if (!student) return c.json({ error: "not_found" }, 404);

  if ((body.confirmEmail ?? "").trim().toLowerCase() !== student.email.toLowerCase()) {
    return c.json(
      { error: "confirmation_mismatch", message: "Typed email doesn't match this student's account." },
      400
    );
  }

  await deleteUser(c.env, id);
  await logAuditEvent(c.env, "admin_user_deleted", {
    metadata: { adminId: admin.id, deletedUserId: id, deletedEmail: student.email }
  });

  return c.json({ ok: true });
});

const WIPE_ALL_CONFIRMATION_PHRASE = "DELETE ALL STUDENT DATA";

adminRoutes.post("/students/wipe-all", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json<{ confirm?: string }>().catch(() => ({}) as { confirm?: string });

  const perAdmin = await checkRateLimit(c.env, `admin_wipe_all:${admin.id}`, 3, 3600);
  if (!perAdmin.allowed) {
    return c.json({ error: "rate_limited", message: "Too many attempts. Please try again later." }, 429);
  }

  if ((body.confirm ?? "") !== WIPE_ALL_CONFIRMATION_PHRASE) {
    return c.json(
      {
        error: "confirmation_mismatch",
        message: `Type "${WIPE_ALL_CONFIRMATION_PHRASE}" exactly to confirm.`
      },
      400
    );
  }

  const deletedCount = await wipeAllUsers(c.env);
  await logAuditEvent(c.env, "admin_wipe_all_users", {
    metadata: { adminId: admin.id, deletedCount }
  });

  return c.json({ ok: true, deletedCount });
});

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
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_chapter_created", { metadata: { adminId: admin.id, chapterId: chapter.id } });
  return c.json({
    ok: true,
    chapter: { id: chapter.id, name: chapter.name, tagline: chapter.tagline, sortOrder: chapter.sort_order }
  });
});

adminRoutes.patch("/chapters/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
  const body = await c.req
    .json<{ name?: string; tagline?: string | null }>()
    .catch(() => ({}) as { name?: string; tagline?: string | null });

  try {
    await updateChapter(c.env, id, { name: body.name, tagline: body.tagline });
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_chapter_updated", { metadata: { adminId: admin.id, chapterId: id } });
  return c.json({ ok: true });
});

adminRoutes.post("/chapters/reorder", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json<{ orderedIds?: number[] }>().catch(() => ({}) as { orderedIds?: number[] });
  const orderedIds = validateIdArray(body.orderedIds);
  if (!orderedIds) {
    return c.json(
      { error: "invalid_input", message: "orderedIds must be a non-empty array of positive integers." },
      400
    );
  }
  await reorderChapters(c.env, orderedIds);
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_chapters_reordered", { metadata: { adminId: admin.id } });
  return c.json({ ok: true });
});

adminRoutes.delete("/chapters/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
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
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_chapter_deleted", { metadata: { adminId: admin.id, chapterId: id } });
  return c.json({ ok: true });
});

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
      isActive: Boolean(l.is_active),
      watermarkEnabled: Boolean(l.watermark_enabled),
      durationLabel: l.duration_label
    }))
  });
});

adminRoutes.post("/lessons", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{
      title?: string;
      chapterName?: string;
      tagline?: string;
      description?: string;
      videoEmbedUrl?: string;
      thumbnailUrl?: string;
      watermarkEnabled?: boolean;
      durationLabel?: string;
    }>()
    .catch(
      () =>
        ({}) as {
          title?: string;
          chapterName?: string;
          tagline?: string;
          description?: string;
          videoEmbedUrl?: string;
          thumbnailUrl?: string;
          watermarkEnabled?: boolean;
          durationLabel?: string;
        }
    );

  const title = (body.title ?? "").trim();
  const chapterName = (body.chapterName ?? "").trim();
  if (!title || !chapterName) {
    return c.json({ error: "invalid_input", message: "Title and chapter are required." }, 400);
  }

  let videoEmbedUrl: string | null;
  let thumbnailUrl: string | null;
  let durationLabel: string | null;
  try {
    videoEmbedUrl = normalizeOptionalUrl(body.videoEmbedUrl);
  } catch {
    return c.json({ error: "invalid_input", message: "Video embed URL must be a valid http(s) link." }, 400);
  }
  try {
    thumbnailUrl = normalizeLessonThumbnail(
      body.thumbnailUrl,
      LESSON_THUMBNAIL_MAX_BYTES,
      LESSON_THUMBNAIL_ALLOWED_MIME_TYPES
    );
  } catch {
    return c.json(
      { error: "invalid_input", message: "Thumbnail must be a JPEG/PNG/WebP/GIF under 1MB, or a valid http(s) link." },
      400
    );
  }
  try {
    durationLabel = normalizeLessonDuration(body.durationLabel);
  } catch {
    return c.json({ error: "invalid_input", message: "Duration must look like 12:45 or 1:04:30." }, 400);
  }

  if (!thumbnailUrl && videoEmbedUrl) {
    thumbnailUrl = await fetchBunnyThumbnailUrl(c.env, videoEmbedUrl);
  }

  const lesson = await createLesson(c.env, {
    title,
    chapterName,
    tagline: body.tagline?.trim() || null,
    description: body.description?.trim() || null,
    videoEmbedUrl,
    thumbnailUrl,
    watermarkEnabled: Boolean(body.watermarkEnabled),
    durationLabel
  });

  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
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
      thumbnailUrl: lesson.thumbnail_url,
      videoEmbedUrl: lesson.video_embed_url,
      isActive: Boolean(lesson.is_active),
      watermarkEnabled: Boolean(lesson.watermark_enabled),
      durationLabel: lesson.duration_label
    }
  });
});

adminRoutes.patch("/lessons/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
  const body = await c.req
    .json<{
      title?: string;
      chapterName?: string;
      tagline?: string | null;
      description?: string | null;
      videoEmbedUrl?: string | null;
      thumbnailUrl?: string | null;
      isActive?: boolean;
      watermarkEnabled?: boolean;
      durationLabel?: string | null;
    }>()
    .catch(() => ({}) as Record<string, never>);

  if (body.title !== undefined && !body.title.trim()) {
    return c.json({ error: "invalid_input", message: "Title can't be empty." }, 400);
  }
  if (body.chapterName !== undefined && !body.chapterName.trim()) {
    return c.json({ error: "invalid_input", message: "Chapter is required." }, 400);
  }

  let videoEmbedUrl: string | null | undefined;
  let thumbnailUrl: string | null | undefined;
  let durationLabel: string | null | undefined;
  try {
    videoEmbedUrl = body.videoEmbedUrl !== undefined ? normalizeOptionalUrl(body.videoEmbedUrl) : undefined;
  } catch {
    return c.json({ error: "invalid_input", message: "Video embed URL must be a valid http(s) link." }, 400);
  }
  try {
    thumbnailUrl =
      body.thumbnailUrl !== undefined
        ? normalizeLessonThumbnail(body.thumbnailUrl, LESSON_THUMBNAIL_MAX_BYTES, LESSON_THUMBNAIL_ALLOWED_MIME_TYPES)
        : undefined;
  } catch {
    return c.json(
      { error: "invalid_input", message: "Thumbnail must be a JPEG/PNG/WebP/GIF under 1MB, or a valid http(s) link." },
      400
    );
  }
  try {
    durationLabel = body.durationLabel !== undefined ? normalizeLessonDuration(body.durationLabel) : undefined;
  } catch {
    return c.json({ error: "invalid_input", message: "Duration must look like 12:45 or 1:04:30." }, 400);
  }

  if (videoEmbedUrl !== undefined && thumbnailUrl === null) {
    thumbnailUrl = videoEmbedUrl ? await fetchBunnyThumbnailUrl(c.env, videoEmbedUrl) : null;
  }

  try {
    await updateLesson(c.env, id, {
      ...body,
      title: body.title?.trim(),
      chapterName: body.chapterName?.trim(),
      videoEmbedUrl,
      thumbnailUrl,
      durationLabel
    });
  } catch {
    return c.json({ error: "not_found" }, 404);
  }

  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lesson_updated", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

adminRoutes.post("/lessons/:id/archive", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
  await archiveLesson(c.env, id);
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lesson_archived", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

adminRoutes.delete("/lessons/:id", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
  try {
    await deleteLesson(c.env, id);
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lesson_deleted", { metadata: { adminId: admin.id, lessonId: id } });
  return c.json({ ok: true });
});

adminRoutes.post("/lessons/reorder", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{ orderedIds?: number[]; orderedLessons?: { id: number; chapterName: string }[] }>()
    .catch(() => ({}) as { orderedIds?: number[]; orderedLessons?: { id: number; chapterName: string }[] });

  const MAX_REORDER_ENTRIES = 500;

  if (Array.isArray(body.orderedLessons) && body.orderedLessons.length > 0) {
    if (body.orderedLessons.length > MAX_REORDER_ENTRIES) {
      return c.json({ error: "invalid_input", message: "Too many lessons in one reorder request." }, 400);
    }
    const chapters = await listChapters(c.env);
    const validNames = new Set(chapters.map((ch) => ch.name));
    for (const item of body.orderedLessons) {
      if (!Number.isSafeInteger(item.id) || item.id <= 0) {
        return c.json({ error: "invalid_input", message: "Every lesson id must be a positive integer." }, 400);
      }
      if (!item.chapterName || !validNames.has(item.chapterName)) {
        return c.json({ error: "invalid_input", message: `Unknown chapter: ${item.chapterName}` }, 400);
      }
    }
    await reorderLessonsWithChapters(c.env, body.orderedLessons);
  } else if (Array.isArray(body.orderedIds) && body.orderedIds.length > 0) {
    const orderedIds = validateIdArray(body.orderedIds, MAX_REORDER_ENTRIES);
    if (!orderedIds) {
      return c.json(
        { error: "invalid_input", message: "orderedIds must be a non-empty array of positive integers." },
        400
      );
    }
    await reorderLessons(c.env, orderedIds);
  } else {
    return c.json({ error: "invalid_input", message: "orderedIds or orderedLessons must be a non-empty array." }, 400);
  }

  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lessons_reordered", { metadata: { adminId: admin.id } });
  return c.json({ ok: true });
});

adminRoutes.post("/lessons/:id/duplicate", async (c) => {
  const admin = c.get("admin")!;
  const id = parsePositiveIntId(c.req.param("id"));
  if (id === null) return c.json({ error: "not_found" }, 404);
  let lesson;
  try {
    lesson = await duplicateLesson(c.env, id);
  } catch {
    return c.json({ error: "not_found" }, 404);
  }
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lesson_duplicated", {
    metadata: { adminId: admin.id, sourceLessonId: id, newLessonId: lesson.id }
  });
  return c.json({
    ok: true,
    lesson: {
      id: lesson.id,
      lessonNumber: lesson.lesson_number,
      title: lesson.title,
      chapterName: lesson.chapter_name,
      tagline: lesson.tagline,
      description: lesson.description,
      thumbnailUrl: lesson.thumbnail_url,
      videoEmbedUrl: lesson.video_embed_url,
      isActive: Boolean(lesson.is_active),
      watermarkEnabled: Boolean(lesson.watermark_enabled),
      durationLabel: lesson.duration_label
    }
  });
});

adminRoutes.post("/lessons/bulk", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req
    .json<{ ids?: number[]; action?: "publish" | "unpublish" | "delete" }>()
    .catch(() => ({}) as { ids?: number[]; action?: "publish" | "unpublish" | "delete" });

  const ids = validateIdArray(body.ids);
  if (!ids) {
    return c.json({ error: "invalid_input", message: "ids must be a non-empty array of positive integers." }, 400);
  }
  if (body.action !== "publish" && body.action !== "unpublish" && body.action !== "delete") {
    return c.json({ error: "invalid_input", message: "action must be publish, unpublish, or delete." }, 400);
  }

  const affected = await bulkUpdateLessons(c.env, ids, body.action);
  await purgeCache(c.env, CACHE_KEYS.lessonsOutline);
  await logAuditEvent(c.env, "admin_lessons_bulk_action", {
    metadata: { adminId: admin.id, action: body.action, ids, affected }
  });
  return c.json({ ok: true, affected });
});

adminRoutes.get("/settings", async (c) => {
  const [enrollmentPrice, referencePrice, freeLessonCount, introVideoEmbedUrl, siteLogoUrl, siteFaviconUrl] =
    await Promise.all([
      getEnrollmentAmount(c.env),
      getReferenceAmount(c.env),
      getFreeLessonCount(c.env),
      getIntroVideoEmbedUrl(c.env),
      getSiteLogoUrl(c.env),
      getSiteFaviconUrl(c.env)
    ]);
  return c.json({
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl,
    siteLogoUrl,
    siteFaviconUrl
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
      siteLogoUrl?: string | null;
      siteFaviconUrl?: string | null;
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

  try {
    if (body.introVideoEmbedUrl !== undefined) {
      updates.push(
        setSetting(c.env, SETTING_INTRO_VIDEO_EMBED_URL, normalizeOptionalUrl(body.introVideoEmbedUrl) ?? "", admin.id)
      );
    }

    if (body.siteLogoUrl !== undefined) {
      updates.push(setSetting(c.env, SETTING_SITE_LOGO_URL, normalizeOptionalUrl(body.siteLogoUrl) ?? "", admin.id));
    }

    if (body.siteFaviconUrl !== undefined) {
      updates.push(
        setSetting(c.env, SETTING_SITE_FAVICON_URL, normalizeOptionalUrl(body.siteFaviconUrl) ?? "", admin.id)
      );
    }
  } catch {
    return c.json({ error: "invalid_input", message: "Every link must be a valid http(s) URL." }, 400);
  }

  if (updates.length === 0) {
    return c.json({ error: "invalid_input", message: "Nothing to update." }, 400);
  }

  await Promise.all(updates);
  await purgeCache(c.env, CACHE_KEYS.publicConfig);
  await logAuditEvent(c.env, "admin_settings_updated", { metadata: { adminId: admin.id, ...body } });

  const [enrollmentPrice, referencePrice, freeLessonCount, introVideoEmbedUrl, siteLogoUrl, siteFaviconUrl] =
    await Promise.all([
      getEnrollmentAmount(c.env),
      getReferenceAmount(c.env),
      getFreeLessonCount(c.env),
      getIntroVideoEmbedUrl(c.env),
      getSiteLogoUrl(c.env),
      getSiteFaviconUrl(c.env)
    ]);
  return c.json({
    ok: true,
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl,
    siteLogoUrl,
    siteFaviconUrl
  });
});

adminRoutes.get("/content", async (c) => {
  const rows = await listContentAdmin(c.env, CONTENT_FIELDS);
  const fieldsByKey = new Map(CONTENT_FIELDS.map((f) => [f.key, f]));
  const fields = rows.map((row) => ({
    ...row,
    group: fieldsByKey.get(row.key)?.group ?? "Other",
    label: fieldsByKey.get(row.key)?.label ?? row.key,
    type: fieldsByKey.get(row.key)?.type ?? "text"
  }));
  return c.json({ fields });
});

adminRoutes.post("/content", async (c) => {
  const admin = c.get("admin")!;
  const body = await c.req.json<{ key?: string; value?: string | null }>().catch(() => ({}) as Record<string, never>);

  if (!body.key || typeof body.key !== "string") {
    return c.json({ error: "invalid_input", message: "A content key is required." }, 400);
  }
  const defaultValue = CONTENT_DEFAULTS[body.key];
  if (defaultValue === undefined) {
    return c.json({ error: "invalid_input", message: "Unknown content key." }, 400);
  }

  await setContentValue(c.env, body.key, body.value ?? null, defaultValue, admin.id);
  await purgeCache(c.env, CACHE_KEYS.content);
  await logAuditEvent(c.env, "admin_content_updated", { metadata: { adminId: admin.id, key: body.key } });
  return c.json({ ok: true });
});

adminRoutes.post("/content/:key/reset", async (c) => {
  const admin = c.get("admin")!;
  const key = c.req.param("key");
  const defaultValue = CONTENT_DEFAULTS[key];
  if (defaultValue === undefined) {
    return c.json({ error: "invalid_input", message: "Unknown content key." }, 400);
  }

  await resetContentValue(c.env, key, defaultValue, admin.id);
  await purgeCache(c.env, CACHE_KEYS.content);
  await logAuditEvent(c.env, "admin_content_reset", { metadata: { adminId: admin.id, key } });
  return c.json({ ok: true, value: defaultValue });
});

adminRoutes.get("/layout", async (c) => {
  const pageKeys = Object.keys(PAGE_BLOCKS);
  const layouts = await listLayoutsAdmin(c.env, pageKeys);
  const pages = pageKeys.map((pageKey) => ({
    pageKey,
    label: PAGE_LABELS[pageKey] ?? pageKey,
    blocks: layouts[pageKey].map((entry) => ({
      ...entry,
      label: PAGE_BLOCKS[pageKey].find((b) => b.id === entry.id)?.label ?? entry.id
    }))
  }));
  return c.json({ pages });
});

adminRoutes.post("/layout/:pageKey", async (c) => {
  const admin = c.get("admin")!;
  const pageKey = c.req.param("pageKey");
  if (!PAGE_BLOCKS[pageKey]) {
    return c.json({ error: "invalid_input", message: "Unknown page." }, 400);
  }

  const body = await c.req
    .json<{ blocks?: { id?: string; visible?: boolean }[] }>()
    .catch(() => ({}) as Record<string, never>);
  if (!Array.isArray(body.blocks)) {
    return c.json({ error: "invalid_input", message: "A blocks array is required." }, 400);
  }

  const knownIds = new Set(PAGE_BLOCKS[pageKey].map((b) => b.id));
  for (const entry of body.blocks) {
    if (typeof entry.id !== "string" || !knownIds.has(entry.id)) {
      return c.json({ error: "invalid_input", message: "Unknown block id." }, 400);
    }
  }

  const blocks: LayoutBlockState[] = body.blocks.map((b) => ({ id: b.id as string, visible: Boolean(b.visible) }));
  const reconciled = reconcileLayout(pageKey, blocks);

  await setLayout(c.env, pageKey, reconciled, admin.id);
  await purgeCache(c.env, CACHE_KEYS.layout);
  await logAuditEvent(c.env, "admin_layout_updated", { metadata: { adminId: admin.id, pageKey } });
  return c.json({ ok: true, blocks: reconciled });
});
