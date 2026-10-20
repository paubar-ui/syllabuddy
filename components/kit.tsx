// Small building blocks that make every page explain itself:
// a page header with a one-line description, coloured callouts, "How this works" fold-outs,
// section headers with a hint, helpful empty states and back links.
import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
  back,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  back?: { href: string; label: string };
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-6">
      {back && <BackLink href={back.href} label={back.label} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="text-sm text-muted">{eyebrow}</p>}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">
      <span aria-hidden="true">←</span> {label}
    </Link>
  );
}

export type CalloutTone = "info" | "success" | "warn" | "danger" | "accent";

const TONES: Record<CalloutTone, string> = {
  info: "border-info-line bg-info-soft",
  success: "border-success-line bg-success-soft",
  warn: "border-warn-line bg-warn-bg",
  danger: "border-danger-line bg-danger-soft",
  accent: "border-accent-line bg-accent-soft",
};

const TITLE_TONES: Record<CalloutTone, string> = {
  info: "text-info-ink",
  success: "text-success",
  warn: "text-warn-ink",
  danger: "text-danger",
  accent: "text-accent",
};

/** A tinted box for one kind of message, with an optional action on the right. */
export function Callout({
  tone,
  title,
  children,
  action,
  role,
  className = "",
}: {
  tone: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
  className?: string;
}) {
  return (
    <div role={role} className={`rounded-xl border px-4 py-3 ${TONES[tone]} ${className}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 text-sm">
          {title && <p className={`font-semibold ${TITLE_TONES[tone]}`}>{title}</p>}
          {children && <div className={title ? "mt-0.5" : ""}>{children}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** A fold-out with a short explanation of how a feature works. */
export function HowItWorks({ title = "How this works", children }: { title?: string; children: ReactNode }) {
  return (
    <details className="group rounded-xl border border-info-line bg-info-soft px-4 py-2.5 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium text-info-ink">
        <span
          aria-hidden="true"
          className="inline-block transition-transform group-open:rotate-90"
        >
          ›
        </span>
        {title}
      </summary>
      <div className="mt-2 space-y-1.5 pb-1 leading-relaxed">{children}</div>
    </details>
  );
}

/** A section title with a one-line hint about what to do there. */
export function SectionHeader({
  id,
  title,
  hint,
  action,
}: {
  id: string;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** What to do when a page or list is still empty. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface px-4 py-8 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** A small coloured dot for a course. */
export function CourseDot({ color }: { color?: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: color ?? "var(--accent)" }}
    />
  );
}
