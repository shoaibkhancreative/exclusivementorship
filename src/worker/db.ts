import type { Env } from "./lib/config";
import { randomUuid } from "./lib/crypto";

export interface UserRow {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  current_lesson: number;
  course_status: "free" | "paid";
  paid_at: string | null;
  google_sub: string | null;
  // NOTE: the `users` table also has a nullable `name` column (see
  // migrations/0002_add_user_name.sql). It's intentionally omitted here —
  // nothing reads or writes it; the UI's display name is derived from the
  // email instead (deriveDisplayName in routes/auth.ts). Left undocumented
  // no longer — this is deliberate, not an oversight, and the column is
  // safe to ignore unless/until someone decides to actually wire it up.
}

export async function findUserByEmail(env: Env, email: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<UserRow>();
  return row ?? null;
}

export async function findUserById(env: Env, id: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<UserRow>();
  return row ?? null;
}

export async function createUser(env: Env, email: string): Promise<UserRow> {
  const id = randomUuid();
  const normalized = email.toLowerCase().trim();
  await env.DB.prepare(
    `INSERT INTO users (id, email, current_lesson, course_status) VALUES (?, ?, 1, 'free')`
  )
    .bind(id, normalized)
    .run();
  const user = await findUserById(env, id);
  if (!user) throw new Error("Failed to create user");
  return user;
}

export async function getOrCreateUser(env: Env, email: string): Promise<UserRow> {
  const existing = await findUserByEmail(env, email);
  if (existing) return existing;
  return createUser(env, email);
}

export async function findUserByGoogleSub(env: Env, sub: string): Promise<UserRow | null> {
  const row = await env.DB.prepare("SELECT * FROM users WHERE google_sub = ?").bind(sub).first<UserRow>();
  return row ?? null;
}

export async function linkGoogleSub(env: Env, userId: string, sub: string): Promise<void> {
  await env.DB.prepare("UPDATE users SET google_sub = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(sub, userId)
    .run();
}

/**
 * Resolves (or creates) a user for a verified Google identity.
 *
 * Lookup order matters:
 * 1. By google_sub first — stable even if the person's Google email changes later.
 * 2. By email second — so someone who already has a course account from the
 *    email-OTP flow gets linked to that SAME account (and keeps their
 *    progress) the first time they use "Continue with Google", instead of a
 *    confusing duplicate account.
 * 3. Otherwise create a brand new account, same as OTP's getOrCreateUser.
 */
export async function getOrCreateUserByGoogle(env: Env, sub: string, email: string): Promise<UserRow> {
  const bySub = await findUserByGoogleSub(env, sub);
  if (bySub) return bySub;

  const byEmail = await findUserByEmail(env, email);
  const base = byEmail ?? (await createUser(env, email));

  await linkGoogleSub(env, base.id, sub);
  const linked = await findUserById(env, base.id);
  return linked ?? base;
}

/**
 * Seconds elapsed since the most recent otp_codes row was created for this
 * email, or null if no OTP has ever been requested for it. Used to enforce
 * OTP_RESEND_COOLDOWN_SECONDS in the /request-otp route.
 */
export async function secondsSinceLastOtpRequest(env: Env, email: string): Promise<number | null> {
  const normalized = email.toLowerCase().trim();
  const row = await env.DB.prepare(
    `SELECT created_at FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`
  )
    .bind(normalized)
    .first<{ created_at: string }>();

  if (!row) return null;

  const createdAt = new Date(row.created_at.endsWith("Z") ? row.created_at : row.created_at + "Z");
  return (Date.now() - createdAt.getTime()) / 1000;
}

/**
 * Fixed-window rate limiter backed by D1. Not perfectly precise under high
 * concurrency (see TROUBLESHOOTING.md), but sufficient for OTP/login/payment
 * endpoints on the Cloudflare Free plan without adding a KV/Durable Object
 * dependency.
 */
export async function checkRateLimit(
  env: Env,
  bucketKey: string,
  maxCount: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const row = await env.DB.prepare("SELECT count, window_start FROM rate_limits WHERE bucket_key = ?")
    .bind(bucketKey)
    .first<{ count: number; window_start: string }>();

  if (!row) {
    await env.DB.prepare(
      "INSERT INTO rate_limits (bucket_key, count, window_start) VALUES (?, 1, ?)"
    )
      .bind(bucketKey, now.toISOString())
      .run();
    return { allowed: true, remaining: maxCount - 1 };
  }

  const windowStart = new Date(row.window_start + (row.window_start.endsWith("Z") ? "" : "Z"));
  const elapsedSeconds = (now.getTime() - windowStart.getTime()) / 1000;

  if (elapsedSeconds > windowSeconds) {
    // window expired, reset
    await env.DB.prepare(
      "UPDATE rate_limits SET count = 1, window_start = ? WHERE bucket_key = ?"
    )
      .bind(now.toISOString(), bucketKey)
      .run();
    return { allowed: true, remaining: maxCount - 1 };
  }

  if (row.count >= maxCount) {
    return { allowed: false, remaining: 0 };
  }

  await env.DB.prepare("UPDATE rate_limits SET count = count + 1 WHERE bucket_key = ?")
    .bind(bucketKey)
    .run();
  return { allowed: true, remaining: maxCount - row.count - 1 };
}

// ---------------------------------------------------------------------------
// site_settings — admin-editable key/value config (see lib/config.ts for the
// price-related keys and their env-var fallbacks).
// ---------------------------------------------------------------------------

/** Reads a setting, falling back to `fallback` (usually a wrangler.jsonc env var) if no row exists yet. */
export async function getSetting(
  env: Env,
  key: string,
  fallback?: string | null
): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  if (row) return row.value;
  return fallback ?? null;
}

