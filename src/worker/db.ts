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
  await env.DB.prepare(`INSERT INTO users (id, email, current_lesson, course_status) VALUES (?, ?, 1, 'free')`)
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

export async function getOrCreateUserByGoogle(env: Env, sub: string, email: string): Promise<UserRow> {
  const bySub = await findUserByGoogleSub(env, sub);
  if (bySub) return bySub;

  const byEmail = await findUserByEmail(env, email);
  const base = byEmail ?? (await createUser(env, email));

  await linkGoogleSub(env, base.id, sub);
  const linked = await findUserById(env, base.id);
  return linked ?? base;
}

export async function secondsSinceLastOtpRequest(env: Env, email: string): Promise<number | null> {
  const normalized = email.toLowerCase().trim();
  const row = await env.DB.prepare(`SELECT created_at FROM otp_codes WHERE email = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(normalized)
    .first<{ created_at: string }>();

  if (!row) return null;

  const createdAt = new Date(row.created_at.endsWith("Z") ? row.created_at : row.created_at + "Z");
  return (Date.now() - createdAt.getTime()) / 1000;
}

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

  if (!row) return { allowed: false, remaining: 0 };

  if (row.count > maxCount) {
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: maxCount - row.count };
}

export async function getSetting(env: Env, key: string, fallback?: string | null): Promise<string | null> {
  const row = await env.DB.prepare("SELECT value FROM site_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();
  if (row) return row.value;
  return fallback ?? null;
}

export async function setSetting(env: Env, key: string, value: string, updatedByAdminId: string | null): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_settings (key, value, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now'), updated_by = excluded.updated_by`
  )
    .bind(key, value, updatedByAdminId)
    .run();
}

export interface ContentRow {
  key: string;
  value: string | null;
  default_value: string;
  updated_at: string;
  updated_by: string | null;
}

export async function getContentMap(env: Env, defaults: Record<string, string>): Promise<Record<string, string>> {
  const result = await env.DB.prepare(`SELECT key, value FROM site_content`).all<{
    key: string;
    value: string | null;
  }>();
  const overrides = new Map(result.results.map((r) => [r.key, r.value]));
  const map: Record<string, string> = {};
  for (const [key, fallback] of Object.entries(defaults)) {
    const override = overrides.get(key);
    map[key] = override !== undefined && override !== null && override !== "" ? override : fallback;
  }
  return map;
}

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

export async function resetContentValue(
  env: Env,
  key: string,
  defaultValue: string,
  updatedByAdminId: string | null
): Promise<void> {
  await setContentValue(env, key, null, defaultValue, updatedByAdminId);
}

interface LayoutRow {
  page_key: string;
  blocks: string;
  updated_at: string;
  updated_by: string | null;
}

export async function getLayout(env: Env, pageKey: string): Promise<LayoutBlockState[]> {
  try {
    const row = await env.DB.prepare(`SELECT blocks FROM site_layout WHERE page_key = ?`)
      .bind(pageKey)
      .first<{ blocks: string }>();
    if (!row) return defaultLayout(pageKey);
    const parsed = JSON.parse(row.blocks) as LayoutBlockState[];
    return reconcileLayout(pageKey, parsed);
  } catch {
    return defaultLayout(pageKey);
  }
}

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

export async function listLayoutsAdmin(env: Env, pageKeys: string[]): Promise<Record<string, LayoutBlockState[]>> {
  return getAllLayouts(env, pageKeys);
}

