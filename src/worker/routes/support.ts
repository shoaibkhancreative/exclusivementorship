import { Hono, type Context } from "hono";
import type { Env } from "../lib/config";
import {
  RATE_LIMITS,
  SUPPORT_AGENT_LABELS,
  SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES,
  SUPPORT_GUEST_COOKIE_NAME,
  SUPPORT_MAX_ATTACHMENT_BYTES,
  randomSupportAgentProfile
} from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { readCookie, buildGuestIdCookie } from "../auth";
import { randomUuid, sha256Hex } from "../lib/crypto";
import { decodeImageDataUrl } from "../lib/validation";
import {
  checkRateLimit,
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

function supportTicketVisibleToUser(ticket: SupportTicketRow, identity: SupportIdentity): boolean {
  return supportTicketBelongsTo(ticket, identity) && ticket.hidden_by_user_at === null;
}

function background(c: Context<{ Bindings: Env; Variables: AppVariables }>, task: Promise<void>) {
  const reported = task.catch((err) => {
    // eslint-disable-next-line no-console
    console.error("support background task failed", err);
  });
  try {
    c.executionCtx.waitUntil(reported);
  } catch {
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

supportRoutes.get("/tickets", async (c) => {
  const { identity } = resolveIdentity(c);
  if (!identity.userId && !identity.guestId) return c.json({ tickets: [] });
  const tickets = await listSupportTicketsForIdentity(c.env, identity);
  return c.json({ tickets: tickets.map(serializeTicket) });
});

supportRoutes.post("/tickets", async (c) => {
  const user = c.get("user");
  const { identity, guestIdToSet } = resolveIdentity(c);

  const body = await c.req
    .json<{
      body?: string;
      guestEmail?: string;
      originPath?: string;
      attachment?: { dataUrl: string; filename: string };
    }>()
    .catch(
      () =>
        ({}) as {
          body?: string;
          guestEmail?: string;
          originPath?: string;
          attachment?: { dataUrl: string; filename: string };
        }
    );
  const text = (body.body ?? "").trim();
  const guestEmail = (body.guestEmail ?? "").trim();

  if (!user && !guestEmail) {
    return c.json({ error: "email_required", message: "Please provide an email so we can reach you." }, 400);
  }
  if (!text && !body.attachment) {
    return c.json({ error: "empty_message", message: "Please write a message." }, 400);
  }

  const ip = c.req.header("cf-connecting-ip") ?? "unknown";
  const ipHash = await sha256Hex(ip);
  const identityKey = identity.userId ?? `guest:${identity.guestId}`;
  const perIp = await checkRateLimit(
    c.env,
    `support_ticket:ip:${ipHash}`,
    RATE_LIMITS.supportTicketCreatePerIpPerHour,
    3600
  );
  const perIdentity = await checkRateLimit(
    c.env,
    `support_ticket:identity:${identityKey}`,
    RATE_LIMITS.supportTicketCreatePerIdentityPerHour,
    3600
  );
  if (!perIp.allowed || !perIdentity.allowed) {
    return c.json({ error: "rate_limited", message: "Too many requests. Please try again shortly." }, 429);
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
      const decoded = decodeImageDataUrl(
        body.attachment.dataUrl,
        SUPPORT_MAX_ATTACHMENT_BYTES,
        SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES
      );
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

  const identityKey = identity.userId ?? `guest:${identity.guestId}`;
  const rate = await checkRateLimit(
    c.env,
    `support_message:identity:${identityKey}`,
    RATE_LIMITS.supportMessagePerIdentityPerHour,
    3600
  );
  if (!rate.allowed) {
    return c.json({ error: "rate_limited", message: "Too many messages. Please try again shortly." }, 429);
  }

  let attachment: { bytes: Uint8Array; mime: string; filename: string } | null = null;
  if (body.attachment) {
    try {
      const decoded = decodeImageDataUrl(
        body.attachment.dataUrl,
        SUPPORT_MAX_ATTACHMENT_BYTES,
        SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES
      );
      attachment = { ...decoded, filename: body.attachment.filename || "attachment" };
    } catch (err) {
      return attachmentErrorResponse(c, err);
    }
  }

  const message = await createSupportMessage(c.env, {
    ticketId: ticket.id,
    senderType: "user",
    body: text || null,
    attachment
  });

  background(c, sendSupportAdminNotificationEmail(c.env, { ticketId: ticket.id, preview: text || "[attachment]" }));

  return c.json({ message: serializeMessage(message) }, 201);
});

supportRoutes.post("/tickets/:id/close", async (c) => {
  const { identity } = resolveIdentity(c);
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket || !supportTicketBelongsTo(ticket, identity)) {
    return c.json({ error: "not_found" }, 404);
  }
  await hideSupportTicketForUser(c.env, ticket.id);
  return c.json({ ok: true });
});

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
    return c.json(
      { error: "attachment_too_large", message: "That image is too large. Please choose a smaller one." },
      413
    );
  }
  if (code === "invalid_mime") {
    return c.json(
      { error: "invalid_mime", message: "This image format isn't supported — please use JPEG, PNG, WebP, or GIF." },
      400
    );
  }
  return c.json(
    { error: "invalid_attachment", message: "That attachment couldn't be read. Please try another image." },
    400
  );
}
