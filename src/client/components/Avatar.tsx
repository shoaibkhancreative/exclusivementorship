interface AvatarProps {
  label: string;
  premium?: boolean;
  size?: number;
}

export function Avatar({ label, premium = false, size = 36 }: AvatarProps) {
  const initial = label.trim().charAt(0).toUpperCase() || "?";
  const fontSize = Math.max(11, Math.round(size * 0.4));

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${premium ? "bg-highlight-500 p-0.5" : "bg-transparent p-0"}`}
      style={{ width: size, height: size }}
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
