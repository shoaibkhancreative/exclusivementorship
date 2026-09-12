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
          className="focus-ring fixed bottom-5 right-5 z-40 flex items-center justify-center rounded-full bg-accent-500 text-base-950 shadow-lg transition-transform duration-150 hover:scale-105 hover:bg-accent-400 active:scale-95 sm:bottom-6 sm:right-6"
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
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-base-950 bg-red-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      )}
    </>
  );
}

