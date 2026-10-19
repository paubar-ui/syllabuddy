import { describe, expect, it } from "vitest";
import { estimateHours, paceFactor } from "./estimate";
import { emptyPace, paceInsights, updatePace } from "./pace";
import type { Deliverable } from "./types";

// Essay, 25% weight, effort 3 → base estimate 8 × 1.125 = 9h.
const essay = (loggedMinutes: number, courseId = "c1"): Deliverable => ({
  id: "d1",
  courseId,
  title: "Essay",
  type: "essay",
  dueDate: "2026-11-30",
  weight: 25,
  estimatedHours: 9,
  loggedMinutes,
  done: true,
});

describe("updatePace", () => {
  it("ignores deliverables with less than 15 logged minutes", () => {
    const pace = emptyPace();
    expect(updatePace(pace, essay(10), 3)).toBe(pace);
  });

  it("moves type and course ratios 30% of the way towards the real ratio", () => {
    // 13.5h actual / 9h planned = 1.5 → 1 × 0.7 + 1.5 × 0.3 = 1.15
    const pace = updatePace(emptyPace(), essay(13.5 * 60), 3);
    expect(pace.byType.essay).toBe(1.15);
    expect(pace.byCourse.c1).toBe(1.15);
  });

  it("converges so type × course matches your real pace, without double counting", () => {
    let pace = emptyPace();
    for (let i = 0; i < 40; i++) pace = updatePace(pace, essay(13.5 * 60), 3);
    expect(paceFactor(pace, "essay", "c1")).toBeCloseTo(1.5, 1);
  });

  it("a correct prediction keeps your pace where it is", () => {
    let pace = emptyPace();
    for (let i = 0; i < 40; i++) pace = updatePace(pace, essay(13.5 * 60), 3);
    const before = paceFactor(pace, "essay", "c1");
    const after = paceFactor(updatePace(pace, essay(13.5 * 60), 3), "essay", "c1");
    expect(after).toBeCloseTo(before, 1);
  });

  it("makes future estimates longer for slow work types", () => {
    const pace = updatePace(emptyPace(), essay(13.5 * 60), 3);
    const before = estimateHours({ type: "essay", weight: 25, effort: 3 });
    const after = estimateHours({ type: "essay", weight: 25, effort: 3, courseId: "c2", pace });
    expect(after).toBeGreaterThan(before);
  });

  it("caps extreme ratios", () => {
    const pace = updatePace(emptyPace(), essay(100 * 60), 3);
    expect(pace.byType.essay).toBe(1.9); // ratio capped at 4 → 0.7 + 1.2
  });
});

describe("paceInsights", () => {
  it("describes noticeably slow and fast types, biggest first", () => {
    const insights = paceInsights({ byType: { essay: 1.3, quiz: 0.8, exam: 1.04 }, byCourse: {} });
    expect(insights.map((i) => i.text)).toEqual([
      "Essays take you 1.3× longer than planned",
      "Quizzes take you 0.8× the planned time — faster than expected",
    ]);
  });

  it("says nothing when you're on track", () => {
    expect(paceInsights(emptyPace())).toEqual([]);
  });
});
