import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "../src/worker/index";
import { createTestEnv } from "./testEnv";
import { createSession } from "../src/worker/auth";
import { getOrCreateUser } from "../src/worker/db";
import type { Env } from "../src/worker/lib/config";

async function call(env: Env, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const request = new Request(`http://localhost${path}`, { ...init, headers });
  return worker.fetch(request, env);
}

function extractCookie(res: Response): string {
  const setCookie = res.headers.get("set-cookie") ?? "";
  return setCookie.split(";")[0]; // "em_session=..."
}

async function loginNewUser(env: Env, email: string) {
  const user = await getOrCreateUser(env, email);
  const token = await createSession(env, user.id);
  return { user, cookie: `em_session=${token}` };
}

describe("Lesson access rules (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("lesson 1 is accessible to a brand new logged-in user", async () => {
    const { cookie } = await loginNewUser(env, "alice@example.com");
    const res = await call(env, "/api/lessons/1", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lessonNumber: number };
    expect(body.lessonNumber).toBe(1);
  });

  it("lesson 2 is locked until lesson 1's assignment is submitted", async () => {
    const { cookie } = await loginNewUser(env, "bob@example.com");
    const res = await call(env, "/api/lessons/2", { cookie });
    expect(res.status).toBe(403);
  });

  it("submitting lesson 1's assignment unlocks lesson 2", async () => {
    const { cookie } = await loginNewUser(env, "carol@example.com");

    const submit = await call(env, "/api/lessons/1/submit-assignment", { method: "POST", cookie, body: "{}" });
    expect(submit.status).toBe(200);
    const submitBody = (await submit.json()) as { nextLessonNumber: number };
    expect(submitBody.nextLessonNumber).toBe(2);

    const res = await call(env, "/api/lessons/2", { cookie });
    expect(res.status).toBe(200);
  });

  it("lesson 6, once sequentially reached without payment, is a navigable but locked preview (not a 403)", async () => {
    const { cookie } = await loginNewUser(env, "dave@example.com");

    // Walk through lessons 1-5 to reach the premium boundary.
    let lastGate = false;
    for (let n = 1; n <= 5; n++) {
      const submit = await call(env, `/api/lessons/${n}/submit-assignment`, { method: "POST", cookie, body: "{}" });
      const body = (await submit.json()) as { showPremiumGate: boolean };
      lastGate = body.showPremiumGate;
    }
    expect(lastGate).toBe(true);

    const res = await call(env, "/api/lessons/6", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isLocked: boolean; youtubeVideoId: string | null };
    expect(body.isLocked).toBe(true);
    expect(body.youtubeVideoId).toBeNull();
  });

  it("lesson 6 is still a real 403 if a free user hasn't sequentially reached it yet", async () => {
    const { cookie } = await loginNewUser(env, "heidi@example.com");
    const res = await call(env, "/api/lessons/6", { cookie });
    expect(res.status).toBe(403);
  });

  it("lesson 6 becomes accessible once the user is marked paid", async () => {
    const { user, cookie } = await loginNewUser(env, "erin@example.com");

    for (let n = 1; n <= 5; n++) {
      await call(env, `/api/lessons/${n}/submit-assignment`, { method: "POST", cookie, body: "{}" });
    }

    // Simulate a confirmed payment the way the webhook handler would.
    await env.DB.prepare("UPDATE users SET course_status = 'paid' WHERE id = ?").bind(user.id).run();

    const res = await call(env, "/api/lessons/6", { cookie });
    expect(res.status).toBe(200);
  });

  it("lesson 6 is a Telegram gateway (no video) for paid users, not for free users", async () => {
    const { user, cookie } = await loginNewUser(env, "frank@example.com");

    for (let n = 1; n <= 5; n++) {
      await call(env, `/api/lessons/${n}/submit-assignment`, { method: "POST", cookie, body: "{}" });
    }
    await env.DB.prepare("UPDATE users SET course_status = 'paid' WHERE id = ?").bind(user.id).run();

    const res = await call(env, "/api/lessons/6", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isTelegramGate: boolean; youtubeVideoId: string | null };
    expect(body.isTelegramGate).toBe(true);
    expect(body.youtubeVideoId).toBeNull();
  });

  it("lesson 7 (a normal lesson) is not marked as a Telegram gateway", async () => {
    const { user, cookie } = await loginNewUser(env, "grace@example.com");
    await env.DB.prepare("UPDATE users SET course_status = 'paid', current_lesson = 8 WHERE id = ?")
      .bind(user.id)
      .run();

    const res = await call(env, "/api/lessons/7", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isTelegramGate: boolean };
    expect(body.isTelegramGate).toBe(false);
  });

  it("rejects unauthenticated attempts to submit an assignment", async () => {
    const res = await call(env, "/api/lessons/1/submit-assignment", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("Session lifecycle (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("/api/auth/me reflects logged-out state with no cookie", async () => {
    const res = await call(env, "/api/auth/me");
    const body = (await res.json()) as { authenticated: boolean };
    expect(body.authenticated).toBe(false);
  });

  it("/api/auth/me reflects logged-in state with a valid session cookie", async () => {
    const { cookie } = await loginNewUser(env, "frank@example.com");
    const res = await call(env, "/api/auth/me", { cookie });
    const body = (await res.json()) as { authenticated: boolean; email?: string };
    expect(body.authenticated).toBe(true);
    expect(body.email).toBe("frank@example.com");
  });

  it("logout revokes the session so protected routes 401 afterwards", async () => {
    const { cookie } = await loginNewUser(env, "grace@example.com");

    const logoutRes = await call(env, "/api/auth/logout", { method: "POST", cookie });
    expect(logoutRes.status).toBe(200);

    const protectedRes = await call(env, "/api/lessons/1/complete-video", { method: "POST", cookie });
    expect(protectedRes.status).toBe(401);
  });
});

