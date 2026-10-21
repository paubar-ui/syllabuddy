import { describe, expect, it } from "vitest";
import { draftsToStore, emptyCourse, validateDrafts, weightTotal, weightsLookOff, type DraftCourse } from "./draft";

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

describe("weights", () => {
  it("adds up weights and flags totals far from 100%", () => {
    expect(weightTotal(course())).toBe(100);
    expect(weightsLookOff(course())).toBe(false);
    const off = course({
      items: [{ id: "a", title: "Midterm", type: "midterm", dueDate: "2026-11-02", weight: "30,5" }],
    });
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

describe("emptyCourse", () => {
  it("starts with no deadlines, and a course without deadlines is fine", () => {
    const c = { ...emptyCourse(0, makeId), name: "Stats" };
    expect(c.items).toEqual([]);
    expect(validateDrafts([c])).toEqual([]);
  });
});