export async function setLayout(
  env: Env,
  pageKey: string,
  blocks: LayoutBlockState[],
  updatedByAdminId: string | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO site_layout (page_key, blocks, updated_at, updated_by) VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(page_key) DO UPDATE SET blocks = excluded.blocks, updated_at = datetime('now'), updated_by = excluded.updated_by`
  )
    .bind(pageKey, JSON.stringify(blocks), updatedByAdminId)
    .run();
}

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

export async function setUserCourseStatus(env: Env, userId: string, status: "free" | "paid"): Promise<void> {
  if (status === "paid") {
    await env.DB.prepare(
      `UPDATE users SET course_status = 'paid', paid_at = COALESCE(paid_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`
    )
      .bind(userId)
      .run();
  } else {
    await env.DB.prepare(`UPDATE users SET course_status = 'free', updated_at = datetime('now') WHERE id = ?`)
      .bind(userId)
      .run();
  }
}

export async function deleteUser(env: Env, userId: string): Promise<void> {
  await env.DB.prepare("PRAGMA foreign_keys = ON").run();
  const existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(userId).first<{ id: string }>();
  if (!existing) throw new Error("not_found");
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

export async function wipeAllUsers(env: Env): Promise<number> {
  await env.DB.prepare("PRAGMA foreign_keys = ON").run();
  const countRow = await env.DB.prepare("SELECT COUNT(*) as n FROM users").first<{ n: number }>();
  const count = countRow?.n ?? 0;
  await env.DB.prepare("DELETE FROM users").run();
  return count;
}

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

export async function updateChapter(
  env: Env,
  id: number,
  fields: { name?: string; tagline?: string | null }
): Promise<void> {
  const existing = await env.DB.prepare(`SELECT * FROM chapters WHERE id = ?`).bind(id).first<ChapterRow>();
  if (!existing) throw new Error("not_found");

  const nextName = fields.name?.trim() || existing.name;
  const nextTagline = fields.tagline !== undefined ? fields.tagline : existing.tagline;

  await env.DB.prepare(`UPDATE chapters SET name = ?, tagline = ? WHERE id = ?`).bind(nextName, nextTagline, id).run();

  if (nextName !== existing.name) {
    await env.DB.prepare(`UPDATE lessons SET chapter_name = ? WHERE chapter_name = ?`)
      .bind(nextName, existing.name)
      .run();
  }
}

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

  const remaining = await listChapters(env);
  for (let i = 0; i < remaining.length; i++) {
    await env.DB.prepare(`UPDATE chapters SET sort_order = ? WHERE id = ?`)
      .bind(i + 1, remaining[i].id)
      .run();
  }
}

export async function reorderChapters(env: Env, orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    await env.DB.prepare(`UPDATE chapters SET sort_order = ? WHERE id = ?`)
      .bind(i + 1, orderedIds[i])
      .run();
  }

  await resequenceLessonsByChapterOrder(env);
}

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
  duration_label: string | null;
}

export async function listAdminLessons(env: Env): Promise<AdminLessonRow[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM lessons ORDER BY sort_order ASC, lesson_number ASC`
  ).all<AdminLessonRow>();
  return result.results;
}

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

  if (nextChapterName !== existing.chapter_name) {
    await resequenceLessonsByChapterOrder(env);
  }
}