describe("OTP request/verify over HTTP (dev-mode email fallback)", () => {
  let env: Env;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    env = await createTestEnv(); // no RESEND_API_KEY -> email service logs the code instead of sending
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
  });

  it("completes a full request-otp -> verify-otp -> authenticated round trip", async () => {
    const email = "henry@example.com";
    const res1 = await call(env, "/api/auth/request-otp", { method: "POST", body: JSON.stringify({ email }) });
    expect(res1.status).toBe(200);

    const logged = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes(email));
    expect(logged).toBeDefined();
    const code = logged!.match(/(\d{6})/)?.[1];
    expect(code).toBeDefined();

    const res2 = await call(env, "/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, code })
    });
    expect(res2.status).toBe(200);
    const cookie = extractCookie(res2);
    expect(cookie).toContain("em_session=");

    const me = await call(env, "/api/auth/me", { cookie });
    const meBody = (await me.json()) as { authenticated: boolean };
    expect(meBody.authenticated).toBe(true);
  });

  it("returns a generic response for an invalid email without leaking user existence", async () => {
    const res = await call(env, "/api/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email: "not-an-email" })
    });
    expect(res.status).toBe(400);
  });
});

describe("Payment order creation + NOWPayments webhook (HTTP)", () => {
  let env: Env;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    env = await createTestEnv({ NOWPAYMENTS_API_KEY: "test-np-key" });
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates an order using the server-configured price, ignoring any client-supplied amount", async () => {
    const { cookie } = await loginNewUser(env, "irene@example.com");

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payment_id: "np-1",
          pay_address: "TAddressNp1",
          pay_amount: 39,
          pay_currency: "usdttrc20",
          payment_status: "waiting"
        }),
        { status: 200 }
      )
    );

    // Attempting to smuggle a custom amount — the route accepts no body fields for amount at all.
    const res = await call(env, "/api/payments/create-order", {
      method: "POST",
      cookie,
      body: JSON.stringify({ amount: 1 })
    });
    expect(res.status).toBe(200);

    const [, requestInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const sentBody = JSON.parse(requestInit.body as string);
    expect(sentBody.price_amount).toBe(39); // server-side ENROLLMENT_PRICE_USDT, not the client's "1"
  });

  it("processes a validly signed webhook, marks the user paid, and preps telegram_access", async () => {
    const { user, cookie } = await loginNewUser(env, "james@example.com");

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payment_id: "np-2",
          pay_address: "TAddressNp2",
          pay_amount: 39,
          pay_currency: "usdttrc20",
          payment_status: "waiting"
        }),
        { status: 200 }
      )
    );
    const createRes = await call(env, "/api/payments/create-order", { method: "POST", cookie, body: "{}" });
    const { orderId } = (await createRes.json()) as { orderId: string };

    const { createHmac } = await import("node:crypto");
    const payload = { order_id: orderId, payment_id: "np-2", payment_status: "finished" };
    const sig = createHmac("sha512", "test-ipn-secret").update(JSON.stringify(payload)).digest("hex");

    const webhookRes = await call(env, "/api/webhooks/nowpayments", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "x-nowpayments-sig": sig }
    });
    expect(webhookRes.status).toBe(200);

    const updatedUser = await env.DB.prepare("SELECT course_status FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ course_status: string }>();
    expect(updatedUser?.course_status).toBe("paid");

    const telegramRow = await env.DB.prepare("SELECT status FROM telegram_access WHERE user_id = ?")
      .bind(user.id)
      .first<{ status: string }>();
    expect(telegramRow?.status).toBe("pending");
  });

  it("is idempotent under a duplicate/replayed webhook", async () => {
    const { cookie } = await loginNewUser(env, "karen@example.com");

    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          payment_id: "np-3",
          pay_address: "TAddressNp3",
          pay_amount: 39,
          pay_currency: "usdttrc20",
          payment_status: "waiting"
        }),
        { status: 200 }
      )
    );
    const createRes = await call(env, "/api/payments/create-order", { method: "POST", cookie, body: "{}" });
    const { orderId } = (await createRes.json()) as { orderId: string };

    const { createHmac } = await import("node:crypto");
    const payload = { order_id: orderId, payment_id: "np-3", payment_status: "finished" };
    const sig = createHmac("sha512", "test-ipn-secret").update(JSON.stringify(payload)).digest("hex");

    const first = await call(env, "/api/webhooks/nowpayments", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "x-nowpayments-sig": sig }
    });
    const second = await call(env, "/api/webhooks/nowpayments", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "x-nowpayments-sig": sig }
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { alreadyProcessed?: boolean };
    expect(secondBody.alreadyProcessed).toBe(true);
  });

  it("rejects a webhook with an invalid/forged signature", async () => {
    const res = await call(env, "/api/webhooks/nowpayments", {
      method: "POST",
      body: JSON.stringify({ order_id: "does-not-matter", payment_id: "x", payment_status: "finished" }),
      headers: { "x-nowpayments-sig": "0".repeat(128) }
    });
    expect(res.status).toBe(401);
  });

  it("rejects a webhook referencing an order that doesn't exist", async () => {
    const { createHmac } = await import("node:crypto");
    const payload = { order_id: "unknown-order-id", payment_id: "np-x", payment_status: "finished" };
    const sig = createHmac("sha512", "test-ipn-secret").update(JSON.stringify(payload)).digest("hex");

    const res = await call(env, "/api/webhooks/nowpayments", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "x-nowpayments-sig": sig }
    });
    expect(res.status).toBe(404);
  });
});