export async function setSetting(
  env: Env,
  key: string,
  value: string,
  updatedByAdminId: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), updated_by = excluded.updated_by`
  )
    .bind(key, value, updatedByAdminId)
    .run();
}

// ---------------------------------------------------------------------------
// admins (separate identity from `users`/students — see migrations/0008)
// ---------------------------------------------------------------------------
export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  last_login_at: string | null;
}

export async function findAdminByEmail(env: Env, email: string): Promise<AdminRow | null> {
  const row = await env.DB.prepare("SELECT * FROM admins WHERE email = ?")
    .bind(email.toLowerCase().trim())
    .first<AdminRow>();
  return row ?? null;
}

export async function findAdminById(env: Env, id: string): Promise<AdminRow | null> {
  const row = await env.DB.prepare("SELECT * FROM admins WHERE id = ?").bind(id).first<AdminRow>();
  return row ?? null;
}

export async function touchAdminLastLogin(env: Env, adminId: string): Promise<void> {
  await env.DB.prepare("UPDATE admins SET last_login_at = datetime('now') WHERE id = ?").bind(adminId).run();
}

// ---------------------------------------------------------------------------
// Student directory (admin panel)
// ---------------------------------------------------------------------------
export interface StudentDirectoryRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  current_lesson: number;
  course_status: "free" | "paid";
  paid_at: string | null;
  completed_lessons: number;
  total_lessons: number;
  latest_payment_status: string | null;
}

/**
 * One row per user with everything the admin directory needs to show at a
 * glance: progress (against real, active lessons only), and the most
 * recent payment order's status (NULL for a user who has never started a
 * checkout). "Completed" is now driven by finishing the video
 * (lesson_progress.video_completed) — the assignment system has been
 * removed from the product.
 */
export async function listStudents(env: Env): Promise<StudentDirectoryRow[]> {
  const result = await env.DB.prepare(
    `SELECT
       u.id as id,
       u.email as email,
       u.name as name,
       u.created_at as created_at,
       u.current_lesson as current_lesson,
       u.course_status as course_status,
       u.paid_at as paid_at,
       (SELECT COUNT(*) FROM lesson_progress lp
          JOIN lessons l ON l.id = lp.lesson_id
          WHERE lp.user_id = u.id AND lp.video_completed = 1 AND l.is_active = 1
       ) as completed_lessons,
       (SELECT COUNT(*) FROM lessons l WHERE l.is_active = 1) as total_lessons,
       (SELECT po.status FROM payment_orders po WHERE po.user_id = u.id ORDER BY po.created_at DESC LIMIT 1) as latest_payment_status
     FROM users u
     ORDER BY u.created_at DESC`
  ).all<StudentDirectoryRow>();
  return result.results;
}

/**
 * Manually grants (or revokes) paid access from the admin panel — e.g. for
 * a student who paid outside NOWPayments (bank transfer, in person, etc).
 * Mirrors exactly what the NOWPayments webhook does on a confirmed payment
 * (see routes/webhooks.ts), so a manually-granted student is
 * indistinguishable from one who paid through checkout.
 */
export async function setUserCourseStatus(env: Env, userId: string, status: "free" | "paid"): Promise<void> {
  if (status === "paid") {
    await env.DB.prepare(
      `UPDATE users SET course_status = 'paid', paid_at = COALESCE(paid_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`
    )
      .bind(userId)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE users SET course_status = 'free', updated_at = datetime('now') WHERE id = ?`
    )
      .bind(userId)
      .run();
  }
}

