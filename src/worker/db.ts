import type { Env, SupportAgentProfile } from "./lib/config";
import { getFreeLessonCount } from "./lib/config";
import { randomUuid } from "./lib/crypto";
import { defaultLayout, reconcileLayout, type LayoutBlockState } from "./lib/layout";

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
 * Fixed-window rate limiter backed by D1.
 *
 * A single atomic UPSERT (INSERT ... ON CONFLICT DO UPDATE ... RETURNING)
 * rather than a separate SELECT-then-INSERT/UPDATE — the previous version
 * read the row, decided in JS whether to reset/increment, then wrote it
 * back in a second statement, leaving a window where two concurrent
 * requests for the same bucket could both read the same `count` and both
 * proceed, letting a burst slip a couple of requests past the limit. SQLite
 * (and D1) executes one statement as a single atomic step even with
 * concurrent callers, so folding the read-decide-write into one statement
 * closes that race. `bucket_key` is the table's PRIMARY KEY, which is what
 * makes ON CONFLICT well-defined here.
 *
 * window_start is stored as the same ISO-8601 string format as before
 * (readable, matches every other timestamp column in this schema);
 * strftime('%s', ...) converts both it and 'now' to Unix seconds for the
 * comparison, which SQLite parses correctly including the trailing 'Z'.
 */
export async function checkRateLimit(
  env: Env,
  bucketKey: string,
  maxCount: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const nowIso = new Date().toISOString();

  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket_key, count, window_start) VALUES (?, 1, ?)
     ON CONFLICT(bucket_key) DO UPDATE SET
       count = CASE
         WHEN (strftime('%s', ?) - strftime('%s', rate_limits.window_start)) > ?
         THEN 1
         ELSE rate_limits.count + 1
       END,
       window_start = CASE
         WHEN (strftime('%s', ?) - strftime('%s', rate_limits.window_start)) > ?
         THEN excluded.window_start
         ELSE rate_limits.window_start
       END
     RETURNING count`
  )
    .bind(bucketKey, nowIso, nowIso, windowSeconds, nowIso, windowSeconds)
    .first<{ count: number }>();

  // The RETURNING row always comes back (insert or update path) — this null
  // check is just to satisfy the type checker / fail closed on a driver
  // that somehow doesn't support RETURNING.
  if (!row) return { allowed: false, remaining: 0 };

  if (row.count > maxCount) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxCount - row.count };
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
// site_content — admin-editable page copy (migrations/0013). Every key's
// default lives in worker/lib/content.ts (CONTENT_DEFAULTS) — that's the
// single source of truth for "what keys exist" and "what do they say until
// an admin changes them". A row only exists here once an admin has actually
// looked at (via listContentAdmin/upsert) or overridden a key; getContentMap
// falls back to CONTENT_DEFAULTS for anything with no row, or a NULL value.
// ---------------------------------------------------------------------------
export interface ContentRow {
  key: string;
  value: string | null;
  default_value: string;
  updated_at: string;
  updated_by: string | null;
}

/** Public/runtime read path: key -> effective value (override, or the built-in default). Never 500s on a missing table row. */
export async function getContentMap(env: Env, defaults: Record<string, string>): Promise<Record<string, string>> {
  const result = await env.DB.prepare(`SELECT key, value FROM site_content`).all<{ key: string; value: string | null }>();
  const overrides = new Map(result.results.map((r) => [r.key, r.value]));
  const map: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const override = overrides.get(key);
    map[key] = override !== undefined && override !== null && override !== "" ? override : fallback;
  }
  return map;
}

/** Admin read path: every known key, its current override (if any) and its default, so the Content page can show both and offer "reset to default". */
export async function listContentAdmin(env: Env, defs: { key: string; defaultValue: string }[]): Promise<ContentRow[]> {
  const result = await env.DB.prepare(`SELECT key, value, updated_at, updated_by FROM site_content`).all<{
    key: string;
    value: string | null;
    updated_at: string;
    updated_by: string | null;
  }>();
  const rows = new Map(result.results.map((r) => [r.key, r]));
  return defs.map((def) => {
    const row = rows.get(def.key);
    return {
      key: def.key,
      value: row?.value ?? null,
      default_value: def.defaultValue,
      updated_at: row?.updated_at ?? "",
      updated_by: row?.updated_by ?? null
    };
  });
}

/** Sets (or clears, when value is null/empty) one content override. Mirrors setSetting's upsert shape. */
export async function setContentValue(
  env: Env,
  key: string,
  value: string | null,
  defaultValue: string,
  updatedByAdminId: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_content (key, value, default_value, updated_at, updated_by) VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), updated_by = excluded.updated_by`
  )
    .bind(key, value, defaultValue, updatedByAdminId)
    .run();
}

/** "Reset to default" — clears the override (value = NULL) rather than deleting the row, so updated_at/updated_by still reflect the reset. */
export async function resetContentValue(env: Env, key: string, defaultValue: string, updatedByAdminId: string | null): Promise<void> {
  await setContentValue(env, key, null, defaultValue, updatedByAdminId);
}

// ---------------------------------------------------------------------------
// site_layout — per-page block order/visibility (migrations/0014, Phase 3).
// PAGE_BLOCKS (worker/lib/layout.ts) is the source of truth for which block
// ids exist per page; this table only ever stores an order/visibility over
// that fixed set — see reconcileLayout for how a stored row is protected
// against drifting out of sync with the registry.
// ---------------------------------------------------------------------------
interface LayoutRow {
  page_key: string;
  blocks: string;
  updated_at: string;
  updated_by: string | null;
}

/** Public/runtime read path for one page: reconciled, ordered block list. Falls back to the full default order on any DB error or missing row. */
export async function getLayout(env: Env, pageKey: string): Promise<LayoutBlockState[]> {
  try {
    const row = await env.DB.prepare(`SELECT blocks FROM site_layout WHERE page_key = ?`).bind(pageKey).first<{ blocks: string }>();
    if (!row) return defaultLayout(pageKey);
    const parsed = JSON.parse(row.blocks) as LayoutBlockState[];
    return reconcileLayout(pageKey, parsed);
  } catch {
    return defaultLayout(pageKey);
  }
}

