import { Hono } from "hono";
import type { Env } from "../lib/config";
import { RATE_LIMITS } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { readCookie, revokeSession, buildLogoutCookie, buildSessionCookie, createSession, issueOtp, verifyOtp } from "../auth";
import { checkRateLimit, logAuditEvent } from "../db";
import { sendOtpEmail } from "../services/email";
import { verifyTurnstile } from "../services/turnstile";
import { sha256Hex } from "../lib/crypto";
import { SESSION_COOKIE_NAME } from "../lib/config";

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

authRoutes.post("/request-otp", async (c) => {
  const body = await c.req
    .json<{ email?: string; turnstileToken?: string }>()
    .catch(() => ({}) as { email?: string; turnstileToken?: string });
  const email = (body.email ?? "").trim();

  if (!isValidEmail(email)) {
    return c.json({ error: "invalid_email", message: "Please enter a valid email address." }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);

  const turnstileOk = await verifyTurnstile(c.env, body.turnstileToken, ip);
  if (!turnstileOk) {
    return c.json({ error: "turnstile_failed", message: "Verification failed. Please try again." }, 400);
  }

  const perEmail = await checkRateLimit(
    c.env,
    `otp_request:email:${email}`,
    RATE_LIMITS.otpRequestPerEmailPerHour,
    3600
  );
  const perIp = await checkRateLimit(c.env, `otp_request:ip:${ipHash}`, RATE_LIMITS.otpRequestPerIpPerHour, 3600);

  if (!perEmail.allowed || !perIp.allowed) {
    return c.json(
      { error: "rate_limited", message: "Too many requests. Please try again in a bit." },
      429
    );
  }

  const code = await issueOtp(c.env, email);

  try {
    await sendOtpEmail(c.env, email, code);
  } catch (err) {
    // Do not leak provider details to the client.
    // eslint-disable-next-line no-console
    console.error("sendOtpEmail failed", err);
    return c.json({ error: "email_send_failed", message: "We couldn't send the code. Please try again shortly." }, 502);
  }

  await logAuditEvent(c.env, "otp_requested", { ipHash, metadata: { email } });

  // Deliberately generic response — never reveals whether the email was
  // already a known user.
  return c.json({ ok: true, message: "If that email is valid, a code has been sent." });
});

authRoutes.post("/verify-otp", async (c) => {
  const body = await c.req
    .json<{ email?: string; code?: string }>()
    .catch(() => ({}) as { email?: string; code?: string });
  const email = (body.email ?? "").trim();
  const code = (body.code ?? "").trim();

  if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "invalid_input", message: "Please enter the 6-digit code." }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);

  const rate = await checkRateLimit(c.env, `otp_verify:email:${email}`, RATE_LIMITS.otpVerifyPerEmailPer10Min, 600);
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Too many attempts. Please request a new code." }, 429);
  }

  const result = await verifyOtp(c.env, email, code);

  if (!result.ok) {
    const messages: Record<string, string> = {
      invalid: "That code is incorrect.",
      expired: "That code has expired. Please request a new one.",
      too_many_attempts: "Too many incorrect attempts. Please request a new code."
    };
    return c.json({ error: result.reason, message: messages[result.reason] }, 400);
  }

  const token = await createSession(c.env, result.user.id);
  c.header("Set-Cookie", buildSessionCookie(c.env, token));
  await logAuditEvent(c.env, "login", { userId: result.user.id, ipHash });

  return c.json({ ok: true, user: { email: result.user.email, courseStatus: result.user.course_status } });
});

authRoutes.post("/logout", async (c) => {
  const token = readCookie(c.req.header("cookie") ?? null, SESSION_COOKIE_NAME);
  if (token) await revokeSession(c.env, token);
  c.header("Set-Cookie", buildLogoutCookie(c.env));
  return c.json({ ok: true });
});

authRoutes.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.json({ authenticated: false });
  return c.json({
    authenticated: true,
    email: user.email,
    currentLesson: user.current_lesson,
    courseStatus: user.course_status
  });
});