// ---------------------------------------------------------------------------
// Chapters — admin-manageable groupings (replaces the old static
// src/worker/lib/semesters.ts array). `name` is the join key against
// lessons.chapter_name.
// ---------------------------------------------------------------------------
export interface ChapterRow {
  id: number;
  name: string;
  tagline: string | null;
  sort_order: number;
}

export async function listChapters(env: Env): Promise<ChapterRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM chapters ORDER BY sort_order ASC, id ASC`).all<ChapterRow>();
  return result.results;
}

export async function createChapter(env: Env, name: string, tagline: string | null): Promise<ChapterRow> {
  const maxRow = await env.DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) as max FROM chapters`).first<{
    max: number;
  }>();
  const sortOrder = (maxRow?.max ?? 0) + 1;
  await env.DB.prepare(`INSERT INTO chapters (name, tagline, sort_order) VALUES (?, ?, ?)`)
    .bind(name, tagline, sortOrder)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM chapters WHERE name = ?`).bind(name).first<ChapterRow>();
  if (!row) throw new Error("Failed to create chapter");
  return row;
}

/**
 * Renames a chapter and cascades the rename onto every lesson currently
 * grouped under the old name, so lessons never end up pointing at a
 * chapter name that no longer exists in the `chapters` table.
 */
export async function updateChapter(
  env: Env,
  id: number,
  fields: { name?: string; tagline?: string | null }
): Promise<void> {
  const existing = await env.DB.prepare(`SELECT * FROM chapters WHERE id = ?`).bind(id).first<ChapterRow>();
  if (!existing) throw new Error("not_found");

  const nextName = fields.name?.trim() || existing.name;
  const nextTagline = fields.tagline !== undefined ? fields.tagline : existing.tagline;

  await env.DB.prepare(`UPDATE chapters SET name = ?, tagline = ? WHERE id = ?`)
    .bind(nextName, nextTagline, id)
    .run();

  if (nextName !== existing.name) {
    await env.DB.prepare(`UPDATE lessons SET chapter_name = ? WHERE chapter_name = ?`)
      .bind(nextName, existing.name)
      .run();
  }
}

/**
 * Deletes a chapter outright. Refuses (throws "chapter_not_empty") while any
 * lesson still points at it — silently cascading the delete onto those
 * lessons would destroy real content (and, transitively, any student
 * progress against them) with no confirmation of what's being removed. The
 * admin must move or delete those lessons first, then the chapter itself.
 */
export async function deleteChapter(env: Env, id: number): Promise<void> {
  const chapter = await env.DB.prepare(`SELECT * FROM chapters WHERE id = ?`).bind(id).first<ChapterRow>();
  if (!chapter) throw new Error("not_found");

  const lessonCount = await env.DB.prepare(`SELECT COUNT(*) as count FROM lessons WHERE chapter_name = ?`)
    .bind(chapter.name)
    .first<{ count: number }>();
  if ((lessonCount?.count ?? 0) > 0) {
    throw new Error("chapter_not_empty");
  }

  await env.DB.prepare(`DELETE FROM chapters WHERE id = ?`).bind(id).run();

  // Close the gap the delete leaves in sort_order, so the remaining chapters
  // stay a clean 1..N sequence — same invariant reorderChapters maintains.
  const remaining = await listChapters(env);
  for (let i = 0; i < remaining.length; i++) {
    await env.DB.prepare(`UPDATE chapters SET sort_order = ? WHERE id = ?`).bind(i + 1, remaining[i].id).run();
  }
}

export async function reorderChapters(env: Env, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await env.DB.prepare(`UPDATE chapters SET sort_order = ? WHERE id = ?`)
      .bind(i + 1, orderedIds[i])
      .run();
  }

  // The public course page (routes/lessons.ts + OutlineList.tsx) walks
  // lessons in their own sort_order and starts a new chapter section purely
  // by noticing chapter_name changed — it never looks at chapters.sort_order
  // directly. Without this, moving a chapter here only changes its header
  // number/name while its lessons stay wherever they physically were,
  // silently desyncing the admin's intended order from what students see.
  await resequenceLessonsByChapterOrder(env);
}

// ---------------------------------------------------------------------------
// Lessons — full admin CRUD. Content that is NOT editable from the admin
// panel (per product spec) stays out of the update whitelist entirely:
// only title, tagline, description, chapterName, videoEmbedUrl,
// thumbnailUrl and isActive can ever be changed here.
// ---------------------------------------------------------------------------
export interface AdminLessonRow {
  id: number;
  lesson_number: number;
  title: string;
  chapter_name: string;
  tagline: string | null;
  description: string | null;
  thumbnail_url: string | null;
  video_embed_url: string | null;
  is_free: number;
  is_active: number;
  sort_order: number;
}

export async function listAdminLessons(env: Env): Promise<AdminLessonRow[]> {
  const result = await env.DB.prepare(`SELECT * FROM lessons ORDER BY sort_order ASC, lesson_number ASC`).all<AdminLessonRow>();
  return result.results;
}

/**
 * Creates a new lesson at the end of the course (highest lesson_number +
 * sort_order + 1). Free/paid status is never set per-lesson here — it's
 * derived entirely from the lesson's position vs the admin-editable
 * free-lesson-count setting (see lib/config.ts getFreeLessonCount), so
 * `is_free` is left at its default (0) and unused for access decisions;
 * it's kept only for backward-compatible display purposes.
 */
export async function createLesson(
  env: Env,
  fields: { title: string; chapterName: string; tagline: string | null; description: string | null; videoEmbedUrl: string | null }
): Promise<AdminLessonRow> {
  const maxRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(lesson_number), 0) as maxNumber, COALESCE(MAX(sort_order), 0) as maxSort FROM lessons`
  ).first<{ maxNumber: number; maxSort: number }>();
  const nextNumber = (maxRow?.maxNumber ?? 0) + 1;
  const nextSort = (maxRow?.maxSort ?? 0) + 1;

  const insert = await env.DB.prepare(
    `INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, video_embed_url, is_free, is_active, sort_order)
     VALUES (?, ?, ?, NULL, 'N/A', ?, ?, ?, 0, 1, ?)`
  )
    .bind(nextNumber, fields.title, fields.chapterName, fields.description, fields.tagline, fields.videoEmbedUrl, nextSort)
    .run();
  const id = insert.meta.last_row_id as number;

  // A brand-new lesson always lands with the highest lesson_number/sort_order
  // above, i.e. at the very end of the WHOLE course — even when its chapter
  // isn't the last one. Left alone, that splits the chapter's classes apart
  // in the public sequence (routes/lessons.ts + OutlineList.tsx both assume
  // same-chapter lessons are contiguous). Resequence so it lands right after
  // that chapter's existing lessons instead.
  await resequenceLessonsByChapterOrder(env);

  const row = await env.DB.prepare(`SELECT * FROM lessons WHERE id = ?`).bind(id).first<AdminLessonRow>();
  if (!row) throw new Error("Failed to create lesson");
  return row;
}

