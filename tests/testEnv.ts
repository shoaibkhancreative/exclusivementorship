import type { Env } from "../src/worker/lib/config";
import { createTestD1 } from "./fakeD1";

export async function createTestEnv(overrides: Partial<Env> = {}): Promise<Env> {
  const { fakeD1 } = await createTestD1();

  const assets: Fetcher = {
    // Minimal stand-in for the Workers Assets binding — not exercised by
    // API-focused tests, but required to satisfy the Env type.
    fetch: async () => new Response("not found", { status: 404 })
  } as unknown as Fetcher;

  return {
    DB: fakeD1 as unknown as D1Database,
    ASSETS: assets,
    APP_URL: "http://localhost:8787",
    EMAIL_FROM: "Next Level Trader <support@exclusivementorship.xyz>",
    MENTORSHIP_PDF_URL: "https://example.com/mentorship-details.pdf",
    TELEGRAM_CHANNEL_ID: "-100123",
    TELEGRAM_GROUP_ID: "-100456",
    TURNSTILE_SITE_KEY: "test-site-key",
    ENROLLMENT_PRICE_USDT: "39",
    REFERENCE_PRICE_USDT: "100",
    SESSION_SECRET: "test-session-secret-not-for-production",
    NOWPAYMENTS_IPN_SECRET: "test-ipn-secret",
    // RESEND_API_KEY, NOWPAYMENTS_API_KEY, TELEGRAM_BOT_TOKEN, and
    // TURNSTILE_SECRET_KEY are intentionally left unset: each service module
    // has an explicit "not configured" dev-mode fallback (see
    // services/email.ts, services/turnstile.ts) or is stubbed per-test via
    // vi.stubGlobal('fetch', ...) where a real network call would occur.
    ...overrides
  };
}
