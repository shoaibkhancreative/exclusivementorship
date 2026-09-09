// Bunny Stream "Embed View Token Authentication" — signs the iframe embed
// URL so a copied/shared link can't be opened outside the site once it
// expires. See https://docs.bunny.net/stream/token-authentication (verified
// directly against Bunny's docs before writing this, not from memory).
import type { Env } from "./config";
import { sha256Hex } from "./crypto";

/**
 * The Bunny Stream library that hosts every mentorship video. Not a
 * secret — it's the numeric ID that already appears in the public
 * iframe.mediadelivery.net URL — but kept as one named constant instead of
 * repeating the literal, in case a second library is ever added.
 */
export const BUNNY_LIBRARY_ID = "747219";

/**
 * How long a freshly-signed embed URL stays valid, in seconds. Kept
 * deliberately short (30 min) rather than "however long the lesson runs":
 * Bunny's Embed View Token Authentication only checks `token`/`expires` on
 * the initial iframe request, not on every underlying video segment, so
 * this window only bounds how long a *copied-but-not-yet-opened* link keeps
 * working — it does not interrupt playback that has already started.
 * Named/exported so it's easy to tune later without hunting for a literal.
 */
export const VIDEO_TOKEN_TTL_SECONDS = 30 * 60;

const BUNNY_HOST_PATTERN = /(^|\.)(mediadelivery\.net|b-cdn\.net)$/;

export interface BunnyEmbedRef {
  libraryId: string;
  videoId: string;
}

/**
 * Parses `https://iframe.mediadelivery.net/embed/{libraryId}/{videoId}`
 * (optionally with existing query params) into its library/video IDs.
 * Returns null for anything that isn't a Bunny embed URL (YouTube links,
 * malformed input, etc.) so callers can safely no-op on non-Bunny embeds.
 */
export function parseBunnyEmbedUrl(embedUrl: string): BunnyEmbedRef | null {
  let parsed: URL;
  try {
    parsed = new URL(embedUrl);
  } catch {
    return null;
  }
  if (!BUNNY_HOST_PATTERN.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean); // ["embed", "747219", "<videoId>"]
  if (parts.length < 3 || parts[0] !== "embed") return null;

  return { libraryId: parts[1], videoId: parts[2] };
}

export function isBunnyEmbedUrl(embedUrl: string): boolean {
  return parseBunnyEmbedUrl(embedUrl) !== null;
}

/**
 * Signs a Bunny Stream embed URL with Embed View Token Authentication.
 *
 * Algorithm (verified against Bunny's docs, not assumed):
 *   token = SHA256_HEX(token_security_key + video_id + expires)
 * — plain string concatenation, in that order (key, then video ID, then the
 * decimal Unix-seconds expiry), lower-case hex digest. `sha256Hex` below is
 * the same unkeyed Web Crypto helper already used elsewhere in lib/crypto.ts
 * (not the HMAC variant — Bunny's scheme is a plain SHA-256 of the
 * concatenated string, not a keyed hash).
 *
 * Future DRM note: once MediaCage Enterprise DRM is enabled later from the
 * Bunny dashboard, this exact same signed-URL flow continues to work
 * unchanged — Embed View Token Authentication automatically also covers the
 * DRM license endpoint at that point. That's a dashboard toggle + Bunny
 * sales contract, not a code change; nothing here needs to be restructured.
 *
 * Throws (never silently falls back to an unsigned URL) if the input isn't
 * a Bunny embed URL or the signing key isn't configured — callers should
 * catch and return a generic error, never leak *why* signing failed.
 */
export async function signBunnyEmbedUrl(env: Env, embedUrl: string): Promise<string> {
  const ref = parseBunnyEmbedUrl(embedUrl);
  if (!ref) {
    throw new Error("Not a Bunny Stream embed URL");
  }
  if (!env.BUNNY_TOKEN_AUTH_KEY) {
    throw new Error("BUNNY_TOKEN_AUTH_KEY is not configured");
  }

  const expires = Math.floor(Date.now() / 1000) + VIDEO_TOKEN_TTL_SECONDS;
  const token = await sha256Hex(env.BUNNY_TOKEN_AUTH_KEY + ref.videoId + String(expires));

  const signed = new URL(embedUrl);
  signed.searchParams.set("token", token);
  signed.searchParams.set("expires", String(expires));
  return signed.toString();
}
