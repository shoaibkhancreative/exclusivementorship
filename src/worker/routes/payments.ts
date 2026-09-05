import { Hono } from "hono";
import type { Env } from "../lib/config";
import { RATE_LIMITS, getEnrollmentAmount } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requireAuth } from "../middleware/session";
import { checkRateLimit, logAuditEvent } from "../db";
import { createNowPaymentsInvoice } from "../services/nowpayments";
import { randomUuid } from "../lib/crypto";

export const paymentRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface OrderRow {
  id: string;
  user_id: string;
  status: string;
  pay_url: string | null;
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
    return c.json({ error: "already_paid", message: "You're already enrolled." }, 400);
  }

  const rate = await checkRateLimit(
    c.env,
    `payment_create:user:${user.id}`,
    RATE_LIMITS.paymentCreatePerUserPerHour,
    3600
  );
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Please wait before creating another payment attempt." }, 429);
  }

  // Reuse an existing non-terminal order if one already exists, so we don't
  // spam NOWPayments with duplicate active invoices for the same user.
  const existing = await c.env.DB.prepare(
    `SELECT * FROM payment_orders WHERE user_id = ? AND status IN ('created','waiting','confirming') ORDER BY created_at DESC LIMIT 1`
  )
    .bind(user.id)
    .first<OrderRow>();

  if (existing && existing.pay_url) {
    return c.json({ ok: true, orderId: existing.id, payUrl: existing.pay_url });
  }

  const orderId = randomUuid();
  const amount = getEnrollmentAmount(c.env);

  await c.env.DB.prepare(
    `INSERT INTO payment_orders (id, user_id, amount, currency, status) VALUES (?, ?, ?, 'usdttrc20', 'created')`
  )
    .bind(orderId, user.id, amount)
    .run();

  try {
    const invoice = await createNowPaymentsInvoice(c.env, {
      orderId,
      amount,
      currency: "usdttrc20",
      customerEmail: user.email
    });

    await c.env.DB.prepare(
      `UPDATE payment_orders SET nowpayments_payment_id = ?, pay_url = ?, status = 'waiting' WHERE id = ?`
    )
      .bind(invoice.paymentId, invoice.payUrl, orderId)
      .run();

    await logAuditEvent(c.env, "payment_order_created", { userId: user.id, metadata: { orderId } });

    return c.json({ ok: true, orderId, payUrl: invoice.payUrl });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("createNowPaymentsInvoice failed", err);
    await c.env.DB.prepare("UPDATE payment_orders SET status = 'failed' WHERE id = ?").bind(orderId).run();
    return c.json({ error: "payment_creation_failed", message: "We couldn't start the payment. Please try again." }, 502);
  }
});

/** Lets the pending-payment page poll for confirmation without hitting NOWPayments directly. */
paymentRoutes.get("/status/:orderId", requireAuth, async (c) => {
  const user = c.get("user")!;
  const orderId = c.req.param("orderId");

  const order = await c.env.DB.prepare("SELECT * FROM payment_orders WHERE id = ? AND user_id = ?")
    .bind(orderId, user.id)
    .first<OrderRow>();

  if (!order) return c.json({ error: "not_found" }, 404);

  return c.json({ orderId: order.id, status: order.status, courseStatus: user.course_status });
});