export async function reorderLessons(env: Env, orderedIds: number[]): Promise<void> {
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

export async function reorderLessonsWithChapters(
  env: Env,
  orderedLessons: { id: number; chapterName: string }[]
): Promise<void> {
  for (const item of orderedLessons) {
    await env.DB.prepare(`UPDATE lessons SET chapter_name = ? WHERE id = ? AND chapter_name != ?`)
      .bind(item.chapterName, item.id, item.chapterName)
      .run();
  }
  await reorderLessons(
    env,
    orderedLessons.map((item) => item.id)
  );
}

export async function deleteLesson(env: Env, id: number): Promise<void> {
  const existing = await env.DB.prepare(`SELECT id FROM lessons WHERE id = ?`).bind(id).first<{ id: number }>();
  if (!existing) throw new Error("not_found");

  await env.DB.prepare(`DELETE FROM lessons WHERE id = ?`).bind(id).run();

  await resequenceLessonsByChapterOrder(env);
}

async function resequenceLessonsByChapterOrder(env: Env): Promise<void> {
  const chapters = await listChapters(env);
  const lessons = await env.DB.prepare(
    `SELECT id, chapter_name FROM lessons ORDER BY sort_order ASC, lesson_number ASC`
  ).all<{ id: number; chapter_name: string }>();

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
  const placed = new Set(orderedIds);
  for (const lesson of lessons.results) {
    if (!placed.has(lesson.id)) orderedIds.push(lesson.id);
  }

  if (orderedIds.length > 0) {
    await reorderLessons(env, orderedIds);
  }
}

export async function archiveLesson(env: Env, id: number): Promise<void> {
  await env.DB.prepare(`UPDATE lessons SET is_active = 0 WHERE id = ?`).bind(id).run();
}

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

const REVENUE_PAID_STATUSES = ["confirmed", "finished"] as const;

export interface DailyPoint {
  date: string;
  amount: number;
  count: number;
}

export interface SignupPoint {
  date: string;
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
  dailyRevenue: DailyPoint[];
  dailySignups: SignupPoint[];
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
  dateFrom: string;
  dateTo: string;
  granularity: "day" | "week" | "month";
  courseStatus: "all" | "free" | "paid";
  currency: string;
  paymentStatuses: string[];
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

  const cohortClause = courseStatus !== "all" ? "AND course_status = ?" : "";
  const cohortClauseU = courseStatus !== "all" ? "AND u.course_status = ?" : "";
  const cohortParam = courseStatus !== "all" ? [courseStatus] : [];

  const currencyClause = currency !== "all" ? "AND currency = ?" : "";
  const currencyParam = currency !== "all" ? [currency] : [];

  const filterableRevenueStatuses = paymentStatuses.length > 0 ? paymentStatuses : [...REVENUE_PAID_STATUSES];

  const revenuePeriod = periodExprFor("confirmed_at", granularity);
  const signupPeriod = periodExprFor("created_at", granularity);

  const totalStudentsRow = await env.DB.prepare(`SELECT COUNT(*) as cnt FROM users WHERE 1=1 ${cohortClause}`)
    .bind(...cohortParam)
    .first<{ cnt: number }>();

  const newStudentsRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE date(created_at) BETWEEN ? AND ? ${cohortClause}`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  const paidInRangeRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE date(created_at) BETWEEN ? AND ? AND course_status = 'paid' ${cohortClause}`
  )
    .bind(dateFrom, dateTo, ...cohortParam)
    .first<{ cnt: number }>();

  const newStudentsInRange = newStudentsRow?.cnt ?? 0;
  const paidStudents = paidInRangeRow?.cnt ?? 0;
  const freeStudents = Math.max(0, newStudentsInRange - paidStudents);
  const conversionRate = newStudentsInRange > 0 ? Math.round((paidStudents / newStudentsInRange) * 100) : 0;

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

  const statusBreakdownRows = await env.DB.prepare(
    `SELECT status, COUNT(*) as cnt, COALESCE(SUM(amount), 0) as total
     FROM payment_orders
     WHERE date(created_at) BETWEEN ? AND ? ${currencyClause}
     GROUP BY status ORDER BY cnt DESC`
  )
    .bind(dateFrom, dateTo, ...currencyParam)
    .all<{ status: string; cnt: number; total: number }>();

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

  const freeLessonCount = await getFreeLessonCount(env);

  const lessonsResult = await env.DB.prepare(
    `SELECT id, lesson_number, title, chapter_name FROM lessons WHERE is_active = 1 ORDER BY sort_order ASC, lesson_number ASC`
  ).all<{ id: number; lesson_number: number; title: string; chapter_name: string }>();

  const paidTotalRow = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM users WHERE course_status = 'paid' ${cohortClause}`
  )
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

  const supportRow = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_cnt,
       SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cnt,
       COUNT(*) as total
     FROM support_tickets WHERE date(created_at) BETWEEN ? AND ?`
  )
    .bind(dateFrom, dateTo)
    .first<{ open_cnt: number | null; closed_cnt: number | null; total: number }>();

  const currenciesResult = await env.DB.prepare(
    `SELECT DISTINCT currency FROM payment_orders ORDER BY currency ASC`
  ).all<{
    currency: string;
  }>();
  const chaptersResult = await env.DB.prepare(`SELECT name FROM chapters ORDER BY sort_order ASC`).all<{
    name: string;
  }>();

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
  await env.DB.prepare(`INSERT INTO audit_events (id, user_id, event_type, metadata, ip_hash) VALUES (?, ?, ?, ?, ?)`)
    .bind(
      randomUuid(),
      opts.userId ?? null,
      eventType,
      opts.metadata ? JSON.stringify(opts.metadata) : null,
      opts.ipHash ?? null
    )
    .run();
}

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
  has_attachment: number;
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

