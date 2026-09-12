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
  // In-site support inbox (replaces the old Telegram support button — see
  // routes/support.ts, routes/admin-support.ts). Where "new ticket" /
  // "new message" notifications are emailed. Optional: if unset, those
  // admin-notification emails are skipped (learner-facing reply emails
  // still send normally, since those go to the learner, not this address).
  SUPPORT_NOTIFY_EMAIL?: string;

  // Optional — retention window (in days) for the scheduled audit_events
  // cleanup job. Defaults to 90 if unset. Never applies to event_type
  // 'payment_confirmed' or 'payment_underpaid_within_tolerance', which are
  // kept indefinitely regardless of this setting. See scheduled.ts. The cron
  // trigger that runs this job is NOT enabled by default — see
  // wrangler.jsonc.
  AUDIT_RETENTION_DAYS?: string;

  // secrets (wrangler secret put ...) — undefined locally unless in .dev.vars
  RESEND_API_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  // Bunny Stream → Security → General → "Token authentication key". Signs
  // Bunny embed URLs (see lib/bunny.ts). Never sent to the client, never
  // logged. Left unset locally unless added to .dev.vars — video-token
  // requests fail closed (500) rather than falling back to an unsigned URL.
  BUNNY_TOKEN_AUTH_KEY?: string;
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
  paymentCreatePerUserPerHour: 5,
  // A normal viewer requests a handful of these per lesson at most (page
  // load, maybe a manual retry). Generous enough to never bother a real
  // student, tight enough to blunt a script trying to mint many signed
  // links quickly.
  videoTokenPerUserPerHour: 60
};

// site_settings keys used for admin-editable price/discount, course
// structure and homepage content. See getSetting/setSetting in db.ts and
// routes/admin.ts's settings endpoints.
export const SETTING_ENROLLMENT_PRICE_USDT = "enrollment_price_usdt";
export const SETTING_REFERENCE_PRICE_USDT = "reference_price_usdt";
export const SETTING_FREE_LESSON_COUNT = "free_lesson_count";
export const SETTING_INTRO_VIDEO_EMBED_URL = "intro_video_embed_url";
export const SETTING_SITE_LOGO_URL = "site_logo_url";
export const SETTING_SITE_FAVICON_URL = "site_favicon_url";

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
 * Site logo/favicon (Phase 4) — URL fields, same "paste a link, see a
 * preview" pattern as the intro video and lesson thumbnails; no upload
 * storage. Both are optional: when unset, the client keeps its current
 * default appearance (text brand name in the nav; the bundled
 * /favicon.svg) rather than showing anything broken.
 */
export async function getSiteLogoUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_SITE_LOGO_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
}

export async function getSiteFaviconUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_SITE_FAVICON_URL, null);
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

// ---------------------------------------------------------------------------
// In-site support inbox (migrations/0016, 0017) — replaces the old Telegram
// support button. See routes/support.ts (learner) and
// routes/admin-support.ts (admin).
// ---------------------------------------------------------------------------

export type SupportAgentProfile = "nlt" | "void" | "venom" | "shadow";

/** Every agent profile's display label, in one place so copy can change without touching route/UI logic. */
export const SUPPORT_AGENT_LABELS: Record<SupportAgentProfile, string> = {
  nlt: "NLT",
  void: "Void",
  venom: "Venom",
  shadow: "Shadow"
};

/** New tickets are randomly assigned to one of these — never 'nlt' at creation time (only an admin can shift a ticket to 'nlt'). */
export const SUPPORT_AUTO_ASSIGN_PROFILES: SupportAgentProfile[] = ["void", "venom", "shadow"];

export function randomSupportAgentProfile(): SupportAgentProfile {
  const i = Math.floor(Math.random() * SUPPORT_AUTO_ASSIGN_PROFILES.length);
  return SUPPORT_AUTO_ASSIGN_PROFILES[i];
}

export const SUPPORT_GUEST_COOKIE_NAME = "support_guest_id";
/** How long a guest's support-ticket identity cookie lasts. Not a security-sensitive token (just a correlation id), so a long-lived plain cookie is fine — mirrors buildSessionCookie's attribute shape, not its HMAC. */
export const SUPPORT_GUEST_COOKIE_DAYS = 365;

/** Hard server-side cap on a single attachment's raw (decoded) byte size — D1's own BLOB/row ceiling is 2,000,000 bytes, so this leaves comfortable headroom. */
export const SUPPORT_MAX_ATTACHMENT_BYTES = 1.5 * 1024 * 1024;
export const SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif"
]);

/**
 * Lesson thumbnails uploaded from the admin panel (see LessonsPage.tsx /
 * fileToCompressedDataUrl) are stored inline in `lessons.thumbnail_url` as a
 * `data:image/...;base64,...` string — this project has no R2/object
 * storage bucket configured (see wrangler.jsonc), so a plain TEXT column is
 * the pragmatic option rather than standing up new infra for what's a small
 * (client-resized) image. Kept well under D1's 2,000,000-byte BLOB/row
 * ceiling: 1MB of raw image bytes inflates to ~1.37MB as base64 text, which
 * still leaves headroom alongside the row's other columns.
 */
export const LESSON_THUMBNAIL_MAX_BYTES = 1 * 1024 * 1024;
export const LESSON_THUMBNAIL_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);


