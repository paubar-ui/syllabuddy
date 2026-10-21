"use client";
// /app — the main screen: add a deadline (the core feature), the coach's line, progress,
// today's study blocks and all your deadlines. Every section explains what to do there.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { Callout, CourseDot, HowItWorks, PageHeader } from "@/components/kit";
import { SessionDetail } from "@/components/SessionDetail";
import { MascotBubble } from "@/components/Tick";
import { AddDeadline, DeadlineList } from "@/components/today/Deadlines";
import { buttonPrimary, buttonSecondary, card, page } from "@/components/ui";
import { detectBurnout } from "@/lib/burnout";
import {
  comingUp,
  getAheadSuggestion,
  greeting,
  headsUp,
  summaryLine,
  todayTimeline,
  yesterdayStats,
  type HeadsUp,
} from "@/lib/briefing";
import { daysBetween, describeDaysAway, todayISO } from "@/lib/dates";
import { blockPoints } from "@/lib/gamification";
import { weeklyStats } from "@/lib/leaderboard";
import { isExam } from "@/lib/examPlan";
import { getMascotMessage, pickSituation } from "@/lib/mascot";
import { blockDetail } from "@/lib/sessionDetail";
import { classesOn, studyStartMinute } from "@/lib/blackboard";
import { useStore } from "@/lib/store";
import type { Deliverable, StudyBlock } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";

export function TodayView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="mt-2 text-muted">Loading your plan…</p>
      </main>
    );
  }
  return <TodayContent />;
}

