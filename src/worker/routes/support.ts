import { Hono, type Context } from "hono";
import type { Env } from "../lib/config";
import {
  SUPPORT_AGENT_LABELS,
  SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES,
  SUPPORT_GUEST_COOKIE_NAME,
  SUPPORT_MAX_ATTACHMENT_BYTES,
  randomSupportAgentProfile
} from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { readCookie, buildGuestIdCookie } from "../auth";
import { randomUuid } from "../lib/crypto";
import { decodeImageDataUrl } from "../lib/validation";
import {
  createSupportMessage,
  createSupportTicket,
  getSupportMessageAttachment,
  getSupportTicket,
  hasVisibleSupportTicket,
  hideSupportTicketForUser,
  listSupportMessages,
  listSupportTicketsForIdentity,
  markSupportMessagesRead,
  supportTicketBelongsTo,
  type SupportIdentity,
  type SupportTicketRow
} from "../db";
import { sendSupportAdminNotificationEmail } from "../services/email";

export const supportRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * Resolves the caller's ticket identity: a logged-in user's id, or the
 * support_guest_id cookie's value for a guest. Never both. Returns
 * `guestIdToSet` when a brand-new guest id was minted so the caller can set
 * the cookie on the response (only ticket creation ever does this — every
 * other route just needs to know who's asking, not mint a new identity for
 * someone with no cookie and no existing tickets).
 */
function resolveIdentity(c: Context<{ Bindings: Env; Variables: AppVariables }>): {
  identity: SupportIdentity;
  guestIdToSet: string | null;
} {
  const user = c.get("user");
  if (user) return { identity: { userId: user.id, guestId: null }, guestIdToSet: null };

  const existingGuestId = readCookie(c.req.header("cookie") ?? null, SUPPORT_GUEST_COOKIE_NAME);
  if (existingGuestId) return { identity: { userId: null, guestId: existingGuestId }, guestIdToSet: null };

  const newGuestId = randomUuid();
  return { identity: { userId: null, guestId: newGuestId }, guestIdToSet: newGuestId };
}

/**
 * Once a learner taps "Close conversation" (hidden_by_user_at set), the
 * ticket should behave as fully gone from THEIR side — not just absent from
 * the list, but unreachable by id too (admin access is separate and
 * untouched — see routes/admin-support.ts). This is stricter than plain
 * ownership (supportTicketBelongsTo), which the close action itself still
 * uses since hiding an already-open ticket must still be allowed.
 */
function supportTicketVisibleToUser(ticket: SupportTicketRow, identity: SupportIdentity): boolean {
  return supportTicketBelongsTo(ticket, identity) && ticket.hidden_by_user_at === null;
}

/**
 * Fires a best-effort background task without making the caller wait for
 * it. Real Cloudflare Workers get an executionCtx from Hono — waitUntil
 * keeps the task alive after the response is sent instead of risking the
 * isolate being torn down mid-send. Test/other environments have no
 * executionCtx, so this just lets the promise run and swallows its error
 * (there's nothing else to do with it there).
 */
function background(c: Context<{ Bindings: Env; Variables: AppVariables }>, task: Promise<void>) {
  const reported = task.catch((err) => {
    // eslint-disable-next-line no-console
    console.error("support background task failed", err);
  });
  // c.executionCtx is a getter that THROWS (not undefined) when there's no
  // ExecutionContext (e.g. in tests, or any non-Workers runtime) — see
  // Hono's Context#executionCtx. Fall back to just letting the promise run
  // on its own in that case; there's nothing else to hand it to.
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
  origin_path?: string | null;
  unread_count?: number;
}) {
  return {
    id: t.id,
    subject: t.subject,
    status: t.status,
    agentProfile: t.agent_profile,
    agentDisplayName: SUPPORT_AGENT_LABELS[t.agent_profile as keyof typeof SUPPORT_AGENT_LABELS] ?? t.agent_profile,
    lastMessageAt: t.last_message_at,
    createdAt: t.created_at,
    originPath: t.origin_path ?? null,
    unreadCount: t.unread_count ?? 0
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
    attachmentUrl: m.has_attachment ? `/api/support/messages/${m.id}/attachment` : null
  };
}

/** GET /support/tickets — the caller's VISIBLE tickets (not hidden by them — see hideSupportTicketForUser), most recent activity first. */
supportRoutes.get("/tickets", async (c) => {
  const { identity } = resolveIdentity(c);
  if (!identity.userId && !identity.guestId) return c.json({ tickets: [] });
  const tickets = await listSupportTicketsForIdentity(c.env, identity);
  return c.json({ tickets: tickets.map(serializeTicket) });
});

/**
 * POST /support/tickets — creates a new ticket + its first message. A
 * learner may only have ONE visible ticket at a time — see
 * hasVisibleSupportTicket — closing it (POST .../close) is what frees them
 * up to start a new one. Guests must supply guestEmail on this call
 * (captured once, reused for every reply-notification email after).
 */
