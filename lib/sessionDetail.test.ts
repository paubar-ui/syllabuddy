import { describe, expect, it } from "vitest";
import { addDaysISO } from "./dates";
import { blockDetail } from "./sessionDetail";
import type { Course, Deliverable, StudyBlock } from "./types";

const TODAY = "2026-10-20";
const day = (n: number) => addDaysISO(TODAY, n);
const course: Course = {
  id: "c1",
  name: "Statistics",
  color: "#000",
  effort: 3,
  gradeScale: 10,
  sessions: [1, 2, 3, 4, 5, 6].map((n) => ({
    number: n,
    topic: `Topic ${n}`,
    concepts: [`Concept ${n}`],
    readings: [],
    problemSets: [`PS${n}`],
  })),
};
const deliverable = (type: Deliverable["type"], dueIn: number): Deliverable => ({
  id: "d1",
  courseId: "c1",
  title: type === "essay" ? "Policy essay" : "Stats midterm",
  type,
  dueDate: day(dueIn),
  weight: 30,
  estimatedHours: 10,
  loggedMinutes: 0,
  done: false,
  exam: type === "midterm" ? { coversSessions: [1, 2, 3, 4, 5, 6] } : undefined,
});
const block = (date: string): StudyBlock => ({ id: "b1", deliverableId: "d1", date, minutes: 60, status: "planned" });

describe("blockDetail", () => {
  it("shows your own plan when you organise the exam yourself", () => {
    const d = {
      ...deliverable("midterm", 10),
      exam: { coversSessions: [1, 2, 3], myPlan: { [day(1)]: "- Redo PS2\nSummarise ch. 4" } },
    };
    const b = block(day(1));
    const self = { ...course, studyMode: "self" as const };
    const detail = blockDetail({ block: b, deliverable: d, course: self, blocks: [b], today: TODAY });
    expect(detail.heading).toBe("Day 2 · Your plan");
    expect(detail.tasks).toEqual(["Redo PS2", "Summarise ch. 4"]);
    const empty = blockDetail({ block: block(day(2)), deliverable: d, course: self, blocks: [b], today: TODAY });
    expect(empty.goal).toMatch(/haven't written a plan/);
  });

  it("uses the exam prep plan day for exam blocks", () => {
    const d = deliverable("midterm", 10);
    const b = block(day(1));
    const detail = blockDetail({ block: b, deliverable: d, course, blocks: [b], today: TODAY });
    expect(detail.heading).toMatch(/^Day 2 · /);
    expect(detail.dayInfo).toBe("Day 2 of 11 · exam in 10 days");
    expect(detail.examDay?.kind).toBe("core");
    expect(detail.tasks.join(" ")).toContain("PS1");
  });

  it("gives a sensible checklist for other types", () => {
    const d = deliverable("essay", 5);
    const detail = blockDetail({ block: block(TODAY), deliverable: d, course, blocks: [], today: TODAY });
    expect(detail.heading).toBe("Policy essay");
    expect(detail.dayInfo).toBeUndefined();
    expect(detail.tasks.length).toBeGreaterThanOrEqual(3);
    expect(detail.tip).not.toBe("");
  });
});
