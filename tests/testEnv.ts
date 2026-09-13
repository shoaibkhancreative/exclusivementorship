import type { Env } from "../src/worker/lib/config";
import { createTestD1 } from "./fakeD1";

export async function createTestEnv(overrides: Partial<Env> = {}): Promise<Env> {
  const { fakeD1 } = await createTestD1();

  const assets: Fetcher = {
    fetch: async () => new Response("not found", { status: 404 })
  } as unknown as Fetcher;

  return {
    DB: fakeD1 as unknown as D1Database,
    ASSETS: assets,
    APP_URL: "http://localhost:8787",
    EMAIL_FROM: "Next Level Trader <support@exclusivementorship.xyz>",
    MENTORSHIP_PDF_URL: "https://example.com/mentorship-details.pdf",
    TURNSTILE_SITE_KEY: "test-site-key",
    GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
    ENROLLMENT_PRICE_USDT: "39",
    REFERENCE_PRICE_USDT: "100",
    SESSION_SECRET: "test-session-secret-not-for-production",
    NOWPAYMENTS_IPN_SECRET: "test-ipn-secret",
    BUNNY_TOKEN_AUTH_KEY: "test-bunny-token-key",
    BUNNY_PULL_ZONE_HOST: "vz-test12345-de6.b-cdn.net",
    ...overrides
  };
}