/** Public/runtime read path for every registered page at once (used by the single /config/layout fetch). */
export async function getAllLayouts(env: Env, pageKeys: string[]): Promise<Record<string, LayoutBlockState[]>> {
  const result = await env.DB.prepare(`SELECT page_key, blocks FROM site_layout`).all<LayoutRow>();
  const rows = new Map(result.results.map((r) => [r.page_key, r.blocks]));
  const layouts: Record<string, LayoutBlockState[]> = {};
  for (const pageKey of pageKeys) {
    const raw = rows.get(pageKey);
    if (!raw) {
      layouts[pageKey] = defaultLayout(pageKey);
      continue;
    }
    try {
      layouts[pageKey] = reconcileLayout(pageKey, JSON.parse(raw) as LayoutBlockState[]);
    } catch {
      layouts[pageKey] = defaultLayout(pageKey);
    }
  }
  return layouts;
}

/** Admin read path: every registered page's current (reconciled) block order. */
export async function listLayoutsAdmin(env: Env, pageKeys: string[]): Promise<Record<string, LayoutBlockState[]>> {
  return getAllLayouts(env, pageKeys);
}

export async function setLayout(env: Env, pageKey: string, blocks: LayoutBlockState[], updatedByAdminId: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_layout (page_key, blocks, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(page_key) DO UPDATE SET blocks = excluded.blocks, updated_at = datetime('now'), updated_by = excluded.updated_by`
  )
    .bind(pageKey, JSON.stringify(blocks), updatedByAdminId)
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

/**
 * Permanently deletes one student's account and every row that hangs off
 * it. We rely on the schema's `ON DELETE CASCADE` (sessions, lesson_progress,
 * assignments, payment_orders, notifications, support_messages all
 * reference users(id) that way — see migrations/0001 and 0008), so a single
 * DELETE on `users` is enough as long as foreign_keys is ON for this
 * connection. `audit_events.user_id` is `ON DELETE SET NULL`, so the audit
 * trail survives the deletion instead of vanishing with it.
 *
 * Throws "not_found" if the id doesn't match an existing user, same
 * convention as deleteLesson/deleteChapter below.
 */
export async function deleteUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("PRAGMA foreign_keys = ON").run();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first<{ id: string }>();
  if (!existing) throw new Error("not_found");
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

/**
 * Wipes EVERY student's account and everything that cascades from it
 * (sessions, progress, assignments, payment history, notifications,
 * support messages) — course content (lessons/chapters), admin accounts,
 * and site settings are untouched. Irreversible; the caller (route) is
 * responsible for requiring an explicit typed confirmation before this is
 * ever invoked. Returns how many accounts were removed, for the confirmation
 * screen / audit log.
 */
export async function wipeAllUsers(env: Env): Promise<number> {
  await env.DB.prepare("PRAGMA foreign_keys = ON").run();
  const countRow = await env.DB.prepare("SELECT COUNT(*) as n FROM users").first<{ n: number }>();
  const count = countRow?.n ?? 0;
  await env.DB.prepare("DELETE FROM users").run();
  return count;
}

// ---------------------------------------------------------------------------
// Chapters — admin-manageable groupings (replaces the old static, hardcoded
// semester array this project used to ship). `name` is the join key against
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
  watermark_enabled: number;
  /** Admin-entered display label like "12:45" — see migration 0018. Never auto-detected. */
  duration_label: string | null;
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
  fields: {
    title: string;
    chapterName: string;
    tagline: string | null;
    description: string | null;
    videoEmbedUrl: string | null;
    thumbnailUrl?: string | null;
    watermarkEnabled?: boolean;
    durationLabel?: string | null;
  }
): Promise<AdminLessonRow> {
  const maxRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(lesson_number), 0) as maxNumber, COALESCE(MAX(sort_order), 0) as maxSort FROM lessons`
  ).first<{ maxNumber: number; maxSort: number }>();
  const nextNumber = (maxRow?.maxNumber ?? 0) + 1;
  const nextSort = (maxRow?.maxSort ?? 0) + 1;

  const insert = await env.DB.prepare(
    `INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, video_embed_url, is_free, is_active, sort_order, watermark_enabled, duration_label)
     VALUES (?, ?, ?, ?, 'N/A', ?, ?, ?, 0, 1, ?, ?, ?)`
  )
    .bind(
      nextNumber,
      fields.title,
      fields.chapterName,
      fields.thumbnailUrl ?? null,
      fields.description,
      fields.tagline,
      fields.videoEmbedUrl,
      nextSort,
      fields.watermarkEnabled ? 1 : 0,
      fields.durationLabel ?? null
    )
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
    watermarkEnabled?: boolean;
    durationLabel?: string | null;
  }
): Promise<void> {
  const existing = await env.DB.prepare(`SELECT * FROM lessons WHERE id = ?`).bind(id).first<AdminLessonRow>();
  if (!existing) throw new Error("not_found");

  const nextChapterName = fields.chapterName ?? existing.chapter_name;

  await env.DB.prepare(
    `UPDATE lessons SET
       title = ?, chapter_name = ?, tagline = ?, description = ?, video_embed_url = ?, thumbnail_url = ?, is_active = ?, watermark_enabled = ?, duration_label = ?
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
      fields.watermarkEnabled !== undefined ? (fields.watermarkEnabled ? 1 : 0) : existing.watermark_enabled,
      fields.durationLabel !== undefined ? fields.durationLabel : existing.duration_label,
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

/**
 * Clones a lesson (title gets a " (copy)" suffix) into the SAME chapter. The
 * clone is always created hidden (is_active = 0) regardless of the source's
 * state — same "review before publishing" rule as a brand-new lesson (see
 * createLesson) — and never copies watch progress, since it's a distinct
 * lesson row. Lands at the end of its chapter, exactly like createLesson,
 * via the same resequence helper. Throws "not_found" if the source lesson
 * doesn't exist.
 */
export async function duplicateLesson(env: Env, id: number): Promise<AdminLessonRow> {
  const source = await env.DB.prepare(`SELECT * FROM lessons WHERE id = ?`).bind(id).first<AdminLessonRow>();
  if (!source) throw new Error("not_found");

  const maxRow = await env.DB.prepare(
    `SELECT COALESCE(MAX(lesson_number), 0) as maxNumber, COALESCE(MAX(sort_order), 0) as maxSort FROM lessons`
  ).first<{ maxNumber: number; maxSort: number }>();
  const nextNumber = (maxRow?.maxNumber ?? 0) + 1;
  const nextSort = (maxRow?.maxSort ?? 0) + 1;

  const insert = await env.DB.prepare(
    `INSERT INTO lessons (lesson_number, title, chapter_name, thumbnail_url, youtube_video_id, description, tagline, video_embed_url, is_free, is_active, sort_order, watermark_enabled, duration_label)
     VALUES (?, ?, ?, ?, 'N/A', ?, ?, ?, 0, 0, ?, ?, ?)`
  )
    .bind(
      nextNumber,
      `${source.title} (copy)`,
      source.chapter_name,
      source.thumbnail_url,
      source.description,
      source.tagline,
      source.video_embed_url,
      nextSort,
      source.watermark_enabled,
      source.duration_label
    )
    .run();
  const newId = insert.meta.last_row_id as number;

  await resequenceLessonsByChapterOrder(env);

  const row = await env.DB.prepare(`SELECT * FROM lessons WHERE id = ?`).bind(newId).first<AdminLessonRow>();
  if (!row) throw new Error("Failed to duplicate lesson");
  return row;
}

/**
 * Applies one action to many lessons at once (the Lessons page's bulk
 * toolbar). "delete" reuses deleteLesson's resequence-after so the numbering
 * stays clean even when several lessons vanish in one go. Returns how many
 * rows were actually affected (skips ids that don't exist rather than
 * throwing, since a bulk action should apply to what's still there).
 */
export async function bulkUpdateLessons(
  env: Env,
  ids: number[],
  action: "publish" | "unpublish" | "delete"
): Promise<number> {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");

  if (action === "delete") {
    const existing = await env.DB.prepare(`SELECT id FROM lessons WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: number }>();
    if (existing.results.length === 0) return 0;
    await env.DB.prepare(`DELETE FROM lessons WHERE id IN (${placeholders})`)
      .bind(...ids)
      .run();
    await resequenceLessonsByChapterOrder(env);
    return existing.results.length;
  }

  const isActive = action === "publish" ? 1 : 0;
  const result = await env.DB.prepare(`UPDATE lessons SET is_active = ? WHERE id IN (${placeholders})`)
    .bind(isActive, ...ids)
    .run();
  return result.meta.changes ?? 0;
}

