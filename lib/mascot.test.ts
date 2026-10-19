import { describe, expect, it } from "vitest";
import { getMascotMessage, MESSAGES, pickSituation, type MascotSituation, type MascotTone } from "./mascot";
import type { StudyBlock } from "./types";

const tones: MascotTone[] = ["gentle", "coach", "savage"];
const situations: MascotSituation[] = [
  "morningPlan", "freeDay", "allDone", "missedYesterday", "deadlineSoon", "streakMilestone", "burnout",
];

const blocks = (...statuses: StudyBlock["status"][]): StudyBlock[] =>
  statuses.map((status, i) => ({ id: `b${i}`, deliverableId: "d", date: "2026-10-19", minutes: 30, status }));

describe("message bank", () => {
  it("has at least 2 messages for every tone × situation", () => {
    for (const tone of tones) for (const s of situations) expect(MESSAGES[tone][s].length).toBeGreaterThanOrEqual(2);
  });

  it("fills in every placeholder", () => {
    const vars = { minutes: 90, count: 2, title: "Finance midterm", when: "tomorrow", streak: 7 };
    for (const tone of tones) {
      for (const s of situations) {
        for (const seed of ["a", "b", "c", "d"]) {
          expect(getMascotMessage(tone, s, vars, seed)).not.toMatch(/[{}]/);
        }
      }
    }
  });

  it("is stable for the same seed", () => {
    const a = getMascotMessage("coach", "morningPlan", { minutes: 60, count: 2 }, "2026-10-19");
    const b = getMascotMessage("coach", "morningPlan", { minutes: 60, count: 2 }, "2026-10-19");
    expect(a).toBe(b);
    expect(a).toMatch(/60|2/);
  });
});

describe("pickSituation", () => {
  const base = { todayBlocks: blocks("planned"), missedYesterday: false, streak: 0 };

  it("puts burnout first", () => {
    expect(pickSituation({ ...base, burnout: true, missedYesterday: true })).toBe("burnout");
  });

  it("celebrates a finished day, and a 7-day milestone", () => {
    expect(pickSituation({ ...base, todayBlocks: blocks("done", "done"), streak: 3 })).toBe("allDone");
    expect(pickSituation({ ...base, todayBlocks: blocks("done"), streak: 14 })).toBe("streakMilestone");
  });

  it("then missed yesterday, then deadlines, then the normal morning plan", () => {
    expect(pickSituation({ ...base, missedYesterday: true, nextDeadlineDays: 1 })).toBe("missedYesterday");
    expect(pickSituation({ ...base, nextDeadlineDays: 2 })).toBe("deadlineSoon");
    expect(pickSituation({ ...base, nextDeadlineDays: 5 })).toBe("morningPlan");
    expect(pickSituation(base)).toBe("morningPlan");
    expect(pickSituation({ ...base, todayBlocks: [] })).toBe("freeDay");
  });
});
