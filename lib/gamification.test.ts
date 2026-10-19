import { describe, expect, it } from "vitest";
import {
  addPoints,
  blockPoints,
  completeDay,
  initialGamification,
  isDayComplete,
  settleMissedDays,
} from "./gamification";
import type { Gamification, StudyBlock } from "./types";

const block = (date: string, status: StudyBlock["status"], id = `${date}-${status}`): StudyBlock => ({
  id, deliverableId: "d1", date, minutes: 50, status,
});

const withStreak = (streak: number, extra: Partial<Gamification> = {}): Gamification => ({
  ...initialGamification(), streak, bestStreak: streak, ...extra,
});

describe("points", () => {
  it("blockPoints = round(minutes/5) × (1 + weight/50)", () => {
    expect(blockPoints(50, 30)).toBe(16);
    expect(blockPoints(25, 0)).toBe(5);
    expect(blockPoints(90, 50)).toBe(36);
  });

  it("addPoints updates the total and today's history, never below zero", () => {
    let g = addPoints(initialGamification(), "2026-10-19", 16, 50);
    g = addPoints(g, "2026-10-19", 5, 25);
    expect(g.points).toBe(21);
    expect(g.history).toEqual([{ date: "2026-10-19", minutes: 75, points: 21 }]);
    g = addPoints(g, "2026-10-19", -100, -100);
    expect(g.points).toBe(0);
    expect(g.history[0]).toEqual({ date: "2026-10-19", minutes: 0, points: 0 });
  });
});

describe("isDayComplete", () => {
  it("needs every block done when there are several", () => {
    expect(isDayComplete([block("d", "done", "a"), block("d", "planned", "b")])).toBe(false);
    expect(isDayComplete([block("d", "done", "a"), block("d", "done", "b")])).toBe(true);
  });

  it("needs one block when the day had one or none", () => {
    expect(isDayComplete([block("d", "done")])).toBe(true);
    expect(isDayComplete([block("d", "planned")])).toBe(false);
    expect(isDayComplete([])).toBe(false);
  });
});

describe("streaks", () => {
  it("completeDay adds one per day, only once", () => {
    let g = completeDay(initialGamification(), "2026-10-19");
    g = completeDay(g, "2026-10-19");
    expect(g.streak).toBe(1);
    expect(g.bestStreak).toBe(1);
  });

  it("earns a freeze every 7 days, at most 2", () => {
    let g = initialGamification();
    for (let i = 1; i <= 21; i++) g = completeDay(g, `2026-11-${String(i).padStart(2, "0")}`);
    expect(g.streak).toBe(21);
    expect(g.streakFreezes).toBe(2);
  });

  it("a missed day resets the streak when there are no freezes", () => {
    const g = withStreak(5, { lastCompletedDate: "2026-10-17" });
    const blocks = [block("2026-10-18", "missed")];
    expect(settleMissedDays(g, blocks, "2026-10-19").streak).toBe(0);
  });

  it("a missed day uses a freeze instead when one is available", () => {
    const g = withStreak(5, { lastCompletedDate: "2026-10-17", streakFreezes: 1 });
    const result = settleMissedDays(g, [block("2026-10-18", "missed")], "2026-10-19");
    expect(result.streak).toBe(5);
    expect(result.streakFreezes).toBe(0);
  });

  it("rest days without blocks don't break the streak", () => {
    const g = withStreak(5, { lastCompletedDate: "2026-10-16" });
    expect(settleMissedDays(g, [], "2026-10-19").streak).toBe(5);
  });

  it("never counts the same missed day twice", () => {
    const g = withStreak(5, { lastCompletedDate: "2026-10-17", streakFreezes: 2 });
    const blocks = [block("2026-10-18", "missed")];
    const once = settleMissedDays(g, blocks, "2026-10-19");
    const twice = settleMissedDays(once, blocks, "2026-10-19");
    expect(twice.streakFreezes).toBe(1);
  });

  it("doesn't judge today before it's over", () => {
    const g = withStreak(5, { lastCompletedDate: "2026-10-18" });
    expect(settleMissedDays(g, [block("2026-10-19", "planned")], "2026-10-19").streak).toBe(5);
  });
});
