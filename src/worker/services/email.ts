import type { Env } from "../lib/config";
import { getContentMap } from "../db";
import { CONTENT_DEFAULTS } from "../lib/content";

/** Escapes the handful of characters that matter for a raw HTML text node — this template never accepts user-controlled admin content elsewhere, but the OTP code itself is untrusted input. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function otpEmailHtml(code: string, content: Record<string, string>): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #26262a;border-radius:12px;padding:32px;">
            <tr><td style="color:#c9a24b;font-size:13px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(content["email.otp_kicker"])}</td></tr>
            <tr><td style="color:#f4f4f5;font-size:20px;font-weight:600;padding-top:8px;">${escapeHtml(content["email.otp_brand"])}</td></tr>
            <tr><td style="color:#a1a1aa;font-size:14px;padding-top:20px;">${escapeHtml(content["email.otp_intro"])}</td></tr>
            <tr>
              <td style="padding-top:12px;">
                <span style="display:inline-block;background:#1a1a1d;border:1px solid #38383e;border-radius:8px;padding:14px 20px;color:#e6cf94;font-size:28px;font-weight:700;letter-spacing:8px;">${escapeHtml(code)}</span>
              </td>
            </tr>
            <tr><td style="color:#71717a;font-size:13px;padding-top:20px;">${escapeHtml(content["email.otp_expiry_note"])}</td></tr>
            <tr><td style="color:#52525b;font-size:12px;padding-top:24px;border-top:1px solid #26262a;margin-top:24px;">${escapeHtml(content["email.otp_ignore_note"])}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/** Same layout as the OTP email (kicker/brand/body/footer), swapped for a plain text body and a button-style link instead of a code block. */
function abandonedCheckoutEmailHtml(unlockUrl: string, content: Record<string, string>): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #26262a;border-radius:12px;padding:32px;">
            <tr><td style="color:#c9a24b;font-size:13px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(content["email.reminder_kicker"])}</td></tr>
            <tr><td style="color:#f4f4f5;font-size:20px;font-weight:600;padding-top:8px;">${escapeHtml(content["email.reminder_brand"])}</td></tr>
            <tr><td style="color:#a1a1aa;font-size:14px;padding-top:20px;line-height:1.5;">${escapeHtml(content["email.reminder_body"])}</td></tr>
            <tr>
              <td style="padding-top:20px;">
                <a href="${escapeHtml(unlockUrl)}" style="display:inline-block;background:#e6cf94;color:#0a0a0b;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;text-decoration:none;">${escapeHtml(content["email.reminder_cta"])}</a>
              </td>
            </tr>
            <tr><td style="color:#52525b;font-size:12px;padding-top:24px;border-top:1px solid #26262a;margin-top:24px;">${escapeHtml(content["email.reminder_ignore_note"])}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Sends a one-time reminder for a checkout that was started but never
 * completed (see scheduled.ts / sendAbandonedCheckoutReminders — the caller
 * already guarantees this fires at most once per order). Fails loudly
 * (throws) rather than swallowing errors, same as sendOtpEmail, so the
 * caller can skip setting reminder_sent_at and retry on the next run.
 */
export async function sendAbandonedCheckoutEmail(env: Env, toEmail: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(`[dev-mode] Abandoned-checkout reminder for ${toEmail}`);
    return;
  }

  const content = await getContentMap(env, CONTENT_DEFAULTS).catch(() => CONTENT_DEFAULTS);
  // There's no standalone /unlock page anymore — the Dashboard itself shows
  // the same state-driven "Unlock Mentorship" CTA (see pages/Learn.tsx),
  // which opens the checkout popup directly once tapped.
  const unlockUrl = `${env.APP_URL.replace(/\/$/, "")}/learn`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject: content["email.reminder_subject"],
      html: abandonedCheckoutEmailHtml(unlockUrl, content)
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** Same kicker/brand/body/footer layout as the other transactional emails, for the support inbox. */
function supportEmailHtml(opts: { kicker: string; body: string; ctaLabel: string; ctaUrl: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #26262a;border-radius:12px;padding:32px;">
            <tr><td style="color:#c9a24b;font-size:13px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(opts.kicker)}</td></tr>
            <tr><td style="color:#f4f4f5;font-size:20px;font-weight:600;padding-top:8px;">Exclusive Mentorship</td></tr>
            <tr><td style="color:#a1a1aa;font-size:14px;padding-top:20px;line-height:1.5;">${escapeHtml(opts.body)}</td></tr>
            <tr>
              <td style="padding-top:20px;">
                <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background:#e6cf94;color:#0a0a0b;font-size:14px;font-weight:600;padding:12px 20px;border-radius:8px;text-decoration:none;">${escapeHtml(opts.ctaLabel)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Notifies the admin support inbox (SUPPORT_NOTIFY_EMAIL) of a new ticket or
 * a new learner message. Silently no-ops if SUPPORT_NOTIFY_EMAIL isn't
 * configured — this is a nice-to-have alert, not something that should ever
 * fail a learner-facing request.
 */
export async function sendSupportAdminNotificationEmail(
  env: Env,
  opts: { preview: string; ticketId: string }
): Promise<void> {
  if (!env.SUPPORT_NOTIFY_EMAIL) return;

  const inboxUrl = `${env.APP_URL.replace(/\/$/, "")}/admin/support?ticket=${encodeURIComponent(opts.ticketId)}`;

  if (!env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(`[dev-mode] Support notification for ${env.SUPPORT_NOTIFY_EMAIL}: ${opts.preview}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [env.SUPPORT_NOTIFY_EMAIL],
      subject: "New support inbox activity",
      html: supportEmailHtml({
        kicker: "Support inbox",
        body: opts.preview.slice(0, 300),
        ctaLabel: "Open in admin inbox",
        ctaUrl: inboxUrl
      })
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text.slice(0, 300)}`);
  }
}

/** Notifies a learner (account email or guest_email) that an agent replied to their support ticket. */
export async function sendSupportReplyEmail(
  env: Env,
  toEmail: string,
  opts: { agentDisplayName: string }
): Promise<void> {
  const siteUrl = env.APP_URL.replace(/\/$/, "");

  if (!env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(`[dev-mode] Support reply notification for ${toEmail} from ${opts.agentDisplayName}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject: `New reply from ${opts.agentDisplayName}`,
      html: supportEmailHtml({
        kicker: "Support",
        body: `${opts.agentDisplayName} replied to your support conversation.`,
        ctaLabel: "View the reply",
        ctaUrl: siteUrl
      })
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text.slice(0, 300)}`);
  }
}

/**
 * Sends the OTP email via Resend. In local development, if RESEND_API_KEY is
 * absent, the code is logged to the console instead of failing the request
 * so the flow can still be tested end-to-end.
 */
export async function sendOtpEmail(env: Env, toEmail: string, code: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.log(`[dev-mode] OTP for ${toEmail}: ${code}`);
    return;
  }

  // Falls back to CONTENT_DEFAULTS wholesale (never a partial/broken map) if
  // the DB read fails for any reason — an OTP email must never fail to send
  // just because site_content is briefly unavailable.
  const content = await getContentMap(env, CONTENT_DEFAULTS).catch(() => CONTENT_DEFAULTS);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject: content["email.otp_subject"],
      html: otpEmailHtml(code, content)
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text.slice(0, 300)}`);
  }
}
