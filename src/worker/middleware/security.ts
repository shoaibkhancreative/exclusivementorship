import type { Context, Next } from "hono";
import type { Env } from "../lib/config";

/**
 * Applies a conservative security-header baseline to every response.
 * The CSP allows YouTube's embed origin (video), Cloudflare Turnstile's
 * script/frame, and Google Identity Services' script/iframe (Sign in with
 * Google) — everything else is same-origin.
 */
export async function securityHeaders(c: Context<{ Bindings: Env }>, next: Next) {
  await next();

  const res = new Response(c.res.body, c.res);

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://www.youtube.com https://assets.mediadelivery.net https://challenges.cloudflare.com https://accounts.google.com/gsi/client",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://iframe.mediadelivery.net https://challenges.cloudflare.com https://accounts.google.com/gsi/",
      "connect-src 'self' https://accounts.google.com/gsi/",
      "font-src 'self' data:",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join("; ")
  );

  if (!c.req.url.startsWith("http://localhost") && !c.req.url.startsWith("http://127.0.0.1")) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  }

  c.res = res;
}

/**
 * True only when `origin`'s hostname is EXACTLY "localhost" or "127.0.0.1" —
 * never a substring match (e.g. "https://evil.com/localhost" or
 * "https://localhost.evil.com" must NOT pass).
 */
function isLocalDevOrigin(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Restricts CORS to the configured APP_URL. The SPA and API share an origin in production. */
export async function corsPolicy(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header("origin");
  await next();

  if (origin && (origin === c.env.APP_URL || isLocalDevOrigin(origin))) {
    const res = new Response(c.res.body, c.res);
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Credentials", "true");
    c.res = res;
  }
}