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

function requireSecret(env: Env): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    // Fail loudly in production rather than silently using a weak default.
    throw new Error(
      "SESSION_SECRET is not configured. Set it with `wrangler secret put SESSION_SECRET`."
    );
  }
  return secret;
}

/** Issues a fresh OTP for an email, storing only its HMAC hash. */
export async function issueOtp(env: Env, email: string): Promise<string> {
  const secret = requireSecret(env);
  const normalized = email.toLowerCase().trim();
  const code = generateOtp(6);
  const codeHash = await hmacSha256Hex(secret, `otp:${normalized}:${code}`);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO otp_codes (id, email, code_hash, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(randomUuid(), normalized, codeHash, expiresAt)
    .run();

  return code; // returned only so the caller can email it — never logged, never returned to the HTTP client
}

export type OtpVerifyResult =
  | { ok: true; user: UserRow }
  | { ok: false; reason: "invalid" | "expired" | "too_many_attempts" };

/** Verifies a submitted OTP. On success, creates the user if needed and returns it. */
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
    await env.DB.prepare("UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?")
      .bind(row.id)
      .run();
    return { ok: false, reason: "invalid" };
  }

  await env.DB.prepare("UPDATE otp_codes SET used_at = datetime('now') WHERE id = ?")
    .bind(row.id)
    .run();

  const user = await getOrCreateUser(env, normalized);
  return { ok: true, user };
}

/**
 * Creates a new session for a user and returns the raw token to set as a
 * cookie. Enforces "single active session per account": every other
 * non-revoked session belonging to this user is revoked as part of the same
 * login, so logging in on a second device silently signs the first one out
 * on its next request (resolveSession already rejects a revoked token — see
 * below — so no separate enforcement is needed there). This is a deterrent
 * against casual account-sharing, not a security boundary in itself: a
 * legitimate user who logs in on a new device is expected to get signed out
 * of an old one they forgot about, same as most subscription products.
 */
export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const id = randomUuid();

  // Revoke first, then insert the new session — so there's no window (even
  // within this single request) where both the old and new sessions are
  // simultaneously valid. The new row's own id excludes it from the revoke
  // by construction (it doesn't exist yet), so ordering here is safe.
  await env.DB.prepare(
    `UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`
  )
    .bind(userId)
    .run();

  await env.DB.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(id, userId, tokenHash, expiresAt)
    .run();

  return token;
}

export async function resolveSession(env: Env, token: string | undefined | null): Promise<UserRow | null> {
  if (!token) return null;
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);

  const row = await env.DB.prepare(
    `SELECT s.user_id as user_id, s.expires_at as expires_at, s.revoked_at as revoked_at
     FROM sessions s WHERE s.token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ user_id: string; expires_at: string; revoked_at: string | null }>();

  if (!row || row.revoked_at) return null;

  const expiresAt = new Date(row.expires_at.endsWith("Z") ? row.expires_at : row.expires_at + "Z");
  if (expiresAt.getTime() < Date.now()) return null;

  const { findUserById } = await import("./db");
  return findUserById(env, row.user_id);
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `session:${token}`);
  await env.DB.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

export function buildSessionCookie(env: Env, token: string): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const maxAge = SESSION_DURATION_DAYS * 24 * 60 * 60;
  const attrs = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildLogoutCookie(env: Env): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const attrs = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

/**
 * The support-ticket guest identity cookie (SUPPORT_GUEST_COOKIE_NAME) —
 * unlike the session cookie above, this holds a plain uuid rather than a
 * hashed/HMAC'd token: it's only ever used as a correlation id for "which
 * guest's tickets are these", never as an authentication credential (see
 * routes/support.ts, which always re-checks ticket ownership server-side
 * regardless). Still httpOnly so it can't be read/tampered with from page
 * JS, and long-lived since a guest may come back days later to check a
 * reply.
 */
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