// ---------------------------------------------------------------------------
// Revenue / signup analytics (Dashboard). Read-only aggregation queries over
// payment_orders and users — no new tables. "Revenue" only ever counts
// orders in a PAID_STATUSES-equivalent terminal state ('confirmed' or
// 'finished' — see services/nowpayments.ts PAID_STATUSES), so pending/failed
// checkouts never inflate the numbers.
// ---------------------------------------------------------------------------
const REVENUE_PAID_STATUSES = ["confirmed", "finished"] as const;

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
}

export interface SignupPoint {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface StatusBreakdownRow {
  status: string;
  count: number;
}

export interface RevenueAnalytics {
  totalRevenue: number;
  totalPaidOrders: number;
  avgOrderValue: number;
  revenueLast30Days: number;
  revenueThisMonth: number;
  revenuePrevMonth: number;
  dailyRevenue: DailyPoint[]; // last 30 days, always 30 entries (0-filled)
  dailySignups: SignupPoint[]; // last 30 days, always 30 entries (0-filled)
  statusBreakdown: StatusBreakdownRow[];
}

function last30DayKeys(): string[] {
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

export async function getRevenueAnalytics(env: Env): Promise<RevenueAnalytics> {
  const paidPlaceholders = REVENUE_PAID_STATUSES.map(() => "?").join(",");

  const totalsRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
     FROM payment_orders WHERE status IN (${paidPlaceholders})`
  )
    .bind(...REVENUE_PAID_STATUSES)
    .first<{ total: number; cnt: number }>();

  const last30Row = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE status IN (${paidPlaceholders}) AND confirmed_at >= datetime('now', '-30 days')`
  )
    .bind(...REVENUE_PAID_STATUSES)
    .first<{ total: number }>();

  const thisMonthRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE status IN (${paidPlaceholders}) AND strftime('%Y-%m', confirmed_at) = strftime('%Y-%m', 'now')`
  )
    .bind(...REVENUE_PAID_STATUSES)
    .first<{ total: number }>();

  const prevMonthRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE status IN (${paidPlaceholders}) AND strftime('%Y-%m', confirmed_at) = strftime('%Y-%m', 'now', '-1 month')`
  )
    .bind(...REVENUE_PAID_STATUSES)
    .first<{ total: number }>();

  const dailyRows = await env.DB.prepare(
    `SELECT date(confirmed_at) as day, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
     FROM payment_orders
     WHERE status IN (${paidPlaceholders}) AND confirmed_at >= datetime('now', '-30 days')
     GROUP BY day`
  )
    .bind(...REVENUE_PAID_STATUSES)
    .all<{ day: string; total: number; cnt: number }>();

  const signupRows = await env.DB.prepare(
    `SELECT date(created_at) as day, COUNT(*) as cnt
     FROM users
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY day`
  ).all<{ day: string; cnt: number }>();

  const statusRows = await env.DB.prepare(
    `SELECT status, COUNT(*) as cnt FROM payment_orders GROUP BY status ORDER BY cnt DESC`
  ).all<{ status: string; cnt: number }>();

  const revenueByDay = new Map(dailyRows.results.map((r) => [r.day, r]));
  const signupsByDay = new Map(signupRows.results.map((r) => [r.day, r.cnt]));

  const days = last30DayKeys();
  const dailyRevenue: DailyPoint[] = days.map((day) => ({
    date: day,
    amount: revenueByDay.get(day)?.total ?? 0,
    count: revenueByDay.get(day)?.cnt ?? 0
  }));
  const dailySignups: SignupPoint[] = days.map((day) => ({ date: day, count: signupsByDay.get(day) ?? 0 }));

  const total = totalsRow?.total ?? 0;
  const cnt = totalsRow?.cnt ?? 0;

  return {
    totalRevenue: total,
    totalPaidOrders: cnt,
    avgOrderValue: cnt > 0 ? total / cnt : 0,
    revenueLast30Days: last30Row?.total ?? 0,
    revenueThisMonth: thisMonthRow?.total ?? 0,
    revenuePrevMonth: prevMonthRow?.total ?? 0,
    dailyRevenue,
    dailySignups,
    statusBreakdown: statusRows.results.map((r) => ({ status: r.status, count: r.cnt }))
  };
}

// ---------------------------------------------------------------------------
// Advanced analytics (admin panel's Analytics page — GET
// /admin/analytics/advanced). A deeper, filterable sibling to
// getRevenueAnalytics above: same read-only aggregation style and the same
// REVENUE_PAID_STATUSES convention for what counts as "revenue", but
// filterable by date range / granularity / cohort (course_status) /
// currency / order status, and covering signups, funnel, lesson &
// chapter completion, and support on top of revenue.
// ---------------------------------------------------------------------------

