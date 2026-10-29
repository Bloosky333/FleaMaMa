import Link from "next/link";
import type { ReactNode } from "react";
import { Store } from "lucide-react";

export function LogoMark({ className = "size-9" }: { className?: string }) {
  return (
    <span
      className={`bg-brand-600 shadow-brand-600/30 flex shrink-0 items-center justify-center rounded-xl text-white shadow-md ${className}`}
    >
      <Store className="size-1/2" strokeWidth={2} aria-hidden />
    </span>
  );
}

/** Frame of the exhibitors' pages: header, hero band, content, footer. */
export function PublicShell({
  name,
  eyebrow,
  title,
  subtitle,
  width = "max-w-5xl",
  children,
}: {
  /** Organiser name shown in the header and footer (may be empty). */
  name: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className={`mx-auto flex h-16 items-center gap-3 px-4 ${width}`}>
          <LogoMark />
          <span className="font-display text-lg font-extrabold tracking-tight">{name || "Brocante"}</span>
        </div>
      </header>
      <section className="bg-dots relative overflow-hidden border-b border-slate-200 bg-white">
        <div
          aria-hidden
          className="bg-brand-600 absolute -top-24 right-[8%] hidden size-80 rounded-full md:block"
        />
        <div
          aria-hidden
          className="bg-brand-100 absolute right-[28%] -bottom-24 hidden size-48 rounded-full md:block"
        />
        <div className={`relative mx-auto px-4 pt-10 pb-12 ${width}`}>
          {eyebrow && (
            <div className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display mt-3 max-w-2xl text-4xl font-extrabold tracking-tight text-slate-900 md:text-6xl">
            {title}
          </h1>
          {subtitle && <p className="mt-3 max-w-2xl text-lg text-slate-600">{subtitle}</p>}
        </div>
      </section>
      <main className={`mx-auto w-full flex-1 px-4 py-8 ${width}`}>{children}</main>
      <footer
        className={`mx-auto flex w-full justify-between gap-4 px-4 pb-8 text-xs text-slate-500 ${width}`}
      >
        <span>{name}</span>
        <Link href="/admin" className="hover:text-slate-900 hover:underline">
          Espace organisateurs
        </Link>
      </footer>
    </div>
  );
}

/** Small centred card on a dotted background (login, first setup). */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="bg-dots flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_48px_-32px_rgb(15_23_42/0.35)]">
          {children}
        </div>
      </div>
    </main>
  );
}
