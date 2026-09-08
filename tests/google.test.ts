import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestEnv } from "./testEnv";
import type { Env } from "../src/worker/lib/config";
import { issueOtp, verifyOtp } from "../src/worker/auth";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "fake-jwks"),
  jwtVerify: vi.fn()
}));

import { jwtVerify } from "jose";
import { verifyGoogleIdToken } from "../src/worker/services/google";
import { getOrCreateUserByGoogle } from "../src/worker/db";

function mockPayload(overrides: Record<string, unknown> = {}) {
  return {
    payload: {
      iss: "https://accounts.google.com",
      aud: "test-google-client-id.apps.googleusercontent.com",
      sub: "1234567890",
      email: "Someone@Example.com",
      email_verified: true,
      ...overrides
    }
  };
}

describe("verifyGoogleIdToken", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
    vi.mocked(jwtVerify).mockReset();
  });

  it("returns not_configured when GOOGLE_CLIENT_ID is unset", async () => {
    const result = await verifyGoogleIdToken({ ...env, GOOGLE_CLIENT_ID: "" }, "whatever");
    expect(result).toEqual({ ok: false, reason: "not_configured" });
    // Never even attempts signature verification without a configured client id.
    expect(jwtVerify).not.toHaveBeenCalled();
  });

  it("accepts a valid, signature-verified token and normalizes the email", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(mockPayload() as never);

    const result = await verifyGoogleIdToken(env, "valid-jwt");
    expect(result).toEqual({
      ok: true,
      identity: { sub: "1234567890", email: "someone@example.com" }
    });
  });

  it("rejects an unverified email", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(mockPayload({ email_verified: false }) as never);

    const result = await verifyGoogleIdToken(env, "jwt");
    expect(result).toEqual({ ok: false, reason: "email_not_verified" });
  });

  it("rejects a token asserting the wrong issuer", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(mockPayload({ iss: "https://evil.example.com" }) as never);

    const result = await verifyGoogleIdToken(env, "jwt");
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("rejects when jose throws (bad signature, expired, wrong audience, malformed)", async () => {
    vi.mocked(jwtVerify).mockRejectedValue(new Error("signature verification failed"));

    const result = await verifyGoogleIdToken(env, "garbage");
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("never trusts a payload missing sub or email even if issuer/verified check pass", async () => {
    vi.mocked(jwtVerify).mockResolvedValue(mockPayload({ sub: undefined }) as never);

    const result = await verifyGoogleIdToken(env, "jwt");
    expect(result).toEqual({ ok: false, reason: "invalid_token" });
  });
});

describe("getOrCreateUserByGoogle", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("creates a new user (free tier) when neither google_sub nor email exist yet", async () => {
    const user = await getOrCreateUserByGoogle(env, "sub-1", "new@example.com");
    expect(user.email).toBe("new@example.com");
    expect(user.google_sub).toBe("sub-1");
    expect(user.course_status).toBe("free");
    expect(user.current_lesson).toBe(1);
  });

  it("links to an existing OTP-created account by email instead of duplicating it", async () => {
    const code = await issueOtp(env, "user@example.com");
    const otpResult = await verifyOtp(env, "user@example.com", code);
    if (!otpResult.ok) throw new Error("expected ok");

    const googleUser = await getOrCreateUserByGoogle(env, "sub-42", "user@example.com");
    expect(googleUser.id).toBe(otpResult.user.id);
    expect(googleUser.google_sub).toBe("sub-42");
  });

  it("resolves the same account by google_sub on a repeat Google login", async () => {
    const first = await getOrCreateUserByGoogle(env, "sub-7", "repeat@example.com");
    const second = await getOrCreateUserByGoogle(env, "sub-7", "repeat@example.com");
    expect(second.id).toBe(first.id);
  });

  it("does not lose existing progress/paid status when linking an OTP account", async () => {
    const code = await issueOtp(env, "paid@example.com");
    const otpResult = await verifyOtp(env, "paid@example.com", code);
    if (!otpResult.ok) throw new Error("expected ok");

    await env.DB.prepare("UPDATE users SET course_status = 'paid', current_lesson = 10 WHERE id = ?")
      .bind(otpResult.user.id)
      .run();

    const googleUser = await getOrCreateUserByGoogle(env, "sub-99", "paid@example.com");
    expect(googleUser.id).toBe(otpResult.user.id);
    expect(googleUser.course_status).toBe("paid");
    expect(googleUser.current_lesson).toBe(10);
  });
});
