import type { Env } from "./config";
import { hmacSha256Hex, randomUuid } from "./crypto";

// --- Device-lock rules -----------------------------------------------------
// Free users: no device lock at all, on web or app. Unlimited devices.
// Paid users on web: no device/session lock at all (see auth.ts).
// Paid users on the app: locked to the first device they log in from.
//   - Logging in again from that same device is always fine.
//   - Logging in from a different device is rejected until an admin resets
//     the lock (see resetAppDevice below). The user is expected to reach out
//     to support from the web (where they're never locked) to request that.
//
// NOTE (important limitation to flag honestly): this module currently trusts
// a client-supplied `deviceId` string. That is enough to build and test the
// whole lock/reset/admin workflow end-to-end, but a raw client-supplied ID
// can be spoofed by anyone willing to reverse-engineer the app — it is not a
// real hardware attestation. The Android app phase should generate this ID
// from something hard to fake (e.g. a Play Integrity verdict combined with
// an app-generated key that's stored in the Android Keystore), and the video
// token phase should stop trusting deviceId alone for paid-video issuance.
// This module's job is only the *account-to-device* lock; it's intentionally
// decoupled from video-token issuance so each phase can improve one piece
// without having to re-touch the whole chain again later.

export type AppLoginCheck = { ok: true } | { ok: false; reason: "device_locked" };

async function hashDeviceId(env: Env, deviceId: string): Promise<string> {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured. Set it with `wrangler secret put SESSION_SECRET`.");
  }
  return hmacSha256Hex(secret, `app_device:${deviceId}`);
}

/**
 * Call this when a login attempt arrives through the app, after credentials
 * (OTP/Google) have already been verified. For free users this always
 * succeeds and doesn't touch app_devices at all. For paid users it registers
 * the device on first login, allows the same device to keep logging in, and
 * rejects a different device until an admin resets the lock.
 */
export async function checkAndRegisterAppDevice(
  env: Env,
  userId: string,
  courseStatus: "free" | "paid",
  deviceId: string
): Promise<AppLoginCheck> {
  if (courseStatus !== "paid") {
    return { ok: true };
  }

  const deviceHash = await hashDeviceId(env, deviceId);

  const existing = await env.DB.prepare("SELECT device_id_hash FROM app_devices WHERE user_id = ?")
    .bind(userId)
    .first<{ device_id_hash: string }>();

  if (!existing || existing.device_id_hash === "") {
    if (existing) {
      await env.DB.prepare(
        `UPDATE app_devices SET device_id_hash = ?, registered_at = datetime('now'), last_seen_at = datetime('now')
         WHERE user_id = ?`
      )
        .bind(deviceHash, userId)
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO app_devices (user_id, device_id_hash, registered_at, last_seen_at)
         VALUES (?, ?, datetime('now'), datetime('now'))`
      )
        .bind(userId, deviceHash)
        .run();
    }
    await env.DB.prepare(`INSERT INTO app_device_events (id, user_id, event, device_id_hash) VALUES (?, ?, ?, ?)`)
      .bind(randomUuid(), userId, "registered", deviceHash)
      .run();
    return { ok: true };
  }

  if (existing.device_id_hash !== deviceHash) {
    await env.DB.prepare(`INSERT INTO app_device_events (id, user_id, event, device_id_hash) VALUES (?, ?, ?, ?)`)
      .bind(randomUuid(), userId, "blocked", deviceHash)
      .run();
    return { ok: false, reason: "device_locked" };
  }

  await env.DB.prepare(`UPDATE app_devices SET last_seen_at = datetime('now') WHERE user_id = ?`)
    .bind(userId)
    .run();
  return { ok: true };
}

/**
 * Admin action: clears a paid user's device lock so their next app login
 * registers a fresh device. Does NOT touch the user's web sessions — only
 * their app sessions get force-logged-out, by the caller invoking
 * revokeSessionsByPlatform(env, userId, "app") alongside this.
 */
export async function resetAppDevice(env: Env, userId: string, adminId: string): Promise<void> {
  const existing = await env.DB.prepare("SELECT user_id FROM app_devices WHERE user_id = ?")
    .bind(userId)
    .first<{ user_id: string }>();

  if (existing) {
    await env.DB.prepare(
      `UPDATE app_devices
       SET device_id_hash = '', reset_count = reset_count + 1, last_reset_at = datetime('now'), last_reset_by_admin_id = ?
       WHERE user_id = ?`
    )
      .bind(adminId, userId)
      .run();
  } else {
    // Nothing registered yet — still worth recording that an admin reset
    // was requested, in case support needs to review the timeline later.
    await env.DB.prepare(
      `INSERT INTO app_devices (user_id, device_id_hash, reset_count, last_reset_at, last_reset_by_admin_id)
       VALUES (?, '', 1, datetime('now'), ?)`
    )
      .bind(userId, adminId)
      .run();
  }

  await env.DB.prepare(`INSERT INTO app_device_events (id, user_id, event, admin_id) VALUES (?, ?, 'reset', ?)`)
    .bind(randomUuid(), userId, adminId)
    .run();
}

export interface AppDeviceInfo {
  locked: boolean;
  registeredAt: string | null;
  lastSeenAt: string | null;
  resetCount: number;
}

export async function getAppDeviceInfo(env: Env, userId: string): Promise<AppDeviceInfo> {
  const row = await env.DB.prepare(
    "SELECT device_id_hash, registered_at, last_seen_at, reset_count FROM app_devices WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ device_id_hash: string; registered_at: string; last_seen_at: string | null; reset_count: number }>();

  if (!row) return { locked: false, registeredAt: null, lastSeenAt: null, resetCount: 0 };
  return {
    locked: Boolean(row.device_id_hash),
    registeredAt: row.device_id_hash ? row.registered_at : null,
    lastSeenAt: row.last_seen_at,
    resetCount: row.reset_count
  };
}
