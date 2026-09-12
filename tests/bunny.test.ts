import { describe, expect, it, beforeEach } from "vitest";
import { isBunnyEmbedUrl, parseBunnyEmbedUrl, signBunnyEmbedUrl, VIDEO_TOKEN_TTL_SECONDS } from "../src/worker/lib/bunny";
import { sha256Hex } from "../src/worker/lib/crypto";
import worker from "../src/worker/index";
import { createTestEnv } from "./testEnv";
import { createSession } from "../src/worker/auth";
import { getOrCreateUser } from "../src/worker/db";
import type { Env } from "../src/worker/lib/config";

const BUNNY_URL = "https://iframe.mediadelivery.net/embed/747219/abc-123-def";
const YOUTUBE_URL = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";

describe("parseBunnyEmbedUrl / isBunnyEmbedUrl", () => {
  it("extracts library and video IDs from a Bunny embed URL", () => {
    expect(parseBunnyEmbedUrl(BUNNY_URL)).toEqual({ libraryId: "747219", videoId: "abc-123-def" });
  });

  it("returns null for a YouTube URL", () => {
    expect(parseBunnyEmbedUrl(YOUTUBE_URL)).toBeNull();
    expect(isBunnyEmbedUrl(YOUTUBE_URL)).toBe(false);
  });

  it("returns null for malformed input", () => {
    expect(parseBunnyEmbedUrl("not a url")).toBeNull();
    expect(parseBunnyEmbedUrl("https://iframe.mediadelivery.net/embed/747219")).toBeNull();
  });

  it("recognizes a Bunny embed URL that already has query params", () => {
    expect(isBunnyEmbedUrl(`${BUNNY_URL}?autoplay=false`)).toBe(true);
  });
});

describe("signBunnyEmbedUrl", () => {
  it("appends a token and expires computed with Bunny's documented algorithm", async () => {
    const env = await createTestEnv();
    const before = Math.floor(Date.now() / 1000);
    const signed = await signBunnyEmbedUrl(env, BUNNY_URL);
    const url = new URL(signed);

    const expires = Number(url.searchParams.get("expires"));
    expect(expires).toBeGreaterThanOrEqual(before + VIDEO_TOKEN_TTL_SECONDS);
    expect(expires).toBeLessThanOrEqual(before + VIDEO_TOKEN_TTL_SECONDS + 5);

    // token = SHA256_HEX(security_key + video_id + expires), plain
    // concatenation — recomputed independently here against the same
    // helper used elsewhere (sha256Hex), not against signBunnyEmbedUrl
    // itself, so this actually checks the algorithm/ordering.
    const expected = await sha256Hex(env.BUNNY_TOKEN_AUTH_KEY! + "abc-123-def" + String(expires));
    expect(url.searchParams.get("token")).toBe(expected);
  });

  it("preserves the library/video path unchanged", async () => {
    const env = await createTestEnv();
    const signed = await signBunnyEmbedUrl(env, BUNNY_URL);
    expect(new URL(signed).pathname).toBe("/embed/747219/abc-123-def");
  });

  it("throws for a non-Bunny URL rather than returning it unsigned", async () => {
    const env = await createTestEnv();
    await expect(signBunnyEmbedUrl(env, YOUTUBE_URL)).rejects.toThrow();
  });

  it("throws (fails closed) when the signing key isn't configured", async () => {
    const env = await createTestEnv({ BUNNY_TOKEN_AUTH_KEY: undefined });
    await expect(signBunnyEmbedUrl(env, BUNNY_URL)).rejects.toThrow();
  });

  it("never leaks the security key into the signed URL", async () => {
    const env = await createTestEnv();
    const signed = await signBunnyEmbedUrl(env, BUNNY_URL);
    expect(signed).not.toContain(env.BUNNY_TOKEN_AUTH_KEY);
  });
});

// --- HTTP route: POST /api/lessons/:number/video-token ---------------------

async function call(env: Env, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const request = new Request(`http://localhost${path}`, { ...init, headers });
  return worker.fetch(request, env);
}

async function loginNewUser(env: Env, email: string) {
  const user = await getOrCreateUser(env, email);
  const token = await createSession(env, user.id);
  return { user, cookie: `em_session=${token}` };
}

async function setLessonEmbedUrl(env: Env, lessonNumber: number, embedUrl: string) {
  await env.DB.prepare("UPDATE lessons SET video_embed_url = ? WHERE lesson_number = ?")
    .bind(embedUrl, lessonNumber)
    .run();
}