/** Mirrors payment_orders' CHECK(status IN (...)) constraint — see migrations/0005. Hardcoded rather than a DISTINCT query so every possible status always shows up as a filter option, even ones with zero rows yet. */
export const ORDER_STATUSES = [
  "created",
  "waiting",
  "confirming",
  "confirmed",
  "finished",
  "failed",
  "expired",
  "cancelled"
] as const;

export interface AdvancedAnalyticsFilters {
  dateFrom: string; // YYYY-MM-DD, inclusive
  dateTo: string; // YYYY-MM-DD, inclusive
  granularity: "day" | "week" | "month";
  courseStatus: "all" | "free" | "paid";
  currency: string; // "all" or an exact payment_orders.currency value
  paymentStatuses: string[]; // empty = every status
}

export interface AdvancedTrendPoint {
  period: string;
  amount: number;
  count: number;
}

export interface AdvancedStatusBreakdownRow {
  status: string;
  count: number;
  amount: number;
}

export interface AdvancedCurrencyBreakdownRow {
  currency: string;
  count: number;
  amount: number;
}

export interface FunnelStage {
  stage: string;
  count: number;
}

export interface ChapterCompletionRow {
  chapterName: string;
  totalLessons: number;
  avgCompletionRate: number;
}

export interface LessonCompletionRow {
  lessonNumber: number;
  title: string;
  chapterName: string;
  completedCount: number;
  totalEligible: number;
  completionRate: number;
}

export interface AdvancedAnalytics {
  range: { from: string; to: string };
  kpis: {
    totalStudents: number;
    newStudentsInRange: number;
    paidStudents: number;
    freeStudents: number;
    conversionRate: number;
    totalRevenue: number;
    totalOrders: number;
    avgOrderValue: number;
    avgDaysToConvert: number | null;
    avgLessonCompletionRate: number;
  };
  revenueTrend: AdvancedTrendPoint[];
  signupTrend: AdvancedTrendPoint[];
  statusBreakdown: AdvancedStatusBreakdownRow[];
  currencyBreakdown: AdvancedCurrencyBreakdownRow[];
  funnel: FunnelStage[];
  chapterCompletion: ChapterCompletionRow[];
  lessonCompletion: LessonCompletionRow[];
  supportStats: { open: number; resolved: number; total: number };
  underpaidOrderCount: number;
  filterOptions: { currencies: string[]; chapters: string[]; statuses: string[] };
}

/**
 * Builds the `date(...)` SQL fragment used to bucket a timestamp column
 * into a trend period. `granularity` is always one of the three literal
 * values the route handler validates before this is ever called — never
 * raw request input — so splicing it into the SQL string here (SQLite has
 * no way to bind a function's date-modifier argument as a parameter) can't
 * be used for injection. Week buckets start on Sunday (`strftime('%w', …)`
 * is 0 for Sunday); month buckets use SQLite's built-in 'start of month'.
 */
function periodExprFor(column: string, granularity: AdvancedAnalyticsFilters["granularity"]): string {
  switch (granularity) {
    case "week":
      return `date(${column}, '-' || strftime('%w', ${column}) || ' days')`;
    case "month":
      return `date(${column}, 'start of month')`;
    case "day":
    default:
      return `date(${column})`;
  }
}

