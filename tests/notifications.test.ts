import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { createTestEnv } from "./testEnv";
import { createSession } from "../src/worker/auth";
import { getOrCreateUser } from "../src/worker/db";
import { hashPassword, randomUuid } from "../src/worker/lib/crypto";
import type { Env } from "../src/worker/lib/config";

async function call(env: Env, path: string, init: RequestInit & { cookie?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", init.cookie);
  if (init.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const request = new Request(`http://localhost${path}`, { ...init, headers });
  return worker.fetch(request, env);
}

function extractCookie(res: Response, name: string): string | null {
  const all = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
  const match = all.find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return match.split(";")[0];
}

async function loginNewUser(env: Env, email: string) {
  const user = await getOrCreateUser(env, email);
  const token = await createSession(env, user.id);
  return { user, cookie: `em_session=${token}` };
}

async function seedAdmin(env: Env, email: string, password: string) {
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)")
    .bind(randomUuid(), email, passwordHash)
    .run();
}

async function loginAdmin(env: Env, email: string, password: string): Promise<string> {
  await seedAdmin(env, email, password);
  const res = await call(env, "/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
  expect(res.status).toBe(200);
  const cookie = extractCookie(res, "em_admin_session");
  if (!cookie) throw new Error("admin login did not set a session cookie");
  return cookie;
}

/**
 * Notification creation happens in a fire-and-forget background() task (see
 * routes/admin-support.ts) — in a real Worker that's kept alive by
 * executionCtx.waitUntil, but in this test environment (no ExecutionContext
 * — see support.ts' background() helper) it's just a floating promise racing
 * the response. It's backed by the same in-memory SQLite as every awaited
 * call in the request, so it resolves within a handful of microtask ticks;
 * this polls briefly instead of asserting immediately so the test isn't
 * flaky about exactly how many ticks that takes.
 */
async function waitForNotifications(env: Env, cookie: string, minCount: number, attempts = 10): Promise<{ notifications: { id: string; message: string; readAt: string | null; type: string }[]; unreadCount: number }> {
  for (let i = 0; i < attempts; i++) {
    const res = await call(env, "/api/notifications", { cookie });
    const body = await res.json<{ notifications: { id: string; message: string; readAt: string | null; type: string }[]; unreadCount: number }>();
    if (body.notifications.length >= minCount) return body;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Expected at least ${minCount} notification(s) but never saw them`);
}

describe("Notifications (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("requires login for every notifications route", async () => {
    const list = await call(env, "/api/notifications");
    expect(list.status).toBe(401);

    const read = await call(env, "/api/notifications/some-id/read", { method: "POST" });
    expect(read.status).toBe(401);

    const readAll = await call(env, "/api/notifications/read-all", { method: "POST" });
    expect(readAll.status).toBe(401);
  });

  it("starts a learner off with an empty notification list and zero unread", async () => {
    const { cookie } = await loginNewUser(env, "fresh-learner@example.com");
    const res = await call(env, "/api/notifications", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json<{ notifications: unknown[]; unreadCount: number }>();
    expect(body.notifications).toEqual([]);
    expect(body.unreadCount).toBe(0);
  });

  it("notifies a learner in-site when an admin replies to their ticket", async () => {
    const { cookie } = await loginNewUser(env, "notif-reply-learner@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Question" }) });
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin-notif-reply@example.com", "correct-horse-battery");
    const reply = await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ body: "Here's the answer to your question." })
    });
    expect(reply.status).toBe(201);

    const body = await waitForNotifications(env, cookie, 1);
    expect(body.unreadCount).toBe(1);
    expect(body.notifications[0].type).toBe("support_reply");
    expect(body.notifications[0].message).toBe("Here's the answer to your question.");
    expect(body.notifications[0].readAt).toBeNull();
  });

  it("notifies a learner in-site when an admin starts a brand-new conversation with them", async () => {
    const { user, cookie } = await loginNewUser(env, "notif-new-convo-learner@example.com");
    const adminCookie = await loginAdmin(env, "admin-notif-new-convo@example.com", "correct-horse-battery");

    const create = await call(env, "/api/admin/support/tickets", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: user.id, body: "Checking in on your progress!" })
    });
    expect(create.status).toBe(201);

    const body = await waitForNotifications(env, cookie, 1);
    expect(body.notifications[0].type).toBe("support_reply");
    expect(body.notifications[0].message).toBe("Checking in on your progress!");
  });

  it("never creates a notification for a guest ticket, since notifications.user_id can't be null", async () => {
    // No login — resolveIdentity mints a guest cookie for us.
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({ body: "Guest question", guestEmail: "guest-notif@example.com" })
    });
    expect(create.status).toBe(201);
    const guestCookie = extractCookie(create, "support_guest_id");
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin-notif-guest@example.com", "correct-horse-battery");
    const reply = await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ body: "Replying to a guest" })
    });
    expect(reply.status).toBe(201);
    void guestCookie;

    // Give the (non-existent) background notification the same handful of
    // ticks the other tests give a real one, then confirm the table stays
    // empty overall — there's no user to list a guest's notifications as,
    // so we check directly.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const count = await env.DB.prepare("SELECT COUNT(*) as cnt FROM notifications").first<{ cnt: number }>();
    expect(count?.cnt ?? 0).toBe(0);
  });

  it("marks a single notification read, and only that one", async () => {
    const { cookie } = await loginNewUser(env, "notif-mark-one-learner@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Q1" }) });
    const { ticket } = await create.json<{ ticket: { id: string } }>();
    const adminCookie = await loginAdmin(env, "admin-notif-mark-one@example.com", "correct-horse-battery");

    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: "First reply" }) });
    await waitForNotifications(env, cookie, 1);
    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: "Second reply" }) });
    const before = await waitForNotifications(env, cookie, 2);
    expect(before.unreadCount).toBe(2);

    const toMark = before.notifications[0];
    const markRes = await call(env, `/api/notifications/${toMark.id}/read`, { method: "POST", cookie });
    expect(markRes.status).toBe(200);

    const after = await call(env, "/api/notifications", { cookie });
    const afterBody = await after.json<{ notifications: { id: string; readAt: string | null }[]; unreadCount: number }>();
    expect(afterBody.unreadCount).toBe(1);
    expect(afterBody.notifications.find((n) => n.id === toMark.id)?.readAt).not.toBeNull();
  });

  it("404s marking a notification read that belongs to someone else", async () => {
    const { cookie: cookieA } = await loginNewUser(env, "notif-owner-a@example.com");
    const createA = await call(env, "/api/support/tickets", { method: "POST", cookie: cookieA, body: JSON.stringify({ body: "Hi" }) });
    const { ticket } = await createA.json<{ ticket: { id: string } }>();
    const adminCookie = await loginAdmin(env, "admin-notif-owner@example.com", "correct-horse-battery");
    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: "Reply" }) });
    const ownerBody = await waitForNotifications(env, cookieA, 1);

    const { cookie: cookieB } = await loginNewUser(env, "notif-owner-b@example.com");
    const stolenRead = await call(env, `/api/notifications/${ownerBody.notifications[0].id}/read`, { method: "POST", cookie: cookieB });
    expect(stolenRead.status).toBe(404);

    // It's still unread for the actual owner.
    const stillUnread = await call(env, "/api/notifications", { cookie: cookieA });
    expect((await stillUnread.json<{ unreadCount: number }>()).unreadCount).toBe(1);
  });

  it("marks every notification read at once with read-all", async () => {
    const { cookie } = await loginNewUser(env, "notif-mark-all-learner@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Q1" }) });
    const { ticket } = await create.json<{ ticket: { id: string } }>();
    const adminCookie = await loginAdmin(env, "admin-notif-mark-all@example.com", "correct-horse-battery");

    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: "First" }) });
    await waitForNotifications(env, cookie, 1);
    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: "Second" }) });
    await waitForNotifications(env, cookie, 2);

    const markAll = await call(env, "/api/notifications/read-all", { method: "POST", cookie });
    expect(markAll.status).toBe(200);

    const after = await call(env, "/api/notifications", { cookie });
    const afterBody = await after.json<{ notifications: { readAt: string | null }[]; unreadCount: number }>();
    expect(afterBody.unreadCount).toBe(0);
    expect(afterBody.notifications.every((n) => n.readAt !== null)).toBe(true);
  });

  it("truncates an overly long admin reply to the documented notification message cap", async () => {
    const { cookie } = await loginNewUser(env, "notif-truncate-learner@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Q" }) });
    const { ticket } = await create.json<{ ticket: { id: string } }>();
    const adminCookie = await loginAdmin(env, "admin-notif-truncate@example.com", "correct-horse-battery");

    const longReply = "x".repeat(500);
    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { method: "POST", cookie: adminCookie, body: JSON.stringify({ body: longReply }) });

    const body = await waitForNotifications(env, cookie, 1);
    expect(body.notifications[0].message.length).toBeLessThanOrEqual(140);
    expect(body.notifications[0].message.length).toBeGreaterThan(0);
  });
});
