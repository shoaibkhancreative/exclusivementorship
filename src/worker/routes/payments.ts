import { Hono } from "hono";
import type { Env } from "../lib/config";
import { RATE_LIMITS, getEnrollmentAmount, PAY_CURRENCY } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import { checkRateLimit, logAuditEvent } from "../db";
import { createNowPaymentsPayment } from "../services/nowpayments";
import { randomUuid } from "../lib/crypto";

export const paymentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  pay_address: string | null;
  pay_amount_crypto: number | null;
  pay_currency: string | null;
  expires_at: string | null;
  amount: number;
  currency: string;
  created_at: string;
}

paymentRoutes.post("/create-order", requireAuth, async (c) => {
  const user = c.get("user")!;

  if (user.course_status === "paid") {
    return c.json({ error: "already_paid", message: "You're already enrolled." }, 400);
  }

  const existing = await c.env.DB.prepare(
    `SELECT * FROM payment_orders WHERE user_id = ? AND status IN ('created','waiting','confirming') ORDER BY created_at DESC LIMIT 1`
  )
    .bind(user.id)
    .first<OrderRow>();

  const existingIsTimeExpired = existing?.expires_at ? new Date(existing.expires_at).getTime() <= Date.now() : false;

  if (existing && existing.pay_address && !existingIsTimeExpired) {
    return c.json({
      ok: true,
      orderId: existing.id,
      payAddress: existing.pay_address,
      payAmount: existing.pay_amount_crypto,
      payCurrency: existing.pay_currency,
      expiresAt: existing.expires_at,
      priceUsd: existing.amount
    });
  }

  if (existing && existingIsTimeExpired) {
    await c.env.DB.prepare("UPDATE payment_orders SET status = 'expired' WHERE id = ?").bind(existing.id).run();
  }

  const rate = await checkRateLimit(
    c.env,
    `payment_create:user:${user.id}`,
    RATE_LIMITS.paymentCreatePerUserPerHour,
    3600
  );
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Please wait a moment before trying another payment." }, 429);
  }

  const orderId = randomUuid();
  const amount = await getEnrollmentAmount(c.env);

  await c.env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, amount, currency, status) VALUES (?, ?, ?, ?, 'created')`
  )
    .bind(orderId, user.id, amount, PAY_CURRENCY)
    .run();

  try {
    const payment = await createNowPaymentsPayment(c.env, {
      orderId,
      amount,
      currency: PAY_CURRENCY,
      customerEmail: user.email
    });

    await c.env.DB.prepare(
      `UPDATE payment_orders
         SET nowpayments_payment_id = ?, pay_address = ?, pay_amount_crypto = ?, pay_currency = ?, expires_at = ?, status = 'waiting'
       WHERE id = ?`
    )
      .bind(payment.paymentId, payment.payAddress, payment.payAmount, payment.payCurrency, payment.expiresAt, orderId)
      .run();

    await logAuditEvent(c.env, "payment_order_created", { userId: user.id, metadata: { orderId } });

    return c.json({
      ok: true,
      orderId,
      payAddress: payment.payAddress,
      payAmount: payment.payAmount,
      payCurrency: payment.payCurrency,
      expiresAt: payment.expiresAt,
      priceUsd: amount
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("createNowPaymentsPayment failed", err);
    await c.env.DB.prepare("UPDATE payment_orders SET status = 'failed' WHERE id = ?").bind(orderId).run();
    return c.json({ error: "payment_creation_failed", message: "Couldn't start the payment. Please try again." }, 502);
  }
});

paymentRoutes.get("/status/:orderId", requireAuth, async (c) => {
  const user = c.get("user")!;
  const orderId = c.req.param("orderId");

  const order = await c.env.DB.prepare("SELECT * FROM payment_orders WHERE id = ? AND user_id = ?")
    .bind(orderId, user.id)
    .first<OrderRow>();

  if (!order) return c.json({ error: "not_found" }, 404);

  return c.json({
    orderId: order.id,
    status: order.status,
    courseStatus: user.course_status,
    payAddress: order.pay_address,
    payAmount: order.pay_amount_crypto,
    payCurrency: order.pay_currency,
    expiresAt: order.expires_at,
    priceUsd: order.amount
  });
});
