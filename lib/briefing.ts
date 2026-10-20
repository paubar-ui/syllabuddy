// The daily briefing on Today: greeting, one-line summary, today's timeline, what's coming up,
// at most two "heads up" alerts and yesterday's progress. Pure functions, unit-tested.
import type { BurnoutResult } from "./burnout";
import { addDaysISO, daysBetween, describeDaysAway, weekdayIndex } from "./dates";
import type { Availability, Course, Deliverable, StudyBlock } from "./types";

export function greeting(hour: number, name?: string): string {
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = name?.trim();
  return first ? `${part}, ${first}` : part;
}

/** 135 → "2h 15m", 50 → "50m", 120 → "2h". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const clock = (minutesFromMidnight: number) => {
  const m = ((minutesFromMidnight % 1440) + 1440) % 1440;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

export interface TimelineItem {
  block: StudyBlock;
  start: string; // "18:00"
  end: string;
  title: string;
  courseName: string;
  color?: string;
}

/**
 * Today's study blocks in time order. Blocks have no fixed time, so — like the calendar export —
 * they're placed back to back from `startHour` in a stable order.
 */
export function todayTimeline(
  blocks: StudyBlock[],
  deliverables: Deliverable[],
  courses: Course[],
  today: string,
  startHour = 18,
): TimelineItem[] {
  const deliverable = new Map(deliverables.map((d) => [d.id, d]));
  const course = new Map(courses.map((c) => [c.id, c]));
  let cursor = startHour * 60;
  return blocks
    .filter((b) => b.date === today)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((block) => {
      const d = deliverable.get(block.deliverableId);
      const c = d ? course.get(d.courseId) : undefined;
      const item: TimelineItem = {
        block,
        start: clock(cursor),
        end: clock(cursor + block.minutes),
        title: d?.title ?? "Study block",
        courseName: c?.name ?? "",
        color: c?.color,
      };
      cursor += block.minutes;
      return item;
    });
}

export interface ComingUpItem {
  deliverable: Deliverable;
  courseName: string;
  color?: string;
  daysLeft: number;
}