export async function getAdvancedAnalytics(env: Env, filters: AdvancedAnalyticsFilters): Promise<AdvancedAnalytics> {
  const { dateFrom, dateTo, granularity, courseStatus, currency, paymentStatuses } = filters;

  // Cohort (course_status) filter — two variants, since some queries below
  // hit `users` bare and others join it in as `u`.
  const cohortClause = courseStatus !== "all" ? "AND course_status = ?" : "";
  const cohortClauseU = courseStatus !== "all" ? "AND u.course_status = ?" : "";
  const cohortParam = courseStatus !== "all" ? [courseStatus] : [];

  const currencyClause = currency !== "all" ? "AND currency = ?" : "";
  const currencyParam = currency !== "all" ? [currency] : [];

  // Which statuses count as "revenue" for the breakdown/trend queries that
  // respect the order-status filter — the admin's selection if they made
  // one, otherwise the same paid/finished pair getRevenueAnalytics uses.
  const filterableRevenueStatuses = paymentStatuses.length > 0 ? paymentStatuses : [...REVENUE_PAID_STATUSES];

  const revenuePeriod = periodExprFor("confirmed_at", granularity);
  const signupPeriod = periodExprFor("created_at", granularity);

  // ---- Student KPIs ---------------------------------------------------------
  const totalStudentsRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE 1=1 ${cohortClause}`)
    .bind(...cohortParam)
    .first<{ cnt: number }>();

  const newStudentsRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE date(created_at) BETWEEN ? AND ? ${cohortClause}`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  // Intersected with the cohort filter (not just "paid") so that, e.g.,
  // filtering to the "free" cohort correctly shows 0 paid students in
  // range rather than every paid student site-wide.
  const paidInRangeRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE date(created_at) BETWEEN ? AND ? AND course_status = 'paid' ${cohortClause}`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  const newStudentsInRange = newStudentsRow?.cnt ?? 0;
  const paidStudents = paidInRangeRow?.cnt ?? 0;
  const freeStudents = Math.max(0, newStudentsInRange - paidStudents);
  const conversionRate = newStudentsInRange > 0 ? Math.round((paidStudents / newStudentsInRange) * 100) : 0;

  // ---- Revenue KPIs — always the paid/finished statuses, regardless of
  // the order-status filter (a "Revenue in range" number that changes
  // meaning when someone ticks "failed" would be actively misleading). ----
  const revenuePaidPlaceholders = REVENUE_PAID_STATUSES.map(() => "?").join(",");
  const revenueKpiRow = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
     FROM payment_orders
     WHERE date(confirmed_at) BETWEEN ? AND ? AND status IN (${revenuePaidPlaceholders}) ${currencyClause}`
  )
    .bind(dateFrom, dateTo, ...REVENUE_PAID_STATUSES, ...currencyParam)
    .first<{ total: number; cnt: number }>();

  const totalRevenue = revenueKpiRow?.total ?? 0;
  const totalOrders = revenueKpiRow?.cnt ?? 0;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const convertRow = await env.DB.prepare(
    `SELECT AVG(julianday(paid_at) - julianday(created_at)) as avg_days
     FROM users WHERE paid_at IS NOT NULL AND date(paid_at) BETWEEN ? AND ?`
  )
    .bind(dateFrom, dateTo)
    .first<{ avg_days: number | null }>();
  const avgDaysToConvert = convertRow?.avg_days != null ? Math.round(convertRow.avg_days * 10) / 10 : null;

  // ---- Trends -----------------------------------------------------------
  const revenueTrendRows = await env.DB.prepare(
    `SELECT ${revenuePeriod} as period, COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt
     FROM payment_orders
     WHERE date(confirmed_at) BETWEEN ? AND ? AND status IN (${revenuePaidPlaceholders}) ${currencyClause}
     GROUP BY period ORDER BY period ASC`
  )
    .bind(dateFrom, dateTo, ...REVENUE_PAID_STATUSES, ...currencyParam)
    .all<{ period: string; total: number; cnt: number }>();

  const signupTrendRows = await env.DB.prepare(
    `SELECT ${signupPeriod} as period, COUNT(*) as cnt
     FROM users
     WHERE date(created_at) BETWEEN ? AND ? ${cohortClause}
     GROUP BY period ORDER BY period ASC`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .all<{ period: string; cnt: number }>();

  const revenueTrend: AdvancedTrendPoint[] = revenueTrendRows.results.map((r) => ({
    period: r.period,
    amount: r.total,
    count: r.cnt
  }));
  const signupTrend: AdvancedTrendPoint[] = signupTrendRows.results.map((r) => ({
    period: r.period,
    amount: 0,
    count: r.cnt
  }));

  // ---- Breakdowns ---------------------------------------------------------
  // Status breakdown deliberately ignores the order-status filter — showing
  // the distribution ACROSS statuses is the whole point of this panel.
  const statusBreakdownRows = await env.DB.prepare(
    `SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE date(created_at) BETWEEN ? AND ? ${currencyClause}
     GROUP BY status ORDER BY cnt DESC`
  )
    .bind(dateFrom, dateTo, ...currencyParam)
    .all<{ status: string; cnt: number; total: number }>();

  // Currency breakdown, conversely, respects the order-status filter (it's
  // not the axis being broken down) but ignores the currency filter itself.
  const filterableStatusPlaceholders = filterableRevenueStatuses.map(() => "?").join(",");
  const currencyBreakdownRows = await env.DB.prepare(
    `SELECT currency, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE date(created_at) BETWEEN ? AND ? AND status IN (${filterableStatusPlaceholders})
     GROUP BY currency ORDER BY total DESC`
  )
    .bind(dateFrom, dateTo, ...filterableRevenueStatuses)
    .all<{ currency: string; cnt: number; total: number }>();

  const statusBreakdown: AdvancedStatusBreakdownRow[] = statusBreakdownRows.results.map((r) => ({
    status: r.status,
    count: r.cnt,
    amount: r.total
  }));
  const currencyBreakdown: AdvancedCurrencyBreakdownRow[] = currencyBreakdownRows.results.map((r) => ({
    currency: r.currency,
    count: r.cnt,
    amount: r.total
  }));

  const underpaidRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM payment_orders
     WHERE date(created_at) BETWEEN ? AND ? AND underpaid_tolerated = 1 ${currencyClause}`
  )
    .bind(dateFrom, dateTo, ...currencyParam)
    .first<{ cnt: number }>();

  // ---- Funnel -------------------------------------------------------------
  const startedRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users u
     WHERE date(u.created_at) BETWEEN ? AND ? ${cohortClauseU}
       AND EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = u.id)`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  const completedAnyRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users u
     WHERE date(u.created_at) BETWEEN ? AND ? ${cohortClauseU}
       AND EXISTS (SELECT 1 FROM lesson_progress lp WHERE lp.user_id = u.id AND lp.video_completed = 1)`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  const funnel: FunnelStage[] = [
    { stage: "Signed up", count: newStudentsInRange },
    { stage: "Started a lesson", count: startedRow?.cnt ?? 0 },
    { stage: "Completed a lesson", count: completedAnyRow?.cnt ?? 0 },
    { stage: "Paid", count: paidStudents }
  ];

  // ---- Lesson / chapter completion — cohort-filtered but NOT date-range
  // limited (progress isn't naturally bound to a signup window). ----------
  const freeLessonCount = await getFreeLessonCount(env);

  const lessonsResult = await env.DB.prepare(
    `SELECT id, lesson_number, title, chapter_name FROM lessons WHERE is_active = 1 ORDER BY sort_order ASC, lesson_number ASC`
  ).all<{ id: number; lesson_number: number; title: string; chapter_name: string }>();

  const paidTotalRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE course_status = 'paid' ${cohortClause}`)
    .bind(...cohortParam)
    .first<{ cnt: number }>();

  const completedByLessonRows = await env.DB.prepare(
    `SELECT lp.lesson_id as lesson_id, COUNT(*) as cnt
     FROM lesson_progress lp
     JOIN users u ON u.id = lp.user_id
     WHERE lp.video_completed = 1 ${cohortClauseU}
     GROUP BY lp.lesson_id`
  )
    .bind(...cohortParam)
    .all<{ lesson_id: number; cnt: number }>();

  const completedByLesson = new Map(completedByLessonRows.results.map((r) => [r.lesson_id, r.cnt]));
  const allStudentsTotal = totalStudentsRow?.cnt ?? 0;
  const paidStudentsTotal = paidTotalRow?.cnt ?? 0;

  const lessonCompletion: LessonCompletionRow[] = lessonsResult.results.map((l) => {
    const isFree = l.lesson_number <= freeLessonCount;
    const totalEligible = isFree ? allStudentsTotal : paidStudentsTotal;
    const completedCount = completedByLesson.get(l.id) ?? 0;
    const completionRate = totalEligible > 0 ? Math.round((completedCount / totalEligible) * 100) : 0;
    return {
      lessonNumber: l.lesson_number,
      title: l.title,
      chapterName: l.chapter_name,
      completedCount,
      totalEligible,
      completionRate
    };
  });

  const chapterOrder: string[] = [];
  const chapterTotals = new Map<string, { total: number; sumRate: number }>();
  for (const l of lessonCompletion) {
    if (!chapterTotals.has(l.chapterName)) chapterOrder.push(l.chapterName);
    const entry = chapterTotals.get(l.chapterName) ?? { total: 0, sumRate: 0 };
    entry.total += 1;
    entry.sumRate += l.completionRate;
    chapterTotals.set(l.chapterName, entry);
  }
  const chapterCompletion: ChapterCompletionRow[] = chapterOrder.map((chapterName) => {
    const entry = chapterTotals.get(chapterName)!;
    return { chapterName, totalLessons: entry.total, avgCompletionRate: Math.round(entry.sumRate / entry.total) };
  });

  const avgLessonCompletionRate =
    lessonCompletion.length > 0
      ? Math.round(lessonCompletion.reduce((sum, l) => sum + l.completionRate, 0) / lessonCompletion.length)
      : 0;

  // ---- Support ------------------------------------------------------------
  const supportRow = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_cnt,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cnt,
       COUNT(*) as total
     FROM support_tickets WHERE date(created_at) BETWEEN ? AND ?`
  )
    .bind(dateFrom, dateTo)
    .first<{ open_cnt: number | null; closed_cnt: number | null; total: number }>();

  // ---- Filter options -------------------------------------------------------
  const currenciesResult = await env.DB.prepare(`SELECT DISTINCT currency FROM payment_orders ORDER BY currency ASC`).all<{
    currency: string;
  }>();
  const chaptersResult = await env.DB.prepare(`SELECT name FROM chapters ORDER BY sort_order ASC`).all<{ name: string }>();

  return {
    range: { from: dateFrom, to: dateTo },
    kpis: {
      totalStudents: allStudentsTotal,
      newStudentsInRange,
      paidStudents,
      freeStudents,
      conversionRate,
      totalRevenue,
      totalOrders,
      avgOrderValue,
      avgDaysToConvert,
      avgLessonCompletionRate
    },
    revenueTrend,
    signupTrend,
    statusBreakdown,
    currencyBreakdown,
    funnel,
    chapterCompletion,
    lessonCompletion,
    supportStats: {
      open: supportRow?.open_cnt ?? 0,
      resolved: supportRow?.closed_cnt ?? 0,
      total: supportRow?.total ?? 0
    },
    underpaidOrderCount: underpaidRow?.cnt ?? 0,
    filterOptions: {
      currencies: currenciesResult.results.map((r) => r.currency),
      chapters: chaptersResult.results.map((r) => r.name),
      statuses: [...ORDER_STATUSES]
    }
  };
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

// ---------------------------------------------------------------------------
// Support inbox (migrations/0016, 0017) — in-site ticket/thread system that
// replaces the Telegram support button. See routes/support.ts (learner) and
// routes/admin-support.ts (admin). "Identity" for a ticket is either a
// logged-in user_id or a guest_id from the support_guest_id cookie — never
// both, and every helper below that takes an identity expects exactly one
// of the two to be set.
// ---------------------------------------------------------------------------

export interface SupportIdentity {
  userId: string | null;
  guestId: string | null;
}

export interface SupportTicketRow {
  id: string;
  user_id: string | null;
  guest_id: string | null;
  guest_email: string | null;
  agent_profile: SupportAgentProfile;
  status: "open" | "closed";
  subject: string | null;
  created_at: string;
  last_message_at: string;
  hidden_by_user_at: string | null;
  origin_path: string | null;
}

export interface SupportTicketListItem extends SupportTicketRow {
  unread_count: number;
}

export interface SupportMessageRow {
  id: string;
  ticket_id: string;
  sender_type: "user" | "admin";
  body: string | null;
  has_attachment: number; // 0/1 — derived, blob bytes are never selected here
  attachment_mime: string | null;
  attachment_filename: string | null;
  attachment_size: number | null;
  created_at: string;
  read_at: string | null;
}

export interface SupportAttachment {
  bytes: Uint8Array;
  mime: string;
  filename: string;
  ticket_id: string;
}

/** True if this ticket belongs to the given identity (user OR guest, never both). Used by every learner-facing route to gate access before returning/mutating anything. */
export function supportTicketBelongsTo(ticket: SupportTicketRow, identity: SupportIdentity): boolean {
  if (identity.userId) return ticket.user_id === identity.userId;
  if (identity.guestId) return ticket.guest_id === identity.guestId;
  return false;
}

/**
 * True if this identity already has a ticket that's still visible to them
 * (hidden_by_user_at IS NULL). A learner may only have ONE ticket open at a
 * time — see routes/support.ts' create-ticket handler — closing
 * ("Close conversation", which sets hidden_by_user_at) is what frees them up
 * to start a new one. This intentionally ignores admin open/closed
 * `status`: an admin-closed-but-not-hidden ticket still counts as "theirs"
 * until the learner themselves closes it, since they can still see and
 * reply into it.
 */
export async function hasVisibleSupportTicket(env: Env, identity: SupportIdentity): Promise<boolean> {
  const column = identity.userId ? "user_id" : "guest_id";
  const value = identity.userId ?? identity.guestId;
  if (!value) return false;
  const row = await env.DB.prepare(
    `SELECT 1 as found FROM support_tickets WHERE ${column} = ? AND hidden_by_user_at IS NULL LIMIT 1`
  )
    .bind(value)
    .first<{ found: number }>();
  return Boolean(row);
}

export async function createSupportTicket(
  env: Env,
  fields: {
    userId: string | null;
    guestId: string | null;
    guestEmail: string | null;
    agentProfile: SupportAgentProfile;
    subject: string | null;
    originPath: string | null;
  }
): Promise<SupportTicketRow> {
  const id = randomUuid();
  await env.DB.prepare(
    `INSERT INTO support_tickets (id, user_id, guest_id, guest_email, agent_profile, status, subject, created_at, last_message_at, origin_path)
     VALUES (?, ?, ?, ?, ?, 'open', ?, datetime('now'), datetime('now'), ?)`
  )
    .bind(id, fields.userId, fields.guestId, fields.guestEmail, fields.agentProfile, fields.subject, fields.originPath)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first<SupportTicketRow>();
  if (!row) throw new Error("Failed to create support ticket");
  return row;
}

export async function getSupportTicket(env: Env, id: string): Promise<SupportTicketRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM support_tickets WHERE id = ?`).bind(id).first<SupportTicketRow>();
  return row ?? null;
}

