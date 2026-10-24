import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-stone-300",
  secondary: "bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100 disabled:text-stone-400",
  danger: "bg-white text-red-700 ring-1 ring-red-300 hover:bg-red-50",
  ghost: "text-stone-700 hover:bg-stone-100",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${variants[variant]} ${extra}`;
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
  "block rounded-md border border-stone-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none";

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
      <span className="text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-stone-200 bg-white p-4 shadow-sm ${className}`}>{children}</div>
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
        <h1 className="text-2xl font-semibold text-stone-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-stone-600">{description}</p>}
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
    stone: "bg-stone-100 text-stone-700",
    green: "bg-green-100 text-green-800",
    amber: "bg-amber-100 text-amber-800",
    blue: "bg-blue-100 text-blue-800",
    red: "bg-red-100 text-red-800",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
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
  return <div className={`rounded-md border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}
