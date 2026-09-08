import React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

/**
 * Three button styles, one shape (rounded-md), one motion (color only, no
 * scale/shadow tricks). Primary is the only place accent-500 fills a
 * surface — everywhere else the accent only tints text, so it stays a
 * signal for "the one thing to do here" rather than decoration.
 */
export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "focus-ring inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
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
    <div className={`rounded-md border border-base-800 p-6 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-sm text-zinc-500">Loading…</div>
  );
}
