// Turns deliverables + free time into daily study blocks (CLAUDE.md §5.2).
//
// For each deliverable (earliest due first, ties → higher weight first):
//   A. Spread its minutes over a "lead window" that starts ceil(hours/2) days before
//      the due date, ramping up linearly so later days get more (back-loaded).
//   B. Whatever didn't fit goes into free time on earlier days, latest first, back to today.
//   C. As a last resort the deadline day itself takes up to 25% of the work.
//   Anything still left becomes a warning.
import { addDaysISO, daysBetween, weekdayIndex } from "./dates";
import type { Availability, Course, Deliverable, StudyBlock } from "./types";

export const MIN_BLOCK = 25;
export const MAX_BLOCK = 90;
export const DEADLINE_DAY_SHARE = 0.25;

export interface ScheduleInput {
  courses: Course[];
  deliverables: Deliverable[];
  availability: Availability;
  today: string;
  /** Previous plan. Done and missed blocks are kept; planned ones are regenerated. */
  existingBlocks?: StudyBlock[];
}

export interface ScheduleResult {
  blocks: StudyBlock[];
  warnings: string[];
}

const floor5 = (minutes: number) => Math.floor(minutes / 5) * 5;
const ceil5 = (minutes: number) => Math.ceil(minutes / 5) * 5;

export function dayCapacity(availability: Availability, date: string): number {
  if (availability.daysOff.includes(date)) return 0;
  const forWeekday = availability.minutesPerWeekday[weekdayIndex(date)] ?? 0;
  return Math.max(0, Math.min(forWeekday, availability.maxMinutesPerDay));
}

/** Minutes still to study, in steps of 5 and never a sliver smaller than one block. */
export function remainingMinutes(deliverable: Deliverable): number {
  const left = deliverable.estimatedHours * 60 - deliverable.loggedMinutes;
  if (left < 10) return 0;
  return Math.max(MIN_BLOCK, ceil5(left));
}

/** Linear ramp of `total` minutes over `days` days; tiny early slices are merged forward. */
export function rampTargets(total: number, days: number): number[] {
  if (days <= 0) return [];
  const sum = (days * (days + 1)) / 2;
  const targets = Array.from({ length: days }, (_, i) => floor5((total * (i + 1)) / sum));
  targets[days - 1] += total - targets.reduce((a, b) => a + b, 0);

  let carry = 0;
  for (let i = 0; i < days - 1; i++) {
    const value = targets[i] + carry;
    if (value < MIN_BLOCK) {
      carry = value;
      targets[i] = 0;
    } else {
      targets[i] = value;
      carry = 0;
    }
  }
  targets[days - 1] += carry;
  return targets;
}

/** How much of `remaining` to put in a slot, never leaving a leftover smaller than one block. */
function chunk(remaining: number, available: number, want = remaining): number {
  const cap = floor5(Math.min(available, want));
  if (cap >= remaining) return remaining;
  if (cap < MIN_BLOCK) return 0;
  if (remaining - cap >= MIN_BLOCK) return cap;
  const adjusted = remaining - MIN_BLOCK;
  return adjusted >= MIN_BLOCK ? adjusted : 0;
}

/** Splits one day's minutes into even blocks of 25–90 minutes. */
export function splitIntoBlocks(minutes: number): number[] {
  const count = Math.ceil(minutes / MAX_BLOCK);
  const base = floor5(minutes / count);
  const sizes = Array<number>(count).fill(base);
  let extra = minutes - base * count;
  for (let i = 0; extra > 0; i = (i + 1) % count, extra -= 5) sizes[i] += 5;
  return sizes;
}

export function formatHours(minutes: number): string {
  const hours = Math.round(minutes / 30) / 2;
  return hours > 0 ? `${hours}h` : `${minutes} min`;
}

export function generateSchedule({
  courses,
  deliverables,
  availability,
  today,
  existingBlocks = [],
}: ScheduleInput): ScheduleResult {
  const warnings: string[] = [];

  // Replanning: keep history, turn past planned blocks into missed, drop future planned ones.
  const kept: StudyBlock[] = existingBlocks
    .filter((b) => b.status !== "planned" || b.date < today)
    .map((b) => (b.status === "planned" ? { ...b, status: "missed" } : b));

  const used = new Map<string, number>();
  for (const b of kept) {
    if (b.status === "done" && b.date >= today) used.set(b.date, (used.get(b.date) ?? 0) + b.minutes);
  }
  const free = (date: string) =>
    Math.max(0, dayCapacity(availability, date) - (used.get(date) ?? 0));

  const takenIds = new Set(kept.map((b) => b.id));
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const todo = deliverables
    .filter((d) => !d.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.weight - a.weight);

  const newBlocks: StudyBlock[] = [];

  for (const d of todo) {
    const label = `${courseName.get(d.courseId) ?? "Course"} – ${d.title}`;
    if (d.dueDate < today) {
      warnings.push(`${label}: the due date has passed — mark it done or update the date.`);
      continue;
    }
    const total = remainingMinutes(d);
    if (total === 0) continue;

    let remaining = total;
    const perDay = new Map<string, number>();
    const place = (date: string, minutes: number) => {
      if (minutes <= 0) return;
      perDay.set(date, (perDay.get(date) ?? 0) + minutes);
      used.set(date, (used.get(date) ?? 0) + minutes);
      remaining -= minutes;
    };

    const daysUntilDue = daysBetween(today, d.dueDate);
    const leadDays = Math.max(1, Math.ceil(total / 60 / 2));
    const windowLength = Math.min(daysUntilDue, leadDays);
    const windowStart = daysUntilDue - windowLength;

    // A. Back-loaded ramp inside the lead window.
    rampTargets(total, windowLength).forEach((target, i) => {
      if (target === 0 || remaining === 0) return;
      const date = addDaysISO(today, windowStart + i);
      place(date, chunk(remaining, free(date), target));
    });

    // B. Overflow into earlier free time, latest day first.
    for (let offset = daysUntilDue - 1; offset >= 0 && remaining > 0; offset--) {
      const date = addDaysISO(today, offset);
      place(date, chunk(remaining, free(date)));
    }

    // C. Deadline day, capped at 25% of the work.
    if (remaining > 0) {
      place(d.dueDate, chunk(remaining, free(d.dueDate), floor5(total * DEADLINE_DAY_SHARE)));
    }

    if (remaining > 0) {
      warnings.push(
        `${label}: ${formatHours(remaining)} don't fit — consider Panic Mode or more availability.`,
      );
    }

    for (const [date, minutes] of [...perDay].sort(([a], [b]) => a.localeCompare(b))) {
      splitIntoBlocks(minutes).forEach((size, i) => {
        let id = `${d.id}-${date}-${i}`;
        while (takenIds.has(id)) id += "x";
        takenIds.add(id);
        newBlocks.push({ id, deliverableId: d.id, date, minutes: size, status: "planned" });
      });
    }
  }

  const blocks = [...kept, ...newBlocks].sort((a, b) => a.date.localeCompare(b.date));
  return { blocks, warnings };
}