function TodayContent() {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const blocks = useStore((s) => s.blocks);
  const gamification = useStore((s) => s.gamification);
  const warnings = useStore((s) => s.warnings);
  const isDemo = useStore((s) => s.isDemo);
  const toggleBlock = useStore((s) => s.toggleBlock);
  const settleDays = useStore((s) => s.settleDays);
  const replanIfNeeded = useStore((s) => s.replanIfNeeded);
  const protectTonight = useStore((s) => s.protectTonight);
  const lastReplan = useStore((s) => s.lastReplan);
  const availability = useStore((s) => s.availability);
  const [announcement, setAnnouncement] = useState("");
  const [replanDismissed, setReplanDismissed] = useState(false);
  const displayName = useStore((s) => s.displayName);
  const calendar = useStore((s) => s.calendar);
  const [hour] = useState(() => new Date().getHours());
  const [detailId, setDetailId] = useState<string | null>(null);

  // "Today" is read once per visit, so the page doesn't change under you at midnight.
  const [today] = useState(todayISO);

  // Once per visit: check the streak, then move any missed blocks back into the plan.
  useEffect(() => {
    settleDays(today);
    replanIfNeeded(today);
    // Study Buddies: quietly share this week's points/streak/hours if you've joined.
    import("@/lib/buddies").then(({ buddiesConfigured, syncIfSignedIn }) => {
      if (buddiesConfigured) syncIfSignedIn(weeklyStats(useStore.getState().gamification, today));
    });
  }, [settleDays, replanIfNeeded, today]);

  const deliverableById = useMemo(() => new Map(deliverables.map((d) => [d.id, d])), [deliverables]);
  const dateLine = format(parseISO(today), "EEEE d MMMM");

  if (courses.length === 0) {
    return (
      <main id="main" className={page}>
        <PageHeader
          eyebrow={dateLine}
          title="Welcome to Syllabuddy"
          description="Let's set up your semester. Add your first deadline below — Syllabuddy turns it into small daily study blocks so you never have to cram."
        />
        <AddDeadline today={today} />
        <section aria-labelledby="start-title" className={`${card} mt-6`}>
          <h2 id="start-title" className="font-semibold">
            Three ways to get started
          </h2>
          <ol className="mt-3 space-y-3 text-sm">
            <li className="flex gap-3">
              <Step n={1} />
              <span>
                <span className="font-medium">Add a deadline above.</span>{" "}
                <span className="text-muted">
                  Just the title is enough, like “Statistics quiz”. You can set the date, course and weight under “More
                  options”.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <Step n={2} />
              <span>
                <span className="font-medium">Add your courses.</span>{" "}
                <span className="text-muted">
                  Name each course, say how hard it is for you and add its deadlines — the plan is built around them.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <Step n={3} />
              <span>
                <span className="font-medium">Just looking?</span>{" "}
                <span className="text-muted">
                  Load four sample courses to see how a full semester plan works. You can replace them any time.
                </span>
              </span>
            </li>
          </ol>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link href="/courses" data-testid="start-button" className={buttonSecondary}>
              Add your courses
            </Link>
            <DemoButton label="Load a sample semester" variant="secondary" />
          </div>
        </section>
        <DeadlineList today={today} />
      </main>
    );
  }

  // Study starts at 18:00, or 15 minutes after an evening class (Blackboard calendar).
  const todayClasses = classesOn(calendar, today, courses);
  const timeline = todayTimeline(blocks, deliverables, courses, today, studyStartMinute(calendar, today) / 60);
  const todayBlocks = timeline.map((t) => t.block);
  const doneMinutes = todayBlocks.filter((b) => b.status === "done").reduce((s, b) => s + b.minutes, 0);
  const totalMinutes = todayBlocks.reduce((s, b) => s + b.minutes, 0);
  const upcomingWeek = comingUp(deliverables, courses, today, 7);
  const next = upcomingWeek[0];
  const yesterday = yesterdayStats(blocks, today);
  const missedYesterday = yesterday.total > yesterday.done;
  const getAhead = getAheadSuggestion(blocks, today);
  const getAheadDeliverable = getAhead ? deliverableById.get(getAhead.deliverableId) : undefined;

  const burnout = detectBurnout({
    history: gamification.history,
    availability,
    today,
  });
  const replannedToday = lastReplan?.date === today && lastReplan.blocks > 0;
  const protectedTonight = availability.daysOff.includes(today);
  const alerts = headsUp({
    today,
    burnout,
    protectedTonight,
    lastReplan,
    replanDismissed,
    deliverables,
    blocks,
    availability,
  });

  // On a protected evening the coach only talks about resting.
  const situation = protectedTonight
    ? "freeDay"
    : pickSituation({
        todayBlocks,
        missedYesterday,
        nextDeadlineDays: next && next.daysLeft <= 3 ? next.daysLeft : null,
        streak: gamification.streak,
        replanned: replannedToday,
        burnout: burnout.triggered,
      });
  const message = getMascotMessage(
    gamification.mascotTone,
    situation,
    {
      minutes: totalMinutes,
      count: todayBlocks.length,
      title: next?.deliverable.title,
      when:
        situation === "freeDay"
          ? getAhead
            ? describeDaysAway(daysBetween(today, getAhead.date))
            : "soon"
          : next
            ? describeDaysAway(next.daysLeft)
            : "",
      streak: gamification.streak,
    },
    today,
  );

  // Exam blocks show which day of the prep plan they are, e.g. "Day 3 · Probability".
  function examHeading(block: StudyBlock, d: Deliverable) {
    if (!isExam(d)) return null;
    const detail = blockDetail({
      block,
      deliverable: d,
      course: courses.find((c) => c.id === d.courseId),
      blocks,
      today,
    });
    return detail.examDay ? <span className="block text-xs font-semibold text-accent">{detail.heading}</span> : null;
  }

  function onToggle(blockId: string) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const wasDone = block.status === "done";
    const points = blockPoints(block.minutes, deliverableById.get(block.deliverableId)?.weight ?? 0);
    toggleBlock(blockId, today);
    setAnnouncement(wasDone ? `Unchecked. ${points} points removed.` : `Nice! +${points} points.`);
  }

  function runAction(alert: HeadsUp) {
    if (alert.action.kind === "protectTonight") {
      protectTonight(today);
      setAnnouncement("Tonight is protected. Today's study blocks were moved to other days.");
    } else if (alert.action.kind === "dismissReplan") {
      setReplanDismissed(true);
    }
  }

  return (
    <main id="main" className={page}>
      {/* ---------------- Daily briefing ---------------- */}
      <section
        data-testid="daily-briefing"
        aria-labelledby="briefing-title"
        className="rounded-2xl border border-line bg-surface p-4 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm text-muted">{dateLine}</p>
            <h1 id="briefing-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting(hour, displayName)}
            </h1>
          </div>
          {isDemo && (
            <p className="rounded-md border border-info-line bg-info-soft px-2.5 py-1 text-xs font-medium text-info-ink">
              Sample semester ·{" "}
              <Link href="/courses" className="underline underline-offset-2 hover:no-underline">
                add my own courses
              </Link>
            </p>
          )}
        </div>
        <p className="mt-1 text-muted">{summaryLine(timeline, next)}</p>

        {/* Progress */}
        <dl className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="Day streak" testId="streak-count" value={gamification.streak} tone="warn" />
          <Stat label="Points" testId="points-count" value={gamification.points} tone="accent" />
          <Stat label="Streak freezes" value={gamification.streakFreezes} tone="info" />
        </dl>
        <p className="mt-2 text-xs text-muted">
          {yesterday.total > 0
            ? `Yesterday you did ${yesterday.done} of ${yesterday.total} block${yesterday.total === 1 ? "" : "s"}. `
            : ""}
          Finish all of today&apos;s blocks to grow your streak.{" "}
          <Link href="/buddies" className="font-medium text-accent underline underline-offset-2 hover:no-underline">
            See the leaderboard
          </Link>
        </p>

        {/* Heads up */}
        {(alerts.length > 0 || protectedTonight) && (
          <div className="mt-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Heads up</h2>
            <div className="mt-2 space-y-2">
              {protectedTonight && (
                <Callout tone="success" role="status" title="Tonight is protected">
                  No study planned today — enjoy your evening. Your blocks were moved to other days.
                </Callout>
              )}
              {alerts.map((alert) => (
                <Callout
                  key={alert.id}
                  tone={alert.tone}
                  title={alert.title}
                  action={
                    alert.action.kind === "link" ? (
                      <Link href={alert.action.href} className={buttonSecondary}>
                        {alert.action.label}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => runAction(alert)}
                        className={alert.action.kind === "protectTonight" ? buttonPrimary : buttonSecondary}
                      >
                        {alert.action.label}
                      </button>
                    )
                  }
                >
                  {alert.text}
                </Callout>
              ))}
            </div>
          </div>
        )}

        {/* Today's timeline */}
        <div className="mt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="today-blocks" className="text-sm font-semibold uppercase tracking-wider text-muted">
              Today&apos;s plan
            </h2>
            {totalMinutes > 0 && (
              <p className="text-xs text-muted">
                {doneMinutes} of {totalMinutes} min done
              </p>
            )}
          </div>
          {totalMinutes > 0 && (
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
              role="progressbar"
              aria-label="Today's progress"
              aria-valuemin={0}
              aria-valuemax={totalMinutes}
              aria-valuenow={doneMinutes}
            >
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${(doneMinutes / totalMinutes) * 100}%` }}
              />
            </div>
          )}
          {todayClasses.length > 0 && (
            <div className="mt-2 rounded-lg border border-dashed border-line bg-surface-2 px-3 py-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Your classes today</p>
              <ul className="mt-1 space-y-0.5">
                {todayClasses.map((c) => (
                  <li key={`${c.key}-${c.start}`} className="flex gap-3">
                    <span className="w-24 shrink-0 tabular-nums text-muted">
                      {c.async ? "Online" : `${c.start}–${c.end}`}
                    </span>
                    <span className="min-w-0 break-words">
                      {c.name}
                      {c.number > 0 && <span className="text-muted"> · Ses. {c.number}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul data-testid="today-list" aria-labelledby="today-blocks" className="mt-2 divide-y divide-line">
            {timeline.length === 0 && (
              <li className="py-3">
                <p className="font-medium">Free day</p>
                <p className="text-sm text-muted">
                  {protectedTonight
                    ? "Rest is part of the plan."
                    : "Nothing planned today. Rest, or get a little ahead if you feel like it."}
                </p>
                {!protectedTonight && getAhead && getAheadDeliverable && (
                  <Link href={`/focus/${getAhead.id}`} className={`${buttonSecondary} mt-2`}>
                    Get ahead: {getAheadDeliverable.title} ({getAhead.minutes} min)
                  </Link>
                )}
              </li>
            )}
            {timeline.map(({ block, start, title, courseName, color }) => {
              const done = block.status === "done";
              const d = deliverableById.get(block.deliverableId);
              const dueIn = d ? daysBetween(today, d.dueDate) : null;
              const inputId = `block-${block.id}`;
              return (
                <li key={block.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-11 shrink-0 text-xs tabular-nums text-muted">{start}</span>
                  <input
                    id={inputId}
                    type="checkbox"
                    data-testid={`block-checkbox-${block.id}`}
                    checked={done}
                    onChange={() => onToggle(block.id)}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <label htmlFor={inputId} className="sr-only">
                    Mark {title} as done
                  </label>
                  <button
                    type="button"
                    data-testid={`block-open-${block.id}`}
                    onClick={() => setDetailId(block.id)}
                    aria-haspopup="dialog"
                    className="min-w-0 flex-1 rounded-md text-left hover:bg-surface-2 focus-visible:bg-surface-2"
                  >
                    <span className={`block font-medium ${done ? "text-muted line-through" : ""}`}>
                      {d && examHeading(block, d)}
                      {title}
                    </span>
                    <span className="flex items-center gap-1.5 text-sm text-muted">
                      <CourseDot color={color} />
                      {courseName}
                      {dueIn !== null && ` · due ${describeDaysAway(dueIn)}`}
                    </span>
                  </button>
                  <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-medium tabular-nums">
                      {block.minutes} min
                    </span>
                    {!done && (
                      <Link
                        href={`/focus/${block.id}`}
                        aria-label={`Start a focus session for ${title}`}
                        className="rounded-md px-2 py-0.5 text-sm font-semibold text-accent hover:bg-accent-soft"
                      >
                        Focus
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {warnings.length > 0 && (
            <p className="mt-2 text-sm text-warn-ink">
              {warnings.length} deadline{warnings.length === 1 ? "" : "s"} didn&apos;t fully fit in your free time.{" "}
              <Link href="/plan" className="font-medium underline underline-offset-2 hover:no-underline">
                See details on Plan
              </Link>
            </p>
          )}
        </div>

        {/* Coming up */}
        <div className="mt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Coming up · next 7 days</h2>
          {upcomingWeek.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing due in the next 7 days.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {upcomingWeek.map(({ deliverable: d, courseName, color, daysLeft }) => (
                <li key={d.id} className="flex items-center gap-3 text-sm">
                  <span className="w-14 shrink-0 tabular-nums text-muted">{format(parseISO(d.dueDate), "EEE d")}</span>
                  <CourseDot color={color} />
                  <span className="min-w-0 flex-1 truncate">
                    {isExam(d) ? (
                      <Link
                        href={`/exam/${d.id}`}
                        className="font-medium underline underline-offset-2 hover:no-underline"
                      >
                        {d.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{d.title}</span>
                    )}
                    <span className="text-muted"> · {courseName}</span>
                  </span>
                  <span className="shrink-0 text-muted">{d.weight}%</span>
                  {daysLeft <= 1 && (
                    <span className="shrink-0 rounded-md border border-danger-line bg-danger-soft px-1.5 py-0.5 text-xs font-semibold text-danger">
                      {describeDaysAway(daysLeft)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5">
          <MascotBubble message={message} />
        </div>
      </section>

      {/* ---------------- Main action and the rest ---------------- */}
      <div className="mt-6">
        <AddDeadline today={today} />
      </div>

      <div className="mt-6">
        <Callout
          tone="danger"
          title="Too much due at once?"
          action={
            <Link href="/panic" data-testid="panic-button" className={buttonSecondary}>
              Open panic mode
            </Link>
          }
        >
          Panic mode looks at the next 48 hours and calmly tells you what to finish, what to do quickly, and what can
          wait.
        </Callout>
      </div>

      <div className="mt-4">
        <HowItWorks title="How your plan is made">
          <p>
            Every deadline gets an estimate in hours, based on its type, its weight in your grade and how hard the
            course is for you.
          </p>
          <p>
            That time is spread over the days before the deadline — a little more each day as it gets closer, never all
            on the last night — and fitted around the free time you set in Settings. Times on the plan are suggestions,
            starting at 18:00; study whenever suits you.
          </p>
          <p>
            Missed a block? It&apos;s moved forward automatically. Mark work as done on Courses and Syllabuddy learns
            how long things really take you.
          </p>
        </HowItWorks>
      </div>

      <DeadlineList today={today} />
      <SessionDetail blockId={detailId} today={today} onClose={() => setDetailId(null)} />
    </main>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
    >
      {n}
    </span>
  );
}

const STAT_TONES = {
  warn: "border-warn-line bg-warn-bg",
  accent: "border-accent-line bg-accent-soft",
  info: "border-info-line bg-info-soft",
};

function Stat({
  label,
  value,
  tone,
  testId,
}: {
  label: string;
  value: number;
  tone: keyof typeof STAT_TONES;
  testId?: string;
}) {
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${STAT_TONES[tone]}`}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}
