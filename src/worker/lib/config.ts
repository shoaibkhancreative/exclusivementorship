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

  // secrets (wrangler secret put ...) — undefined locally unless in .dev.vars
  RESEND_API_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  TELEGRAM_BOT_TOKEN?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export const FREE_LESSON_COUNT = 5;

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
