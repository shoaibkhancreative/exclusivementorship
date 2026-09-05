// Central place for typed bindings and business-rule constants.
// Content (lesson titles etc.) lives in the database, not here — see
// migrations/seed.sql and README.md "How to add more lessons later".

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // vars (wrangler.jsonc "vars", safe to be non-secret)
  APP_URL: string;
  EMAIL_FROM: string;
  MENTORSHIP_PDF_URL: string;
  TELEGRAM_CHANNEL_ID: string;
  TELEGRAM_GROUP_ID: string;
  TURNSTILE_SITE_KEY: string;
  ENROLLMENT_PRICE_USDT: string;
  REFERENCE_PRICE_USDT: string;
  // Optional — how much (in USDT, ~1:1 with USD since it's a stablecoin) a
  // buyer may underpay by and still be auto-unlocked. Covers people who
  // didn't realize the network fee is deducted separately and send a
  // dollar or two short. Defaults to 2 if unset. See getUnderpaymentToleranceUsdt.
  UNDERPAYMENT_TOLERANCE_USDT?: string;
  // Telegram destinations for the floating support button. Which one is used
  // is decided server-side (via /config/public) but the routing choice on the
  // client is always based on the real, authenticated course_status — never
  // a visual/UI assumption.
  SUPPORT_TELEGRAM_PREMIUM_URL: string;
  SUPPORT_TELEGRAM_FREE_URL: string;

  // secrets (wrangler secret put ...) — undefined locally unless in .dev.vars
  RESEND_API_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export const FREE_LESSON_COUNT = 5;

/**
 * The first premium lesson (Class 6) no longer plays normal video content
 * for paid users — it acts as the handoff point into the private Telegram
 * mentorship. See routes/lessons.ts.
 */
export const TELEGRAM_GATEWAY_LESSON = FREE_LESSON_COUNT + 1;

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export const SESSION_DURATION_DAYS = 30;
export const SESSION_COOKIE_NAME = "em_session";

export const RATE_LIMITS = {
  otpRequestPerEmailPerHour: 5,
  otpRequestPerIpPerHour: 20,
  otpVerifyPerEmailPer10Min: 10,
  paymentCreatePerUserPerHour: 5
};

/** The server is always the source of truth for price — never trust the client. */
export function getEnrollmentAmount(env: Env): number {
  const n = Number(env.ENROLLMENT_PRICE_USDT);
  return Number.isFinite(n) && n > 0 ? n : 39;
}

export function getReferenceAmount(env: Env): number {
  const n = Number(env.REFERENCE_PRICE_USDT);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * The only crypto currency we accept, and the only one shown to buyers:
 * USDT on BNB Smart Chain (BEP20). Chosen deliberately over TRC20/ERC20
 * because it has the lowest network fee of NOWPayments' supported USDT
 * networks — fewer support tickets about "why did $2 disappear".
 * Kept as a single constant so it's changed in exactly one place.
 */
export const PAY_CURRENCY = "usdtbsc";
export const PAY_NETWORK_LABEL = "BNB Smart Chain (BEP20)";

/**
 * How much a buyer may underpay (in USDT — a stablecoin, so ~1:1 with USD)
 * and still be treated as fully paid. Exists because first-time crypto users
 * often don't know the network deducts its own fee from what they send, and
 * end up 1-2 USDT short of the exact amount. Rather than manually reviewing
 * every "partially_paid" IPN, anything within this tolerance is unlocked
 * automatically; anything beyond it is still held for manual review.
 * Overpayment is never a problem — NOWPayments confirms those normally.
 */
export function getUnderpaymentToleranceUsdt(env: Env): number {
  const n = Number(env.UNDERPAYMENT_TOLERANCE_USDT);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}