export async function updateLesson(
  env: Env,
  id: number,
  fields: {
    title?: string;
    chapterName?: string;
    tagline?: string | null;
    description?: string | null;
    videoEmbedUrl?: string | null;
    thumbnailUrl?: string | null;
    isActive?: boolean;
  }
): Promise<void> {
  const existing = await env.DB.prepare(`SELECT * FROM lessons WHERE id = ?`).bind(id).first<AdminLessonRow>();
  if (!existing) throw new Error("not_found");

  const nextChapterName = fields.chapterName ?? existing.chapter_name;

  await env.DB.prepare(
    `UPDATE lessons SET
       title = ?, chapter_name = ?, tagline = ?, description = ?, video_embed_url = ?, thumbnail_url = ?, is_active = ?
     WHERE id = ?`
  )
    .bind(
      fields.title ?? existing.title,
      nextChapterName,
      fields.tagline !== undefined ? fields.tagline : existing.tagline,
      fields.description !== undefined ? fields.description : existing.description,
      fields.videoEmbedUrl !== undefined ? fields.videoEmbedUrl : existing.video_embed_url,
      fields.thumbnailUrl !== undefined ? fields.thumbnailUrl : existing.thumbnail_url,
      fields.isActive !== undefined ? (fields.isActive ? 1 : 0) : existing.is_active,
      id
    )
    .run();

  // Re-assigning a lesson to a different chapter (the Edit-lesson form's
  // Chapter dropdown) doesn't move its lesson_number/sort_order — without
  // resequencing it stays wherever it physically was, splitting either its
  // old or new chapter apart on the public course page.
  if (nextChapterName !== existing.chapter_name) {
    await resequenceLessonsByChapterOrder(env);
  }
}

