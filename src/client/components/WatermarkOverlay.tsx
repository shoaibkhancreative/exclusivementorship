import { useEffect, useRef, useState } from "react";

/**
 * DETERRENT ONLY — NOT A PREVENTION MEASURE. This overlay does not stop
 * screen recording, photographing the screen, or any other capture method;
 * Bunny's iframe player is cross-origin and we cannot see or block what
 * happens to its rendered frames. Its only purpose is to put the viewing
 * student's own identity on the video so that a leaked recording is
 * traceable back to whoever leaked it, which discourages casual
 * redistribution. Do not remove this comment when editing.
 *
 * Pure CSS/text overlay, positioned on top of (not baked into) the video
 * iframe. `pointer-events: none` throughout so it never intercepts clicks
 * meant for the player's own controls. Continuously drifts along a diagonal
 * bounce path across the whole video area (a few seconds per traverse) so
 * it never sits still long enough to be cropped out of a still frame or a
 * short recording clip. Kept semi-transparent (opacity intentionally in the
 * 25–40% range) so it stays legible on a recording without being
 * distracting during normal viewing.
 *
 * The MutationObserver below and the per-mount randomized class/id name
 * raise the bar against a *casual* "select element, hide it" attempt or a
 * shared ad-blocker-style filter list keyed on a fixed selector — they are
 * NOT, and cannot be, foolproof against someone actively modifying the
 * page's JS execution (e.g. patching MutationObserver itself, or running a
 * script that strips this component's effect before it runs). Same
 * "deterrent, not prevention" framing as the rest of this file.
 */

const DRIFT_DURATION_SECONDS = 5;

interface WatermarkOverlayProps {
  /** e.g. the viewer's email or a short user ID — never more than that. */
  label: string;
}

function randomSuffix(): string {
  // Per-mount, per-session — not a fixed, greppable selector shared across
  // every viewer. Doesn't need to be cryptographically strong, just
  // unpredictable enough that a filter list can't target it by name.
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WatermarkOverlay({ label }: WatermarkOverlayProps) {
  const [suffix] = useState(randomSuffix);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const wrapperClass = `wm-${suffix}`;
  const keyframesName = `wm-drift-${suffix}`;

  // Inject a per-mount <style> tag rather than a shared stylesheet class —
  // both the keyframes name and the class selector are randomized, so
  // nothing here is a stable target across sessions/users.
  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-watermark-style", suffix);
    style.textContent = `
      @keyframes ${keyframesName} {
        0%   { left: 4%;  top: 6%; }
        25%  { left: 78%; top: 10%; }
        50%  { left: 70%; top: 82%; }
        75%  { left: 8%;  top: 74%; }
        100% { left: 4%;  top: 6%; }
      }
      .${wrapperClass} {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }
      .${wrapperClass} > span {
        position: absolute;
        animation: ${keyframesName} ${DRIFT_DURATION_SECONDS}s linear infinite;
        white-space: nowrap;
        user-select: none;
        border-radius: 4px;
        background: rgba(0, 0, 0, 0.2);
        padding: 4px 8px;
        font-family: ui-monospace, SFMono-Regular, monospace;
        font-size: 11px;
        letter-spacing: 0.02em;
        color: #fff;
        opacity: 0.32;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, [suffix, wrapperClass, keyframesName]);

  // --- Tamper-resistance (casual-attempt deterrent only) ------------------
  //
  // Watches the wrapper's parent for the wrapper node itself being removed
  // (childList) and watches the wrapper's own attributes for a hide-via-CSS
  // attempt (display:none / visibility:hidden / opacity:0 via inline style,
  // or its class being stripped). Either kind of tamper is reverted
  // immediately. This only guards the DOM-level, devtools-inspector style
  // of removal — see the file-level comment above for what it does not
  // (and cannot) defend against.
  useEffect(() => {
    const node = wrapperRef.current;
    if (!node) return;
    const parent = node.parentElement;

    function isHidden(el: HTMLElement): boolean {
      if (!el.isConnected) return true;
      const inlineDisplay = el.style.display;
      const inlineVisibility = el.style.visibility;
      const inlineOpacity = el.style.opacity;
      if (inlineDisplay === "none") return true;
      if (inlineVisibility === "hidden" || inlineVisibility === "collapse") return true;
      if (inlineOpacity !== "" && Number(inlineOpacity) === 0) return true;
      const computed = window.getComputedStyle(el);
      return computed.display === "none" || computed.visibility === "hidden" || computed.opacity === "0";
    }

    function restore() {
      const current = wrapperRef.current;
      if (!current) return;
      if (!current.isConnected && parent) {
        parent.appendChild(current);
      }
      if (!current.classList.contains(wrapperClass)) {
        current.className = wrapperClass;
      }
      current.style.removeProperty("display");
      current.style.removeProperty("visibility");
      current.style.removeProperty("opacity");
    }

    const attributeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const target = mutation.target as HTMLElement;
          if (isHidden(target) || !target.classList.contains(wrapperClass)) {
            restore();
          }
        }
      }
    });
    attributeObserver.observe(node, { attributes: true, attributeFilter: ["style", "class"] });

    let childListObserver: MutationObserver | null = null;
    if (parent) {
      childListObserver = new MutationObserver(() => {
        if (!wrapperRef.current || !wrapperRef.current.isConnected) {
          restore();
        }
      });
      childListObserver.observe(parent, { childList: true });
    }

    return () => {
      attributeObserver.disconnect();
      childListObserver?.disconnect();
    };
  }, [wrapperClass]);

  return (
    <div ref={wrapperRef} aria-hidden="true" className={wrapperClass}>
      <span>{label}</span>
    </div>
  );
}
