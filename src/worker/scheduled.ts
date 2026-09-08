// Scheduled (cron) cleanup for tables that otherwise grow unbounded:
// otp_codes, rate_limits, and audit_events. None of these have any
// expiry/eviction mechanism elsewhere in the codebase, so left alone they
// accumulate forever as usage grows.
//
// Wired up in index.ts, and registered via the "triggers.crons" block in
// wrangler.jsonc.
//
// Each table is cleaned independently and failures are isolated (one
// table's delete failing does not stop the others from running), with a
// summary logged at the end for visibility in `wrangler tail`.

import type { Env } from "./lib/config";

/** Default retention window for audit_events, in days, if AUDIT_RETENTION_DAYS is unset/invalid. */
const DEFAULT_AUDIT_RETENTION_DAYS = 90;

/**
 * Event types that must NEVER be deleted by this job, regardless of
 * retention period — kept indefinitely for financial audit purposes.
 */
const AUDIT_EVENTS_NEVER_DELETE = ["payment_confirmed", "payment_underpaid_tolerated"] as const;

function getAuditRetentionDays(env: Env): number {
  const n = Number(env.AUDIT_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_AUDIT_RETENTION_DAYS;
}

interface CleanupResult {
  table: string;
  deleted: number;
  error?: string;
}

/**
 * Deletes otp_codes rows whose expires_at is in the past AND at least
 * 24 hours old. The 24-hour buffer (rather than deleting the instant a
 * code expires) is deliberate — it leaves a short window to inspect recent
 * codes/attempts if a login issue gets reported, without letting the table
 * grow unbounded.
 */
async function cleanupOtpCodes(env: Env): Promise<CleanupResult> {
  try {
    // Both conditions use SQLite's own clock (datetime('now', ...)) rather
    // than mixing in a JS-computed timestamp, so there's a single source
    // of truth for "now" and no risk of clock-skew between the two checks.
    const result = await env.DB.prepare(
      `DELETE FROM otp_codes WHERE expires_at < datetime('now') AND expires_at < datetime('now', '-24 hours')`
    ).run();
    return { table: "otp_codes", deleted: result.meta?.changes ?? 0 };
  } catch (err) {
    return { table: "otp_codes", deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Deletes rate_limits rows whose window_start is more than 48 hours old.
 * These are fixed-window counters (see checkRateLimit in db.ts) — once a
 * window is more than 48 hours stale it's not informing any live rate
 * limit decision and is safe to drop.
 */
async function cleanupRateLimits(env: Env): Promise<CleanupResult> {
  try {
    const result = await env.DB.prepare(
      `DELETE FROM rate_limits WHERE window_start < datetime('now', '-48 hours')`
    ).run();
    return { table: "rate_limits", deleted: result.meta?.changes ?? 0 };
  } catch (err) {
    return { table: "rate_limits", deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Deletes audit_events rows older than the configured retention period
 * (AUDIT_RETENTION_DAYS, default 90), EXCEPT rows whose event_type is
 * 'payment_confirmed' or 'payment_underpaid_tolerated' — those are kept
 * indefinitely for financial audit purposes regardless of age.
 */
async function cleanupAuditEvents(env: Env): Promise<CleanupResult> {
  try {
    const retentionDays = getAuditRetentionDays(env);
    const placeholders = AUDIT_EVENTS_NEVER_DELETE.map(() => "?").join(", ");
    const result = await env.DB.prepare(
      `DELETE FROM audit_events
         WHERE created_at < datetime('now', '-' || ? || ' days')
           AND event_type NOT IN (${placeholders})`
    )
      .bind(retentionDays, ...AUDIT_EVENTS_NEVER_DELETE)
      .run();
    return { table: "audit_events", deleted: result.meta?.changes ?? 0 };
  } catch (err) {
    return { table: "audit_events", deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Entry point called by the Worker's `scheduled` export (see index.ts).
 * Runs all three cleanups, logs a summary, and never throws — a failure in
 * one table's cleanup is logged but does not prevent the others from
 * running or crash the scheduled invocation.
 */
export async function runScheduledCleanup(env: Env): Promise<CleanupResult[]> {
  const results = await Promise.all([cleanupOtpCodes(env), cleanupRateLimits(env), cleanupAuditEvents(env)]);

  for (const r of results) {
    if (r.error) {
      // eslint-disable-next-line no-console
      console.error(`[scheduled-cleanup] ${r.table} failed:`, r.error);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[scheduled-cleanup] ${r.table}: deleted ${r.deleted} row(s)`);
    }
  }

  return results;
}