/** Open deadlines in the next `days` days (today included), soonest first, heavier first on ties. */
export function comingUp(deliverables: Deliverable[], courses: Course[], today: string, days = 7): ComingUpItem[] {
  const course = new Map(courses.map((c) => [c.id, c]));
  return deliverables
    .filter((d) => !d.done)
    .map((d) => ({ d, daysLeft: daysBetween(today, d.dueDate) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft || b.d.weight - a.d.weight)
    .map(({ d, daysLeft }) => ({
      deliverable: d,
      courseName: course.get(d.courseId)?.name ?? "",
      color: course.get(d.courseId)?.color,
      daysLeft,
    }));
}

/** "3 study blocks today (2h 15m) · next deadline: Finance problem set in 2 days." */
export function summaryLine(timeline: TimelineItem[], next: ComingUpItem | undefined): string {
  const minutes = timeline.reduce((s, t) => s + t.block.minutes, 0);
  const left = timeline.filter((t) => t.block.status !== "done");
  const parts: string[] = [];
  if (timeline.length === 0) parts.push("No study blocks today");
  else if (left.length === 0) parts.push(`All ${timeline.length} study block${timeline.length === 1 ? "" : "s"} done today`);
  else parts.push(`${timeline.length} study block${timeline.length === 1 ? "" : "s"} today (${formatDuration(minutes)})`);
  if (next) parts.push(`next deadline: ${next.deliverable.title} ${describeDaysAway(next.daysLeft)}`);
  return `${parts.join(" · ")}.`;
}

/** How yesterday went: done blocks out of the blocks that were planned for that day. */
export function yesterdayStats(blocks: StudyBlock[], today: string): { done: number; total: number } {
  const yesterday = addDaysISO(today, -1);
  const day = blocks.filter((b) => b.date === yesterday);
  return { done: day.filter((b) => b.status === "done").length, total: day.length };
}

export type AlertAction =
  | { kind: "link"; label: string; href: string }
  | { kind: "protectTonight"; label: string }
  | { kind: "dismissReplan"; label: string };

export interface HeadsUp {
  id: "burnout" | "replanned" | "noStudyTime" | "heavyWeek";
  tone: "success" | "info" | "danger" | "warn";
  title: string;
  text: string;
  action: AlertAction;
}

export interface HeadsUpInput {
  today: string;
  burnout: BurnoutResult;
  protectedTonight: boolean;
  lastReplan: { date: string; blocks: number; minutes: number } | null;
  replanDismissed: boolean;
  deliverables: Deliverable[];
  blocks: StudyBlock[];
  availability: Availability;
}

/** Share of free time (next 7 days) above which a week counts as heavy. */
export const HEAVY_WEEK_SHARE = 0.85;

/** At most two alerts, most important first, each with exactly one action. */
export function headsUp(input: HeadsUpInput): HeadsUp[] {
  const { today, burnout, deliverables, blocks, availability } = input;
  const alerts: HeadsUp[] = [];

  if (burnout.triggered && !input.protectedTonight) {
    alerts.push({
      id: "burnout",
      tone: "success",
      title: "Time for a breather?",
      text:
        burnout.reason === "overwork"
          ? `You've studied more than your daily limit for ${burnout.days} days in a row. Resting tonight helps you remember more tomorrow.`
          : `You've studied ${burnout.days} days in a row without a day off. Resting tonight helps you remember more tomorrow.`,
      action: { kind: "protectTonight", label: "Protect tonight" },
    });
  }

  const replan = input.lastReplan;
  if (replan && replan.date === today && replan.blocks > 0 && !input.replanDismissed) {
    alerts.push({
      id: "replanned",
      tone: "info",
      title: "Missed blocks were moved",
      text: `${replan.blocks} study block${replan.blocks === 1 ? "" : "s"} from earlier days didn't happen — that's okay. ${formatDuration(replan.minutes)} were moved into your plan, starting today.`,
      action: { kind: "dismissReplan", label: "Got it" },
    });
  }

  const studied = new Set(blocks.filter((b) => b.status !== "missed").map((b) => b.deliverableId));
  const unplanned = deliverables
    .filter((d) => !d.done && !studied.has(d.id) && d.estimatedHours * 60 - d.loggedMinutes > 0)
    .map((d) => ({ d, daysLeft: daysBetween(today, d.dueDate) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)[0];
  if (unplanned) {
    alerts.push({
      id: "noStudyTime",
      tone: "danger",
      title: `No study time for ${unplanned.d.title}`,
      text: `It's due ${describeDaysAway(unplanned.daysLeft)}, but there's no room for it in your plan yet. Panic mode helps you decide what to do first.`,
      action: { kind: "link", label: "Open panic mode", href: "/panic" },
    });
  }

  let planned = 0;
  let free = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDaysISO(today, i);
    planned += blocks.filter((b) => b.date === date && b.status !== "missed").reduce((s, b) => s + b.minutes, 0);
    if (!availability.daysOff.includes(date)) {
      free += Math.min(availability.minutesPerWeekday[weekdayIndex(date)] ?? 0, availability.maxMinutesPerDay);
    }
  }
  if (free > 0 && planned / free >= HEAVY_WEEK_SHARE) {
    alerts.push({
      id: "heavyWeek",
      tone: "warn",
      title: "Heavy week ahead",
      text: `You have ${formatDuration(planned)} of study planned in the next 7 days — ${Math.round((planned / free) * 100)}% of your free time. Plan some rest, or add study time in Settings.`,
      action: { kind: "link", label: "See the week", href: "/plan" },
    });
  }

  return alerts.slice(0, 2);
}

/** On a free day: the next planned block, as a "get ahead" suggestion. */
export function getAheadSuggestion(blocks: StudyBlock[], today: string): StudyBlock | undefined {
  return blocks
    .filter((b) => b.date > today && b.status === "planned")
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
}
