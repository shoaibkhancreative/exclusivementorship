import type { Env } from "../lib/config";

/**
 * Verifies a Turnstile token from the client. If TURNSTILE_SECRET_KEY is not
 * configured (e.g. local dev before the owner has set it up), verification
 * is skipped with a warning rather than blocking the whole auth flow.
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp?: string
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    // eslint-disable-next-line no-console
    console.warn("[dev-mode] TURNSTILE_SECRET_KEY not set — skipping verification.");
    return true;
  }
  if (!token) return false;

  const body = new URLSearchParams();
  body.set("secret", env.TURNSTILE_SECRET_KEY);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body
  });

  const data = (await res.json()) as { success: boolean };
  return Boolean(data.success);
}
