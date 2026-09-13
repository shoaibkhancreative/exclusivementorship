import type { Env } from "./config";
import { sha256Hex } from "./crypto";

export const BUNNY_LIBRARY_ID = "747219";

export const VIDEO_TOKEN_TTL_SECONDS = 30 * 60;

const BUNNY_HOST_PATTERN = /(^|\.)(mediadelivery\.net|b-cdn\.net)$/;

export interface BunnyEmbedRef {
  libraryId: string;
  videoId: string;
}

export function parseBunnyEmbedUrl(embedUrl: string): BunnyEmbedRef | null {
  let parsed: URL;
  try {
    parsed = new URL(embedUrl);
  } catch {
    return null;
  }
  if (!BUNNY_HOST_PATTERN.test(parsed.hostname)) return null;

  const parts = parsed.pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "embed") return null;

  return { libraryId: parts[1], videoId: parts[2] };
}

export function isBunnyEmbedUrl(embedUrl: string): boolean {
  return parseBunnyEmbedUrl(embedUrl) !== null;
}

export async function fetchBunnyThumbnailUrl(env: Env, embedUrl: string): Promise<string | null> {
  const ref = parseBunnyEmbedUrl(embedUrl);
  if (!ref) return null;
  if (!env.BUNNY_PULL_ZONE_HOST || !env.BUNNY_STREAM_API_KEY) return null;

  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${ref.libraryId}/videos/${ref.videoId}`, {
      headers: { AccessKey: env.BUNNY_STREAM_API_KEY }
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { thumbnailFileName?: string | null };
    if (!data.thumbnailFileName) return null;

    return `https://${env.BUNNY_PULL_ZONE_HOST}/${ref.videoId}/${data.thumbnailFileName}`;
  } catch {
    return null;
  }
}

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
