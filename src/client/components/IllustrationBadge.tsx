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

export function RetryBadge({ size = 72 }: { size?: number }) {
  return (
    <IllustrationBadge size={size} bg="var(--tw-base-800, #16201C)">
      <svg viewBox="0 0 64 64" width={Math.round(size * 0.47)} height={Math.round(size * 0.47)} aria-hidden="true">
        <path d="M46 20a18 18 0 1 0 4 14" fill="none" stroke="#7E9188" strokeWidth="4.5" strokeLinecap="round" />
        <path
          d="M46 8v13h-13"
          fill="none"
          stroke="#7E9188"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </IllustrationBadge>
  );
}
