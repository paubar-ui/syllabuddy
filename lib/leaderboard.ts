// Weekly leaderboard for Study Buddies: what we share (aggregates only), ranking,
// Tick's comment, and the fake friends shown in demo mode.
import { addDaysISO } from "./dates";
import { weekStart } from "./plan";
import type { Gamification } from "./types";

/** The only data about you that ever leaves the device. */
export interface WeeklyStats {
  week: string; // Monday, ISO
  points: number;
  streak: number;
  minutes: number;
}

export function weeklyStats(g: Gamification, today: string): WeeklyStats {
  const week = weekStart(today);
  const end = addDaysISO(week, 7);
  const thisWeek = g.history.filter((h) => h.date >= week && h.date < end);
  return {
    week,
    points: thisWeek.reduce((s, h) => s + h.points, 0),
    minutes: thisWeek.reduce((s, h) => s + h.minutes, 0),
    streak: g.streak,
  };
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  points: number;
  streak: number;
  minutes: number;
  isMe: boolean;
}

export interface RankedEntry extends LeaderboardEntry {
  rank: number;
}

/** Most points first; ties share a rank and are broken by streak, then name. */
export function rankLeaderboard(entries: LeaderboardEntry[]): RankedEntry[] {
  const sorted = [...entries].sort(
    (a, b) => b.points - a.points || b.streak - a.streak || a.name.localeCompare(b.name),
  );
  return sorted.map((e, i) => ({
    ...e,
    rank: i > 0 && sorted[i - 1].points === e.points ? rankOf(sorted, i - 1) : i + 1,
  }));
}

function rankOf(sorted: LeaderboardEntry[], index: number): number {
  let i = index;
  while (i > 0 && sorted[i - 1].points === sorted[index].points) i--;
  return i + 1;
}

/** Tick's one-liner about where you stand this week. */
export function leaderboardComment(ranked: RankedEntry[]): string {
  const me = ranked.find((e) => e.isMe);
  if (!me) return "Add a study buddy to start a friendly competition.";
  if (ranked.length === 1) return "It's just you so far — share your invite code to bring a friend.";
  if (ranked.every((e) => e.points === 0)) return "A fresh week! First block checked off takes the lead.";
  if (me.rank === 1) {
    const second = ranked.find((e) => !e.isMe);
    const lead = me.points - (second?.points ?? 0);
    return lead === 0
      ? `You're tied for first with ${second?.name}. One more block breaks the tie!`
      : `You're in first place, ${lead} point${lead === 1 ? "" : "s"} ahead. Keep the rhythm!`;
  }
  const ahead = ranked.filter((e) => e.points > me.points).at(-1)!;
  const gap = ahead.points - me.points;
  return `You're #${me.rank} — just ${gap} point${gap === 1 ? "" : "s"} behind ${ahead.name}. One focus session could do it.`;
}

/** Four friendly fake buddies for demo mode, scaled around your own week so it feels alive. */
export function demoBuddies(mine: WeeklyStats): LeaderboardEntry[] {
  const base = Math.max(mine.points, 60);
  return [
    { id: "demo-lucia", name: "Lucía", points: Math.round(base * 1.35), streak: 6, minutes: 610, isMe: false },
    { id: "demo-omar", name: "Omar", points: Math.round(base * 1.05) + 5, streak: 4, minutes: 420, isMe: false },
    { id: "demo-hana", name: "Hana", points: Math.round(base * 0.7), streak: 2, minutes: 300, isMe: false },
    { id: "demo-theo", name: "Theo", points: Math.round(base * 0.35), streak: 0, minutes: 130, isMe: false },
  ];
}
