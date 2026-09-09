import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface FullscreenStageProps {
  children: ReactNode;
}

/**
 * Generic "click to fullscreen" wrapper, extracted out of VideoStage so both
 * lesson videos (VideoStage) and the homepage intro video (Home.tsx) get the
 * exact same fullscreen behavior/UX instead of two different
 * implementations drifting apart.
 *
 * Renders `children` (typically a <VideoPlayer/>, optionally with an overlay
 * sibling like the watermark) inside a container with its own fullscreen
 * toggle button. See the extended rationale below for why this exists
 * instead of just relying on the embedded player's native fullscreen button.
 *
 * - Real Fullscreen API via requestFullscreen()/exitFullscreen() when
 *   available, triggered from a genuine click gesture (not from inside a
 *   `fullscreenchange` handler, which browsers routinely reject).
 * - CSS-only "pseudo-fullscreen" fallback (fixed-position overlay) for
 *   browsers without the Fullscreen API on arbitrary elements (notably iOS
 *   Safari), or if requestFullscreen() is rejected for any other reason.
 * - The pseudo-fullscreen path is portaled straight onto <body> so it isn't
 *   accidentally confined by an ancestor with `transform`/`filter`/
 *   `backdrop-filter`/`will-change` (which create a new containing block for
 *   `position: fixed`). Real native fullscreen is never portaled — the
 *   browser already promotes it to the top layer, and portaling would
 *   unmount the exact node that was fullscreened, kicking us straight back
 *   out.
 */
export function FullscreenStage({ children }: FullscreenStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pseudoFullscreen, setPseudoFullscreen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);

  const enterFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (el?.requestFullscreen) {
      el.requestFullscreen().then(
        () => {
          setIsNativeFullscreen(true);
          setPseudoFullscreen(true);
        },
        () => {
          setIsNativeFullscreen(false);
          setPseudoFullscreen(true);
        }
      );
    } else {
      setIsNativeFullscreen(false);
      setPseudoFullscreen(true);
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (isNativeFullscreen && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {
        // Nothing more we can do — leave state as-is; the fullscreenchange
        // listener below will resync if the browser exits on its own.
      });
    } else {
      setPseudoFullscreen(false);
    }
  }, [isNativeFullscreen]);

  const togglePseudoFullscreen = useCallback(() => {
    if (pseudoFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }, [pseudoFullscreen, enterFullscreen, exitFullscreen]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        setIsNativeFullscreen(false);
        setPseudoFullscreen(false);
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!pseudoFullscreen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") exitFullscreen();
    }
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [pseudoFullscreen, exitFullscreen]);

  const stage = (
    <div
      ref={containerRef}
      className={pseudoFullscreen ? "fixed inset-0 z-50 flex items-center justify-center bg-black" : "relative"}
    >
      <div
        className="relative w-full"
        style={pseudoFullscreen ? { width: "min(100vw, calc(100vh * 16 / 9))" } : undefined}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={togglePseudoFullscreen}
        aria-label={pseudoFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        // Top-right, not bottom-right: the embedded player's own control bar
        // (scrubber, play/pause, its now-inert fullscreen icon) lives along
        // the bottom edge, and a button placed there would sit on top of
        // those controls and interfere with clicking them.
        className="focus-ring absolute right-3 top-3 z-10 rounded-md bg-black/60 p-2 text-white/90 transition-colors hover:bg-black/80 hover:text-white"
      >
        {pseudoFullscreen ? (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M8 3H4a1 1 0 0 0-1 1v4M12 3h4a1 1 0 0 1 1 1v4M8 17H4a1 1 0 0 1-1-1v-4M12 17h4a1 1 0 0 0 1-1v-4"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path
              d="M3 7V4a1 1 0 0 1 1-1h3M13 3h3a1 1 0 0 1 1 1v3M17 13v3a1 1 0 0 1-1 1h-3M7 17H4a1 1 0 0 1-1-1v-3"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );

  const shouldPortal = pseudoFullscreen && !isNativeFullscreen;
  return shouldPortal ? createPortal(stage, document.body) : stage;
}
