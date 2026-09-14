import type { Env } from "./lib/config";
import {
  OTP_EXPIRY_MINUTES,
  OTP_MAX_ATTEMPTS,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_DAYS,
  SUPPORT_GUEST_COOKIE_NAME,
  SUPPORT_GUEST_COOKIE_DAYS
} from "./lib/config";
import { generateOtp, hmacSha256Hex, randomToken, randomUuid, timingSafeEqual } from "./lib/crypto";
import { getOrCreateUser, type UserRow } from "./db";
import { getRawCached, putRawCached, sessionCacheKey, SESSION_CACHE_TTL_SECONDS, purgeCache } from "./lib/cache";

function requireSecret(env: Env): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured. Set it with `wrangler secret put SESSION_SECRET`.");
  }
  return secret;
}

export async function issueOtp(env: Env, email: string): Promise<string> {
  const secret = requireSecret(env);
  const normalized = email.toLowerCase().trim();
  const code = generateOtp(6);
  const codeHash = await hmacSha256Hex(secret, `otp:${normalized}:${code}`);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare(`INSERT INTO otp_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)`)
    .bind(randomUuid(), normalized, codeHash, expiresAt)
    .run();

  return code;
}

export type OtpVerifyResult =
  { ok: true; user: UserRow } | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

export async function verifyOtp(env: Env, email: string, code: string): Promise<OtpVerifyResult> {
  const secret = requireSecret(env);
  const normalized = email.toLowerCase().trim();

  const row = await env.DB.prepare(
    `SELECT id, code_hash, expires_at, used_at, attempts FROM otp_codes
     WHERE email = ? AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  )
    .bind(normalized)
    .first<{ id: string; code_hash: string; expires_at: string; used_at: string | null; attempts: number }>();

  if (!row) return { ok: false, reason: "invalid" };

  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "too_many_attempts" };
  }

  const expiresAt = new Date(row.expires_at.endsWith("Z") ? row.expires_at : row.expires_at + "Z");
  if (expiresAt.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const candidateHash = await hmacSha256Hex(secret, `otp:${normalized}:${code}`);
  const matches = timingSafeEqual(candidateHash, row.code_hash);

  if (!matches) {
    await env.DB.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?").bind(row.id).run();
    return { ok: false, reason: "invalid" };
  }

  await env.DB.prepare("UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?").bind(row.id).run();

  const user = await getOrCreateUser(env, normalized);
  return { ok: true, user };
}

export type SessionPlatform = "web" | "app";

// Phase 3: resolveSession now returns platform alongside the user so that
// downstream handlers (e.g. video-token) can enforce app-only access for
// paid lessons without a second DB round-trip.
export interface ResolvedSession {
  user: UserRow;
  platform: SessionPlatform;
}

export async function createSession(env: Env, userId: string, platform: SessionPlatform = "web"): Promise<string> {
  const token = randomToken(32);
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const id = randomUuid();

  await env.DB.prepare(`INSERT INTO sessions (id, user_id, token_hash, expires_at, platform) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, userId, tokenHash, expiresAt, platform)
    .run();

  return token;
}

export async function revokeSessionsByPlatform(env: Env, userId: string, platform: SessionPlatform): Promise<void> {
  const rows = await env.DB.prepare(
    `SELECT token_hash FROM sessions WHERE user_id = ? AND platform = ? AND revoked_at IS NULL`
  )
    .bind(userId, platform)
    .all<{ token_hash: string }>();

  await env.DB.prepare(
    `UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND platform = ? AND revoked_at IS NULL`
  )
    .bind(userId, platform)
    .run();

  for (const row of rows.results) {
    await purgeCache(env, sessionCacheKey(row.token_hash));
  }
}

// Phase 3: resolveSession now returns the full ResolvedSession (user + platform)
// so callers don't need to re-query the DB just to know whether the session
// originated from the native app or a browser.
//
// Cache key is unchanged (token-hash-based), but the cached payload now
// includes the platform string, so old cached entries (which won't have it)
// are handled gracefully: a missing platform field defaults to "web".
export async function resolveSession(env: Env, token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null;
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);
  const cacheKey = sessionCacheKey(tokenHash);

  const cached = await getRawCached(env, cacheKey);
  if (cached !== null) {
    try {
      const parsed = JSON.parse(cached) as { user: UserRow; platform?: string };
      if (parsed && parsed.user) {
        return {
          user: parsed.user,
          platform: (parsed.platform === "app" ? "app" : "web") as SessionPlatform
        };
      }
      // Legacy cache entry: just a UserRow, no platform. Treat as "web".
      const legacyUser = parsed as unknown as UserRow;
      if (legacyUser && legacyUser.id) {
        return { user: legacyUser, platform: "web" };
      }
    } catch {
      // ignore malformed cache entries
    }
  }

  const row = await env.DB.prepare(
    `SELECT s.user_id as user_id, s.expires_at as expires_at, s.revoked_at as revoked_at, s.platform as platform
     FROM sessions s WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; revoked_at: string | null; platform: string | null }>();

  if (!row || row.revoked_at) return null;

  const expiresAt = new Date(row.expires_at.endsWith("Z") ? row.expires_at : row.expires_at + "Z");
  if (expiresAt.getTime() < Date.now()) return null;

  const { findUserById } = await import("./db");
  const user = await findUserById(env, row.user_id);
  if (!user) return null;

  const platform: SessionPlatform = row.platform === "app" ? "app" : "web";
  await putRawCached(env, cacheKey, JSON.stringify({ user, platform }), SESSION_CACHE_TTL_SECONDS);
  return { user, platform };
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);
  await env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?").bind(tokenHash).run();
  await purgeCache(env, sessionCacheKey(tokenHash));
}

export function buildSessionCookie(env: Env, token: string): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60;
  const attrs = [`${SESSION_COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildLogoutCookie(env: Env): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const attrs = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildGuestIdCookie(env: Env, guestId: string): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const maxAge = SUPPORT_GUEST_COOKIE_DAYS * 24 * 60 * 60;
  const attrs = [`${SUPPORT_GUEST_COOKIE_NAME}=${guestId}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return undefined;
}
