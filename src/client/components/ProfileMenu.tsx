import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { Avatar } from "./Avatar";

/**
 * Deliberately minimal: name, email, and a single status-driven action.
 * - Free users who haven't finished the 5 free classes see nothing extra.
 * - Free users who HAVE finished the 5 free classes see an "Unlock" button.
 * - Paid users see an "Access" button (their Telegram mentorship access).
 */
export function ProfileMenu() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const isPremium = me.courseStatus === "paid";
  const label = me.displayName || me.email || "?";

  // A free user has "finished the 5 free classes" once current_lesson has
  // advanced past the free threshold (i.e. reached the Telegram gateway
  // lesson) — mirrors the server's own definition, nothing re-invented here.
  const hasFinishedFreeClasses =
    !isPremium &&
    typeof me.currentLesson === "number" &&
    typeof me.telegramGatewayLesson === "number" &&
    me.currentLesson >= me.telegramGatewayLesson;

  async function handleLogout() {
    await api.post("/auth/logout");
    await refresh();
    setOpen(false);
    navigate("/");
  }

  function handleUnlockClick() {
    setOpen(false);
    navigate("/unlock");
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring rounded-full"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar label={label} premium={isPremium} size={34} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 max-w-[90vw] rounded-xl border border-base-700 bg-base-900 p-4 shadow-xl shadow-black/40"
        >
          <div className="mb-3 flex items-center gap-3">
            <Avatar label={label} premium={isPremium} size={44} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{label}</div>
              <div className="truncate text-xs text-zinc-500">{me.email}</div>
            </div>
          </div>

          {isPremium && (
            <Link
              to="/access"
              onClick={() => setOpen(false)}
              role="menuitem"
              className="focus-ring mb-2 flex w-full items-center justify-center rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm font-medium text-accent-300 transition-colors hover:border-accent-500 hover:bg-accent-500/15"
            >
              Access
            </Link>
          )}

          {hasFinishedFreeClasses && (
            <button
              type="button"
              onClick={handleUnlockClick}
              role="menuitem"
              className="focus-ring mb-2 flex w-full items-center justify-center rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
            >
              Unlock Full Mentorship
            </button>
          )}

          <button
            type="button"
            onClick={handleLogout}
            role="menuitem"
            className="focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-base-800 hover:text-zinc-100"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
