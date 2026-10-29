import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 disabled:bg-slate-300 disabled:shadow-none",
  secondary:
    "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 disabled:text-slate-400",
  danger: "bg-white text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50",
  ghost: "text-slate-700 hover:bg-slate-100",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed ${variants[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const fieldBase =
  "block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-xs transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none";

/** Full width unless the caller sets its own width (e.g. "w-28"). */
const fieldClass = (className: string) =>
  `${fieldBase} ${/(^|\s)w-/.test(className) ? "" : "w-full"} ${className}`;

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={fieldClass(className)} {...props} />;
}

export function Select({ className = "", ...props }: ComponentProps<"select">) {
  return <select className={fieldClass(className)} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={fieldClass(className)} {...props} />;
}

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgb(15_23_42/0.04),0_12px_32px_-20px_rgb(15_23_42/0.18)] ${className}`}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "stone",
}: {
  children: ReactNode;
  tone?: "stone" | "green" | "amber" | "blue" | "red";
}) {
  const tones = {
    stone: "bg-slate-100 text-slate-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap before:size-1.5 before:rounded-full before:bg-current before:opacity-70 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Alert({ children, tone = "red" }: { children: ReactNode; tone?: "red" | "green" | "amber" }) {
  const tones = {
    red: "border-red-200 bg-red-50 text-red-800",
    green: "border-green-200 bg-green-50 text-green-800",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}
