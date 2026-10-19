// Points, streaks and streak freezes (CLAUDE.md §5.7).
import { addDaysISO } from "./dates";
import type { Gamification, StudyBlock } from "./types";

export const FOCUS_BONUS = 10;
export const DELIVERABLE_BONUS = 50;
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;

export function initialGamification(): Gamification {
  return {
    points: 0,
    streak: 0,
    bestStreak: 0,
    streakFreezes: 0,
    mascotTone: "coach",
    history: [],
  };
}

/** A 50-minute block on a 30% exam: round(50/5) × (1 + 30/50) = 16 points. */
export function blockPoints(minutes: number, weight: number): number {
  return Math.round(Math.round(minutes / 5) * (1 + weight / 50));
}

/** All planned blocks done — or at least one, if the day only had one (or none). */
export function isDayComplete(dayBlocks: StudyBlock[]): boolean {
  const done = dayBlocks.filter((b) => b.status === "done").length;
  if (dayBlocks.length <= 1) return done >= 1;
  return done === dayBlocks.length;
}

/** Adds (or removes, if negative) points and minutes, and records them in today's history. */
export function addPoints(g: Gamification, date: string, points: number, minutes = 0): Gamification {
  const history = [...g.history];
  const i = history.findIndex((h) => h.date === date);
  const entry = i >= 0 ? history[i] : { date, minutes: 0, points: 0 };
  const updated = {
    date,
    minutes: Math.max(0, entry.minutes + minutes),
    points: Math.max(0, entry.points + points),
  };
  if (i >= 0) history[i] = updated;
  else history.push(updated);
  return { ...g, points: Math.max(0, g.points + points), history };
}

/** Call when `date` becomes complete. Counts once per day; every 7th day earns a freeze. */
export function completeDay(g: Gamification, date: string): Gamification {
  if (g.lastCompletedDate === date) return g;
  const streak = g.streak + 1;
  const earnsFreeze = streak % FREEZE_EVERY === 0;
  return {
    ...g,
    streak,
    bestStreak: Math.max(g.bestStreak, streak),
    streakFreezes: earnsFreeze ? Math.min(MAX_FREEZES, g.streakFreezes + 1) : g.streakFreezes,
    lastCompletedDate: date,
  };
}

/**
 * Looks at past days not checked yet. A day that had blocks but wasn't completed
 * uses up a streak freeze, or resets the streak if there are none. Days without
 * blocks (rest days) never break a streak.
 */
export function settleMissedDays(g: Gamification, blocks: StudyBlock[], today: string): Gamification {
  const yesterday = addDaysISO(today, -1);
  const checkedUpTo = [g.lastCheckedDate, g.lastCompletedDate]
    .filter((d): d is string => Boolean(d))
    .sort()
    .pop();
  let date = checkedUpTo
    ? addDaysISO(checkedUpTo, 1)
    : blocks.map((b) => b.date).sort()[0];
  if (!date || date > yesterday) return g;

  const byDate = new Map<string, StudyBlock[]>();
  for (const b of blocks) byDate.set(b.date, [...(byDate.get(b.date) ?? []), b]);

  let { streak, streakFreezes } = g;
  for (let guard = 0; date <= yesterday && guard < 400; guard++, date = addDaysISO(date, 1)) {
    const dayBlocks = byDate.get(date) ?? [];
    if (dayBlocks.length === 0 || isDayComplete(dayBlocks) || streak === 0) continue;
    if (streakFreezes > 0) streakFreezes--;
    else streak = 0;
  }
  return { ...g, streak, streakFreezes, lastCheckedDate: yesterday };
}
