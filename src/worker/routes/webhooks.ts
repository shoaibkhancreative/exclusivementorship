import { Hono } from "hono";
import type { Env } from "../lib/config";
import { PAID_STATUSES, mapNowPaymentsStatus, verifyNowPaymentsSignature } from "../services/nowpayments";
import { logAuditEvent } from "../db";

export const webhookRoutes = new Hono<{ Bindings: Env }>();

interface NowPaymentsIpnPayload {
  payment_id?: string;
  payment_status?: string;
  order_id?: string;
  [key: string]: unknown;
}

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  confirmed_at: string | null;
}

webhookRoutes.post("/nowpayments", async (c) => {
  const rawText = await c.req.text();
  let payload: NowPaymentsIpnPayload;
  try {
    payload = JSON.parse(rawText) as NowPaymentsIpnPayload;
  } catch {
    return c.json({ error: "invalid_payload" }, 400);
  }

  const signature = c.req.header("x-nowpayments-sig");
  const validSignature = await verifyNowPaymentsSignature(c.env, payload, signature ?? null);
  if (!validSignature) {
    await logAuditEvent(c.env, "webhook_signature_invalid", { metadata: { orderId: payload.order_id } });
    return c.json({ error: "invalid_signature" }, 401);
  }

  const orderId = payload.order_id;
  const paymentId = payload.payment_id;
  const npStatus = payload.payment_status;

  if (!orderId || !npStatus) {
    return c.json({ error: "missing_fields" }, 400);
  }

  const order = await c.env.DB.prepare("SELECT * FROM payment_orders WHERE id = ?")
    .bind(orderId)
    .first<OrderRow>();

  if (!order) {
    // Unknown order — do not create one from an unauthenticated webhook.
    await logAuditEvent(c.env, "webhook_unknown_order", { metadata: { orderId } });
    return c.json({ error: "unknown_order" }, 404);
  }

  const mappedStatus = mapNowPaymentsStatus(npStatus);

  // --- Idempotency guard ----------------------------------------------------
  // If we've already recorded this order as confirmed/finished, acknowledge
  // the (likely duplicate) webhook without doing any further work — this is
  // what prevents duplicate Telegram invite generation on webhook replay.
  if (order.confirmed_at && PAID_STATUSES.has(mappedStatus)) {
    return c.json({ ok: true, alreadyProcessed: true });
  }

  const isNowPaid = PAID_STATUSES.has(mappedStatus);

  await c.env.DB.prepare(
    `UPDATE payment_orders
       SET status = ?, nowpayments_payment_id = COALESCE(?, nowpayments_payment_id),
           raw_last_webhook = ?, confirmed_at = CASE WHEN ? THEN COALESCE(confirmed_at, datetime('now')) ELSE confirmed_at END
     WHERE id = ?`
  )
    .bind(mappedStatus, paymentId ?? null, rawText.slice(0, 4000), isNowPaid ? 1 : 0, orderId)
    .run();

  if (isNowPaid) {
    // Mark the user paid (idempotent — repeated UPDATEs are harmless).
    await c.env.DB.prepare(
      `UPDATE users SET course_status = 'paid', paid_at = COALESCE(paid_at, datetime('now')), updated_at = datetime('now') WHERE id = ?`
    )
      .bind(order.user_id)
      .run();

    // Ensure a telegram_access row exists in 'pending' state so the access
    // page knows to (re)try generation — but never overwrite an already
    // 'generated' row (that would be the duplicate-invite bug this guards
    // against).
    await c.env.DB.prepare(
      `INSERT INTO telegram_access (user_id, status) VALUES (?, 'pending')
       ON CONFLICT(user_id) DO NOTHING`
    )
      .bind(order.user_id)
      .run();

    await logAuditEvent(c.env, "payment_confirmed", {
      userId: order.user_id,
      metadata: { orderId, paymentId, npStatus }
    });
  }

  return c.json({ ok: true });
});
