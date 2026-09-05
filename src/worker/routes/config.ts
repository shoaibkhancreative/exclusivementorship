import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getEnrollmentAmount, getReferenceAmount } from "../lib/config";

export const configRoutes = new Hono<{ Bindings: Env }>();

/** Only non-secret, display-safe values. Never put API keys/tokens here. */
configRoutes.get("/public", (c) => {
  return c.json({
    enrollmentPrice: getEnrollmentAmount(c.env),
    referencePrice: getReferenceAmount(c.env),
    discountPercent: Math.round((1 - getEnrollmentAmount(c.env) / getReferenceAmount(c.env)) * 100),
    mentorshipPdfUrl: c.env.MENTORSHIP_PDF_URL,
    turnstileSiteKey: c.env.TURNSTILE_SITE_KEY
  });
});
