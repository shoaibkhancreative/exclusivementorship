import { useRef } from "react";
import { useConfig } from "../lib/useConfig";
import { useContent } from "../lib/useContent";
import { useDialogA11y } from "../lib/useDialogA11y";
import { Button } from "./ui";

// Shown when a *paid* user tries to play a gated video from the web. Free
// users hitting a locked lesson are unaffected — that's a completely
// separate flow (see SequenceLockModal / UnlockModal) and this component is
// never rendered for them.
export function AppRequiredModal({ onClose }: { onClose: () => void }) {
  const config = useConfig();
  const { t } = useContent();
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
      aria-label="Download the app to watch"
    >
      <div
        ref={panelRef}
        className="animate-slide-up w-full max-w-xs rounded-2xl bg-base-900 p-6 text-center shadow-xl"
      >
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent-500 text-base-950">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 18h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <h2 className="text-[15px] font-semibold leading-snug text-zinc-50">{t("lesson.app_required_title")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-400">{t("lesson.app_required_message")}</p>

        <div className="mt-5 flex flex-col gap-2">
          {config?.appDownloadUrl && (
            <a
              href={config.appDownloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="focus-ring inline-flex w-full items-center justify-center rounded-full bg-accent-500 px-6 py-3 text-sm font-semibold text-base-950 transition-transform duration-150 hover:bg-accent-400 active:scale-[0.97]"
            >
              {t("lesson.app_required_cta")}
            </a>
          )}
          <Button variant="secondary" onClick={onClose} className="w-full">
            {t("lesson.app_required_dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
