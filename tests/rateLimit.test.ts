import { beforeEach, describe, expect, it } from "vitest";
import { createTestEnv } from "./testEnv";
import { checkRateLimit } from "../src/worker/db";
import type { Env } from "../src/worker/lib/config";

describe("checkRateLimit", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("allows requests up to the configured max within the window", async () => {
    const key = "test:bucket:1";
    for (let i = 0; i < 3; i++) {
      const result = await checkRateLimit(env, key, 3, 3600);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests once the max count is exceeded", async () => {
    const key = "test:bucket:2";
    await checkRateLimit(env, key, 2, 3600);
    await checkRateLimit(env, key, 2, 3600);
    const third = await checkRateLimit(env, key, 2, 3600);
    expect(third.allowed).toBe(false);
  });

  it("resets the count once the window has elapsed", async () => {
    const key = "test:bucket:3";
    await checkRateLimit(env, key, 1, 3600);
    const blocked = await checkRateLimit(env, key, 1, 3600);
    expect(blocked.allowed).toBe(false);

    // Simulate the window having elapsed.
    await env.DB.prepare("UPDATE rate_limits SET window_start = datetime('now', '-2 hour') WHERE bucket_key = ?")
      .bind(key)
      .run();

    const afterReset = await checkRateLimit(env, key, 1, 3600);
    expect(afterReset.allowed).toBe(true);
  });

  it("tracks independent buckets separately", async () => {
    await checkRateLimit(env, "bucket:a", 1, 3600);
    const blockedA = await checkRateLimit(env, "bucket:a", 1, 3600);
    const allowedB = await checkRateLimit(env, "bucket:b", 1, 3600);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });
});
