import { Hono } from "hono";
import type { Env } from "../lib/config";
import {
  getEnrollmentAmount,
  getReferenceAmount,
  getFreeLessonCount,
  getIntroVideoEmbedUrl,
  getSiteLogoUrl,
  getSiteFaviconUrl
} from "../lib/config";
import { isBunnyEmbedUrl, signBunnyEmbedUrl } from "../lib/bunny";
import { getContentMap, getAllLayouts } from "../db";
import { CONTENT_DEFAULTS } from "../lib/content";
import { PAGE_BLOCKS } from "../lib/layout";
import { getCached, CACHE_KEYS } from "../lib/cache";

export const configRoutes = new Hono<{ Bindings: Env }>();

configRoutes.get("/content", async (c) => {
  const content = await getCached(c.env, CACHE_KEYS.content, () => getContentMap(c.env, CONTENT_DEFAULTS));
  return c.json({ content });
});

configRoutes.get("/layout", async (c) => {
  const pageKeys = Object.keys(PAGE_BLOCKS);
  try {
    const layouts = await getCached(c.env, CACHE_KEYS.layout, () => getAllLayouts(c.env, pageKeys));
    return c.json({ layouts });
  } catch {
    const layouts: Record<string, ReturnType<typeof defaultLayoutFallback>> = {};
    for (const key of pageKeys) layouts[key] = defaultLayoutFallback(key);
    return c.json({ layouts });
  }
});

function defaultLayoutFallback(pageKey: string) {
  return (PAGE_BLOCKS[pageKey] ?? []).map((b) => ({ id: b.id, visible: true }));
}

configRoutes.get("/public", async (c) => {
  const payload = await getCached(c.env, CACHE_KEYS.publicConfig, async () => {
    const [enrollmentPrice, referencePrice, freeLessonCount, rawIntroVideoEmbedUrl, siteLogoUrl, siteFaviconUrl] =
      await Promise.all([
        getEnrollmentAmount(c.env),
        getReferenceAmount(c.env),
        getFreeLessonCount(c.env),
        getIntroVideoEmbedUrl(c.env),
        getSiteLogoUrl(c.env),
        getSiteFaviconUrl(c.env)
      ]);

    let introVideoEmbedUrl = rawIntroVideoEmbedUrl;
    if (rawIntroVideoEmbedUrl && isBunnyEmbedUrl(rawIntroVideoEmbedUrl)) {
      try {
        introVideoEmbedUrl = await signBunnyEmbedUrl(c.env, rawIntroVideoEmbedUrl);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("signBunnyEmbedUrl failed for intro video", err);
      }
    }

    return {
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
    };
  });

  return c.json(payload);
});
