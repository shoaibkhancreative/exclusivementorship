import { useSession } from "../lib/SessionContext";
import { useConfig } from "../lib/useConfig";

/**
 * Opens the correct Telegram support chat directly — no in-site message
 * form, no admin inbox to check. Which link is used is fully decided
 * server-side, never guessed on the client: a logged-in learner gets
 * `me.supportTelegramUrl` from GET /auth/me, which the server derives from
 * the authenticated session's real course_status (see routes/auth.ts) — the
 * premium/free choice is baked into that URL before it ever reaches the
 * browser. A logged-out visitor has no session to resolve that from, so
 * they fall back to the always-public `supportTelegramFreeUrl` from
 * /config/public (see that route's comment for why the premium link can
 * never live there). This is the one Telegram touchpoint intentionally kept
 * on the site — everything else Telegram-related has been removed.
 */
export function SupportButton() {
  const { me } = useSession();
  const config = useConfig();

  const href = me?.authenticated ? me.supportTelegramUrl : config?.supportTelegramFreeUrl;

  return (
    <a
      href={href || "#"}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact support on Telegram"
      title="Support"
      className="focus-ring fixed bottom-5 right-5 z-40 flex items-center justify-center rounded-full bg-accent-500 text-base-950 transition-colors hover:bg-accent-400 sm:bottom-6 sm:right-6"
      style={{ width: 52, height: 52 }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.076-.163-3.017-.463L3 21l1.395-3.72C3.512 15.892 3 14.492 3 13c0-4.418 4.03-8 9-8s9 3.582 9 8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="8.5" cy="12.5" r="0.9" fill="currentColor" />
        <circle cx="12" cy="12.5" r="0.9" fill="currentColor" />
        <circle cx="15.5" cy="12.5" r="0.9" fill="currentColor" />
      </svg>
    </a>
  );
}
