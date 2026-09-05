import type { Env } from "../lib/config";

function otpEmailHtml(code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0b;padding:40px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#111113;border:1px solid #26262a;border-radius:12px;padding:32px;">
            <tr><td style="color:#c9a24b;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Next Level Trader</td></tr>
            <tr><td style="color:#f4f4f5;font-size:20px;font-weight:600;padding-top:8px;">Exclusive Mentorship</td></tr>
            <tr><td style="color:#a1a1aa;font-size:14px;padding-top:20px;">Your verification code is:</td></tr>
            <tr>
              <td style="padding-top:12px;">
                <span style="display:inline-block;background:#1a1a1d;border:1px solid #38383e;border-radius:8px;padding:14px 20px;color:#e6cf94;font-size:28px;font-weight:700;letter-spacing:8px;">${code}</span>
              </td>
            </tr>
            <tr><td style="color:#71717a;font-size:13px;padding-top:20px;">This code expires in 10 minutes and can only be used once.</td></tr>
            <tr><td style="color:#52525b;font-size:12px;padding-top:24px;border-top:1px solid #26262a;margin-top:24px;">If you didn't request this code, you can safely ignore this email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [toEmail],
      subject: "Your Exclusive Mentorship verification code",
      html: otpEmailHtml(code)
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend API error (${res.status}): ${text.slice(0, 300)}`);
  }
}
