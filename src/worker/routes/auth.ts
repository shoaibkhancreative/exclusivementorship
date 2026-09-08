import { Hono } from "hono";
import type { Env } from "../lib/config";
import { RATE_LIMITS, getFreeLessonCount, OTP_RESEND_COOLDOWN_SECONDS } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { readCookie, revokeSession, buildLogoutCookie, buildSessionCookie, createSession, issueOtp, verifyOtp } from "../auth";
import { checkRateLimit, getOrCreateUserByGoogle, logAuditEvent, secondsSinceLastOtpRequest } from "../db";
import { sendOtpEmail } from "../services/email";
import { verifyTurnstile } from "../services/turnstile";
import { verifyGoogleIdToken } from "../services/google";
import { sha256Hex } from "../lib/crypto";
import { SESSION_COOKIE_NAME } from "../lib/config";

export const authRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Login is email-only (OTP) — there is no name field collected anywhere in
 * the product. Rather than inventing one, we derive a readable display name
 * from the email's local part for use in the profile card/avatar. This is
 * deterministic and never stored.
 */
function deriveDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  const cleaned = local.replace(/[._+-]+/g, " ").trim();
  if (!cleaned) return email;
  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

  const secondsSinceLast = await secondsSinceLastOtpRequest(c.env, email);
  if (secondsSinceLast !== null && secondsSinceLast < OTP_RESEND_COOLDOWN_SECONDS) {
    return c.json(
      { error: "resend_cooldown", message: "Please wait a moment before requesting another code." },
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

/**
 * Alternative to email-OTP login. Added because OTP emails were landing in
 * some users' spam folders (a domain-reputation issue, not something a code
 * change fixes quickly) — for anyone with a Google account this skips email
 * delivery entirely, since Google hands us an already-verified email
 * directly. OTP remains fully intact as the primary/fallback method for
 * everyone else.
 */
authRoutes.post("/google", async (c) => {
  const body = await c.req.json<{ credential?: string }>().catch(() => ({}) as { credential?: string });
  const credential = (body.credential ?? "").trim();

  if (!credential) {
    return c.json({ error: "invalid_input", message: "Missing Google credential." }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);

  const rate = await checkRateLimit(c.env, `google_auth:ip:${ipHash}`, RATE_LIMITS.googleAuthPerIpPer10Min, 600);
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Too many attempts. Please try again shortly." }, 429);
  }

  const result = await verifyGoogleIdToken(c.env, credential);
  if (!result.ok) {
    const messages: Record<string, string> = {
      invalid_token: "Google sign-in failed. Please try again.",
      email_not_verified: "That Google account's email isn't verified.",
      not_configured: "Google sign-in isn't available right now."
    };
    return c.json({ error: result.reason, message: messages[result.reason] }, 400);
  }

  const user = await getOrCreateUserByGoogle(c.env, result.identity.sub, result.identity.email);
  const token = await createSession(c.env, user.id);
  c.header("Set-Cookie", buildSessionCookie(c.env, token));
  await logAuditEvent(c.env, "login_google", { userId: user.id, ipHash });

  return c.json({ ok: true, user: { email: user.email, courseStatus: user.course_status } });
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
    displayName: deriveDisplayName(user.email),
    currentLesson: user.current_lesson,
    courseStatus: user.course_status,
    freeLessonCount: await getFreeLessonCount(c.env)
  });
});
