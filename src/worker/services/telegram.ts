import type { Env } from "../lib/config";

interface TelegramInviteLinkResponse {
  ok: boolean;
  result?: { invite_link: string };
  description?: string;
}

/**
 * Creates a single-use (member_limit=1) invite link for a channel or group.
 * The bot MUST already be an administrator with "Invite Users via Link"
 * permission in the target chat — see SETUP_GUIDE.md.
 */
async function createOneTimeInviteLink(env: Env, chatId: string): Promise<string> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  // Expire the link in 24h if unused, and cap it to exactly one member.
  const expireDate = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/createChatInviteLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        member_limit: 1,
        expire_date: expireDate,
        creates_join_request: false
      })
    }
  );

  const data = (await res.json()) as TelegramInviteLinkResponse;

  if (!res.ok || !data.ok || !data.result) {
    throw new Error(`Telegram API error: ${data.description ?? res.statusText}`);
  }

  return data.result.invite_link;
}

export interface TelegramAccessLinks {
  channelInviteLink: string;
  groupInviteLink: string;
}

export async function generateTelegramAccess(env: Env): Promise<TelegramAccessLinks> {
  const [channelInviteLink, groupInviteLink] = await Promise.all([
    createOneTimeInviteLink(env, env.TELEGRAM_CHANNEL_ID),
    createOneTimeInviteLink(env, env.TELEGRAM_GROUP_ID)
  ]);
  return { channelInviteLink, groupInviteLink };
}
