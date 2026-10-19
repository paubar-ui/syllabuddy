"use client";
// The main daily screen: Tick's message, streak & points, today's study blocks, deadlines in the next 72h.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { MascotBubble, Tick } from "@/components/Tick";
import { buttonLink, buttonPrimary, buttonSecondary, card } from "@/components/ui";
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
  if (!hydrated) return <TodaySkeleton />;
  return <TodayContent />;
}

function TodaySkeleton() {
  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10" aria-busy="true">
      <h1 className="text-2xl font-bold">Today</h1>
      <p className="mt-2 text-muted">Loading your plan…</p>
    </main>
  );
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
    // Study Buddies: quietly share this week's points/streak/hours if you're logged in.
    // Loaded on demand, so the Supabase code isn't downloaded by people who never use it.
    import("@/lib/buddies").then(({ buddiesConfigured, syncIfSignedIn }) => {
      if (buddiesConfigured) syncIfSignedIn(weeklyStats(useStore.getState().gamification, today));
    });
  }, [settleDays, replanIfNeeded, today]);

  const courseById = useMemo(() => new Map(courses.map((c) => [c.id, c])), [courses]);
  const deliverableById = useMemo(() => new Map(deliverables.map((d) => [d.id, d])), [deliverables]);

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

  if (courses.length === 0) {
    return (
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-28 text-center md:pb-10">
        <Tick size={96} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-bold">No plan yet</h1>
        <p className="mt-2 text-muted">Add your syllabi to get a daily plan, or look around with a demo semester.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <DemoButton />
          <Link href="/onboarding" data-testid="start-button" className={buttonSecondary}>
            Start with my syllabi
          </Link>
        </div>
      </main>
    );
  }

  const burnout = detectBurnout({ history: gamification.history, availability, today });
  const replannedToday = lastReplan?.date === today && lastReplan.blocks > 0;
  const protectedTonight = availability.daysOff.includes(today);
  const next = upcoming[0];
  const nextBlockDays = nextBlock ? daysBetween(today, nextBlock.date) : null;
  // On a protected evening Tick only talks about resting.
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
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 pb-28 md:pb-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Today</h1>
          <p className="text-muted">{format(parseISO(today), "EEEE d MMMM")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDemo && (
            <p className="rounded-full bg-accent-soft px-3 py-1 text-sm">
              Demo semester ·{" "}
              <Link href="/onboarding" className={buttonLink}>
                use my own syllabi
              </Link>
            </p>
          )}
          <Link
            href="/settings"
            className="rounded-full border border-line px-3 py-1 text-sm font-medium hover:bg-accent-soft md:hidden"
          >
            <span aria-hidden="true">⚙ </span>Settings
          </Link>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-3">
        <Stat label="Day streak" testId="streak-count" value={gamification.streak} icon="🔥" />
        <Stat label="Points" testId="points-count" value={gamification.points} icon="⭐" />
        <Stat label="Streak freezes" value={gamification.streakFreezes} icon="🧊" />
      </dl>

      <div className="mt-6">
        <MascotBubble message={message} />
      </div>

      {burnout.triggered && (
        <section aria-labelledby="burnout-title" className="mt-4 rounded-2xl border border-line bg-success-soft p-4">
          <h2 id="burnout-title" className="font-semibold">
            Time for a breather?
          </h2>
          <p className="mt-1 text-sm">
            {burnout.reason === "overwork"
              ? `You've studied more than your daily limit for ${burnout.days} days in a row.`
              : `You've studied ${burnout.days} days in a row without a day off.`}{" "}
            Resting tonight helps you remember more tomorrow. Your plan will make room for it.
          </p>
          <button
            type="button"
            onClick={() => {
              protectTonight(today);
              setAnnouncement("Tonight is protected. Today's study blocks were moved to other days.");
            }}
            className={`${buttonPrimary} mt-3`}
          >
            Protect tonight
          </button>
        </section>
      )}
      {protectedTonight && (
        <p role="status" className="mt-4 rounded-2xl bg-success-soft px-4 py-3 text-sm">
          🌙 Tonight is protected — no study planned. Enjoy your evening.
        </p>
      )}

      {replannedToday && !replanSeen && lastReplan && (
        <div role="status" className="mt-4 flex items-start justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm">
          <p>
            {lastReplan.blocks} study block{lastReplan.blocks === 1 ? "" : "s"} from earlier days didn&apos;t happen —
            that&apos;s okay. I moved the {formatHours(lastReplan.minutes)} back into your plan, starting today.
          </p>
          <button type="button" onClick={() => setReplanSeen(true)} className={`${buttonLink} shrink-0`}>
            Got it
          </button>
        </div>
      )}

      <Link
        href="/panic"
        data-testid="panic-button"
        className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-sm hover:bg-accent-soft"
      >
        <span>
          <span className="block font-semibold">Panic mode</span>
          <span className="block text-sm text-muted">Too much due at once? Get a calm triage of what to do first.</span>
        </span>
        <span aria-hidden="true" className="text-xl">
          🆘
        </span>
      </Link>

      <section aria-labelledby="today-blocks" className="mt-8">
        <div className="flex items-baseline justify-between gap-2">
          <h2 id="today-blocks" className="text-lg font-semibold">
            Today&apos;s study blocks
          </h2>
          {totalMinutes > 0 && (
            <p className="text-sm text-muted">
              {doneMinutes} of {totalMinutes} min done
            </p>
          )}
        </div>
        {totalMinutes > 0 && (
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Today's progress"
            aria-valuemin={0}
            aria-valuemax={totalMinutes}
            aria-valuenow={doneMinutes}
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${(doneMinutes / totalMinutes) * 100}%` }} />
          </div>
        )}

        <ul data-testid="today-list" className="mt-4 space-y-3">
          {todayBlocks.length === 0 && (
            <li className={`${card} text-muted`}>
              Nothing planned today.
              {nextBlock && (
                <>
                  {" "}
                  Your next study block is on{" "}
                  <span className="font-medium text-ink">{format(parseISO(nextBlock.date), "EEEE d MMMM")}</span>
                  {deliverableById.get(nextBlock.deliverableId) &&
                    ` (${deliverableById.get(nextBlock.deliverableId)?.title})`}
                  .
                </>
              )}
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
                className={`flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm ${
                  done ? "opacity-75" : ""
                }`}
                style={{ borderLeft: `6px solid ${course?.color ?? "var(--accent)"}` }}
              >
                <input
                  id={inputId}
                  type="checkbox"
                  data-testid={`block-checkbox-${block.id}`}
                  checked={done}
                  onChange={() => onToggle(block.id)}
                  className="h-6 w-6 shrink-0 cursor-pointer accent-[var(--success)]"
                />
                <label htmlFor={inputId} className="flex-1 cursor-pointer">
                  <span className={`block font-semibold ${done ? "line-through" : ""}`}>
                    {d?.title ?? "Study block"}
                  </span>
                  <span className="block text-sm text-muted">
                    {course?.name}
                    {dueIn !== null && ` · due ${describeDaysAway(dueIn)}`}
                  </span>
                </label>
                <span className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
                  <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold">{block.minutes} min</span>
                  {!done && (
                    <Link
                      href={`/focus/${block.id}`}
                      aria-label={`Start a focus session for ${d?.title ?? "this block"}`}
                      className="rounded-full border border-line px-3 py-1 text-sm font-semibold text-accent hover:bg-accent-soft"
                    >
                      ▶ Focus
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
      </section>

      <section aria-labelledby="deadlines" className="mt-8">
        <h2 id="deadlines" className="text-lg font-semibold">
          Deadlines in the next 72 hours
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-2 text-muted">No deadlines in the next three days.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {upcoming.map(({ d, days }) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3">
                <span>
                  <span className="block font-medium">{d.title}</span>
                  <span className="block text-sm text-muted">
                    {courseById.get(d.courseId)?.name} · {d.weight}% of grade
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${
                    days <= 1 ? "bg-danger-soft text-danger" : "bg-warn-bg text-warn-ink"
                  }`}
                >
                  Due {describeDaysAway(days)}
                </span>
              </li>
            ))}
          </ul>
        )}
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

function Stat({ label, value, icon, testId }: { label: string; value: number; icon: string; testId?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3 text-center shadow-sm">
      <dt className="text-xs text-muted sm:text-sm">{label}</dt>
      <dd className="mt-1 text-2xl font-bold">
        <span aria-hidden="true">{icon} </span>
        <span data-testid={testId}>{value}</span>
      </dd>
    </div>
  );
}
