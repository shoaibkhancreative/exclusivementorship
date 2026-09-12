import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useUnlockModal } from "../lib/UnlockModalContext";
import { Avatar } from "./Avatar";

// Mirrors the Dashboard's cover-card threshold (see pages/Learn.tsx) — a
// free learner needs to have completed this many classes before the
// "Unlock Full Mentorship" button appears here too.
const CLASSES_TO_UNLOCK_CTA = 5;

/**
 * Deliberately minimal: identity (avatar + name/email) plus exactly two
 * possible actions — "Unlock Full Mentorship" (same visibility rule as
 * before: hidden for paid users and hidden until enough classes are
 * completed) and "Logout". No progress count, no "Continue" card, no
 * "Access" button — nothing else lives here.
 */
export function ProfileMenu() {
  const { me, refresh } = useSession();
  const navigate = useNavigate();
  const { t } = useContent();
  const { openUnlockModal } = useUnlockModal();
  const [open, setOpen] = useState(false);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);
  const [outlineError, setOutlineError] = useState(false);
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

  const loadOutline = useCallback(() => {
    setOutlineError(false);
    api
      .get<OutlineResponse>("/lessons")
      .then(setOutline)
      .catch(() => setOutlineError(true));
  }, []);

  // Lazy-fetch: the outline data isn't needed until the dropdown is
  // actually opened (it's only used to decide whether the Unlock button
  // should show), and once loaded once we keep it around rather than
  // re-fetching on every open.
  useEffect(() => {
    if (open && !outline && !outlineError) {
      loadOutline();
    }
  }, [open, outline, outlineError, loadOutline]);

  if (!me?.authenticated) return null;

  const isPremium = me.courseStatus === "paid";
  const label = me.displayName || me.email || "?";

  const completedCount = outline?.outline.filter((l) => l.state === "completed").length ?? 0;

  // Same single-CTA gate as the Dashboard cover card — hidden until a free
  // learner has completed enough classes, never shown to premium learners
  // (they're unlocked already).
  const showUnlockCta = !isPremium && completedCount >= CLASSES_TO_UNLOCK_CTA;

  async function handleLogout() {
    await api.post("/auth/logout");
    await refresh();
    setOpen(false);
    navigate("/");
  }

  function handleUnlockClick() {
    setOpen(false);
    // Opens the checkout popup directly — there's no intermediate /unlock
    // page anymore (see UnlockModalContext).
    openUnlockModal();
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
          className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-72 max-w-[90vw] origin-top-right overflow-hidden rounded-xl border border-base-800 bg-base-900"
        >
          {/* Identity */}
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <Avatar label={label} premium={isPremium} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{label}</div>
              <div className="truncate text-xs text-zinc-500">{me.email}</div>
            </div>
          </div>

          {/* Account actions — the single status-driven Unlock button (once
              earned), plus logout. Nothing else lives in this menu. */}
          <div className="flex flex-col gap-1 border-t border-base-800 p-2">
            {showUnlockCta && (
              <button
                type="button"
                onClick={handleUnlockClick}
                role="menuitem"
                className="focus-ring flex w-full items-center justify-center rounded-lg bg-accent-500 px-3 py-2 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
              >
                {t("profile.unlock_button")}
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              role="menuitem"
              className="focus-ring w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-400 transition-colors hover:bg-base-800 hover:text-zinc-100"
            >
              {t("profile.logout_button")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
