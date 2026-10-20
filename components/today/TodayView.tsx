"use client";
// /app — the main screen: add a deadline (the core feature), the coach's line, progress,
// today's study blocks and all your deadlines. Every section explains what to do there.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { Callout, CourseDot, EmptyState, HowItWorks, PageHeader, SectionHeader } from "@/components/kit";
import { MascotBubble } from "@/components/Tick";
import { AddDeadline, DeadlineList } from "@/components/today/Deadlines";
import { buttonPrimary, buttonSecondary, card, page } from "@/components/ui";
import { detectBurnout } from "@/lib/burnout";
import { addDaysISO, daysBetween, describeDaysAway, todayISO } from "@/lib/dates";
import { blockPoints } from "@/lib/gamification";
import { weeklyStats } from "@/lib/leaderboard";
import { getMascotMessage, pickSituation } from "@/lib/mascot";
import { formatHours } from "@/lib/scheduler";
import { useStore } from "@/lib/store";
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
  const [replanSeen, setReplanSeen] = useState(false);

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

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
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
                <span className="font-medium">Add a whole course from its syllabus.</span>{" "}
                <span className="text-muted">
                  Paste the text or upload the PDF and we find every deadline and grade weight for you.
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
            <Link href="/onboarding" data-testid="start-button" className={buttonSecondary}>
              Add a course from a syllabus
            </Link>
            <DemoButton label="Load a sample semester" variant="secondary" />
          </div>
        </section>
        <DeadlineList today={today} />
      </main>
    );
  }

  const todayBlocks = blocks.filter((b) => b.date === today);
  const doneMinutes = todayBlocks.filter((b) => b.status === "done").reduce((s, b) => s + b.minutes, 0);
  const totalMinutes = todayBlocks.reduce((s, b) => s + b.minutes, 0);
  const nextBlock = blocks.find((b) => b.date > today && b.status === "planned");
  const yesterday = addDaysISO(today, -1);
  const missedYesterday = blocks.some((b) => b.date === yesterday && b.status !== "done");
  const upcoming = deliverables
    .filter((d) => !d.done)
    .map((d) => ({ d, days: daysBetween(today, d.dueDate) }))
    .filter(({ days }) => days >= 0 && days <= 3)
    .sort((a, b) => a.days - b.days || b.d.weight - a.d.weight);

  const burnout = detectBurnout({ history: gamification.history, availability, today });
  const replannedToday = lastReplan?.date === today && lastReplan.blocks > 0;
  const protectedTonight = availability.daysOff.includes(today);
  const next = upcoming[0];
  const nextBlockDays = nextBlock ? daysBetween(today, nextBlock.date) : null;
  // On a protected evening the coach only talks about resting.
  const situation = protectedTonight
    ? "freeDay"
    : pickSituation({
        todayBlocks,
        missedYesterday,
        nextDeadlineDays: next?.days ?? null,
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
      title: next?.d.title,
      when:
        situation === "freeDay"
          ? nextBlockDays !== null
            ? describeDaysAway(nextBlockDays)
            : "soon"
          : next
            ? describeDaysAway(next.days)
            : "",
      streak: gamification.streak,
    },
    today,
  );

  function onToggle(blockId: string) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const wasDone = block.status === "done";
    const points = blockPoints(block.minutes, deliverableById.get(block.deliverableId)?.weight ?? 0);
    toggleBlock(blockId, today);
    setAnnouncement(wasDone ? `Unchecked. ${points} points removed.` : `Nice! +${points} points.`);
  }

  return (
    <main id="main" className={page}>
      <PageHeader
        eyebrow={dateLine}
        title="Today"
        description="Your plan for today. Tick off study blocks as you finish them — Syllabuddy keeps the rest of your semester on track."
      />

      <AddDeadline today={today} />

      <div className="mt-4">
        <MascotBubble message={message} />
      </div>

      {/* Progress */}
      <section aria-labelledby="progress-title" className="mt-6">
        <h2 id="progress-title" className="sr-only">
          Your progress
        </h2>
        <dl className="grid grid-cols-3 gap-3">
          <Stat label="Day streak" testId="streak-count" value={gamification.streak} tone="warn" />
          <Stat label="Points" testId="points-count" value={gamification.points} tone="accent" />
          <Stat label="Streak freezes" value={gamification.streakFreezes} tone="info" />
        </dl>
        <p className="mt-2 text-xs text-muted">
          Finish all of a day&apos;s blocks to grow your streak; every 7 days earns a freeze that protects it on a missed
          day.{" "}
          <Link href="/buddies" className="font-medium text-accent underline underline-offset-2 hover:no-underline">
            See the leaderboard
          </Link>
        </p>
      </section>

      {/* Notices */}
      <div className="mt-6 space-y-3">
        {isDemo && (
          <Callout
            tone="info"
            title="You're looking at a sample semester"
            action={
              <Link href="/onboarding" className={buttonSecondary}>
                Use my own syllabi
              </Link>
            }
          >
            Explore freely — tick blocks, try the focus timer, open Panic mode. When you&apos;re ready, add your real
            courses and the samples are replaced.
          </Callout>
        )}
        {burnout.triggered && (
          <Callout
            tone="success"
            title="Time for a breather?"
            action={
              <button
                type="button"
                onClick={() => {
                  protectTonight(today);
                  setAnnouncement("Tonight is protected. Today's study blocks were moved to other days.");
                }}
                className={buttonPrimary}
              >
                Protect tonight
              </button>
            }
          >
            {burnout.reason === "overwork"
              ? `You've studied more than your daily limit for ${burnout.days} days in a row.`
              : `You've studied ${burnout.days} days in a row without a day off.`}{" "}
            Resting tonight helps you remember more tomorrow — your plan will make room for it.
          </Callout>
        )}
        {protectedTonight && (
          <Callout tone="success" role="status" title="Tonight is protected">
            No study planned today. Enjoy your evening — your blocks were moved to other days.
          </Callout>
        )}
        {replannedToday && !replanSeen && lastReplan && (
          <Callout
            tone="info"
            role="status"
            title="Your plan was updated"
            action={
              <button type="button" onClick={() => setReplanSeen(true)} className={buttonSecondary}>
                Got it
              </button>
            }
          >
            {lastReplan.blocks} study block{lastReplan.blocks === 1 ? "" : "s"} from earlier days didn&apos;t happen —
            that&apos;s okay. The {formatHours(lastReplan.minutes)} were moved into your plan, starting today.
          </Callout>
        )}
        {warnings.length > 0 && (
          <Callout tone="warn" title={`${warnings.length} thing${warnings.length === 1 ? "" : "s"} didn't fit in your plan`}>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-1">Try adding more study time in Settings, or use Panic mode to decide what to skip.</p>
          </Callout>
        )}
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

      {/* Today's study blocks */}
      <section aria-labelledby="today-blocks" className="mt-8">
        <SectionHeader
          id="today-blocks"
          title="Today's study blocks"
          hint="Each block is one focused session for a deadline. Tick it when you're done, or press Focus to start a 25-minute timer."
          action={
            totalMinutes > 0 ? (
              <p className="text-sm text-muted">
                {doneMinutes} of {totalMinutes} min done
              </p>
            ) : undefined
          }
        />
        {totalMinutes > 0 && (
          <div
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-label="Today's progress"
            aria-valuemin={0}
            aria-valuemax={totalMinutes}
            aria-valuenow={doneMinutes}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${(doneMinutes / totalMinutes) * 100}%` }} />
          </div>
        )}

        <ul data-testid="today-list" className="space-y-2">
          {todayBlocks.length === 0 && (
            <li>
              <EmptyState title="Nothing planned today">
                {nextBlock ? (
                  <>
                    Your next study block is on{" "}
                    <span className="font-medium text-ink">{format(parseISO(nextBlock.date), "EEEE d MMMM")}</span>
                    {deliverableById.get(nextBlock.deliverableId) &&
                      ` (${deliverableById.get(nextBlock.deliverableId)?.title})`}
                    . Enjoy the breather, or get ahead on something in Plan.
                  </>
                ) : (
                  "Add a deadline above and your study blocks will appear here."
                )}
              </EmptyState>
            </li>
          )}
          {todayBlocks.map((block) => {
            const d = deliverableById.get(block.deliverableId);
            const course = d ? courseById.get(d.courseId) : undefined;
            const done = block.status === "done";
            const dueIn = d ? daysBetween(today, d.dueDate) : null;
            const inputId = `block-${block.id}`;
            return (
              <li
                key={block.id}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 sm:p-4"
                style={{ borderLeft: `4px solid ${course?.color ?? "var(--accent)"}` }}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  data-testid={`block-checkbox-${block.id}`}
                  checked={done}
                  onChange={() => onToggle(block.id)}
                  className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
                />
                <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                  <span className={`block font-medium ${done ? "text-muted line-through" : ""}`}>
                    {d?.title ?? "Study block"}
                  </span>
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <CourseDot color={course?.color} />
                    {course?.name}
                    {dueIn !== null && ` · due ${describeDaysAway(dueIn)}`}
                  </span>
                </label>
                <span className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                  <span className="rounded-md bg-surface-2 px-2 py-0.5 text-sm font-medium tabular-nums">
                    {block.minutes} min
                  </span>
                  {!done && (
                    <Link
                      href={`/focus/${block.id}`}
                      aria-label={`Start a focus session for ${d?.title ?? "this block"}`}
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
        <div className="mt-3">
          <HowItWorks title="How your plan is made">
            <p>
              Every deadline gets an estimate in hours, based on its type, its weight in your grade and how hard the course
              is for you.
            </p>
            <p>
              That time is spread over the days before the deadline — a little more each day as it gets closer, never all on
              the last night — and fitted around the free time you set in Settings.
            </p>
            <p>
              Missed a block? It&apos;s moved forward automatically. Mark work as done on Courses and Syllabuddy learns how
              long things really take you.
            </p>
          </HowItWorks>
        </div>
      </section>

      <DeadlineList today={today} />
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