/** Lists one identity's VISIBLE tickets (hidden_by_user_at IS NULL — see hideSupportTicketForUser), newest activity first, with an unread count (admin messages the learner hasn't read yet) per ticket. */
export async function listSupportTicketsForIdentity(env: Env, identity: SupportIdentity): Promise<SupportTicketListItem[]> {
  const column = identity.userId ? "user_id" : "guest_id";
  const value = identity.userId ?? identity.guestId;
  if (!value) return [];
  const result = await env.DB.prepare(
    `SELECT t.*,
       (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'admin' AND m.read_at IS NULL) as unread_count
     FROM support_tickets t
     WHERE t.${column} = ? AND t.hidden_by_user_at IS NULL
     ORDER BY t.last_message_at DESC`
  )
    .bind(value)
    .all<SupportTicketListItem>();
  return result.results;
}

/** Full thread for one ticket, oldest first. Never selects attachment_blob — see SupportAttachment / getSupportMessageAttachment for that. */
export async function listSupportMessages(env: Env, ticketId: string): Promise<SupportMessageRow[]> {
  const result = await env.DB.prepare(
    `SELECT id, ticket_id, sender_type, body,
       (attachment_blob IS NOT NULL) as has_attachment,
       attachment_mime, attachment_filename, attachment_size,
       created_at, read_at
     FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC`
  )
    .bind(ticketId)
    .all<SupportMessageRow>();
  return result.results;
}

