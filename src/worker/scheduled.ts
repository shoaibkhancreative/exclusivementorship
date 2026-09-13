import type { Env } from "./lib/config";
import { sendAbandonedCheckoutEmail } from "./services/email";

const DEFAULT_AUDIT_RETENTION_DAYS = 90;

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

async function cleanupOtpCodes(env: Env): Promise<CleanupResult> {
  try {
    const result = await env.DB.prepare(
      `DELETE FROM otp_codes WHERE expires_at < datetime('now') AND expires_at < datetime('now', '-24 hours')`
    ).run();
    return { table: "otp_codes", deleted: result.meta?.changes ?? 0 };
  } catch (err) {
    return { table: "otp_codes", deleted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

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

interface AbandonedOrderRow {
  order_id: string;
  user_email: string;
}

const ABANDONED_REMINDER_BATCH_SIZE = 50;

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
