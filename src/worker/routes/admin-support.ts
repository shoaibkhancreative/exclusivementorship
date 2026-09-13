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

function background(c: Context<{ Bindings: Env; Variables: AdminVariables }>, task: Promise<void>) {
  const reported = task.catch((err) => {
    // eslint-disable-next-line no-console
    console.error("admin support background task failed", err);
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

adminSupportRoutes.get("/tickets", async (c) => {
  const statusParam = c.req.query("status");
  const agentParam = c.req.query("agent_profile");
  const userStatusParam = c.req.query("user_status");

  const filters: SupportTicketAdminFilters = {
    status:
      statusParam && (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as "open" | "closed")
        : undefined,
    agentProfile:
      agentParam && VALID_AGENT_PROFILES.includes(agentParam as SupportAgentProfile)
        ? (agentParam as SupportAgentProfile)
        : undefined,
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

adminSupportRoutes.post("/tickets", async (c) => {
  const body = await c.req
    .json<{ userId?: string; body?: string }>()
    .catch(() => ({}) as { userId?: string; body?: string });
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

  const message = await createSupportMessage(c.env, {
    ticketId: ticket.id,
    senderType: "admin",
    body: text,
    attachment: null
  });

  background(c, notifyLearnerOfReply(c.env, ticket, ticket.agent_profile));
  background(c, notifyLearnerInSite(c.env, ticket, text));

  return c.json(
    {
      ticket: serializeTicket({ ...ticket, user_email: user.email, user_name: null }),
      message: serializeMessage(message)
    },
    201
  );
});

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
      const decoded = decodeImageDataUrl(
        body.attachment.dataUrl,
        SUPPORT_MAX_ATTACHMENT_BYTES,
        SUPPORT_ALLOWED_ATTACHMENT_MIME_TYPES
      );
      attachment = { ...decoded, filename: body.attachment.filename || "attachment" };
    } catch (err) {
      const code = err instanceof Error ? err.message : "invalid_attachment";
      if (code === "attachment_too_large") {
        return c.json({ error: "attachment_too_large", message: "That image is too large." }, 413);
      }
      if (code === "invalid_mime") {
        return c.json(
          { error: "invalid_mime", message: "Only image attachments (JPEG, PNG, WebP, GIF) are supported." },
          400
        );
      }
      return c.json({ error: "invalid_attachment", message: "That attachment couldn't be read." }, 400);
    }
  }

  const message = await createSupportMessage(c.env, {
    ticketId: ticket.id,
    senderType: "admin",
    body: text || null,
    attachment
  });

  background(c, notifyLearnerOfReply(c.env, ticket, ticket.agent_profile));
  background(c, notifyLearnerInSite(c.env, ticket, text || "[attachment]"));

  return c.json({ message: serializeMessage(message) }, 201);
});

async function notifyLearnerOfReply(
  env: Env,
  ticket: { user_id: string | null; guest_email: string | null },
  agentProfile: SupportAgentProfile
) {
  const toEmail = ticket.user_id ? ((await findUserById(env, ticket.user_id))?.email ?? null) : ticket.guest_email;
  if (!toEmail) return;
  const agentDisplayName = SUPPORT_AGENT_LABELS[agentProfile] ?? agentProfile;
  await sendSupportReplyEmail(env, toEmail, { agentDisplayName });
}

async function notifyLearnerInSite(
  env: Env,
  ticket: { user_id: string | null },
  messagePreview: string
): Promise<void> {
  if (!ticket.user_id) return;
  await createNotification(env, { userId: ticket.user_id, type: "support_reply", message: messagePreview });
}

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

adminSupportRoutes.post("/tickets/:id/unhide", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await unhideSupportTicket(c.env, ticket.id);
  return c.json({ ok: true });
});

adminSupportRoutes.post("/tickets/:id/hide", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await hideSupportTicketForUser(c.env, ticket.id);
  return c.json({ ok: true });
});

adminSupportRoutes.delete("/tickets/:id", async (c) => {
  const ticket = await getSupportTicket(c.env, c.req.param("id"));
  if (!ticket) return c.json({ error: "not_found" }, 404);
  await deleteSupportTicket(c.env, ticket.id);
  return c.json({ ok: true });
});

adminSupportRoutes.delete("/identities/:identityKey", async (c) => {
  const identity = parseIdentityKey(c.req.param("identityKey"));
  if (!identity) return c.json({ error: "invalid_identity" }, 400);
  const deletedCount = await deleteSupportTicketsForIdentity(c.env, identity);
  return c.json({ ok: true, deletedCount });
});

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

adminSupportRoutes.delete("/messages/:id", async (c) => {
  await deleteSupportMessage(c.env, c.req.param("id"));
  return c.json({ ok: true });
});

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
