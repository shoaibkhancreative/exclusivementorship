import { beforeEach, describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { createTestEnv } from "./testEnv";
import { createSession } from "../src/worker/auth";
import { getOrCreateUser, setUserCourseStatus } from "../src/worker/db";
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
  // Test envs only ever set one Set-Cookie header per response here, so
  // getSetCookie() (when available) or a single header read both work.
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

/** A tiny (well under the 1.5MB cap) valid base64 PNG data URL, for attachment happy-path tests. */
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("Support inbox (HTTP)", () => {
  let env: Env;
  beforeEach(async () => {
    env = await createTestEnv();
  });

  it("only allows one active ticket at a time per identity, freed up by closing it — and replying never needs a new ticket", async () => {
    const { cookie } = await loginNewUser(env, "learner@example.com");

    const first = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Question #1" })
    });
    expect(first.status).toBe(201);
    const { ticket: firstTicket } = await first.json<{ ticket: { id: string } }>();

    // A second ticket while the first is still open/visible is rejected.
    const blocked = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Question #2" })
    });
    expect(blocked.status).toBe(429);
    const blockedBody = await blocked.json<{ error: string }>();
    expect(blockedBody.error).toBe("ticket_already_open");

    // But replying into the existing ticket is always fine.
    const reply = await call(env, `/api/support/tickets/${firstTicket.id}/messages`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Following up on this" })
    });
    expect(reply.status).toBe(201);

    // Closing it frees the identity up to open a new one.
    const close = await call(env, `/api/support/tickets/${firstTicket.id}/close`, { method: "POST", cookie });
    expect(close.status).toBe(200);

    const second = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Question #2, for real this time" })
    });
    expect(second.status).toBe(201);

    // The closed ticket no longer shows up in the learner's own list...
    const list = await call(env, "/api/support/tickets", { cookie });
    const listBody = await list.json<{ tickets: { id: string }[] }>();
    expect(listBody.tickets.some((t) => t.id === firstTicket.id)).toBe(false);

    // ...nor is it reachable by id anymore, even though it's still theirs.
    const closedRead = await call(env, `/api/support/tickets/${firstTicket.id}/messages`, { cookie });
    expect(closedRead.status).toBe(404);
  });

  it("lets an admin unhide a learner-closed ticket, putting it back in their list", async () => {
    const { cookie } = await loginNewUser(env, "learner2b@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Hi" }) });
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    await call(env, `/api/support/tickets/${ticket.id}/close`, { method: "POST", cookie });
    let list = await call(env, "/api/support/tickets", { cookie });
    expect((await list.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(false);

    const adminCookie = await loginAdmin(env, "admin-unhide@example.com", "correct-horse-battery");
    // Admin can still see it despite the learner having hidden it.
    const adminList = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    const adminListBody = await adminList.json<{ tickets: { id: string; hiddenByUser: boolean }[] }>();
    const seen = adminListBody.tickets.find((t) => t.id === ticket.id);
    expect(seen?.hiddenByUser).toBe(true);

    const unhide = await call(env, `/api/admin/support/tickets/${ticket.id}/unhide`, { method: "POST", cookie: adminCookie });
    expect(unhide.status).toBe(200);

    list = await call(env, "/api/support/tickets", { cookie });
    expect((await list.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(true);
  });

  it("never assigns a newly created ticket to the 'nlt' profile", async () => {
    const { cookie } = await loginNewUser(env, "learner2@example.com");
    const res = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "msg" })
    });
    const data = await res.json<{ ticket: { agentProfile: string } }>();
    expect(data.ticket.agentProfile).not.toBe("nlt");
    expect(["void", "venom", "shadow"]).toContain(data.ticket.agentProfile);
  });

  it("persists an admin profile shift, and subsequent thread reads reflect the new profile", async () => {
    const { cookie } = await loginNewUser(env, "learner3@example.com");
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Help please" })
    });
    const { ticket } = await create.json<{ ticket: { id: string; agentProfile: string } }>();

    const adminCookie = await loginAdmin(env, "admin@example.com", "correct-horse-battery");

    const shift = await call(env, `/api/admin/support/tickets/${ticket.id}/shift`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agent_profile: "nlt" })
    });
    expect(shift.status).toBe(200);

    await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ body: "This is NLT now" })
    });

    const thread = await call(env, `/api/support/tickets/${ticket.id}/messages`, { cookie });
    const threadBody = await thread.json<{ ticket: { agentProfile: string } }>();
    expect(threadBody.ticket.agentProfile).toBe("nlt");
  });

  it("accepts an attachment under the cap and rejects one over the cap, server-side, regardless of client claims", async () => {
    const { cookie } = await loginNewUser(env, "learner4@example.com");

    const ok = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "See attached", attachment: { dataUrl: TINY_PNG_DATA_URL, filename: "shot.png" } })
    });
    expect(ok.status).toBe(201);
    const { ticket } = await ok.json<{ ticket: { id: string } }>();

    // Build an oversized (>1.5MB decoded) base64 PNG-mime data URL, sent as
    // a follow-up message into the same ticket (a 2nd *ticket* would hit the
    // one-active-ticket rule first and never reach the size check).
    const oversizedBinary = "A".repeat(2 * 1024 * 1024);
    const oversizedBase64 = Buffer.from(oversizedBinary).toString("base64");
    const tooBig = await call(env, `/api/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        body: "See attached, big one",
        attachment: { dataUrl: `data:image/png;base64,${oversizedBase64}`, filename: "huge.png" }
      })
    });
    expect(tooBig.status).toBe(413);
    const tooBigBody = await tooBig.json<{ error: string }>();
    expect(tooBigBody.error).toBe("attachment_too_large");
  });

  it("lets admin delete a message from either sender; learners have no delete route at all", async () => {
    const { cookie } = await loginNewUser(env, "learner5@example.com");
    const create = await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Hi" }) });
    const { ticket, message: learnerMsg } = await create.json<{ ticket: { id: string }; message: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin2@example.com", "correct-horse-battery");
    const reply = await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ body: "Reply" })
    });
    const { message: adminMsg } = await reply.json<{ message: { id: string } }>();

    // Learner has no delete endpoint under /api/support/* — this must 404, not delete anything.
    const learnerAttempt = await call(env, `/api/support/messages/${learnerMsg.id}`, { method: "DELETE", cookie });
    expect(learnerAttempt.status).toBe(404);

    // Admin can delete either side's message.
    const delLearner = await call(env, `/api/admin/support/messages/${learnerMsg.id}`, { method: "DELETE", cookie: adminCookie });
    expect(delLearner.status).toBe(200);
    const delAdmin = await call(env, `/api/admin/support/messages/${adminMsg.id}`, { method: "DELETE", cookie: adminCookie });
    expect(delAdmin.status).toBe(200);

    const threadAfter = await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { cookie: adminCookie });
    const threadBody = await threadAfter.json<{ messages: unknown[] }>();
    expect(threadBody.messages).toHaveLength(0);
  });

  it("filters the admin ticket list by status, agent profile, and search", async () => {
    const { cookie: cookieA } = await loginNewUser(env, "alice@example.com");
    const { cookie: cookieB } = await loginNewUser(env, "bob@example.com");

    const t1 = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie: cookieA, body: JSON.stringify({ body: "billing question" }) })
    ).json<{ ticket: { id: string } }>();
    const t2 = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie: cookieB, body: JSON.stringify({ body: "video won't play" }) })
    ).json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin3@example.com", "correct-horse-battery");

    // Close t1 so status filtering has something to distinguish.
    await call(env, `/api/admin/support/tickets/${t1.ticket.id}/close`, { method: "POST", cookie: adminCookie });

    const openOnly = await call(env, "/api/admin/support/tickets?status=open", { cookie: adminCookie });
    const openBody = await openOnly.json<{ tickets: { id: string; status: string }[] }>();
    expect(openBody.tickets.every((t) => t.status === "open")).toBe(true);
    expect(openBody.tickets.some((t) => t.id === t2.ticket.id)).toBe(true);
    expect(openBody.tickets.some((t) => t.id === t1.ticket.id)).toBe(false);

    const search = await call(env, "/api/admin/support/tickets?search=billing", { cookie: adminCookie });
    const searchBody = await search.json<{ tickets: { id: string }[] }>();
    expect(searchBody.tickets.some((t) => t.id === t1.ticket.id)).toBe(true);
    expect(searchBody.tickets.some((t) => t.id === t2.ticket.id)).toBe(false);
  });

  it("rejects access to tickets that don't belong to the caller, for both learners and guests", async () => {
    const { cookie: ownerCookie } = await loginNewUser(env, "owner@example.com");
    const { cookie: strangerCookie } = await loginNewUser(env, "stranger@example.com");

    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie: ownerCookie,
      body: JSON.stringify({ body: "Private question" })
    });
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    const strangerRead = await call(env, `/api/support/tickets/${ticket.id}/messages`, { cookie: strangerCookie });
    expect(strangerRead.status).toBe(404);

    const strangerReply = await call(env, `/api/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: strangerCookie,
      body: JSON.stringify({ body: "sneaky" })
    });
    expect(strangerReply.status).toBe(404);

    // A guest with no cookie at all also can't read it.
    const guestRead = await call(env, `/api/support/tickets/${ticket.id}/messages`);
    expect(guestRead.status).toBe(404);
  });

  it("lets a guest create a ticket with an email, receives a guest cookie, and can reuse it to reply", async () => {
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({ body: "Guest question", guestEmail: "guest@example.com" })
    });
    expect(create.status).toBe(201);
    const guestCookie = extractCookie(create, "support_guest_id");
    expect(guestCookie).not.toBeNull();

    const { ticket } = await create.json<{ ticket: { id: string } }>();
    const reply = await call(env, `/api/support/tickets/${ticket.id}/messages`, {
      method: "POST",
      cookie: guestCookie!,
      body: JSON.stringify({ body: "still there?" })
    });
    expect(reply.status).toBe(201);
  });

  it("rejects a guest ticket creation without an email", async () => {
    const res = await call(env, "/api/support/tickets", {
      method: "POST",
      body: JSON.stringify({ body: "no email given" })
    });
    expect(res.status).toBe(400);
  });

  it("enriches the admin ticket list with the owner's login/paid status and filters by it", async () => {
    const { user: paidUser, cookie: paidCookie } = await loginNewUser(env, "paid-learner@example.com");
    await setUserCourseStatus(env, paidUser.id, "paid");
    const { cookie: freeCookie } = await loginNewUser(env, "free-learner@example.com");

    const paidTicket = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie: paidCookie, body: JSON.stringify({ body: "paid q" }) })
    ).json<{ ticket: { id: string } }>();
    const freeTicket = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie: freeCookie, body: JSON.stringify({ body: "free q" }) })
    ).json<{ ticket: { id: string } }>();
    const guestTicket = await (
      await call(env, "/api/support/tickets", { method: "POST", body: JSON.stringify({ body: "guest q", guestEmail: "g@example.com" }) })
    ).json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin-enrich@example.com", "correct-horse-battery");

    const paidOnly = await call(env, "/api/admin/support/tickets?user_status=paid", { cookie: adminCookie });
    const paidBody = await paidOnly.json<{ tickets: { id: string; courseStatus: string | null; isGuest: boolean }[] }>();
    expect(paidBody.tickets.some((t) => t.id === paidTicket.ticket.id)).toBe(true);
    expect(paidBody.tickets.some((t) => t.id === freeTicket.ticket.id)).toBe(false);
    expect(paidBody.tickets.every((t) => t.courseStatus === "paid")).toBe(true);

    const guestOnly = await call(env, "/api/admin/support/tickets?user_status=guest", { cookie: adminCookie });
    const guestBody = await guestOnly.json<{ tickets: { id: string; isGuest: boolean }[] }>();
    expect(guestBody.tickets.some((t) => t.id === guestTicket.ticket.id)).toBe(true);
    expect(guestBody.tickets.every((t) => t.isGuest)).toBe(true);
  });

  it("captures the origin page and drops an automatic message into the thread when an admin shifts the profile", async () => {
    const { cookie } = await loginNewUser(env, "origin-learner@example.com");
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Help on this page", originPath: "/lesson/7" })
    });
    const { ticket } = await create.json<{ ticket: { id: string; agentProfile: string } }>();

    const adminCookie = await loginAdmin(env, "admin-origin@example.com", "correct-horse-battery");
    const adminList = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    const found = (await adminList.json<{ tickets: { id: string; originPath: string | null }[] }>()).tickets.find(
      (t) => t.id === ticket.id
    );
    expect(found?.originPath).toBe("/lesson/7");

    const otherProfile = ticket.agentProfile === "nlt" ? "void" : "nlt";
    await call(env, `/api/admin/support/tickets/${ticket.id}/shift`, {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ agent_profile: otherProfile })
    });

    const thread = await call(env, `/api/support/tickets/${ticket.id}/messages`, { cookie });
    const threadBody = await thread.json<{ messages: { senderType: string; body: string | null }[] }>();
    expect(threadBody.messages.some((m) => m.senderType === "admin" && m.body?.toLowerCase().includes("shifted"))).toBe(true);
  });

  it("lets an admin permanently delete an entire ticket, taking its messages with it", async () => {
    const { cookie } = await loginNewUser(env, "delete-ticket-learner@example.com");
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Please delete me" })
    });
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin-delete-ticket@example.com", "correct-horse-battery");

    // Sanity check it's there first.
    const before = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    expect((await before.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(true);

    const del = await call(env, `/api/admin/support/tickets/${ticket.id}`, { method: "DELETE", cookie: adminCookie });
    expect(del.status).toBe(200);

    // Gone from the admin list...
    const after = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    expect((await after.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(false);

    // ...and unreachable both by admin and by the learner who owned it.
    const adminRead = await call(env, `/api/admin/support/tickets/${ticket.id}/messages`, { cookie: adminCookie });
    expect(adminRead.status).toBe(404);
    const learnerRead = await call(env, `/api/support/tickets/${ticket.id}/messages`, { cookie });
    expect(learnerRead.status).toBe(404);

    // Deleting a ticket that doesn't exist 404s rather than silently succeeding.
    const missing = await call(env, `/api/admin/support/tickets/does-not-exist`, { method: "DELETE", cookie: adminCookie });
    expect(missing.status).toBe(404);
  });

  it("lets an admin delete every ticket belonging to one identity in one shot", async () => {
    const { user, cookie } = await loginNewUser(env, "delete-profile-learner@example.com");

    const first = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "First question" }) })
    ).json<{ ticket: { id: string } }>();
    // Close it (hides it, doesn't delete it) so a second ticket is allowed —
    // "delete profile" should still catch this hidden-but-not-deleted one.
    await call(env, `/api/support/tickets/${first.ticket.id}/close`, { method: "POST", cookie });

    const second = await (
      await call(env, "/api/support/tickets", { method: "POST", cookie, body: JSON.stringify({ body: "Second question" }) })
    ).json<{ ticket: { id: string } }>();

    const adminCookie = await loginAdmin(env, "admin-delete-profile@example.com", "correct-horse-battery");

    const del = await call(env, `/api/admin/support/identities/${encodeURIComponent(`user:${user.id}`)}`, {
      method: "DELETE",
      cookie: adminCookie
    });
    expect(del.status).toBe(200);
    const delBody = await del.json<{ ok: boolean; deletedCount: number }>();
    expect(delBody.deletedCount).toBe(2);

    const adminList = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    const adminListBody = await adminList.json<{ tickets: { id: string }[] }>();
    expect(adminListBody.tickets.some((t) => t.id === first.ticket.id)).toBe(false);
    expect(adminListBody.tickets.some((t) => t.id === second.ticket.id)).toBe(false);

    // A malformed identity key is rejected rather than deleting nothing silently.
    const badKey = await call(env, "/api/admin/support/identities/not-a-real-key", { method: "DELETE", cookie: adminCookie });
    expect(badKey.status).toBe(400);
  });

  it("lets an admin hide a ticket from the learner's own list — the missing direction of unhide", async () => {
    const { cookie } = await loginNewUser(env, "admin-hide-learner@example.com");
    const create = await call(env, "/api/support/tickets", {
      method: "POST",
      cookie,
      body: JSON.stringify({ body: "Hide me please" })
    });
    const { ticket } = await create.json<{ ticket: { id: string } }>();

    // Visible to the learner before hiding.
    let list = await call(env, "/api/support/tickets", { cookie });
    expect((await list.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(true);

    const adminCookie = await loginAdmin(env, "admin-hide@example.com", "correct-horse-battery");
    const hide = await call(env, `/api/admin/support/tickets/${ticket.id}/hide`, { method: "POST", cookie: adminCookie });
    expect(hide.status).toBe(200);

    // Gone from the learner's own list...
    list = await call(env, "/api/support/tickets", { cookie });
    expect((await list.json<{ tickets: { id: string }[] }>()).tickets.some((t) => t.id === ticket.id)).toBe(false);
    // ...and unreachable by id for the learner...
    const learnerRead = await call(env, `/api/support/tickets/${ticket.id}/messages`, { cookie });
    expect(learnerRead.status).toBe(404);

    // ...but still fully visible to admin, flagged as hidden.
    const adminList = await call(env, "/api/admin/support/tickets", { cookie: adminCookie });
    const seen = (await adminList.json<{ tickets: { id: string; hiddenByUser: boolean }[] }>()).tickets.find(
      (t) => t.id === ticket.id
    );
    expect(seen?.hiddenByUser).toBe(true);
  });

  it("lets an admin start a new conversation with an existing user, and it shows up in that learner's own widget", async () => {
    const { user, cookie } = await loginNewUser(env, "new-convo-learner@example.com");

    const adminCookie = await loginAdmin(env, "admin-new-convo@example.com", "correct-horse-battery");

    const create = await call(env, "/api/admin/support/tickets", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: user.id, body: "Hey — just checking in on your progress!" })
    });
    expect(create.status).toBe(201);
    const created = await create.json<{ ticket: { id: string; status: string }; message: { senderType: string; body: string } }>();
    expect(created.message.senderType).toBe("admin");
    expect(created.message.body).toBe("Hey — just checking in on your progress!");

    // Shows up in the learner's own ticket list like any other ticket.
    const list = await call(env, "/api/support/tickets", { cookie });
    const listBody = await list.json<{ tickets: { id: string }[] }>();
    expect(listBody.tickets.some((t) => t.id === created.ticket.id)).toBe(true);

    // The learner can read the thread and see the admin's opening message.
    const thread = await call(env, `/api/support/tickets/${created.ticket.id}/messages`, { cookie });
    const threadBody = await thread.json<{ messages: { senderType: string; body: string | null }[] }>();
    expect(threadBody.messages.some((m) => m.senderType === "admin" && m.body === "Hey — just checking in on your progress!")).toBe(
      true
    );

    // Because the learner now has a visible ticket, a second admin-started
    // conversation with them is rejected rather than bypassing the
    // one-visible-ticket-per-identity rule.
    const second = await call(env, "/api/admin/support/tickets", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: user.id, body: "Another one?" })
    });
    expect(second.status).toBe(409);
    const secondBody = await second.json<{ error: string }>();
    expect(secondBody.error).toBe("ticket_already_open");

    // A non-existent user is rejected with 404.
    const badUser = await call(env, "/api/admin/support/tickets", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: "does-not-exist", body: "Hi" })
    });
    expect(badUser.status).toBe(404);

    // A missing message body is rejected with 400.
    const { cookie: cookie2, user: user2 } = await loginNewUser(env, "new-convo-learner-2@example.com");
    void cookie2;
    const emptyBody = await call(env, "/api/admin/support/tickets", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({ userId: user2.id, body: "  " })
    });
    expect(emptyBody.status).toBe(400);
  });
});
