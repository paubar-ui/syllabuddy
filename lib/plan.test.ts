import { describe, expect, it } from "vitest";
import { heatLevel, weekDays, weeksBetween, weekStart, workloadByDay } from "./plan";
import type { Deliverable, StudyBlock } from "./types";

describe("weeks", () => {
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19"); // Monday
    expect(weekStart("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });

  it("lists the 7 days of a week", () => {
    expect(weekDays("2026-10-26")).toEqual([
      "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01",
    ]);
  });

  it("lists the Mondays between two dates", () => {
    expect(weeksBetween("2026-10-21", "2026-11-04")).toEqual(["2026-10-19", "2026-10-26", "2026-11-02"]);
    expect(weeksBetween("2026-10-21", "2026-10-01")).toEqual(["2026-10-19"]);
  });
});

describe("workload", () => {
  const blocks: StudyBlock[] = [
    { id: "a", deliverableId: "d1", date: "2026-10-20", minutes: 60, status: "planned" },
    { id: "b", deliverableId: "d1", date: "2026-10-20", minutes: 30, status: "done" },
    { id: "c", deliverableId: "d1", date: "2026-10-20", minutes: 45, status: "missed" },
  ];
  const deliverables: Deliverable[] = [
    { id: "d1", courseId: "c", title: "Quiz", type: "quiz", dueDate: "2026-10-21", weight: 10, estimatedHours: 2, loggedMinutes: 0, done: false },
    { id: "d2", courseId: "c", title: "Old", type: "quiz", dueDate: "2026-10-21", weight: 10, estimatedHours: 2, loggedMinutes: 0, done: true },
  ];

  it("adds up planned and done minutes and counts open deadlines", () => {
    const load = workloadByDay(blocks, deliverables);
    expect(load.get("2026-10-20")).toEqual({ minutes: 90, deadlines: 0 });
    expect(load.get("2026-10-21")).toEqual({ minutes: 0, deadlines: 1 });
  });

  it("maps minutes to 5 heat levels relative to the busiest day", () => {
    expect(heatLevel(0, 200)).toBe(0);
    expect(heatLevel(10, 200)).toBe(1);
    expect(heatLevel(100, 200)).toBe(2);
    expect(heatLevel(200, 200)).toBe(4);
    expect(heatLevel(50, 0)).toBe(0);
  });
});
