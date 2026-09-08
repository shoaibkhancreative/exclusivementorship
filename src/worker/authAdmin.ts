// Admin authentication — deliberately a SEPARATE module from auth.ts,
// mirroring its session pattern (hashed token in the DB, cookie holds only
// the raw token) but never sharing a table, cookie name, or session with
// students. There is no admin sign-up route: rows in `admins` are only ever
// created by scripts/create-admin.mjs.

import type { Env } from "./lib/config";
import { ADMIN_SESSION_COOKIE_NAME, ADMIN_SESSION_DURATION_DAYS } from "./lib/config";
import { hmacSha256Hex, randomToken, randomUuid } from "./lib/crypto";
import { findAdminById, type AdminRow } from "./db";

function requireSecret(env: Env): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not configured. Set it with `wrangler secret put SESSION_SECRET`."
    );
  }
  return secret;
}

/** Creates a new admin session and returns the raw token to set as a cookie. */
export async function createAdminSession(env: Env, adminId: string): Promise<string> {
  const token = randomToken(32);
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `admin_session:${token}`);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO admin_sessions (id, admin_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`
  )
    .bind(randomUuid(), adminId, tokenHash, expiresAt)
    .run();

  return token;
}

export async function resolveAdminSession(env: Env, token: string | undefined | null): Promise<AdminRow | null> {
  if (!token) return null;
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `admin_session:${token}`);

  const row = await env.DB.prepare(
    `SELECT admin_id as admin_id, expires_at as expires_at, revoked_at as revoked_at
     FROM admin_sessions WHERE token_hash = ?`
  )
    .bind(tokenHash)
    .first<{ admin_id: string; expires_at: string; revoked_at: string | null }>();

  if (!row || row.revoked_at) return null;

  const expiresAt = new Date(row.expires_at.endsWith("Z") ? row.expires_at : row.expires_at + "Z");
  if (expiresAt.getTime() < Date.now()) return null;

  return findAdminById(env, row.admin_id);
}

export async function revokeAdminSession(env: Env, token: string): Promise<void> {
  const secret = requireSecret(env);
  const tokenHash = await hmacSha256Hex(secret, `admin_session:${token}`);
  await env.DB.prepare("UPDATE admin_sessions SET revoked_at = datetime('now') WHERE token_hash = ?")
    .bind(tokenHash)
    .run();
}

export function buildAdminSessionCookie(env: Env, token: string): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const maxAge = ADMIN_SESSION_DURATION_DAYS * 24 * 60 * 60;
  const attrs = [
    `${ADMIN_SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}

export function buildAdminLogoutCookie(env: Env): string {
  const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
  const attrs = [`${ADMIN_SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (!isLocal) attrs.push("Secure");
  return attrs.join("; ");
}