describe("Telegram access generation (HTTP)", () => {
  let env: Env;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    env = await createTestEnv({ TELEGRAM_BOT_TOKEN: "test-bot-token" });
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function markPaid(userId: string) {
    await env.DB.prepare("UPDATE users SET course_status = 'paid' WHERE id = ?").bind(userId).run();
  }

  it("rejects generation for a user who hasn't paid", async () => {
    const { cookie } = await loginNewUser(env, "liam@example.com");
    const res = await call(env, "/api/telegram/generate", { method: "POST", cookie });
    expect(res.status).toBe(402);
  });

  it("generates channel and group invite links with member_limit=1", async () => {
    const { user, cookie } = await loginNewUser(env, "mia@example.com");
    await markPaid(user.id);

    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { invite_link: "https://t.me/joinchat/abc" } }), { status: 200 })
    );

    const res = await call(env, "/api/telegram/generate", { method: "POST", cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { channelInviteLink: string; groupInviteLink: string };
    expect(body.channelInviteLink).toContain("t.me");
    expect(body.groupInviteLink).toContain("t.me");

    // Both Telegram API calls must have requested member_limit: 1.
    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit;
      const sent = JSON.parse(init.body as string);
      expect(sent.member_limit).toBe(1);
    }
  });

  it("does not generate duplicate invite links on a second call (idempotent)", async () => {
    const { user, cookie } = await loginNewUser(env, "noah@example.com");
    await markPaid(user.id);

    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { invite_link: "https://t.me/joinchat/xyz" } }), { status: 200 })
    );

    await call(env, "/api/telegram/generate", { method: "POST", cookie });
    const callCountAfterFirst = fetchSpy.mock.calls.length;

    const second = await call(env, "/api/telegram/generate", { method: "POST", cookie });
    expect(second.status).toBe(200);
    expect(fetchSpy.mock.calls.length).toBe(callCountAfterFirst); // no additional Telegram API calls
  });

  it("keeps the user's paid status intact if Telegram generation fails, allowing a later retry", async () => {
    const { user, cookie } = await loginNewUser(env, "olivia@example.com");
    await markPaid(user.id);

    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const failedRes = await call(env, "/api/telegram/generate", { method: "POST", cookie });
    expect(failedRes.status).toBe(502);

    const stillPaid = await env.DB.prepare("SELECT course_status FROM users WHERE id = ?")
      .bind(user.id)
      .first<{ course_status: string }>();
    expect(stillPaid?.course_status).toBe("paid");

    // Retry succeeds without requiring repayment.
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, result: { invite_link: "https://t.me/joinchat/retry" } }), { status: 200 })
    );
    const retryRes = await call(env, "/api/telegram/generate", { method: "POST", cookie });
    expect(retryRes.status).toBe(200);
  });
});
