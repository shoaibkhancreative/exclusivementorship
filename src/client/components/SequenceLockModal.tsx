import { useEffect } from "react";
import { Button } from "./ui";

/**
 * The "sequence locked" counterpart to UnlockModal.tsx's payment popup —
 * tapping a locked class's button used to reveal an explanation directly on
 * top of the video (see the git history of Lesson.tsx); now both lock
 * reasons open a popup instead, so this is that popup for the "finish the
 * previous class first" case. Deliberately much simpler than UnlockModal
 * since there's no action to take here beyond going back and finishing the
 * previous class: just the message and a close button. Mirrors
 * NewConversationModal.tsx's overlay shape/conventions (backdrop click +
 * Escape to close, body scroll lock) since that's the plain-popup pattern
 * already used elsewhere in this codebase.
 */
export function SequenceLockModal({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-end justify-center bg-[#1c1b17]/70 backdrop-blur-sm sm:items-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Class locked"
    >
      <div className="animate-slide-up w-full max-w-xs rounded-t-2xl bg-base-900 p-6 text-center shadow-xl sm:rounded-2xl">
        {/* Same accent-circle-with-lock treatment as the button that opened
            this popup (see Lesson.tsx), just larger — keeps the popup
            visually tied to what was just tapped instead of introducing a
            third icon style. */}
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-base-950">
          <svg width="18" height="19" viewBox="0 0 12 13" aria-hidden="true">
            <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none" />
          </svg>
        </span>
        <p className="text-sm font-medium leading-relaxed text-zinc-100">{message}</p>
        <Button variant="secondary" onClick={onClose} className="mt-5 w-full">
          Close
        </Button>
      </div>
    </div>
  );
}
