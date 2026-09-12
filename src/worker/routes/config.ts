import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getEnrollmentAmount, getReferenceAmount, getFreeLessonCount, getIntroVideoEmbedUrl, getSiteLogoUrl, getSiteFaviconUrl } from "../lib/config";
import { isBunnyEmbedUrl, signBunnyEmbedUrl } from "../lib/bunny";
import { getContentMap, getAllLayouts } from "../db";
import { CONTENT_DEFAULTS } from "../lib/content";
import { PAGE_BLOCKS } from "../lib/layout";

export const configRoutes = new Hono<{ Bindings: Env }>();

/**
 * Every admin-editable page-copy string, fetched once client-side by
 * useContent() (see lib/content.ts on the client) and cached for the
 * session. Deliberately a separate endpoint from /config/public rather than
 * merged into it: this map can grow to dozens of keys as more pages adopt
 * `t()`, and callers that only need price/video config (Login, SupportButton)
 * shouldn't have to wait on or re-fetch it.
 */
configRoutes.get("/content", async (c) => {
  const content = await getContentMap(c.env, CONTENT_DEFAULTS);
  return c.json({ content });
});

/**
 * Per-page block order + visibility (Phase 3), for the small set of pages
 * built from independent, reorderable blocks (see PAGE_BLOCKS). Returns
 * every known page's *full* reconciled list (hidden blocks included, with
 * `visible: false`) rather than pre-filtering — the page component decides
 * how to render "hidden" (usually: just don't render it), and having the
 * full list makes debugging a layout in the admin UI/devtools easier.
 */
configRoutes.get("/layout", async (c) => {
  const pageKeys = Object.keys(PAGE_BLOCKS);
  try {
    const layouts = await getAllLayouts(c.env, pageKeys);
    return c.json({ layouts });
  } catch {
    // Never break the public site over a layout-table hiccup — fall back to
    // the full default (all blocks, all visible, registry order) for every
    // page, same as an individual getLayout() failure would.
    const layouts: Record<string, ReturnType<typeof defaultLayoutFallback>> = {};
    for (const key of pageKeys) layouts[key] = defaultLayoutFallback(key);
    return c.json({ layouts });
  }
});

function defaultLayoutFallback(pageKey: string) {
  return (PAGE_BLOCKS[pageKey] ?? []).map((b) => ({ id: b.id, visible: true }));
}

/** Only non-secret, display-safe values. Never put API keys/tokens here. */
configRoutes.get("/public", async (c) => {
  const [enrollmentPrice, referencePrice, freeLessonCount, rawIntroVideoEmbedUrl, siteLogoUrl, siteFaviconUrl] =
    await Promise.all([
      getEnrollmentAmount(c.env),
      getReferenceAmount(c.env),
      getFreeLessonCount(c.env),
      getIntroVideoEmbedUrl(c.env),
      getSiteLogoUrl(c.env),
      getSiteFaviconUrl(c.env)
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
    siteLogoUrl,
    siteFaviconUrl
  });
});
