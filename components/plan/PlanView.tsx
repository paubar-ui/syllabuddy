"use client";
// /plan: one week at a time, a semester workload heatmap, and calendar export.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useMemo, useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { Tick } from "@/components/Tick";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { addDaysISO, todayISO } from "@/lib/dates";
import { buildIcs } from "@/lib/ics";
import { heatLevel, weekDays, weeksBetween, weekStart, workloadByDay } from "@/lib/plan";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

const pretty = (iso: string, pattern: string) => format(parseISO(iso), pattern);
const hoursText = (minutes: number) =>
  minutes === 0 ? "free" : minutes < 60 ? `${minutes} min` : `${Math.round((minutes / 60) * 10) / 10}h`;

// Heat colours: the accent colour at increasing strength (works in light and dark mode).
const HEAT = [
  "var(--surface)",
  "color-mix(in srgb, var(--accent) 22%, var(--surface))",
  "color-mix(in srgb, var(--accent) 45%, var(--surface))",
  "color-mix(in srgb, var(--accent) 70%, var(--surface))",
  "var(--accent)",
];

export function PlanView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 md:pb-10" aria-busy="true">
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="mt-2 text-muted">Loading your plan…</p>
      </main>
    );
  }
  return <PlanContent />;
}

function PlanContent() {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const blocks = useStore((s) => s.blocks);
  const warnings = useStore((s) => s.warnings);
  const [today] = useState(todayISO);
  const [monday, setMonday] = useState(() => weekStart(today));
  const [exported, setExported] = useState<string | null>(null);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const deliverableById = useMemo(() => new Map(deliverables.map((d) => [d.id, d])), [deliverables]);
  const load = useMemo(() => workloadByDay(blocks, deliverables), [blocks, deliverables]);

  if (courses.length === 0) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-28 text-center md:pb-10">
        <Tick size={96} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-bold">No plan yet</h1>
        <p className="mt-2 text-muted">Add your syllabi first, or try the demo semester.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoButton />
          <Link href="/onboarding" className={buttonSecondary}>
            Start with my syllabi
          </Link>
        </div>
      </main>
    );
  }

  function exportCalendar() {
    const ics = buildIcs({ courses, deliverables, blocks, now: new Date() });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "syllabuddy.ics";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const planned = blocks.filter((b) => b.status === "planned").length;
    setExported(
      `Downloaded syllabuddy.ics with ${planned} study blocks and ${deliverables.filter((d) => !d.done).length} deadlines. Import it in Google Calendar via Settings → Import & export.`,
    );
  }

  const days = weekDays(monday);
  const weekMinutes = days.reduce((s, d) => s + (load.get(d)?.minutes ?? 0), 0);

  const lastDate = [...blocks.map((b) => b.date), ...deliverables.map((d) => d.dueDate)].sort().pop() ?? today;
  const weeks = weeksBetween(today, lastDate);
  const maxMinutes = Math.max(0, ...[...load.values()].map((l) => l.minutes));

  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 md:pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Plan</h1>
        <button type="button" data-testid="export-ics-button" onClick={exportCalendar} className={buttonPrimary}>
          Export to calendar
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-sm text-muted">
        {exported}
      </p>

      {/* ---------------- Week view ---------------- */}
      <section aria-labelledby="week-title" className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="week-title" className="text-lg font-semibold">
              Week of {pretty(monday, "d MMMM")}
            </h2>
            <p className="text-sm text-muted">{hoursText(weekMinutes)} planned this week</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMonday(addDaysISO(monday, -7))} className={buttonSecondary}>
              <span aria-hidden="true">←</span>
              <span className="sr-only">Previous week</span>
            </button>
            <button
              type="button"
              onClick={() => setMonday(weekStart(today))}
              disabled={monday === weekStart(today)}
              className={buttonSecondary}
            >
              This week
            </button>
            <button type="button" onClick={() => setMonday(addDaysISO(monday, 7))} className={buttonSecondary}>
              <span aria-hidden="true">→</span>
              <span className="sr-only">Next week</span>
            </button>
          </div>
        </div>

        <ol className="mt-4 grid gap-3 md:grid-cols-7">
          {days.map((day) => {
            const dayBlocks = blocks.filter((b) => b.date === day);
            const due = deliverables.filter((d) => !d.done && d.dueDate === day);
            const isToday = day === today;
            return (
              <li
                key={day}
                aria-current={isToday ? "date" : undefined}
                className={`rounded-2xl border bg-surface p-3 ${isToday ? "border-accent border-2" : "border-line"} ${
                  day < today ? "opacity-70" : ""
                }`}
              >
                <h3 className="flex items-baseline justify-between gap-2 md:block">
                  <span className="font-semibold">
                    {pretty(day, "EEE d")}
                    {isToday && <span className="ml-1 text-xs font-medium text-accent">today</span>}
                  </span>
                  <span className="block text-xs text-muted">{hoursText(load.get(day)?.minutes ?? 0)}</span>
                </h3>
                <ul className="mt-2 space-y-1.5">
                  {due.map((d) => (
                    <li key={d.id} className="rounded-lg bg-danger-soft px-2 py-1 text-xs font-semibold text-danger">
                      Due: {d.title}
                    </li>
                  ))}
                  {dayBlocks.map((b) => {
                    const d = deliverableById.get(b.deliverableId);
                    const course = d ? courseById.get(d.courseId) : undefined;
                    return (
                      <li
                        key={b.id}
                        className="rounded-lg border border-line px-2 py-1 text-xs"
                        style={{ borderLeft: `4px solid ${course?.color ?? "var(--accent)"}` }}
                      >
                        <span className={`block font-medium ${b.status === "done" ? "line-through" : ""}`}>
                          {d?.title ?? "Study block"}
                        </span>
                        <span className="text-muted">
                          {b.minutes} min
                          {b.status === "done" && " · done"}
                          {b.status === "missed" && " · missed"}
                        </span>
                      </li>
                    );
                  })}
                  {dayBlocks.length === 0 && due.length === 0 && <li className="text-xs text-muted">Free</li>}
                </ul>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ---------------- Heatmap ---------------- */}
      <section aria-labelledby="heatmap-title" className={`${card} mt-8`}>
        <h2 id="heatmap-title" className="text-lg font-semibold">
          Semester workload
        </h2>
        <p className="mt-1 text-sm text-muted">
          Darker days have more study time. A dot marks a deadline. Select a week to see it above.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="border-separate border-spacing-1 text-xs">
            <caption className="sr-only">Planned study time per day, one row per week</caption>
            <thead>
              <tr>
                <th scope="col" className="pr-2 text-left font-medium text-muted">
                  Week
                </th>
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <th key={d} scope="col" className="w-8 font-medium text-muted">
                    <abbr title={d} className="no-underline">
                      {d[0]}
                    </abbr>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week}>
                  <th scope="row" className="pr-2 text-left font-normal whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setMonday(week)}
                      aria-pressed={week === monday}
                      className={`rounded px-1 hover:underline ${week === monday ? "font-semibold text-accent" : "text-muted"}`}
                    >
                      {pretty(week, "d MMM")}
                    </button>
                  </th>
                  {weekDays(week).map((day) => {
                    const l = load.get(day) ?? { minutes: 0, deadlines: 0 };
                    const level = heatLevel(l.minutes, maxMinutes);
                    const description = `${pretty(day, "EEEE d MMMM")}: ${hoursText(l.minutes)}${
                      l.deadlines ? `, ${l.deadlines} deadline${l.deadlines === 1 ? "" : "s"}` : ""
                    }`;
                    return (
                      <td key={day} className="p-0">
                        <div
                          title={description}
                          className={`relative h-8 w-8 rounded-md border ${day === today ? "border-2 border-ink" : "border-line"}`}
                          style={{ background: HEAT[level] }}
                        >
                          <span className="sr-only">{description}</span>
                          {l.deadlines > 0 && (
                            <span
                              aria-hidden="true"
                              className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-danger"
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted" aria-hidden="true">
          <span>Less</span>
          {HEAT.map((bg, i) => (
            <span key={i} className="h-4 w-4 rounded border border-line" style={{ background: bg }} />
          ))}
          <span>More</span>
          <span className="ml-3 inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-danger" /> Deadline
          </span>
        </div>
      </section>

      {warnings.length > 0 && (
        <details className="mt-8 rounded-xl bg-warn-bg px-4 py-3 text-warn-ink">
          <summary className="cursor-pointer font-medium">
            {warnings.length} thing{warnings.length === 1 ? "" : "s"} didn&apos;t fit in your plan
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      )}
    </main>
  );
}
