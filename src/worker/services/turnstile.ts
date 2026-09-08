import type { Env } from "../lib/config";

/**
 * Verifies a Turnstile token from the client. If TURNSTILE_SECRET_KEY is not
 * configured, verification is skipped with a warning ONLY when running
 * locally (e.g. before the owner has set up the secret for `wrangler dev`).
 * In any non-local environment, a missing secret fails loudly instead of
 * silently disabling bot protection.
 */
export async function verifyTurnstile(
  env: Env,
  token: string | undefined,
  remoteIp?: string
): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    const isLocal = env.APP_URL.startsWith("http://localhost") || env.APP_URL.startsWith("http://127.0.0.1");
    if (isLocal) {
      // eslint-disable-next-line no-console
      console.warn("[dev-mode] TURNSTILE_SECRET_KEY not set — skipping verification.");
      return true;
    }
    throw new Error(
      "TURNSTILE_SECRET_KEY is not configured. Set it with `wrangler secret put TURNSTILE_SECRET_KEY`."
    );
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
