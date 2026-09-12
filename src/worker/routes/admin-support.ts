import { Hono, type Context } from "hono";
import type { Env, SupportAgentProfile } from "../lib/config";
import {
  SUPPORT_AGENT_LABELS,
  SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES,
  SUPPORT_MAX_ATTACHMENT_BYTES,
  randomSupportAgentProfile
} from "../lib/config";
import type { AdminVariables } from "../middleware/adminSession";
import { requireAdmin } from "../middleware/adminSession";
import { decodeImageDataUrl } from "../lib/validation";
import {
  createNotification,
  createSupportMessage,
  createSupportTicket,
  deleteSupportMessage,
  deleteSupportTicket,
  deleteSupportTicketsForIdentity,
  findUserById,
  getSupportMessageAttachment,
  getSupportTicket,
  hasVisibleSupportTicket,
  hideSupportTicketForUser,
  listSupportMessages,
  listSupportTicketsAdmin,
  markSupportMessagesRead,
  setSupportTicketStatus,
  shiftSupportTicketProfile,
  unhideSupportTicket,
  type SupportIdentity,
  type SupportTicketAdminFilters
} from "../db";
import { sendSupportReplyEmail } from "../services/email";

export const adminSupportRoutes = new Hono<{ Bindings: Env; Variables: AdminVariables }>();

adminSupportRoutes.use("/*", requireAdmin);

const VALID_AGENT_PROFILES: SupportAgentProfile[] = ["nlt", "void", "venom", "shadow"];
const VALID_STATUSES = ["open", "closed"] as const;
const VALID_USER_STATUSES = ["paid", "free", "guest"] as const;

/** Best-effort background task — see routes/support.ts' identical helper for why (executionCtx.waitUntil in real Workers, fire-and-swallow elsewhere). */
function background(c: Context<{ Bindings: Env; Variables: AdminVariables }>, task: Promise<void>) {
  const reported = task.catch((err) => {
    // eslint-disable-next-line no-console
    console.error("admin support background task failed", err);
  });
  // See routes/support.ts' identical helper for why this needs a try/catch
  // rather than `c.executionCtx?.waitUntil(...)`: the getter throws instead
  // of returning undefined when there's no ExecutionContext.
  try {
    c.executionCtx.waitUntil(reported);
  } catch {
    // no-op — `reported` is already running and self-contained.
  }
}

function serializeTicket(t: {
  id: string;
  subject: string | null;
  status: string;
  agent_profile: string;
  last_message_at: string;
  created_at: string;
  user_id: string | null;
  guest_id: string | null;
  guest_email: string | null;
  origin_path: string | null;
  hidden_by_user_at: string | null;
  user_email?: string | null;
  user_name?: string | null;
  course_status?: "free" | "paid" | null;
  current_lesson?: number | null;
  completed_lessons?: number | null;
  total_lessons?: number | null;
  unread_count?: number;
  last_message_preview?: string | null;
}) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    agentProfile: t.agent_profile,
    agentDisplayName: SUPPORT_AGENT_LABELS[t.agent_profile as keyof typeof SUPPORT_AGENT_LABELS] ?? t.agent_profile,
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at,
    userId: t.user_id,
    guestId: t.guest_id,
    isGuest: !t.user_id,
    userEmail: t.user_email ?? null,
    userName: t.user_name ?? null,
    guestEmail: t.guest_email,
    courseStatus: t.course_status ?? null,
    currentLesson: t.current_lesson ?? null,
    completedLessons: t.completed_lessons ?? null,
    totalLessons: t.total_lessons ?? null,
    originPath: t.origin_path,
    hiddenByUser: t.hidden_by_user_at !== null,
    unreadCount: t.unread_count ?? 0,
    lastMessagePreview: t.last_message_preview ?? null
  };
}