/**
 * Sends a message into a ticket. Reopens a closed ticket (status -> 'open')
 * and always bumps last_message_at, whichever side sent it — this is the
 * only place either of those change outside the explicit close/reopen
 * actions. Attachment bytes (if any) are bound as a raw Uint8Array, never
 * base64 text.
 */
export async function createSupportMessage(
  env: Env,
  fields: {
    ticketId: string;
    senderType: "user" | "admin";
    body: string | null;
    attachment: { bytes: Uint8Array; mime: string; filename: string } | null;
  }
): Promise<SupportMessageRow> {
  const id = randomUuid();
  await env.DB.prepare(
    `INSERT INTO support_messages (id, ticket_id, sender_type, body, attachment_blob, attachment_mime, attachment_filename, attachment_size, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  )
    .bind(
      id,
      fields.ticketId,
      fields.senderType,
      fields.body,
      fields.attachment ? fields.attachment.bytes : null,
      fields.attachment ? fields.attachment.mime : null,
      fields.attachment ? fields.attachment.filename : null,
      fields.attachment ? fields.attachment.bytes.byteLength : null
    )
    .run();

  await env.DB.prepare(
    `UPDATE support_tickets SET status = 'open', last_message_at = datetime('now') WHERE id = ?`
  )
    .bind(fields.ticketId)
    .run();

  const row = await env.DB.prepare(
    `SELECT id, ticket_id, sender_type, body, (attachment_blob IS NOT NULL) as has_attachment, attachment_mime, attachment_filename, attachment_size, created_at, read_at
     FROM support_messages WHERE id = ?`
  )
    .bind(id)
    .first<SupportMessageRow>();
  if (!row) throw new Error("Failed to create support message");
  return row;
}

/** Marks every message from `unreadSenderType` in this ticket as read — called when the OTHER side opens the thread (learner reading marks admin messages read, and vice versa). */
export async function markSupportMessagesRead(env: Env, ticketId: string, unreadSenderType: "user" | "admin"): Promise<void> {
  await env.DB.prepare(
    `UPDATE support_messages SET read_at = datetime('now') WHERE ticket_id = ? AND sender_type = ? AND read_at IS NULL`
  )
    .bind(ticketId, unreadSenderType)
    .run();
}

/** Reads one message's attachment bytes for streaming — the caller is responsible for the ownership/auth check (join against support_tickets first). */
export async function getSupportMessageAttachment(env: Env, messageId: string): Promise<SupportAttachment | null> {
  const row = await env.DB.prepare(
    `SELECT ticket_id, attachment_blob, attachment_mime, attachment_filename FROM support_messages WHERE id = ? AND attachment_blob IS NOT NULL`
  )
    .bind(messageId)
    .first<{ ticket_id: string; attachment_blob: Uint8Array | ArrayBuffer; attachment_mime: string; attachment_filename: string }>();
  if (!row) return null;
  const bytes = row.attachment_blob instanceof Uint8Array ? row.attachment_blob : new Uint8Array(row.attachment_blob);
  return { bytes, mime: row.attachment_mime, filename: row.attachment_filename, ticket_id: row.ticket_id };
}

export async function shiftSupportTicketProfile(env: Env, ticketId: string, agentProfile: SupportAgentProfile): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET agent_profile = ? WHERE id = ?`).bind(agentProfile, ticketId).run();
}

export async function setSupportTicketStatus(env: Env, ticketId: string, status: "open" | "closed"): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET status = ? WHERE id = ?`).bind(status, ticketId).run();
}

/** Learner-side "Close conversation" — hides the ticket from their own list (see listSupportTicketsForIdentity) without touching admin-controlled `status`. Also frees the identity up to start a new ticket (see hasVisibleSupportTicket). */
export async function hideSupportTicketForUser(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET hidden_by_user_at = datetime('now') WHERE id = ?`).bind(ticketId).run();
}

/** Admin action — puts a learner-hidden ticket back into their ticket list. */
export async function unhideSupportTicket(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET hidden_by_user_at = NULL WHERE id = ?`).bind(ticketId).run();
}

/** Deletes one message (either sender). No ownership check here — admin-only route, gated by requireAdmin at the router level. */
export async function deleteSupportMessage(env: Env, messageId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM support_messages WHERE id = ?`).bind(messageId).run();
}

/**
 * Permanently deletes an entire ticket and everything in it. support_messages
 * has ON DELETE CASCADE on ticket_id (migrations/0016), so deleting the
 * support_tickets row is enough to take the messages (and any attachment
 * blobs) with it. No ownership check here — admin-only route, gated by
 * requireAdmin at the router level.
 */
