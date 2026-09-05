interface AvatarProps {
  label: string;
  premium?: boolean;
  size?: number;
}

/**
 * Initials avatar. There is no profile-picture upload anywhere in the
 * product (email-only OTP login), so this is the real avatar — not a
 * placeholder. Premium status is represented ONLY by the subtle gold ring;
 * no text badge is ever rendered here.
 */
export function Avatar({ label, premium = false, size = 36 }: AvatarProps) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  const fontSize = Math.max(11, Math.round(size * 0.4));

  return (
    <div
      className="inline-flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size,
        height: size,
        padding: premium ? 2 : 0,
        background: premium
          ? "linear-gradient(135deg, #e6cf94 0%, #c9a24b 55%, #8a6d2c 100%)"
          : "transparent"
      }}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-full bg-base-800 font-semibold text-zinc-200"
        style={{ fontSize }}
        aria-hidden="true"
      >
        {initial}
      </div>
    </div>
  );
}
