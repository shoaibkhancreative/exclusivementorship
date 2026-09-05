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
