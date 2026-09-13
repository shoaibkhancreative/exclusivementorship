import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "focus-ring inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium transition-colors duration-150 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
  const variants: Record<string, string> = {
    primary: "bg-accent-500 text-base-950 hover:bg-accent-400",
    secondary: "border border-base-700 text-zinc-200 hover:border-base-600 hover:bg-base-900",
    ghost: "text-zinc-400 hover:text-zinc-100"
  };
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}

type CardProps = React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode; className?: string };

export function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div className={`rounded-md border border-base-800 bg-base-900/40 p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">
      <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-base-700 border-t-accent-500" />
      <span className="ml-2.5">Loading…</span>
    </div>
  );
}
