import { useCallback, useEffect, useState } from "react";
import { api, type SupportTicket } from "../lib/api";
import { useContent } from "../lib/useContent";
import { useSession } from "../lib/SessionContext";
import { SupportChatPanel } from "./SupportChatPanel";

// Same order of magnitude as SupportChatPanel's THREAD_POLL_MS — this
// project has no WebSocket/Durable Object infrastructure, so a short poll
// is the consistent way to keep the badge close to real-time. Only polls
// while logged in (notifications.user_id is NOT NULL — guests have no
// notifications, just the ticket-based count below) and only while the tab
// is visible, same gating as the rest of the app's polling.
const NOTIFICATION_POLL_MS = 5_000;

/**
 * In-site support chat — replaced the old Telegram deep-link this button
 * used to open. The floating button now toggles a docked/fullscreen chat
 * panel (SupportChatPanel) instead of leaving the site. Available to
 * guests too — not gated behind RequireAuth/useSession authentication,
 * since unauthenticated visitors can still open a ticket (see
 * routes/support.ts' guest-cookie identity).
 *
 * The badge on this button doubles as the site's notification indicator
 * (see routes/notifications.ts / db.ts's notifications section): for a
 * logged-in learner it shows their unread in-site notification count
 * (currently always a support reply), which opening the panel clears in
 * one action, same as it always cleared ticket-unread by reading the
 * thread. Guests have no notifications row to read (user_id is NOT NULL),
 * so they keep seeing the plain ticket-unread count instead.
 */
export function SupportButton() {
  const { t } = useContent();
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [ticketUnreadCount, setTicketUnreadCount] = useState(0);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);

  const handleTicketsChange = useCallback((tickets: SupportTicket[]) => {
    setTicketUnreadCount(tickets.reduce((sum, t) => sum + t.unreadCount, 0));
  }, []);

  const loadNotifications = useCallback(() => {
    api
      .get<{ unreadCount: number }>("/notifications")
      .then((res) => setNotificationUnreadCount(res.unreadCount))
      .catch(() => {
        // Silent — the badge just shows whatever it last had.
      });
  }, []);

  useEffect(() => {
    if (!me?.authenticated) return;
    loadNotifications();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") loadNotifications();
    }, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadNotifications();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me?.authenticated, loadNotifications]);

  const unreadCount = me?.authenticated ? notificationUnreadCount : ticketUnreadCount;

  function handleMinimize() {
    setOpen(false);
    setFullscreen(false);
  }

  function handleOpen() {
    setOpen(true);
    // Opening the panel is the same "I've seen it" moment reading a
    // thread's messages already was for ticket-unread — clear the
    // notification badge right away instead of waiting for a poll tick or
    // requiring the learner to open the specific ticket that triggered it.
    if (me?.authenticated && notificationUnreadCount > 0) {
      setNotificationUnreadCount(0);
      api.post("/notifications/read-all").catch(() => {
        // Best-effort — the next poll tick reconciles if this failed.
      });
    }
  }

  return (
    <>
      {open && (
        <SupportChatPanel
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((f) => !f)}
          onMinimize={handleMinimize}
          onTicketsChange={handleTicketsChange}
        />
      )}

      {!open && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Contact support"
          title={t("support.button_label")}
          className="focus-ring fixed bottom-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] right-5 z-40 flex items-center justify-center rounded-full bg-accent-500 shadow-[0_10px_28px_-8px_rgba(230,57,70,0.55)] transition-transform duration-150 hover:scale-105 hover:bg-accent-400 active:scale-95 sm:bottom-6 sm:right-6"
          style={{ width: 56, height: 56 }}
        >
          {/* Flat, single-shape "friendly chat" badge — same illustration
              language as IllustrationBadge (filled shapes in brand hex,
              generous rounding) rather than a thin corporate line icon. */}
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
            <path
              d="M13 4c-5.8 0-10 3.9-10 8.5 0 2.5 1.25 4.75 3.3 6.3-.1 1.2-.5 2.25-1.2 3.15a.5.5 0 0 0 .55.78c1.7-.45 3.05-1.1 4.1-1.85.98.25 2.05.37 3.25.37 5.8 0 10-3.9 10-8.75S18.8 4 13 4Z"
              fill="#fdf8e9"
            />
            <path d="M8.7 13.4c.85 1.05 2.4 1.75 4.3 1.75s3.45-.7 4.3-1.75" stroke="#e63946" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-base-950 bg-highlight-500 px-1 text-[10px] font-bold text-base-950">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}