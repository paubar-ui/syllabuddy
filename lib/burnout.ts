// Burnout guard (CLAUDE.md §5.5). Triggers when either:
//   a) 3+ days in a row with logged study minutes above your daily cap, or
//   b) 7 days in a row of studying (> 0 minutes) without a day off.
// The run of days must end today or yesterday — old history doesn't count.
// Once today is protected as a day off, the guard stays quiet.
import { addDaysISO } from "./dates";
import type { Availability, Gamification } from "./types";

export const OVERWORK_DAYS = 3;
export const NO_REST_DAYS = 7;

export interface BurnoutInput {
  history: Gamification["history"];
  availability: Pick<Availability, "maxMinutesPerDay" | "daysOff">;
  today: string;
}

export type BurnoutResult =
  | { triggered: false }
  | { triggered: true; reason: "overwork" | "noRest"; days: number };

/** Length of the run of days ending at `end` (going backwards) that satisfy `test`. */
function runEndingAt(end: string, test: (date: string) => boolean): number {
  let days = 0;
  for (let date = end; test(date) && days < 366; date = addDaysISO(date, -1)) days++;
  return days;
}

export function detectBurnout({ history, availability, today }: BurnoutInput): BurnoutResult {
  if (availability.daysOff.includes(today)) return { triggered: false };

  const minutes = new Map(history.map((h) => [h.date, h.minutes]));
  const daysOff = new Set(availability.daysOff);
  const studied = (d: string) => (minutes.get(d) ?? 0) > 0 && !daysOff.has(d);
  const overworked = (d: string) => (minutes.get(d) ?? 0) > availability.maxMinutesPerDay && !daysOff.has(d);

  // Today may not have started yet, so a run ending yesterday counts too.
  const longest = (test: (d: string) => boolean) =>
    Math.max(runEndingAt(today, test), runEndingAt(addDaysISO(today, -1), test));

  const overworkRun = longest(overworked);
  if (overworkRun >= OVERWORK_DAYS) return { triggered: true, reason: "overwork", days: overworkRun };

  const studyRun = longest(studied);
  if (studyRun >= NO_REST_DAYS) return { triggered: true, reason: "noRest", days: studyRun };

  return { triggered: false };
}
