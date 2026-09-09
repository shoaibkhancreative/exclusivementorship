import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getEnrollmentAmount, getReferenceAmount, getFreeLessonCount, getIntroVideoEmbedUrl } from "../lib/config";
import { isBunnyEmbedUrl, signBunnyEmbedUrl } from "../lib/bunny";

export const configRoutes = new Hono<{ Bindings: Env }>();

/** Only non-secret, display-safe values. Never put API keys/tokens here. */
configRoutes.get("/public", async (c) => {
  const [enrollmentPrice, referencePrice, freeLessonCount, rawIntroVideoEmbedUrl] = await Promise.all([
    getEnrollmentAmount(c.env),
    getReferenceAmount(c.env),
    getFreeLessonCount(c.env),
    getIntroVideoEmbedUrl(c.env)
  ]);

  // The intro video lives on the same Bunny Stream library as every gated
  // lesson, and that library has Embed View Token Authentication enabled —
  // so an unsigned embed URL is rejected by Bunny just like an unsigned
  // lesson would be. Sign it here exactly like lessons.ts does, and fall
  // back to the raw URL only for non-Bunny embeds (e.g. a YouTube link) or
  // if signing fails, rather than breaking the whole homepage.
  let introVideoEmbedUrl = rawIntroVideoEmbedUrl;
  if (rawIntroVideoEmbedUrl && isBunnyEmbedUrl(rawIntroVideoEmbedUrl)) {
    try {
      introVideoEmbedUrl = await signBunnyEmbedUrl(c.env, rawIntroVideoEmbedUrl);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("signBunnyEmbedUrl failed for intro video", err);
    }
  }

  return c.json({
    enrollmentPrice,
    referencePrice,
    discountPercent: Math.round((1 - enrollmentPrice / referencePrice) * 100),
    freeLessonCount,
    introVideoEmbedUrl,
    mentorshipPdfUrl: c.env.MENTORSHIP_PDF_URL,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY,
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    // Only the FREE-tier Telegram destination is public — it's fine for any
    // anonymous visitor to have. The premium (paid-mentor) Telegram link is
    // deliberately NOT included here: this endpoint has no auth requirement
    // at all (anyone can call GET /api/config/public without logging in), so
    // putting the premium URL here and trusting the client to only show it
    // to paid users would leak the exclusive contact to every visitor via
    // plain devtools/curl. That decision now happens in GET /auth/me
    // instead (see routes/auth.ts's `supportTelegramUrl`), which is
    // authenticated and derives the destination from the real, session-
    // backed course_status — never from anything the client asserts.
    supportTelegramFreeUrl: c.env.SUPPORT_TELEGRAM_FREE_URL
  });
});
