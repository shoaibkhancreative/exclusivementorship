import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Notification } from "../lib/api";
import { useSession } from "../lib/SessionContext";

// Same order of magnitude as SupportChatPanel's THREAD_POLL_MS — this
// project has no WebSocket/Durable Object infrastructure, so a short poll
// interval is the consistent way to keep the bell close to real-time. Runs
// for the whole time a learner is logged in (not just while a panel is
// open), and only while the tab is actually visible — same
// visibilitychange gating as the support thread poll.
const NOTIFICATION_POLL_MS = 5_000;

function formatRelativeTime(iso: string): string {
  const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function NotificationBell() {
  const { me } = useSession();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<{ notifications: Notification[]; unreadCount: number }>("/notifications")
      .then((res) => {
        setNotifications(res.notifications);
        setUnreadCount(res.unreadCount);
      })
      .catch(() => {
        // Silent — the bell just shows whatever it last had, same as the
        // support panel's ticket-list poll.
      });
  }, []);

  useEffect(() => {
    if (!me?.authenticated) return;
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [me?.authenticated, load]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  if (!me?.authenticated) return null;

  // Optimistic: flips readAt locally right away, same pattern as
  // SupportChatPanel's optimistic message send. If the request fails, the
  // next poll tick (at most NOTIFICATION_POLL_MS later) reconciles it.
  async function markRead(id: string) {
    setNotifications((prev) => (prev ?? []).map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await api.post(`/notifications/${id}/read`);
    } catch {
      // Best-effort — see comment above.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => (prev ?? []).map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    try {
      await api.post("/notifications/read-all");
    } catch {
      // Best-effort — see comment above.
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring relative flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:text-zinc-100"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Notifications"
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[9.5px] font-bold text-base-950">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] origin-top-right overflow-hidden rounded-xl border border-base-800 bg-base-900"
        >
          <div className="flex items-center justify-between border-b border-base-800 px-4 py-3">
            <span className="text-sm font-medium text-zinc-100">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                role="menuitem"
                className="focus-ring rounded text-[11px] text-accent-400 transition-colors hover:text-accent-300"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications === null ? (
              <div className="p-4 text-center text-sm text-zinc-500">Loading…</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-sm text-zinc-500">No notifications yet.</div>
            ) : (
              <ul className="divide-y divide-base-800">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => markRead(n.id)}
                      role="menuitem"
                      className={`focus-ring flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-base-800/40 ${
                        n.readAt ? "" : "bg-accent-500/[0.04]"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {!n.readAt && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" aria-hidden="true" />}
                        <span className="line-clamp-2 text-[12.5px] text-zinc-200">{n.message}</span>
                      </span>
                      <span className="text-[10.5px] text-zinc-500">{formatRelativeTime(n.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
