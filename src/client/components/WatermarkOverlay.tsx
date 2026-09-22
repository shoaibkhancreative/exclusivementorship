import { useEffect, useRef, useState } from "react";

const DRIFT_DURATION_SECONDS = 12;

interface WatermarkOverlayProps {
  label: string;
  playing: boolean;
}

function randomSuffix(): string {
  const bytes = new Uint8Array(6);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function WatermarkOverlay({ label, playing }: WatermarkOverlayProps) {
  const [suffix] = useState(randomSuffix);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const wrapperClass = `wm-${suffix}`;
  const keyframesName = `wm-drift-${suffix}`;

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
        background: rgba(0, 0, 0, 0.32);
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
      <span style={{ animationPlayState: playing ? "running" : "paused" }}>{label}</span>
    </div>
  );
}
