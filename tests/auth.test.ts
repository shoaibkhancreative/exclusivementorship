import { beforeEach, describe, expect, it } from "vitest";
import { createTestEnv } from "./testEnv";
import {
  buildLogoutCookie,
  buildSessionCookie,
  createSession,
  issueOtp,
  readCookie,
  resolveSession,
  revokeSession,
  verifyOtp
} from "../src/worker/auth";
import type { Env } from "../src/worker/lib/config";

describe("OTP flow", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("issues an OTP and verifies it successfully, creating a new user", async () => {
    const code = await issueOtp(env, "New.User@Example.com ");
    expect(code).toMatch(/^\d{6}$/);

    const result = await verifyOtp(env, "new.user@example.com", code);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.user.email).toBe("new.user@example.com");
      expect(result.user.course_status).toBe("free");
      expect(result.user.current_lesson).toBe(1);
    }
  });

  it("rejects an incorrect code", async () => {
    await issueOtp(env, "user@example.com");
    const result = await verifyOtp(env, "user@example.com", "000000");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a code after it has expired", async () => {
    const code = await issueOtp(env, "user@example.com");

    // Force the stored OTP into the past to simulate expiry without sleeping.
    await env.DB.prepare("UPDATE otp_codes SET expires_at = datetime('now', '-1 hour') WHERE email = ?")
      .bind("user@example.com")
      .run();

    const result = await verifyOtp(env, "user@example.com", code);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("locks out further attempts after too many incorrect guesses", async () => {
    await issueOtp(env, "user@example.com");

    let last;
    for (let i = 0; i < 6; i++) {
      last = await verifyOtp(env, "user@example.com", "111111");
    }
    expect(last).toEqual({ ok: false, reason: "too_many_attempts" });
  });

  it("cannot be reused after a successful verification", async () => {
    const code = await issueOtp(env, "user@example.com");
    const first = await verifyOtp(env, "user@example.com", code);
    expect(first.ok).toBe(true);

    const second = await verifyOtp(env, "user@example.com", code);
    expect(second.ok).toBe(false);
  });

  it("returns an existing user on a second login rather than creating a duplicate", async () => {
    const code1 = await issueOtp(env, "user@example.com");
    const r1 = await verifyOtp(env, "user@example.com", code1);
    expect(r1.ok).toBe(true);

    const code2 = await issueOtp(env, "user@example.com");
    const r2 = await verifyOtp(env, "user@example.com", code2);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.user.id).toBe(r1.user.id);
    }
  });
});

describe("Sessions", () => {
  let env: Env;

  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("creates a session that resolves back to the same user", async () => {
    const code = await issueOtp(env, "user@example.com");
    const verify = await verifyOtp(env, "user@example.com", code);
    if (!verify.ok) throw new Error("expected ok");

    const token = await createSession(env, verify.user.id);
    const resolved = await resolveSession(env, token);
    expect(resolved?.id).toBe(verify.user.id);
  });

  it("does not resolve a bogus/forged token", async () => {
    const resolved = await resolveSession(env, "not-a-real-token");
    expect(resolved).toBeNull();
  });

  it("does not resolve a session after logout (revocation)", async () => {
    const code = await issueOtp(env, "user@example.com");
    const verify = await verifyOtp(env, "user@example.com", code);
    if (!verify.ok) throw new Error("expected ok");

    const token = await createSession(env, verify.user.id);
    await revokeSession(env, token);

    const resolved = await resolveSession(env, token);
    expect(resolved).toBeNull();
  });

  it("does not resolve an expired session", async () => {
    const code = await issueOtp(env, "user@example.com");
    const verify = await verifyOtp(env, "user@example.com", code);
    if (!verify.ok) throw new Error("expected ok");

    const token = await createSession(env, verify.user.id);

    await env.DB.prepare("UPDATE sessions SET expires_at = datetime('now', '-1 day')").run();

    const resolved = await resolveSession(env, token);
    expect(resolved).toBeNull();
  });

  it("builds a Set-Cookie header with HttpOnly and SameSite=Lax", () => {
    const cookie = buildSessionCookie(env, "sometoken");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("em_session=sometoken");
  });

  it("builds a logout cookie that clears the session (Max-Age=0)", () => {
    const cookie = buildLogoutCookie(env);
    expect(cookie).toContain("Max-Age=0");
  });

  it("readCookie extracts the named cookie from a raw header", () => {
    expect(readCookie("a=1; em_session=abc123; b=2", "em_session")).toBe("abc123");
    expect(readCookie(null, "em_session")).toBeUndefined();
    expect(readCookie("a=1", "em_session")).toBeUndefined();
  });
});