function serializeMessage(m: {
  id: string;
  sender_type: string;
  body: string | null;
  has_attachment: number;
  attachment_filename: string | null;
  attachment_mime: string | null;
  created_at: string;
}) {
  return {
    id: m.id,
    senderType: m.sender_type,
    body: m.body,
    hasAttachment: Boolean(m.has_attachment),
    attachmentFilename: m.attachment_filename,
    attachmentMime: m.attachment_mime,
    createdAt: m.created_at,
    attachmentUrl: m.has_attachment ? `/api/admin/support/messages/${m.id}/attachment` : null
  };
}

/** GET /admin/support/tickets — filterable (status, agent profile, date range, search, and paid/free/guest user status), sorted by most recent activity. */
adminSupportRoutes.get("/tickets", async (c) => {
  const statusParam = c.req.query("status");
  const agentParam = c.req.query("agent_profile");
  const userStatusParam = c.req.query("user_status");

  const filters: SupportTicketAdminFilters = {
    status: statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as "open" | "closed") : undefined,
    agentProfile: agentParam && VALID_AGENT_PROFILES.includes(agentParam as SupportAgentProfile) ? (agentParam as SupportAgentProfile) : undefined,
    dateFrom: c.req.query("date_from") || undefined,
    dateTo: c.req.query("date_to") || undefined,
    search: c.req.query("search") || undefined,
    userStatus:
      userStatusParam && (VALID_USER_STATUSES as readonly string[]).includes(userStatusParam)
        ? (userStatusParam as "paid" | "free" | "guest")
        : undefined
  };

  const tickets = await listSupportTicketsAdmin(c.env, filters);
  return c.json({ tickets: tickets.map(serializeTicket) });
});

/**
 * POST /admin/support/tickets — lets an admin proactively open a brand-new
 * ticket addressed to an existing (logged-in) user, with an initial admin
 * message, instead of only replying to tickets the learner started. Only
 * ever targets a real user_id — there's no such thing as an admin starting
 * a ticket "to" a guest, since guests are only identified by a cookie the
 * admin panel has no way to address.
 *
 * Interaction with the "one visible ticket per identity" rule
 * (hasVisibleSupportTicket / the learner-facing create-ticket handler in
 * routes/support.ts): this does NOT bypass it. If the learner already has a
 * visible ticket, admin-created tickets are rejected with 409 and the admin
 * is pointed at replying in the existing thread instead. Bypassing the rule
 * would let a learner end up with two simultaneously-visible tickets, which
 * nothing else in this system (their own ticket list, "Close conversation")
 * is built to handle — keeping the invariant intact everywhere it's checked
 * is worth the small extra step of an admin occasionally needing to close
 * (or ask the learner to close) an old ticket first.
 */
adminSupportRoutes.post("/tickets", async (c) => {
  const body = await c.req.json<{ userId?: string; body?: string }>().catch(() => ({}) as { userId?: string; body?: string });
  const userId = (body.userId ?? "").trim();
  const text = (body.body ?? "").trim();

  if (!userId) {
    return c.json({ error: "user_required", message: "Please choose a learner to start a conversation with." }, 400);
  }
  if (!text) {
    return c.json({ error: "empty_message", message: "Please write a message." }, 400);
  }

  const user = await findUserById(c.env, userId);
  if (!user) {
    return c.json({ error: "not_found", message: "That learner account no longer exists." }, 404);
  }

  const identity: SupportIdentity = { userId, guestId: null };
  if (await hasVisibleSupportTicket(c.env, identity)) {
    return c.json(
      {
        error: "ticket_already_open",
        message:
          "এই লার্নারের ইতিমধ্যে একটি চলমান কথোপকথন আছে — নতুন টিকেট না খুলে সেই টিকেটেই রিপ্লাই দিন। (This learner already has an open conversation — reply in that thread instead of starting a new one.)"
      },
      409
    );
  }

  const ticket = await createSupportTicket(c.env, {
    userId,
    guestId: null,
    guestEmail: null,
    agentProfile: randomSupportAgentProfile(),
    subject: text.slice(0, 80),
    originPath: null
  });

  const message = await createSupportMessage(c.env, { ticketId: ticket.id, senderType: "admin", body: text, attachment: null });

  background(c, notifyLearnerOfReply(c.env, ticket, ticket.agent_profile));
  background(c, notifyLearnerInSite(c.env, ticket, text));

  return c.json(
    { ticket: serializeTicket({ ...ticket, user_email: user.email, user_name: null }), message: serializeMessage(message) },
    201
  );
});