/**
 * Reorders lessons AND renumbers them 1..N to match the new order —
 * lesson_number doubles as every learner's progress pointer
 * (`users.current_lesson`), so a reorder that didn't renumber would silently
 * desync existing learners' progress from the new sequence. This is safe
 * for content nobody has started yet; reordering classes that students are
 * actively partway through will shift what "Class N" means for them too,
 * same as it would on any sequentially-numbered course.
 */
export async function reorderLessons(env: Env, orderedIds: number[]): Promise<void> {
  // Two-pass renumber: lesson_number is UNIQUE, so writing final numbers
  // directly in id order can collide with another row that still holds its
  // old number (e.g. swapping two adjacent lessons). A negative-offset
  // placeholder pass avoids the collision, then the second pass writes the
  // real 1..N numbers.
  for (let i = 0; i < orderedIds.length; i++) {
    await env.DB.prepare(`UPDATE lessons SET lesson_number = ? WHERE id = ?`)
      .bind(-(i + 1), orderedIds[i])
      .run();
  }
  for (let i = 0; i < orderedIds.length; i++) {
    await env.DB.prepare(`UPDATE lessons SET sort_order = ?, lesson_number = ? WHERE id = ?`)
      .bind(i + 1, i + 1, orderedIds[i])
      .run();
  }
}

/**
 * Same-shape reorder as reorderLessons, but each entry may also carry the
 * lesson's new chapter — this is what powers the admin drag-and-drop (a
 * lesson dragged into a different chapter's section needs its chapter_name
 * updated, not just its position). Chapter changes are applied first so the
 * subsequent renumber/resequence sees the final chapter_name for every row.
 * Ordinary same-chapter reorders (the old up/down arrows) simply pass the
 * same chapterName back and this collapses to a no-op update.
 */
