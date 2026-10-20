"use client";
// /panic: calm triage for "too much due, too little time" (CLAUDE.md §5.6).
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useRef, useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { MascotBubble, Tick } from "@/components/Tick";
import { buttonLink, buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { triage, type TriageLabel } from "@/lib/panic";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

const BADGE: Record<TriageLabel, { text: string; className: string }> = {
  full: { text: "Do fully", className: "bg-success-soft text-success" },
  "minimum viable": { text: "Minimum viable", className: "bg-warn-bg text-warn-ink" },
  skip: { text: "Skip for now", className: "bg-line text-ink" },
};

export function PanicView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10" aria-busy="true">
        <h1 className="text-2xl font-bold">Panic mode</h1>
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
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-28 text-center md:pb-10">
        <Tick size={96} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-bold">Panic mode</h1>
        <p className="mt-2 text-muted">Add your courses first — or try the demo to see how triage works.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoButton />
          <Link href="/onboarding" className={buttonSecondary}>
            Start with my syllabi
          </Link>
        </div>
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
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10">
      <Link href="/app" className={`${buttonLink} text-sm`}>
        ← Back to today
      </Link>
      <h1 className="mt-3 text-2xl font-bold sm:text-3xl">Panic mode</h1>
      <div className="mt-4">
        <MascotBubble message="Okay. Breathe in, breathe out. We'll do the most valuable things first — one at a time." />
      </div>

      <form
        className={`${card} mt-6 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end`}
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
            Nothing is due in the next {windowHours} hours. 🎉 You&apos;re not behind — maybe you&apos;re just tired.
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
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[item.label].className}`}>
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
    </main>
  );
}
