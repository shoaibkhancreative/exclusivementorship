// Central place for typed bindings and business-rule constants.
// Content (lesson titles etc.) lives in the database, not here — see
// migrations/seed.sql and README.md "How to add more lessons later".
import { getSetting } from "../db";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;

  // vars (wrangler.jsonc "vars", safe to be non-secret)
  APP_URL: string;
  EMAIL_FROM: string;
  MENTORSHIP_PDF_URL: string;
  TURNSTILE_SITE_KEY: string;
  // Google OAuth 2.0 Client ID (from Google Cloud Console → Credentials).
  // This is a public identifier, not a secret — it's sent to the browser so
  // the Google Identity Services script can render the "Continue with
  // Google" button. Safe to leave unset: /auth/google returns
  // "not_configured" and the button simply doesn't render (email OTP still
  // works as the fallback/only method). See SETUP_GUIDE.md.
  GOOGLE_CLIENT_ID?: string;
  ENROLLMENT_PRICE_USDT: string;
  REFERENCE_PRICE_USDT: string;
  // Optional — how much (in USDT, ~1:1 with USD since it's a stablecoin) a
  // buyer may underpay by and still be auto-unlocked. Covers people who
  // didn't realize the network fee is deducted separately and send a
  // dollar or two short. Defaults to 2 if unset. See getUnderpaymentToleranceUsdt.
  UNDERPAYMENT_TOLERANCE_USDT?: string;
  // Telegram destinations for the floating support button — the one
  // Telegram touchpoint intentionally kept. Which one is used is decided
  // server-side (via /config/public) but the routing choice on the client
  // is always based on the real, authenticated course_status — never a
  // visual/UI assumption.
  SUPPORT_TELEGRAM_PREMIUM_URL: string;
  SUPPORT_TELEGRAM_FREE_URL: string;

  // Optional — retention window (in days) for the scheduled audit_events
  // cleanup job. Defaults to 90 if unset. Never applies to event_type
  // 'payment_confirmed' or 'payment_underpaid_tolerated', which are kept
  // indefinitely regardless of this setting. See scheduled.ts. The cron
  // trigger that runs this job is NOT enabled by default — see
  // wrangler.jsonc.
  AUDIT_RETENTION_DAYS?: string;

  // secrets (wrangler secret put ...) — undefined locally unless in .dev.vars
  RESEND_API_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

/** Hardcoded fallback used only until an admin ever saves a value from the panel. */
const DEFAULT_FREE_LESSON_COUNT = 5;

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export const SESSION_DURATION_DAYS = 30;
export const SESSION_COOKIE_NAME = "em_session";

// Admin auth is a COMPLETELY separate session system from the student
// session above — different cookie name, different table (admin_sessions),
// never mixed with a student's `user`/session. See auth-admin.ts.
export const ADMIN_SESSION_DURATION_DAYS = 7;
export const ADMIN_SESSION_COOKIE_NAME = "em_admin_session";

export const RATE_LIMITS = {
  otpRequestPerEmailPerHour: 5,
  otpRequestPerIpPerHour: 20,
  otpVerifyPerEmailPer10Min: 10,
  googleAuthPerIpPer10Min: 20,
  paymentCreatePerUserPerHour: 5
};

// site_settings keys used for admin-editable price/discount, course
// structure and homepage content. See getSetting/setSetting in db.ts and
// routes/admin.ts's settings endpoints.
export const SETTING_ENROLLMENT_PRICE_USDT = "enrollment_price_usdt";
export const SETTING_REFERENCE_PRICE_USDT = "reference_price_usdt";
export const SETTING_FREE_LESSON_COUNT = "free_lesson_count";
export const SETTING_INTRO_VIDEO_EMBED_URL = "intro_video_embed_url";

/**
 * The server is always the source of truth for price — never trust the
 * client. Reads the admin-editable `site_settings` row first; falls back to
 * the wrangler.jsonc env var (and finally a hardcoded default) so existing
 * deployments keep working before an admin ever touches the settings page.
 */
export async function getEnrollmentAmount(env: Env): Promise<number> {
  const raw = await getSetting(env, SETTING_ENROLLMENT_PRICE_USDT, env.ENROLLMENT_PRICE_USDT);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 49;
}

export async function getReferenceAmount(env: Env): Promise<number> {
  const raw = await getSetting(env, SETTING_REFERENCE_PRICE_USDT, env.REFERENCE_PRICE_USDT);
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 100;
}

/**
 * How many classes (in sequence, starting from Class 1) a learner can watch
 * before enrollment is required. Fully admin-editable from the panel
 * (Settings → Course) — replaces the old hardcoded FREE_LESSON_COUNT
 * constant. Falls back to 5 if no admin has ever saved a value yet.
 */
export async function getFreeLessonCount(env: Env): Promise<number> {
  const raw = await getSetting(env, SETTING_FREE_LESSON_COUNT, null);
  if (raw === null) return DEFAULT_FREE_LESSON_COUNT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_FREE_LESSON_COUNT;
}

/** The homepage intro video's embed URL, editable from Settings → Course. Null until an admin sets one. */
export async function getIntroVideoEmbedUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_INTRO_VIDEO_EMBED_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
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


