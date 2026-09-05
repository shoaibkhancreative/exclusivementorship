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

/**
 * Creates a new payment order. The amount is ALWAYS the server-configured
 * enrollment price — the client cannot influence it in any way.
 */
paymentRoutes.post("/create-order", requireAuth, async (c) => {
  const user = c.get("user")!;

  if (user.course_status === "paid") {
    return c.json({ error: "already_paid", message: "আপনি ইতিমধ্যে ভর্তি হয়ে গেছেন।" }, 400);
  }

  // Reuse an existing non-terminal order if one already exists, so we don't
  // spam NOWPayments with duplicate active payments for the same user.
  // IMPORTANT: this check happens BEFORE the rate limit below, and does not
  // consume any of the rate limit's quota — merely reopening the checkout
  // popup (which re-calls this endpoint) must never count against the
  // limit, or a user who opens/closes it a handful of times in an hour
  // would get wrongly rate-limited even though no new payment was ever
  // created. The rate limit only protects genuine new-order creation
  // (the actual call to the NOWPayments API) below.
  //
  // NOTE: NOWPayments does not reliably send an IPN purely for a timeout
  // (only for actual on-chain activity), so a stale order can sit in
  // 'waiting' in our DB long after NOWPayments itself has stopped watching
  // that address. We treat an order whose `expires_at` has already passed
  // as NOT reusable — we mark it 'expired' ourselves and fall through to
  // creating a genuinely new one. This is what powers the "Generate New
  // Address" button once the client-side countdown hits zero.
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
    return c.json({ error: "rate_limited", message: "আরেকটি পেমেন্ট চেষ্টা করার আগে একটু অপেক্ষা করুন।" }, 429);
  }

  const orderId = randomUuid();
  const amount = getEnrollmentAmount(c.env);

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
    return c.json({ error: "payment_creation_failed", message: "পেমেন্ট শুরু করা যায়নি। আবার চেষ্টা করুন।" }, 502);
  }
});

/** Lets the checkout popup poll for confirmation without hitting NOWPayments directly. */
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
