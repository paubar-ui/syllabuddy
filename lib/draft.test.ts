import { describe, expect, it } from "vitest";
import {
  draftFromExtraction,
  draftsToStore,
  emptyCourse,
  validateDrafts,
  weightTotal,
  weightsLookOff,
  type DraftCourse,
} from "./draft";

let n = 0;
const makeId = () => `id${++n}`;

const course = (overrides: Partial<DraftCourse> = {}): DraftCourse => ({
  ...emptyCourse(0, makeId),
  name: "Stats",
  items: [
    { id: "a", title: "Midterm", type: "midterm", dueDate: "2026-11-02", weight: "40" },
    { id: "b", title: "Final", type: "final", dueDate: "2027-01-20", weight: "60" },
  ],
  ...overrides,
});

describe("draftFromExtraction", () => {
  it("turns found deliverables into editable rows", () => {
    const d = draftFromExtraction(
      {
        courseName: "Law",
        gradeScale: 100,
        attendancePolicy: "80% attendance",
        deliverables: [{ title: "Essay", type: "essay", dueDate: null, weight: 25 }],
      },
      1,
      makeId,
    );
    expect(d.name).toBe("Law");
    expect(d.gradeScale).toBe(100);
    expect(d.items[0]).toMatchObject({ title: "Essay", type: "essay", dueDate: "", weight: "25" });
  });

  it("starts with one empty row when nothing was found, and a sane grade scale", () => {
    const d = draftFromExtraction({ courseName: null, gradeScale: 7, attendancePolicy: null, deliverables: [] }, 0, makeId);
    expect(d.items).toHaveLength(1);
    expect(d.gradeScale).toBe(10);
  });
});

describe("weights", () => {
  it("adds up weights and flags totals far from 100%", () => {
    expect(weightTotal(course())).toBe(100);
    expect(weightsLookOff(course())).toBe(false);
    const off = course({ items: [{ id: "a", title: "Midterm", type: "midterm", dueDate: "2026-11-02", weight: "30,5" }] });
    expect(weightTotal(off)).toBe(30.5);
    expect(weightsLookOff(off)).toBe(true);
  });
});

describe("validateDrafts", () => {
  it("accepts a complete course", () => {
    expect(validateDrafts([course()])).toEqual([]);
  });

  it("reports missing names, titles, dates and bad numbers", () => {
    const bad = course({
      name: "",
      targetGrade: "12",
      items: [{ id: "x", title: "", type: "quiz", dueDate: "", weight: "150" }],
    });
    const messages = validateDrafts([bad]).map((p) => p.message);
    expect(messages).toEqual([
      "Course 1: give the course a name.",
      "Course 1 – item 1: add a title.",
      "Course 1 – item 1: add a due date.",
      "Course 1 – item 1: weight must be between 0 and 100.",
      "Course 1: target grade must be between 0 and 10.",
    ]);
    expect(validateDrafts([])).toHaveLength(1);
  });
});

describe("draftsToStore", () => {
  it("converts strings to numbers and links deliverables to their course", () => {
    const c = course({ targetGrade: "8.5", effort: 4 });
    const { courses, deliverables } = draftsToStore([c]);
    expect(courses[0]).toMatchObject({ id: c.id, name: "Stats", effort: 4, targetGrade: 8.5, gradeScale: 10 });
    expect(deliverables).toHaveLength(2);
    expect(deliverables[0]).toMatchObject({ courseId: c.id, weight: 40, loggedMinutes: 0, done: false });
  });
});
