import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type OutlineResponse } from "../lib/api";
import { useSession } from "../lib/SessionContext";
import { useContent } from "../lib/useContent";
import { useUnlockModal } from "../lib/UnlockModalContext";
import { Avatar } from "./Avatar";

function UnlockGlyph() {
  return (
    <svg width="13" height="14" viewBox="0 0 14 15" fill="none" aria-hidden="true">
      <rect x="1.5" y="6.5" width="10" height="7" rx="1.4" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 6.5V4.2A2.7 2.7 0 0 1 9.8 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function LogoutGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.5 2.5H3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 5 13 8l-3.5 3M13 8H5.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CLASSES_TO_UNLOCK_CTA = 5;

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

  useEffect(() => {
    if (open && !outline && !outlineError) {
      loadOutline();
    }
  }, [open, outline, outlineError, loadOutline]);

  if (!me?.authenticated) return null;

  const isPremium = me.courseStatus === "paid";
  const label = me.displayName || me.email || "?";

  const completedCount = outline?.outline.filter((l) => l.state === "completed").length ?? 0;

  const showUnlockCta = !isPremium && completedCount >= CLASSES_TO_UNLOCK_CTA;

  async function handleLogout() {
    await api.post("/auth/logout");
    await refresh();
    setOpen(false);
    navigate("/");
  }

  function handleUnlockClick() {
    setOpen(false);
    openUnlockModal();
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="focus-ring rounded-full p-1.5 lg:p-0.5"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar label={label} premium={isPremium} size={34} />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-72 max-w-[90vw] origin-top-right overflow-hidden rounded-2xl border border-base-800 bg-base-900 shadow-lg shadow-base-800/30"
        >
          <div className="flex items-center gap-3 px-4 pb-3 pt-4">
            <Avatar label={label} premium={isPremium} size={40} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-100">{label}</div>
              <div className="truncate text-xs text-zinc-500">{me.email}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-base-800 p-2">
            {showUnlockCta && (
              <button
                type="button"
                onClick={handleUnlockClick}
                role="menuitem"
                className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl bg-accent-500 px-3 py-2.5 text-sm font-medium text-base-950 transition-colors hover:bg-accent-400"
              >
                <UnlockGlyph />
                {t("profile.unlock_button")}
              </button>
            )}

            <button
              type="button"
              onClick={handleLogout}
              role="menuitem"
              className="focus-ring flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-400 transition-colors hover:bg-base-800 hover:text-zinc-100"
            >
              <LogoutGlyph />
              {t("profile.logout_button")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
