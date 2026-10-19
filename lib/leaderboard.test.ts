import { describe, expect, it } from "vitest";
import { initialGamification } from "./gamification";
import { demoBuddies, leaderboardComment, rankLeaderboard, weeklyStats, type LeaderboardEntry } from "./leaderboard";

const entry = (name: string, points: number, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  id: name,
  name,
  points,
  streak: 0,
  minutes: 0,
  isMe: false,
  ...extra,
});

describe("weeklyStats", () => {
  it("adds up only this week's history (Monday to Sunday) and keeps the current streak", () => {
    const g = {
      ...initialGamification(),
      streak: 4,
      history: [
        { date: "2026-10-18", minutes: 100, points: 50 }, // last Sunday
        { date: "2026-10-19", minutes: 60, points: 20 }, // Monday
        { date: "2026-10-21", minutes: 30, points: 10 },
        { date: "2026-10-26", minutes: 99, points: 99 }, // next Monday
      ],
    };
    expect(weeklyStats(g, "2026-10-22")).toEqual({ week: "2026-10-19", points: 30, minutes: 90, streak: 4 });
  });
});

describe("rankLeaderboard", () => {
  it("sorts by points; ties share a rank and fall back to streak", () => {
    const ranked = rankLeaderboard([
      entry("Ben", 50),
      entry("Ana", 80),
      entry("Cleo", 50, { streak: 3 }),
      entry("Dan", 10),
    ]);
    expect(ranked.map((e) => [e.name, e.rank])).toEqual([
      ["Ana", 1],
      ["Cleo", 2],
      ["Ben", 2],
      ["Dan", 4],
    ]);
  });
});

describe("leaderboardComment", () => {
  it("cheers a leader and tells a chaser the gap", () => {
    expect(leaderboardComment(rankLeaderboard([entry("Me", 90, { isMe: true }), entry("Ben", 60)]))).toBe(
      "You're in first place, 30 points ahead. Keep the rhythm!",
    );
    expect(
      leaderboardComment(rankLeaderboard([entry("Me", 50, { isMe: true }), entry("Ben", 60), entry("Ana", 99)])),
    ).toBe("You're #3 — just 10 points behind Ben. One focus session could do it.");
  });

  it("handles ties, a fresh week and being alone", () => {
    expect(leaderboardComment(rankLeaderboard([entry("Me", 40, { isMe: true }), entry("Ben", 40)]))).toContain("tied");
    expect(leaderboardComment(rankLeaderboard([entry("Me", 0, { isMe: true }), entry("Ben", 0)]))).toContain("fresh week");
    expect(leaderboardComment(rankLeaderboard([entry("Me", 10, { isMe: true })]))).toContain("invite code");
  });
});

describe("demoBuddies", () => {
  it("gives four fake friends around your level, so there's always someone to chase", () => {
    const friends = demoBuddies({ week: "2026-10-19", points: 100, streak: 2, minutes: 200 });
    expect(friends).toHaveLength(4);
    expect(friends.every((f) => !f.isMe)).toBe(true);
    expect(friends.some((f) => f.points > 100)).toBe(true);
    expect(friends.some((f) => f.points < 100)).toBe(true);
    // With no points yet, fake friends still have some.
    expect(demoBuddies({ week: "2026-10-19", points: 0, streak: 0, minutes: 0 }).every((f) => f.points > 0)).toBe(true);
  });
});
