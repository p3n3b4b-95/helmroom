import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");

export function Button({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const v = {
    primary: "bg-accent text-on-accent hover:opacity-90",
    secondary: "bg-bg text-text border border-border-input hover:bg-surface",
    danger: "bg-danger text-on-accent hover:opacity-90",
    ghost: "text-accent hover:bg-surface",
  }[variant];
  return <button {...p} className={cx("inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed", v, className)} />;
}

export function Input({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx("h-10 w-full rounded-md border border-border-input bg-bg px-3 text-base", className)} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-border bg-bg p-5 shadow-card", className)}>{children}</div>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  return children ? <p role="alert" className="text-sm text-danger">{children}</p> : null;
}

export const ANSWER_COLORS = ["bg-answer-1", "bg-answer-2", "bg-answer-3", "bg-answer-4", "bg-answer-1", "bg-answer-2"];