export async function deleteSupportTicket(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM support_tickets WHERE id = ?`).bind(ticketId).run();
}

/**
 * Deletes every ticket (and, via cascade, every message) belonging to one
 * identity — the admin "delete profile" action in SupportPage.tsx's Users
 * column. Unlike listSupportTicketsAdmin's list, this ignores any active
 * admin filters and always deletes ALL of that identity's tickets, not just
 * the ones currently shown. Returns how many tickets were deleted.
 */
export async function deleteSupportTicketsForIdentity(env: Env, identity: SupportIdentity): Promise<number> {
  const column = identity.userId ? "user_id" : "guest_id";
  const value = identity.userId ?? identity.guestId;
  if (!value) return 0;
  const result = await env.DB.prepare(`DELETE FROM support_tickets WHERE ${column} = ?`).bind(value).run();
  return result.meta.changes ?? 0;
}

export interface SupportTicketAdminRow extends SupportTicketRow {
  user_email: string | null;
  user_name: string | null;
  course_status: "free" | "paid" | null;
  current_lesson: number | null;
  completed_lessons: number | null;
  total_lessons: number | null;
  unread_count: number;
  last_message_preview: string | null;
}

export interface SupportTicketAdminFilters {
  status?: "open" | "closed";
  agentProfile?: SupportAgentProfile;
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  search?: string;
  /** "paid"/"free" filter by the ticket owner's real course_status; "guest" means never-logged-in (user_id IS NULL). */
  userStatus?: "paid" | "free" | "guest";
}

/**
 * Admin inbox list — filterable, sorted by most recent activity. Unread
 * here means a learner message the admin hasn't read yet. Enriched with
 * enough about the ticket owner (login/paid-free status, lesson progress)
 * that the admin panel can show "who is this" without a second round trip
 * — see SupportPage.tsx's Users column, which groups this same result set
 * by identity rather than calling a separate endpoint.
 */
export async function listSupportTicketsAdmin(env: Env, filters: SupportTicketAdminFilters): Promise<SupportTicketAdminRow[]> {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.status) {
    clauses.push("t.status = ?");
    params.push(filters.status);
  }
  if (filters.agentProfile) {
    clauses.push("t.agent_profile = ?");
    params.push(filters.agentProfile);
  }
  if (filters.dateFrom) {
    clauses.push("date(t.created_at) >= date(?)");
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("date(t.created_at) <= date(?)");
    params.push(filters.dateTo);
  }
  if (filters.userStatus === "guest") {
    clauses.push("t.user_id IS NULL");
  } else if (filters.userStatus === "paid" || filters.userStatus === "free") {
    clauses.push("u.course_status = ?");
    params.push(filters.userStatus);
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    clauses.push(
      `(u.email LIKE ? OR u.name LIKE ? OR t.guest_email LIKE ? OR EXISTS (SELECT 1 FROM support_messages m WHERE m.ticket_id = t.id AND m.body LIKE ?))`
    );
    params.push(term, term, term, term);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const result = await env.DB.prepare(
    `SELECT t.*, u.email as user_email, u.name as user_name, u.course_status as course_status, u.current_lesson as current_lesson,
       (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON l.id = lp.lesson_id WHERE lp.user_id = t.user_id AND lp.video_completed = 1 AND l.is_active = 1) as completed_lessons,
       (SELECT COUNT(*) FROM lessons l WHERE l.is_active = 1) as total_lessons,
       (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id AND m.sender_type = 'user' AND m.read_at IS NULL) as unread_count,
       (SELECT COALESCE(m2.body, CASE WHEN m2.attachment_blob IS NOT NULL THEN '[attachment]' ELSE NULL END)
          FROM support_messages m2 WHERE m2.ticket_id = t.id ORDER BY m2.created_at DESC LIMIT 1) as last_message_preview
     FROM support_tickets t
     LEFT JOIN users u ON u.id = t.user_id
     ${where}
     ORDER BY t.last_message_at DESC`
  )
    .bind(...params)
    .all<SupportTicketAdminRow>();
  return result.results;
}

// ---------------------------------------------------------------------------
// Notifications (migrations/0008) — the single in-site notification stream
// the schema comment describes as shared by assignment approve/reject
// (future session's work — the review UI itself doesn't exist yet, see
// migrations/0008's comment on the `assignments` columns) and support-inbox
// replies (wired up here). See routes/notifications.ts (learner-facing) and
// admin-support.ts (where 'support_reply' rows are actually created).
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  user_id: string;
  type: "assignment_approved" | "assignment_rejected" | "support_reply";
  message: string;
  read_at: string | null;
  created_at: string;
}

/** * Cap for notifications.message, mirroring how createSupportTicket already
 * truncates `subject` to 80 chars. Notifications render as a one-line badge
 * on the support chat button (see SupportButton.tsx), so this is a bit more
 * generous than the ticket subject cap to keep a short reply readable in
 * full via the unread count / future list view while still bounding
 * pathological input.
 */
const NOTIFICATION_MESSAGE_MAX_LENGTH = 140;

export async function createNotification(
  env: Env,
  fields: { userId: string; type: NotificationRow["type"]; message: string }
): Promise<NotificationRow> {
  const id = randomUuid();
  const message = fields.message.slice(0, NOTIFICATION_MESSAGE_MAX_LENGTH);
  await env.DB.prepare(
    `INSERT INTO notifications (id, user_id, type, message, created_at) VALUES (?, ?, ?, ?, datetime('now'))`
  )
    .bind(id, fields.userId, fields.type, message)
    .run();
  const row = await env.DB.prepare(`SELECT * FROM notifications WHERE id = ?`).bind(id).first<NotificationRow>();
  if (!row) throw new Error("Failed to create notification");
  return row;
}

export async function getNotification(env: Env, id: string): Promise<NotificationRow | null> {
  const row = await env.DB.prepare(`SELECT * FROM notifications WHERE id = ?`).bind(id).first<NotificationRow>();
  return row ?? null;
}

export interface NotificationListResult {
  notifications: NotificationRow[];
  unreadCount: number;
}

/**
 * Lists a user's notifications, newest first (capped at `limit`), alongside
 * their TOTAL unread count — not just the unread count within this page —
 * so the bell badge stays accurate even once someone has more than `limit`
 * notifications.
 */
export async function listNotifications(env: Env, userId: string, limit = 30): Promise<NotificationListResult> {
  const [listResult, unreadRow] = await Promise.all([
    env.DB.prepare(`SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`)
      .bind(userId, limit)
      .all<NotificationRow>(),
    env.DB.prepare(`SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND read_at IS NULL`)
      .bind(userId)
      .first<{ cnt: number }>()
  ]);
  return { notifications: listResult.results, unreadCount: unreadRow?.cnt ?? 0 };
}

/** Marks one notification read. Caller must check ownership first (see routes/notifications.ts) — no ownership check here, same convention as markSupportMessagesRead taking a pre-validated ticketId. */
export async function markNotificationRead(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL`).bind(id).run();
}

export async function markAllNotificationsRead(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`)
    .bind(userId)
    .run();
}
