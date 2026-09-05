import type { Env } from "../lib/config";

const NOWPAYMENTS_API_BASE = "https://api.nowpayments.io/v1";

export interface CreatePaymentResult {
  paymentId: string;
  payAddress: string;
  payAmount: number;
  payCurrency: string;
  status: string;
  /** ISO timestamp — NOWPayments payments expire ~20 min after creation. */
  expiresAt: string | null;
}

/**
 * Creates a payment via NOWPayments' non-hosted "payment" endpoint (as
 * opposed to "invoice", which redirects the user to a NOWPayments-hosted
 * page). This returns a raw pay-to address, amount, and currency, which we
 * render inside our own checkout UI — the user never leaves our site and
 * never sees the NOWPayments name or brand. This is the standard, documented
 * way to build a custom-branded checkout on top of NOWPayments; it's not a
 * workaround, it's simply choosing "payment" over "invoice" in their API.
 */
export async function createNowPaymentsPayment(
  env: Env,
  opts: { orderId: string; amount: number; currency: string; customerEmail: string }
): Promise<CreatePaymentResult> {
  if (!env.NOWPAYMENTS_API_KEY) {
    throw new Error("NOWPAYMENTS_API_KEY is not configured.");
  }

  const res = await fetch(`${NOWPAYMENTS_API_BASE}/payment`, {
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
      ipn_callback_url: `${env.APP_URL}/api/webhooks/nowpayments`
    })
  });

  const data = (await res.json()) as {
    payment_id?: string;
    pay_address?: string;
    pay_amount?: number;
    pay_currency?: string;
    payment_status?: string;
    expiration_estimate_date?: string;
    message?: string;
  };

  if (!res.ok || !data.payment_id || !data.pay_address || !data.pay_amount) {
    throw new Error(`NOWPayments error: ${data.message ?? res.statusText}`);
  }

  return {
    paymentId: data.payment_id,
    payAddress: data.pay_address,
    payAmount: data.pay_amount,
    payCurrency: data.pay_currency ?? opts.currency,
    status: data.payment_status ?? "waiting",
    expiresAt: data.expiration_estimate_date ?? null
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