/** GET /admin/support/tickets/:id/messages — full thread; marks learner messages read. */
adminSupportRoutes.get("/tickets/:id/messages", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);

  await markSupportMessagesRead(c.env, ticket.id, "user");
  const messages = await listSupportMessages(c.env, ticket.id);
  return c.json({
    ticket: serializeTicket({ ...ticket, user_email: null, user_name: null }),
    messages: messages.map(serializeMessage)
  });
});

/** POST /admin/support/tickets/:id/messages — reply as the ticket's current agent_profile; emails the learner in the background (doesn't block the admin's own reply). */
adminSupportRoutes.post("/tickets/:id/messages", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);

  const body = await c.req
    .json<{ body?: string; attachment?: { dataUrl: string; filename: string } }>()
    .catch(() => ({}) as { body?: string; attachment?: { dataUrl: string; filename: string } });
  const text = (body.body ?? "").trim();
  if (!text && !body.attachment) {
    return c.json({ error: "empty_message", message: "Please write a message." }, 400);
  }

  let attachment: { bytes: Uint8Array; mime: string; filename: string } | null = null;
  if (body.attachment) {
    try {
      const decoded = decodeImageDataUrl(body.attachment.dataUrl, SUPPORT_MAX_ATTACHMENT_BYTES, SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES);
      attachment = { ...decoded, filename: body.attachment.filename || "attachment" };
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_attachment";
      if (code === "attachment_too_large") {
        return c.json({ error: "attachment_too_large", message: "That image is too large." }, 413);
      }
      if (code === "invalid_mime") {
        return c.json({ error: "invalid_mime", message: "Only image attachments (JPEG, PNG, WebP, GIF) are supported." }, 400);
      }
      return c.json({ error: "invalid_attachment", message: "That attachment couldn't be read." }, 400);
    }
  }

  const message = await createSupportMessage(c.env, { ticketId: ticket.id, senderType: "admin", body: text || null, attachment });

  background(c, notifyLearnerOfReply(c.env, ticket, ticket.agent_profile));
  background(c, notifyLearnerInSite(c.env, ticket, text || "[attachment]"));

  return c.json({ message: serializeMessage(message) }, 201);
});

async function notifyLearnerOfReply(env: Env, ticket: { user_id: string | null; guest_email: string | null }, agentProfile: SupportAgentProfile) {
  const toEmail = ticket.user_id ? (await findUserById(env, ticket.user_id))?.email ?? null : ticket.guest_email;
  if (!toEmail) return;
  const agentDisplayName = SUPPORT_AGENT_LABELS[agentProfile] ?? agentProfile;
  await sendSupportReplyEmail(env, toEmail, { agentDisplayName });
}

/**
 * Creates the in-site notification (see db.ts's notifications section) for
 * an admin message landing in a learner's ticket — a reply, or the first
 * message of an admin-started conversation. A no-op for guest tickets:
 * `notifications.user_id` is NOT NULL, so there's nowhere to put a row for
 * someone with no account. Guests keep getting only the email above; this
 * runs alongside it (background(), not instead of) wherever it's called.
 */
async function notifyLearnerInSite(env: Env, ticket: { user_id: string | null }, messagePreview: string): Promise<void> {
  if (!ticket.user_id) return;
  await createNotification(env, { userId: ticket.user_id, type: "support_reply", message: messagePreview });
}