export function supportTicketBelongsTo(ticket: SupportTicketRow, identity: SupportIdentity): boolean {
  if (identity.userId) return ticket.user_id === identity.userId;
  if (identity.guestId) return ticket.guest_id === identity.guestId;
  return false;
}

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

export async function listSupportTicketsForIdentity(
  env: Env,
  identity: SupportIdentity
): Promise<SupportTicketListItem[]> {
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

  await env.DB.prepare(`UPDATE support_tickets SET status = 'open', last_message_at = datetime('now') WHERE id = ?`)
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

export async function markSupportMessagesRead(
  env: Env,
  ticketId: string,
  unreadSenderType: "user" | "admin"
): Promise<void> {
  await env.DB.prepare(
    `UPDATE support_messages SET read_at = datetime('now') WHERE ticket_id = ? AND sender_type = ? AND read_at IS NULL`
  )
    .bind(ticketId, unreadSenderType)
    .run();
}

export async function getSupportMessageAttachment(env: Env, messageId: string): Promise<SupportAttachment | null> {
  const row = await env.DB.prepare(
    `SELECT ticket_id, attachment_blob, attachment_mime, attachment_filename FROM support_messages WHERE id = ? AND attachment_blob IS NOT NULL`
  )
    .bind(messageId)
    .first<{
      ticket_id: string;
      attachment_blob: Uint8Array | ArrayBuffer;
      attachment_mime: string;
      attachment_filename: string;
    }>();
  if (!row) return null;
  const bytes = row.attachment_blob instanceof Uint8Array ? row.attachment_blob : new Uint8Array(row.attachment_blob);
  return { bytes, mime: row.attachment_mime, filename: row.attachment_filename, ticket_id: row.ticket_id };
}

export async function shiftSupportTicketProfile(
  env: Env,
  ticketId: string,
  agentProfile: SupportAgentProfile
): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET agent_profile = ? WHERE id = ?`).bind(agentProfile, ticketId).run();
}

export async function setSupportTicketStatus(env: Env, ticketId: string, status: "open" | "closed"): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET status = ? WHERE id = ?`).bind(status, ticketId).run();
}

export async function hideSupportTicketForUser(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET hidden_by_user_at = datetime('now') WHERE id = ?`)
    .bind(ticketId)
    .run();
}

export async function unhideSupportTicket(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`UPDATE support_tickets SET hidden_by_user_at = NULL WHERE id = ?`).bind(ticketId).run();
}

export async function deleteSupportMessage(env: Env, messageId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM support_messages WHERE id = ?`).bind(messageId).run();
}

export async function deleteSupportTicket(env: Env, ticketId: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM support_tickets WHERE id = ?`).bind(ticketId).run();
}

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
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  userStatus?: "paid" | "free" | "guest";
}

export async function listSupportTicketsAdmin(
  env: Env,
  filters: SupportTicketAdminFilters
): Promise<SupportTicketAdminRow[]> {
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

export interface NotificationRow {
  id: string;
  user_id: string;
  type: "assignment_approved" | "assignment_rejected" | "support_reply";
  message: string;
  read_at: string | null;
  created_at: string;
}

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

export async function markNotificationRead(env: Env, id: string): Promise<void> {
  await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL`)
    .bind(id)
    .run();
}

export async function markAllNotificationsRead(env: Env, userId: string): Promise<void> {
  await env.DB.prepare(`UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL`)
    .bind(userId)
    .run();
}
