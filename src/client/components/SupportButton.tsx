import { useSession } from "../lib/SessionContext";
import { useConfig } from "../lib/useConfig";

/**
 * Routing uses the real, server-confirmed `courseStatus` from the session
 * (never a visual/UI assumption). Logged-out visitors fall back to the free
 * support destination, matching existing product behavior for anonymous
 * users elsewhere in the app.
 */
export function SupportButton() {
  const { me } = useSession();
  const config = useConfig();

  function handleClick() {
    if (!config) return;
    const isPremium = me?.authenticated && me.courseStatus === "paid";
    const url = isPremium ? config.supportTelegramPremiumUrl : config.supportTelegramFreeUrl;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Contact support on Telegram"
      title="Support"
      className="focus-ring fixed bottom-5 right-5 z-40 flex items-center justify-center rounded-full bg-accent-500 text-base-950 shadow-lg shadow-black/40 transition-transform hover:scale-105 hover:bg-accent-400 sm:bottom-6 sm:right-6"
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
    </button>
  );
}
