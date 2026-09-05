import type { Env } from "../lib/config";

const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";

export interface CreatePaymentResult {
  paymentId: string;
  payUrl: string;
  status: string;
}

/**
 * Creates a payment via NOWPayments' invoice endpoint. We use the "invoice"
 * flow (hosted payment page) rather than raw "payment" so the user is
 * redirected to a NOWPayments-hosted page — simpler and doesn't require us
 * to build our own crypto payment UI.
 */
export async function createNowPaymentsInvoice(
  env: Env,
  opts: { orderId: string; amount: number; currency: string; customerEmail: string }
): Promise<CreatePaymentResult> {
  if (!env.NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured.");
  }

  const res = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
    method: "POST",
    headers: {
      "x-api-key": env.NOWPAYMENTS_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      price_amount: opts.amount,
      price_currency: "usd",
      pay_currency: opts.currency,
      order_id: opts.orderId,
      order_description: "Exclusive Mentorship — Enrollment",
      ipn_callback_url: `${env.APP_URL}/api/webhooks/nowpayments`,
      success_url: `${env.APP_URL}/payment/success?order=${opts.orderId}`,
      cancel_url: `${env.APP_URL}/payment/pending?order=${opts.orderId}`
    })
  });

  const data = (await res.json()) as {
    id?: string;
    invoice_url?: string;
    payment_status?: string;
    message?: string;
  };

  if (!res.ok || !data.id || !data.invoice_url) {
    throw new Error(`NOWPayments error: ${data.message ?? res.statusText}`);
  }

  return {
    paymentId: data.id,
    payUrl: data.invoice_url,
    status: data.payment_status ?? "waiting"
  };
}

/**
 * Recursively sorts object keys — required because NOWPayments computes the
 * IPN signature over the JSON-stringified payload with keys sorted
 * alphabetically at every level. See NOWPayments IPN docs.
 */
function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

async function hmacSha512Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Verifies the `x-nowpayments-sig` header against the raw IPN body.
 * Returns false (never throws) on any malformed input so callers can
 * uniformly reject the request.
 */
export async function verifyNowPaymentsSignature(
  env: Env,
  rawBodyJson: unknown,
  signatureHeader: string | null
): Promise<boolean> {
  if (!env.NOWPAYMENTS_IPN_SECRET || !signatureHeader) return false;
  try {
    const sorted = sortObjectKeys(rawBodyJson);
    const serialized = JSON.stringify(sorted);
    const expected = await hmacSha512Hex(env.NOWPAYMENTS_IPN_SECRET, serialized);
    return timingSafeEqualHex(expected, signatureHeader.toLowerCase());
  } catch {
    return false;
  }
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

/** Maps NOWPayments' payment_status values to our internal order status. */
export function mapNowPaymentsStatus(
  status: string
): "created" | "waiting" | "confirming" | "confirmed" | "finished" | "failed" | "expired" | "cancelled" {
  switch (status) {
    case "waiting":
      return "waiting";
    case "confirming":
    case "sending":
      return "confirming";
    case "confirmed":
      return "confirmed";
    case "finished":
      return "finished";
    case "failed":
      return "failed";
    case "expired":
      return "expired";
    case "refunded":
    case "partially_paid":
      return "failed";
    default:
      return "waiting";
  }
}

/** Statuses that count as "paid" for the purpose of unlocking the mentorship. */
export const PAID_STATUSES = new Set(["confirmed", "finished"]);
