"use client";
// /panic: calm triage for "too much due, too little time" (CLAUDE.md §5.6).
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useRef, useState } from "react";
import { Callout, EmptyState, HowItWorks, PageHeader } from "@/components/kit";
import { MascotBubble } from "@/components/Tick";
import { buttonPrimary, card, input, label, page } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { triage, type TriageLabel } from "@/lib/panic";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

const BADGE: Record<TriageLabel, { text: string; className: string }> = {
  full: { text: "Do fully", className: "border-success-line bg-success-soft text-success" },
  "minimum viable": { text: "Minimum viable", className: "border-warn-line bg-warn-bg text-warn-ink" },
  skip: { text: "Skip for now", className: "border-line bg-surface-2 text-ink" },
};

export function PanicView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Panic mode</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <PanicContent />;
}

function PanicContent() {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const [today] = useState(todayISO);
  const [hoursText, setHoursText] = useState("6");
  const [windowHours, setWindowHours] = useState(48);
  const resultRef = useRef<HTMLElement>(null);

  if (courses.length === 0) {
    return (
      <main id="main" className={page}>
        <PageHeader back={{ href: "/app", label: "Today" }} title="Panic mode" />
        <EmptyState
          title="Nothing to triage yet"
          action={
            <Link href="/app" className={buttonPrimary}>
              Add a deadline
            </Link>
          }
        >
          Panic mode sorts out what&apos;s due in the next few days. Add your deadlines first.
        </EmptyState>
      </main>
    );
  }

  const parsed = Number(hoursText.replace(",", "."));
  const hoursValid = hoursText.trim() !== "" && Number.isFinite(parsed) && parsed >= 0 && parsed <= windowHours;
  const result = triage({
    deliverables,
    courses,
    today,
    hoursAvailable: hoursValid ? parsed : 0,
    windowHours,
  });

  return (
    <main id="main" className={page}>
      <PageHeader
        back={{ href: "/app", label: "Today" }}
        title="Panic mode"
        description="Too much due and not enough time? Tell us how many hours you really have, and we'll sort your deadlines into what to finish, what to do quickly, and what can wait."
      />
      <Callout tone="danger" title="Take a breath first">
        Panicking costs more time than it saves. Fill in the two boxes below, then follow the list from top to bottom —
        one thing at a time.
      </Callout>
      <div className="mt-4">
        <MascotBubble message="Okay. Breathe in, breathe out. We'll do the most valuable things first — one at a time." />
      </div>

      <form
        className={`${card} mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}
        aria-describedby="panic-help"
        onSubmit={(e) => {
          e.preventDefault();
          resultRef.current?.focus();
        }}
      >
        <div>
          <label htmlFor="panic-hours" className={label}>
            Hours I can really work
          </label>
          <input
            id="panic-hours"
            type="number"
            min={0}
            max={windowHours}
            step={0.5}
            inputMode="decimal"
            className={`${input} ${hoursValid ? "" : "border-danger"}`}
            value={hoursText}
            aria-invalid={!hoursValid}
            aria-describedby={hoursValid ? undefined : "panic-hours-error"}
            onChange={(e) => setHoursText(e.target.value)}
          />
          {!hoursValid && (
            <p id="panic-hours-error" className="mt-1 text-sm text-danger">
              Enter a number between 0 and {windowHours}.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="panic-window" className={label}>
            Looking ahead
          </label>
          <select
            id="panic-window"
            className={input}
            value={windowHours}
            onChange={(e) => setWindowHours(Number(e.target.value))}
          >
            <option value={24}>Next 24 hours</option>
            <option value={48}>Next 48 hours</option>
            <option value={72}>Next 72 hours</option>
          </select>
        </div>
        <button type="submit" data-testid="panic-button" className={buttonPrimary}>
          Show my triage
        </button>
      </form>

      <section
        ref={resultRef}
        tabIndex={-1}
        data-testid="panic-result"
        aria-labelledby="triage-title"
        aria-live="polite"
        className="mt-6"
      >
        <h2 id="triage-title" className="text-lg font-semibold">
          Your plan for the next {windowHours} hours
        </h2>
        {result.items.length === 0 ? (
          <p className={`${card} mt-3`}>
            Nothing is due in the next {windowHours} hours. You&apos;re not behind — maybe you&apos;re just tired.
            A short walk or an early night might help more than studying.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Everything due adds up to about {result.hoursNeeded}h. With {result.hoursAvailable}h, this plan uses{" "}
              {result.hoursPlanned}h — in this order:
            </p>
            <ol className="mt-3 space-y-3">
              {result.items.map((item, i) => (
                <li key={item.deliverableId} className={`${card} flex gap-3`}>
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold"
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.title}</h3>
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${BADGE[item.label].className}`}>
                        {BADGE[item.label].text}
                        {item.hours > 0 && ` · ${item.hours}h`}
                      </span>
                    </div>
                    <p className="text-sm text-muted">
                      {item.courseName} · {item.weight}% · due {format(parseISO(item.dueDate), "EEE d MMM")}
                    </p>
                    <p className="mt-1 text-sm">{item.reason}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-sm text-muted">
              Skipping something isn&apos;t failing — it&apos;s choosing. If a deadline really can&apos;t be met, a short,
              honest email to your professor asking for an extension is completely okay.
            </p>
          </>
        )}
      </section>

      <div id="panic-help" className="mt-6">
        <HowItWorks title="How the triage works">
          <p>
            We look at everything due in the window you chose and rank it by <span className="font-medium">grade points
            per hour</span>: how much of your grade it&apos;s worth, divided by the hours it still needs.
          </p>
          <p>
            Your hours go to the best-value work first. <span className="font-medium">Do fully</span> means there&apos;s
            time to finish it properly; <span className="font-medium">Minimum viable</span> means do the essentials (we
            say which); <span className="font-medium">Skip for now</span> means let it go or ask for an extension.
          </p>
        </HowItWorks>
      </div>
    </main>
  );
}