export async function reorderLessonsWithChapters(
  env: Env,
  orderedLessons: { id: number; chapterName: string }[]
): Promise<void> {
  for (const item of orderedLessons) {
    await env.DB.prepare(`UPDATE lessons SET chapter_name = ? WHERE id = ? AND chapter_name != ?`)
      .bind(item.chapterName, item.id, item.chapterName)
      .run();
  }
  await reorderLessons(env, orderedLessons.map((item) => item.id));
}

/**
 * Deletes a lesson row outright (unlike archiveLesson, which only hides it).
 * lesson_progress rows for it cascade-delete via the FK (migrations/0001),
 * so this permanently discards any student's completion state for this
 * specific lesson — the caller-facing confirm dialog should say so.
 */
export async function deleteLesson(env: Env, id: number): Promise<void> {
  const existing = await env.DB.prepare(`SELECT id FROM lessons WHERE id = ?`).bind(id).first<{ id: number }>();
  if (!existing) throw new Error("not_found");

  await env.DB.prepare(`DELETE FROM lessons WHERE id = ?`).bind(id).run();

  // Deleting a row leaves a gap in lesson_number/sort_order — resequence
  // everything that remains so numbering stays a clean, chapter-contiguous
  // 1..N sequence (same helper createLesson/updateLesson/reorderChapters use).
  await resequenceLessonsByChapterOrder(env);
}

/**
 * Re-sorts every lesson so that lessons belonging to the same chapter are
 * always contiguous, grouped in chapters.sort_order, with each chapter's own
 * lessons keeping their existing relative order. Several admin actions can
 * otherwise leave a chapter's classes split apart in lesson_number/sort_order
 * (a new lesson always inserts at the very end of the whole course, editing
 * a lesson's chapter doesn't move it, reordering chapters doesn't move their
 * lessons) — see createLesson, updateLesson, and reorderChapters, which all
 * call this afterward. The public course page (routes/lessons.ts) and its
 * outline (OutlineList.tsx) both assume a chapter's lessons are contiguous,
 * so any split shows up there as a duplicated/misnumbered chapter section.
 */
async function resequenceLessonsByChapterOrder(env: Env): Promise<void> {
  const chapters = await listChapters(env); // already ordered by sort_order
  const lessons = await env.DB.prepare(`SELECT id, chapter_name FROM lessons ORDER BY sort_order ASC, lesson_number ASC`)
    .all<{ id: number; chapter_name: string }>();

  const byChapter = new Map<string, number[]>();
  for (const lesson of lessons.results) {
    const list = byChapter.get(lesson.chapter_name) ?? [];
    list.push(lesson.id);
    byChapter.set(lesson.chapter_name, list);
  }

  const orderedIds: number[] = [];
  for (const chapter of chapters) {
    const ids = byChapter.get(chapter.name);
    if (ids) orderedIds.push(...ids);
  }
  // Defensive: a lesson whose chapter_name doesn't match any current chapter
  // (shouldn't normally happen) keeps a place rather than being dropped.
  const placed = new Set(orderedIds);
  for (const lesson of lessons.results) {
    if (!placed.has(lesson.id)) orderedIds.push(lesson.id);
  }

  if (orderedIds.length > 0) {
    await reorderLessons(env, orderedIds);
  }
}

/** Soft-delete: hides a lesson from the public course without destroying any student progress rows tied to it. */
export async function archiveLesson(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE lessons SET is_active = 0 WHERE id = ?`).bind(id).run();
}

export async function logAuditEvent(
  env: Env,
  eventType: string,
  opts: { userId?: string | null; ipHash?: string | null; metadata?: Record<string, unknown> } = {}
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_events (id, user_id, event_type, metadata, ip_hash) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      randomUuid(),
      opts.userId ?? null,
      eventType,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      opts.ipHash ?? null
    )
    .run();
}
