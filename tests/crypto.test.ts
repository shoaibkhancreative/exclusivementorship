import { describe, expect, it } from "vitest";
import { generateOtp, hmacSha256Hex, randomToken, randomUuid, sha256Hex, timingSafeEqual } from "../src/worker/lib/crypto";

describe("sha256Hex / hmacSha256Hex", () => {
  it("produces a stable, deterministic hash for the same input", async () => {
    const a = await sha256Hex("hello world");
    const b = await sha256Hex("hello world");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", async () => {
    const a = await sha256Hex("otp:test@example.com:123456");
    const b = await sha256Hex("otp:test@example.com:123457");
    expect(a).not.toBe(b);
  });

  it("HMAC output depends on the secret, not just the message", async () => {
    const a = await hmacSha256Hex("secret-one", "message");
    const b = await hmacSha256Hex("secret-two", "message");
    expect(a).not.toBe(b);
  });
});

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqual("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqual("short", "muchlongerstring")).toBe(false);
  });
});

describe("randomToken / randomUuid", () => {
  it("generates unique tokens across calls", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => randomToken(16)));
    expect(tokens.size).toBe(20);
  });

  it("generates RFC-4122-shaped UUIDs", () => {
    expect(randomUuid()).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("generateOtp", () => {
  it("generates a 6-digit numeric code by default", () => {
    const otp = generateOtp();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it("is not trivially predictable across many calls (basic sanity check)", () => {
    const codes = new Set(Array.from({ length: 30 }, () => generateOtp()));
    // Extremely unlikely to collide 30 times out of 1,000,000 possibilities
    // unless the generator is broken.
    expect(codes.size).toBeGreaterThan(25);
  });
});
