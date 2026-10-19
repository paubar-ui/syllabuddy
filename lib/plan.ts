// Helpers for the /plan page: weeks, and how busy each day is (for the heatmap).
import { addDaysISO, daysBetween, weekdayIndex } from "./dates";
import type { Deliverable, StudyBlock } from "./types";

/** Monday of the week that contains `iso`. */
export function weekStart(iso: string): string {
  return addDaysISO(iso, -weekdayIndex(iso));
}

/** The 7 ISO days (Mon..Sun) of the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(monday, i));
}

export interface DayLoad {
  minutes: number;
  deadlines: number;
}

/** Planned or done study minutes and open deadlines per day. */
export function workloadByDay(blocks: StudyBlock[], deliverables: Deliverable[]): Map<string, DayLoad> {
  const load = new Map<string, DayLoad>();
  const get = (date: string) => load.get(date) ?? { minutes: 0, deadlines: 0 };
  for (const b of blocks) {
    if (b.status === "missed") continue;
    const day = get(b.date);
    load.set(b.date, { ...day, minutes: day.minutes + b.minutes });
  }
  for (const d of deliverables) {
    if (d.done) continue;
    const day = get(d.dueDate);
    load.set(d.dueDate, { ...day, deadlines: day.deadlines + 1 });
  }
  return load;
}

/** 0 = free, 1–4 = light … heavy, relative to the busiest day. */
export function heatLevel(minutes: number, maxMinutes: number): 0 | 1 | 2 | 3 | 4 {
  if (minutes <= 0 || maxMinutes <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((minutes / maxMinutes) * 4))) as 1 | 2 | 3 | 4;
}

/** Mondays from the week of `from` through the week of `to` (at least one week). */
export function weeksBetween(from: string, to: string): string[] {
  const first = weekStart(from);
  const last = weekStart(to < from ? from : to);
  const count = Math.floor(daysBetween(first, last) / 7) + 1;
  return Array.from({ length: count }, (_, i) => addDaysISO(first, i * 7));
}
