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
import { sendAbandonedCheckoutEmail } from "./services/email";

/** Default retention window for audit_events, in days, if AUDIT_RETENTION_DAYS is unset/invalid. */
const DEFAULT_AUDIT_RETENTION_DAYS = 90;

/**
 * Event types that must NEVER be deleted by this job, regardless of
 * retention period — kept indefinitely for financial audit purposes.
 */
const AUDIT_EVENTS_NEVER_DELETE = ["payment_confirmed", "payment_underpaid_within_tolerance"] as const;

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
 * 'payment_confirmed' or 'payment_underpaid_within_tolerance' — those are kept
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
interface AbandonedOrderRow {
  order_id: string;
  user_email: string;
}

/** Cap per run — the job runs every 15 minutes (see wrangler.jsonc), so a
 * backlog still clears within an hour or two even under this limit; it just
 * keeps any single invocation cheap and bounded. */
const ABANDONED_REMINDER_BATCH_SIZE = 50;

/**
 * Emails one reminder for each payment order that was created, never paid,
 * and has sat past its `expires_at` — the case where a learner opened
 * checkout, didn't finish, and never came back. Purely backend/data logic:
 * no new frontend surface, no change to the checkout flow itself.
 *
 * Guarded three ways against duplicate or wrong-target sends:
 *  - `reminder_sent_at IS NULL` — set the moment a send succeeds, so a
 *    later run (even one that overlaps this one) never re-sends for the
 *    same order.
 *  - `status = 'waiting'` — the only "still genuinely unpaid, still has an
 *    address that was shown to the user" state; anything already
 *    'confirmed'/'finished'/'failed'/'cancelled' is excluded.
 *  - `course_status != 'paid'` — belt-and-suspenders in case the user
 *    completed a *different*, later order in the meantime.
 */
export async function sendAbandonedCheckoutReminders(env: Env): Promise<CleanupResult> {
  try {
    const rows = await env.DB.prepare(
      `SELECT po.id AS order_id, u.email AS user_email
         FROM payment_orders po
         JOIN users u ON u.id = po.user_id
        WHERE po.status = 'waiting'
          AND po.reminder_sent_at IS NULL
          AND po.expires_at IS NOT NULL
          AND po.expires_at < datetime('now')
          AND u.course_status != 'paid'
        ORDER BY po.created_at ASC
        LIMIT ?`
    )
      .bind(ABANDONED_REMINDER_BATCH_SIZE)
      .all<AbandonedOrderRow>();

    let sent = 0;
    for (const row of rows.results) {
      try {
        await sendAbandonedCheckoutEmail(env, row.user_email);
        await env.DB.prepare("UPDATE payment_orders SET reminder_sent_at = datetime('now') WHERE id = ?")
          .bind(row.order_id)
          .run();
        sent += 1;
      } catch (err) {
        // One bad email/address should never block the rest of the batch —
        // it's simply retried on the next run since reminder_sent_at was
        // never set for it.
        // eslint-disable-next-line no-console
        console.error(`[abandoned-checkout-reminder] failed for order ${row.order_id}:`, err);
      }
    }

    // eslint-disable-next-line no-console
    console.log(`[abandoned-checkout-reminder] sent ${sent} reminder(s)`);
    return { table: "payment_orders (reminders)", deleted: sent };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error("[abandoned-checkout-reminder] run failed:", message);
    return { table: "payment_orders (reminders)", deleted: 0, error: message };
  }
}

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
