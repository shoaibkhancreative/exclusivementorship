import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getEnrollmentAmount, getReferenceAmount, getFreeLessonCount, getIntroVideoEmbedUrl } from "../lib/config";

export const configRoutes = new Hono<{ Bindings: Env }>();

/** Only non-secret, display-safe values. Never put API keys/tokens here. */
configRoutes.get("/public", async (c) => {
  const [enrollmentPrice, referencePrice, freeLessonCount, introVideoEmbedUrl] = await Promise.all([
    getEnrollmentAmount(c.env),
    getReferenceAmount(c.env),
    getFreeLessonCount(c.env),
    getIntroVideoEmbedUrl(c.env)
  ]);
  return c.json({
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl,
    mentorshipPdfUrl: c.env.MENTORSHIP_PDF_URL,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    // Which Telegram destination the support button opens is decided here,
    // server-side, from two fixed non-secret URLs — the CLIENT decides
    // which of the two to actually use based on the real, authenticated
    // course_status (see SupportButton.tsx), never a guess. This is the
    // only Telegram-related config left on the site.
    supportTelegramPremiumUrl: c.env.SUPPORT_TELEGRAM_PREMIUM_URL,
    supportTelegramFreeUrl: c.env.SUPPORT_TELEGRAM_FREE_URL
  });
});
