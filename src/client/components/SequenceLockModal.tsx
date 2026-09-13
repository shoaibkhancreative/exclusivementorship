import { useRef } from "react";
import { Button } from "./ui";
import { useDialogA11y } from "../lib/useDialogA11y";

export function SequenceLockModal({ message, onClose }: { message: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(panelRef, { onClose });

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <div
      className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-[#1c1b17]/70 px-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Class locked"
    >
      <div
        ref={panelRef}
        className="animate-slide-up w-full max-w-xs rounded-2xl bg-base-900 p-6 text-center shadow-xl"
      >
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-base-950">
          <svg width="18" height="19" viewBox="0 0 12 13" aria-hidden="true">
            <rect x="1.5" y="5.5" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" fill="none" />
            <path
              d="M3.5 5.5V3.75a2.5 2.5 0 0 1 5 0V5.5"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              fill="none"
            />
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
