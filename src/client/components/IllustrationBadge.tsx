// ---------------------------------------------------------------------------
// One illustration language for the whole site: a single soft round badge
// per screen, flat two/three-tone shapes, generous rounding, built only
// from the site's own brand colors. Deliberately just ONE illustration on
// screen at a time — no sparkle clutter, no secondary icons competing for
// attention next to it. Originally lived only in UnlockModal.tsx; pulled out
// here so any screen (Login included) can reuse the exact same visual
// language instead of re-inventing a slightly-different badge each time.
// ---------------------------------------------------------------------------

export function IllustrationBadge({
  size = 88,
  bg,
  breathe,
  children
}: {
  size?: number;
  bg: string;
  breathe?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative mx-auto flex items-center justify-center rounded-full ${breathe ? "animate-[gentle-breathe_2.8s_ease-in-out_infinite]" : ""}`}
      style={{ width: size, height: size, background: bg }}
    >
      {children}
    </div>
  );
}

/**
 * Shared "couldn't load, try again" hero — a network hiccup is a normal,
 * unremarkable thing to ask the learner to retry, so this stays as calm and
 * "sleepy" as UnlockModal's ClockBadge: a muted circular-arrow glyph, never
 * red/alarming. Used by every full-page load-error state (Learn, Lesson)
 * so a retry always reads the same way site-wide instead of each page
 * inventing its own error treatment.
 */
export function RetryBadge({ size = 72 }: { size?: number }) {
  return (
    <IllustrationBadge size={size} bg="var(--tw-base-800, #f0e3b8)">
      <svg viewBox="0 0 64 64" width={Math.round(size * 0.47)} height={Math.round(size * 0.47)} aria-hidden="true">
        <path d="M46 20a18 18 0 1 0 4 14" fill="none" stroke="#a69f89" strokeWidth="4.5" strokeLinecap="round" />
        <path d="M46 8v13h-13" fill="none" stroke="#a69f89" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </IllustrationBadge>
  );
}
