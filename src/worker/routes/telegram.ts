import { Hono } from "hono";
import type { Env } from "../lib/config";
import type { AppVariables } from "../middleware/session";
import { requirePaid } from "../middleware/session";
import { generateTelegramAccess } from "../services/telegram";
import { logAuditEvent } from "../db";

export const telegramRoutes = new Hono<{ Bindings: Env; Variables: AppVariables }>();

interface TelegramAccessRow {
  user_id: string;
  channel_invite_link: string | null;
  group_invite_link: string | null;
  status: "pending" | "generated" | "failed";
  generated_at: string | null;
}

telegramRoutes.get("/access", requirePaid, async (c) => {
  const user = c.get("user")!;
  const row = await c.env.DB.prepare("SELECT * FROM telegram_access WHERE user_id = ?")
    .bind(user.id)
    .first<TelegramAccessRow>();

  return c.json({
    status: row?.status ?? "pending",
    channelInviteLink: row?.channel_invite_link ?? null,
    groupInviteLink: row?.group_invite_link ?? null
  });
});

/**
 * Idempotent generation: if links already exist (status='generated'), they
 * are returned as-is rather than creating new ones. This is what prevents a
 * user from ending up with multiple one-time invite links, and what allows
 * safe retry after a prior Telegram API failure without requiring repayment
 * (see PRODUCT SPEC §46 "Telegram failure safety").
 */
telegramRoutes.post("/generate", requirePaid, async (c) => {
  const user = c.get("user")!;

  const existing = await c.env.DB.prepare("SELECT * FROM telegram_access WHERE user_id = ?")
    .bind(user.id)
    .first<TelegramAccessRow>();

  if (existing?.status === "generated" && existing.channel_invite_link && existing.group_invite_link) {
    return c.json({
      ok: true,
      status: "generated",
      channelInviteLink: existing.channel_invite_link,
      groupInviteLink: existing.group_invite_link
    });
  }

  try {
    const links = await generateTelegramAccess(c.env);

    await c.env.DB.prepare(
      `INSERT INTO telegram_access (user_id, channel_invite_link, group_invite_link, status, generated_at)
       VALUES (?, ?, ?, 'generated', datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         channel_invite_link = excluded.channel_invite_link,
         group_invite_link = excluded.group_invite_link,
         status = 'generated',
         generated_at = datetime('now')`
    )
      .bind(user.id, links.channelInviteLink, links.groupInviteLink)
      .run();

    await logAuditEvent(c.env, "telegram_access_generated", { userId: user.id });

    return c.json({ ok: true, status: "generated", ...links });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("generateTelegramAccess failed", err);

    await c.env.DB.prepare(
      `INSERT INTO telegram_access (user_id, status) VALUES (?, 'failed')
       ON CONFLICT(user_id) DO UPDATE SET status = 'failed'`
    )
      .bind(user.id)
      .run();

    await logAuditEvent(c.env, "telegram_access_failed", { userId: user.id });

    // Payment stays confirmed regardless — the user keeps access to retry.
    return c.json(
      { error: "telegram_generation_failed", message: "We couldn't generate your Telegram invite yet. You can retry — your enrollment is safe." },
      502
    );
  }
});