/** POST /admin/support/tickets/:id/shift — reassigns the ticket's agent_profile (including back to 'nlt') and drops an automatic system-style message into the thread so the learner sees who they're now talking to. Does not touch existing messages — every message is always shown under the ticket's CURRENT profile. */
adminSupportRoutes.post("/tickets/:id/shift", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);

  const body = await c.req.json<{ agent_profile?: string }>().catch(() => ({}) as { agent_profile?: string });
  const agentProfile = body.agent_profile;
  if (!agentProfile || !VALID_AGENT_PROFILES.includes(agentProfile as SupportAgentProfile)) {
    return c.json({ error: "invalid_agent_profile" }, 400);
  }

  await shiftSupportTicketProfile(c.env, ticket.id, agentProfile as SupportAgentProfile);

  if (agentProfile !== ticket.agent_profile) {
    const newLabel = SUPPORT_AGENT_LABELS[agentProfile as SupportAgentProfile] ?? agentProfile;
    await createSupportMessage(c.env, {
      ticketId: ticket.id,
      senderType: "admin",
      body: `তোমার টিকেটটি ${newLabel}-এর কাছে শিফট করা হয়েছে। (Your ticket has been shifted to ${newLabel}.)`,
      attachment: null
    });
  }

  return c.json({ ok: true, agentProfile });
});

adminSupportRoutes.post("/tickets/:id/close", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await setSupportTicketStatus(c.env, ticket.id, "closed");
  return c.json({ ok: true, status: "closed" });
});

adminSupportRoutes.post("/tickets/:id/reopen", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await setSupportTicketStatus(c.env, ticket.id, "open");
  return c.json({ ok: true, status: "open" });
});

/** POST /admin/support/tickets/:id/unhide — undoes a learner's "Close conversation": puts the ticket back in their own ticket list. */
adminSupportRoutes.post("/tickets/:id/unhide", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await unhideSupportTicket(c.env, ticket.id);
  return c.json({ ok: true });
});

/**
 * POST /admin/support/tickets/:id/hide — the missing direction of unhide
 * above: lets an admin hide a ticket from the learner's own list, the same
 * thing "Close conversation" does on their side (sets hidden_by_user_at via
 * hideSupportTicketForUser). The ticket keeps existing and stays fully
 * visible/actionable here either way.
 */
adminSupportRoutes.post("/tickets/:id/hide", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await hideSupportTicketForUser(c.env, ticket.id);
  return c.json({ ok: true });
});

/** DELETE /admin/support/tickets/:id — permanently deletes the ticket and every message in it (cascade). Irreversible. */
adminSupportRoutes.delete("/tickets/:id", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await deleteSupportTicket(c.env, ticket.id);
  return c.json({ ok: true });
});

/**
 * DELETE /admin/support/identities/:identityKey — the "delete profile"
 * action in the Users column: permanently deletes EVERY ticket (and, via
 * cascade, every message) belonging to one identity in one shot.
 * identityKey reuses the exact `user:<id>` / `guest:<id>` format
 * SupportPage.tsx's identityKeyOf already builds for its own row keys, so
 * the frontend can pass it straight through with no reshaping.
 */
adminSupportRoutes.delete("/identities/:identityKey", async (c) => {
  const identity = parseIdentityKey(c.req.param("identityKey"));
  if (!identity) return c.json({ error: "invalid_identity" }, 400);
  const deletedCount = await deleteSupportTicketsForIdentity(c.env, identity);
  return c.json({ ok: true, deletedCount });
});

/** Parses SupportPage.tsx's `user:<id>` / `guest:<id>` identity key format server-side. Returns null for anything malformed. */
function parseIdentityKey(key: string): SupportIdentity | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) return null;
  const kind = key.slice(0, separatorIndex);
  const value = key.slice(separatorIndex + 1);
  if (!value) return null;
  if (kind === "user") return { userId: value, guestId: null };
  if (kind === "guest") return { userId: null, guestId: value };
  return null;
}

/** DELETE /admin/support/messages/:id — either sender's message, any ticket. */
adminSupportRoutes.delete("/messages/:id", async (c) => {
  await deleteSupportMessage(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

/** GET /admin/support/messages/:id/attachment — same byte-streaming as the learner endpoint, gated by requireAdmin above instead of ticket ownership. */
adminSupportRoutes.get("/messages/:id/attachment", async (c) => {
  const attachment = await getSupportMessageAttachment(c.env, c.req.param("id"));
  if (!attachment) return c.json({ error: "not_found" }, 404);

  return new Response(attachment.bytes, {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600"
    }
  });
});
