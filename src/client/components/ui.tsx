import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "focus-ring inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-accent-500 text-base-950 hover:bg-accent-400",
    secondary: "border border-base-600 text-zinc-100 hover:border-accent-500 hover:text-accent-300",
    ghost: "text-zinc-400 hover:text-zinc-100"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-base-700 bg-base-900 p-6 ${className}`}>{children}</div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">Loading…</div>
  );
}
