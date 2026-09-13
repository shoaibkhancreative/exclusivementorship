import { getSetting } from "../db";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  CONFIG_CACHE?: KVNamespace;

  APP_URL: string;
  EMAIL_FROM: string;
  MENTORSHIP_PDF_URL: string;
  TURNSTILE_SITE_KEY: string;
  GOOGLE_CLIENT_ID?: string;
  ENROLLMENT_PRICE_USDT: string;
  REFERENCE_PRICE_USDT: string;
  BUNNY_PULL_ZONE_HOST?: string;
  UNDERPAYMENT_TOLERANCE_USDT?: string;
  SUPPORT_NOTIFY_EMAIL?: string;

  AUDIT_RETENTION_DAYS?: string;

  RESEND_API_KEY?: string;
  NOWPAYMENTS_API_KEY?: string;
  NOWPAYMENTS_IPN_SECRET?: string;
  SESSION_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  BUNNY_TOKEN_AUTH_KEY?: string;
  BUNNY_STREAM_API_KEY?: string;
}

const DEFAULT_FREE_LESSON_COUNT = 5;

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export const SESSION_DURATION_DAYS = 30;
export const SESSION_COOKIE_NAME = "em_session";

export const ADMIN_SESSION_DURATION_DAYS = 7;
export const ADMIN_SESSION_COOKIE_NAME = "em_admin_session";

export const RATE_LIMITS = {
  otpRequestPerEmailPerHour: 5,
  otpRequestPerIpPerHour: 20,
  otpVerifyPerEmailPer10Min: 10,
  googleAuthPerIpPer10Min: 20,
  paymentCreatePerUserPerHour: 5,
  videoTokenPerUserPerHour: 60,
  supportTicketCreatePerIpPerHour: 10,
  supportTicketCreatePerIdentityPerHour: 5,
  supportMessagePerIdentityPerHour: 30
};

export const SETTING_ENROLLMENT_PRICE_USDT = "enrollment_price_usdt";
export const SETTING_REFERENCE_PRICE_USDT = "reference_price_usdt";
export const SETTING_FREE_LESSON_COUNT = "free_lesson_count";
export const SETTING_INTRO_VIDEO_EMBED_URL = "intro_video_embed_url";
export const SETTING_SITE_LOGO_URL = "site_logo_url";
export const SETTING_SITE_FAVICON_URL = "site_favicon_url";
export const SETTING_APP_DOWNLOAD_URL = "app_download_url";

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

export async function getFreeLessonCount(env: Env): Promise<number> {
  const raw = await getSetting(env, SETTING_FREE_LESSON_COUNT, null);
  if (raw === null) return DEFAULT_FREE_LESSON_COUNT;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_FREE_LESSON_COUNT;
}

export async function getIntroVideoEmbedUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_INTRO_VIDEO_EMBED_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
}

export async function getSiteLogoUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_SITE_LOGO_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
}

export async function getSiteFaviconUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_SITE_FAVICON_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
}

// Placeholder until the Android app exists: the admin can leave this unset
// and the header button will still render (per the requirement that the
// button always shows), just pointing at "#" until a real APK/Play Store
// link is configured. Phase 2 (the Capacitor app) should set this to the
// real download URL.
export async function getAppDownloadUrl(env: Env): Promise<string | null> {
  const raw = await getSetting(env, SETTING_APP_DOWNLOAD_URL, null);
  return raw && raw.trim() ? raw.trim() : null;
}

export const PAY_CURRENCY = "usdtbsc";
export const PAY_NETWORK_LABEL = "BNB Smart Chain (BEP20)";

export function getUnderpaymentToleranceUsdt(env: Env): number {
  const n = Number(env.UNDERPAYMENT_TOLERANCE_USDT);
  return Number.isFinite(n) && n >= 0 ? n : 2;
}

export type SupportAgentProfile = "nlt" | "void" | "venom" | "shadow";

export const SUPPORT_AGENT_LABELS: Record<SupportAgentProfile, string> = {
  nlt: "NLT",
  void: "Void",
  venom: "Venom",
  shadow: "Shadow"
};

export const SUPPORT_AUTO_ASSIGN_PROFILES: SupportAgentProfile[] = ["void", "venom", "shadow"];

export function randomSupportAgentProfile(): SupportAgentProfile {
  const i = Math.floor(Math.random() * SUPPORT_AUTO_ASSIGN_PROFILES.length);
  return SUPPORT_AUTO_ASSIGN_PROFILES[i];
}

export const SUPPORT_GUEST_COOKIE_NAME = "support_guest_id";
export const SUPPORT_GUEST_COOKIE_DAYS = 365;

export const SUPPORT_MAX_ATTACHMENT_BYTES = 1.5 * 1024 * 1024;
export const SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const LESSON_THUMBNAIL_MAX_BYTES = 1 * 1024 * 1024;
export const LESSON_THUMBNAIL_ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
