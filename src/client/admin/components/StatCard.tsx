import { ReactNode } from "react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: ReactNode;
  tone?: "default" | "accent" | "warning" | "danger";
  hint?: string;
}

const TONE_STYLES: Record<NonNullable<StatCardProps["tone"]>, { iconBg: string; iconText: string }> = {
  default: { iconBg: "bg-base-800", iconText: "text-zinc-300" },
  accent: { iconBg: "bg-highlight-500/15", iconText: "text-highlight-400" },
  warning: { iconBg: "bg-amber-50", iconText: "text-amber-700" },
  danger: { iconBg: "bg-red-50", iconText: "text-red-700" }
};

export default function StatCard({ label, value, icon, tone = "default", hint }: StatCardProps) {
  const styles = TONE_STYLES[tone];
  return (
    <div className="rounded-xl border border-base-700/60 bg-base-900 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</span>
        {icon && (
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${styles.iconBg} ${styles.iconText}`}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-50">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}