describe("POST /api/lessons/:number/video-token", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("requires authentication", async () => {
    const res = await call(env, "/api/lessons/1/video-token", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("issues a signed embed URL for a Bunny lesson the user can access", async () => {
    await setLessonEmbedUrl(env, 1, BUNNY_URL);
    const { cookie } = await loginNewUser(env, "dave@example.com");

    const res = await call(env, "/api/lessons/1/video-token", { method: "POST", cookie, body: "{}" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { embedUrl: string; expiresInSeconds: number };
    expect(body.embedUrl.startsWith("https://iframe.mediadelivery.net/embed/747219/")).toBe(true);
    expect(new URL(body.embedUrl).searchParams.has("token")).toBe(true);
    expect(body.expiresInSeconds).toBe(VIDEO_TOKEN_TTL_SECONDS);
  });

  it("never includes the raw security key anywhere in the response", async () => {
    await setLessonEmbedUrl(env, 1, BUNNY_URL);
    const { cookie } = await loginNewUser(env, "erin@example.com");

    const res = await call(env, "/api/lessons/1/video-token", { method: "POST", cookie, body: "{}" });
    const text = await res.text();
    expect(text).not.toContain(env.BUNNY_TOKEN_AUTH_KEY);
  });

  it("refuses to mint a token for a lesson the user hasn't unlocked yet", async () => {
    await setLessonEmbedUrl(env, 2, BUNNY_URL);
    const { cookie } = await loginNewUser(env, "frank@example.com");

    // Lesson 2 is locked for a brand-new user until lesson 1's video is finished.
    const res = await call(env, "/api/lessons/2/video-token", { method: "POST", cookie, body: "{}" });
    expect(res.status).toBe(403);
  });

  it("rejects lessons that aren't Bunny-hosted", async () => {
    const { cookie } = await loginNewUser(env, "grace@example.com");
    // Lesson 1 is seeded with a YouTube embed URL by default.
    const res = await call(env, "/api/lessons/1/video-token", { method: "POST", cookie, body: "{}" });
    expect(res.status).toBe(400);
  });

  it("404s for a lesson number that doesn't exist", async () => {
    const { cookie } = await loginNewUser(env, "heidi@example.com");
    const res = await call(env, "/api/lessons/999999/video-token", { method: "POST", cookie, body: "{}" });
    expect(res.status).toBe(404);
  });
});

// --- GET /lessons endpoints stay open for free lessons ---------------------
//
// These two GET routes are metadata reads (title, thumbnail, embed URL,
// outline state) and were never gated by auth for free lessons, independent
// of how the video itself gets played. That's still true: a logged-out
// visitor can read a free lesson's plain, unsigned embed URL here with no
// 401/403. Whether that raw URL is actually playable against Bunny is a
// separate concern handled client-side by VideoStage, which now signs every
// Bunny-hosted embed (free or paid) via POST /video-token before rendering
// it — see VideoStage.tsx's `needsToken` comment for why an unsigned
// "free" Bunny embed 403s just like an unsigned paid one would.
describe("Free Bunny-hosted lessons are accessible to logged-out visitors", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("GET /api/lessons/:number succeeds for a logged-out visitor on a free Bunny lesson, with the plain embed URL", async () => {
    // Lesson 1 is free by default (freeLessonCount defaults to 5) — point
    // it at a Bunny embed URL to simulate free content now hosted there too.
    await setLessonEmbedUrl(env, 1, BUNNY_URL);

    const res = await call(env, "/api/lessons/1", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { videoEmbedUrl: string; isLocked: boolean };
    expect(body.isLocked).toBe(false);
    // Unsigned — no token/expires query params, exactly the raw Bunny URL.
    expect(body.videoEmbedUrl).toBe(BUNNY_URL);
  });

  it("GET /api/lessons/ outline succeeds for a logged-out visitor with a free Bunny lesson present", async () => {
    await setLessonEmbedUrl(env, 1, BUNNY_URL);

    const res = await call(env, "/api/lessons", { method: "GET" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { outline: Array<{ lessonNumber: number; state: string }> };
    const lessonOne = body.outline.find((item) => item.lessonNumber === 1);
    expect(lessonOne).toBeDefined();
    expect(lessonOne?.state).not.toBe("locked");
  });

  it("never returns a 401/403 for a logged-out visitor across the free-lesson read path", async () => {
    await setLessonEmbedUrl(env, 1, BUNNY_URL);

    const outlineRes = await call(env, "/api/lessons", { method: "GET" });
    const detailRes = await call(env, "/api/lessons/1", { method: "GET" });

    expect([outlineRes.status, detailRes.status]).not.toContain(401);
    expect([outlineRes.status, detailRes.status]).not.toContain(403);
  });
});