supportRoutes.post("/tickets", async (c) => {
  const user = c.get("user");
  const { identity, guestIdToSet } = resolveIdentity(c);

  const body = await c.req
    .json<{ body?: string; guestEmail?: string; originPath?: string; attachment?: { dataUrl: string; filename: string } }>()
    .catch(() => ({}) as { body?: string; guestEmail?: string; originPath?: string; attachment?: { dataUrl: string; filename: string } });
  const text = (body.body ?? "").trim();
  const guestEmail = (body.guestEmail ?? "").trim();

  if (!user && !guestEmail) {
    return c.json({ error: "email_required", message: "Please provide an email so we can reach you." }, 400);
  }
  if (!text && !body.attachment) {
    return c.json({ error: "empty_message", message: "Please write a message." }, 400);
  }

  if (await hasVisibleSupportTicket(c.env, identity)) {
    return c.json(
      {
        error: "ticket_already_open",
        message:
          "আপনার ইতিমধ্যে একটি চলমান কথোপকথন আছে। নতুন টিকেট খুলতে আগেরটি বন্ধ করুন। (You already have an open conversation — close it to start a new one.)"
      },
      429
    );
  }

  let attachment: { bytes: Uint8Array; mime: string; filename: string } | null = null;
  if (body.attachment) {
    try {
      const decoded = decodeImageDataUrl(body.attachment.dataUrl, SUPPORT_MAX_ATTACHMENT_BYTES, SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES);
      attachment = { ...decoded, filename: body.attachment.filename || "attachment" };
    } catch (err) {
      return attachmentErrorResponse(c, err);
    }
  }

  const ticket = await createSupportTicket(c.env, {
    userId: identity.userId,
    guestId: identity.guestId,
    guestEmail: user ? null : guestEmail,
    agentProfile: randomSupportAgentProfile(),
    subject: text ? text.slice(0, 80) : "New ticket",
    originPath: typeof body.originPath === "string" ? body.originPath.slice(0, 200) : null
  });

  const message = await createSupportMessage(c.env, {
    ticketId: ticket.id,
    senderType: "user",
    body: text || null,
    attachment
  });

  if (guestIdToSet) {
    c.header("Set-Cookie", buildGuestIdCookie(c.env, guestIdToSet));
  }

  background(c, sendSupportAdminNotificationEmail(c.env, { ticketId: ticket.id, preview: text || "[attachment]" }));

  return c.json({ ticket: serializeTicket(ticket), message: serializeMessage(message) }, 201);
});

/** GET /support/tickets/:id/messages — full thread; marks admin messages read. 404s for a ticket the learner has closed on their side, even though it still belongs to them (see supportTicketVisibleToUser). */
supportRoutes.get("/tickets/:id/messages", async (c) => {
  const { identity } = resolveIdentity(c);
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket || !supportTicketVisibleToUser(ticket, identity)) {
    return c.json({ error: "not_found" }, 404);
  }

  await markSupportMessagesRead(c.env, ticket.id, "admin");
  const messages = await listSupportMessages(c.env, ticket.id);
  return c.json({ ticket: serializeTicket(ticket), messages: messages.map(serializeMessage) });
});

/** POST /support/tickets/:id/messages — send into an existing (open or closed) ticket. Reopens a closed ticket. */
supportRoutes.post("/tickets/:id/messages", async (c) => {
  const { identity } = resolveIdentity(c);
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket || !supportTicketVisibleToUser(ticket, identity)) {
    return c.json({ error: "not_found" }, 404);
  }

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
      return attachmentErrorResponse(c, err);
    }
  }

  const message = await createSupportMessage(c.env, { ticketId: ticket.id, senderType: "user", body: text || null, attachment });

  background(c, sendSupportAdminNotificationEmail(c.env, { ticketId: ticket.id, preview: text || "[attachment]" }));

  return c.json({ message: serializeMessage(message) }, 201);
});

/** POST /support/tickets/:id/close — hides the ticket from the learner's own list. Admin can still see it and can "Unhide" it back. */
supportRoutes.post("/tickets/:id/close", async (c) => {
  const { identity } = resolveIdentity(c);
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket || !supportTicketBelongsTo(ticket, identity)) {
    return c.json({ error: "not_found" }, 404);
  }
  await hideSupportTicketForUser(c.env, ticket.id);
  return c.json({ ok: true });
});

/** GET /support/messages/:id/attachment — streams the raw bytes; ownership is checked via the message's parent ticket. */
supportRoutes.get("/messages/:id/attachment", async (c) => {
  const { identity } = resolveIdentity(c);
  const attachment = await getSupportMessageAttachment(c.env, c.req.param("id"));
  if (!attachment) return c.json({ error: "not_found" }, 404);

  const ticket = await getSupportTicket(c.env, attachment.ticket_id);
  if (!ticket || !supportTicketVisibleToUser(ticket, identity)) {
    return c.json({ error: "not_found" }, 404);
  }

  return new Response(attachment.bytes, {
    headers: {
      "Content-Type": attachment.mime,
      "Content-Disposition": `inline; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600"
    }
  });
});

function attachmentErrorResponse(c: Context<{ Bindings: Env; Variables: AppVariables }>, err: unknown) {
  const code = err instanceof Error ? err.message : "invalid_attachment";
  if (code === "attachment_too_large") {
    return c.json({ error: "attachment_too_large", message: "That image is too large. Please choose a smaller one." }, 413);
  }
  if (code === "invalid_mime") {
    return c.json(
      { error: "invalid_mime", message: "This image format isn't supported — please use JPEG, PNG, WebP, or GIF." },
      400
    );
  }
  return c.json({ error: "invalid_attachment", message: "That attachment couldn't be read. Please try another image." }, 400);
}
