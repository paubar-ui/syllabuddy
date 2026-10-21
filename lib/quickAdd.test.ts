import { describe, expect, it } from "vitest";
import { initialsOf, parseQuickAdd } from "./quickAdd";

const courses = [
  { id: "pepe", name: "Public Economics & Political Economy" },
  { id: "fin", name: "Corporate Finance" },
  { id: "beh", name: "Behavioral Economics, Finance & Decision-Making" },
];
const TODAY = "2026-10-21";

describe("parseQuickAdd", () => {
  it("PEPE midterm 30/10 30%", () => {
    expect(parseQuickAdd("PEPE midterm 30/10 30%", TODAY, courses)).toEqual({
      title: "Midterm",
      courseId: "pepe",
      type: "midterm",
      dueDate: "2026-10-30",
      weight: 30,
    });
  });

  it("Finance PS4 session 12 5% — 'Finance' is ambiguous here, so no course is guessed", () => {
    expect(parseQuickAdd("Finance PS4 session 12 5%", TODAY, courses)).toEqual({
      title: "Finance Problem set 4",
      type: "homework",
      session: 12,
      weight: 5,
    });
  });

  it("matches a word only one course has, and month names", () => {
    expect(parseQuickAdd("Corporate essay 15 Nov", TODAY, courses)).toMatchObject({
      title: "Essay",
      courseId: "fin",
      type: "essay",
      dueDate: "2026-11-15",
    });
  });

  it("leaves plain text alone (the grading bot's main feature check)", () => {
    expect(parseQuickAdd("QA-7F3K2A grading bot test", TODAY, courses)).toEqual({
      title: "QA-7F3K2A grading bot test",
      type: "quiz",
    });
  });

  it("initials skip small words", () => {
    expect(initialsOf("Public Economics & Political Economy")).toBe("pepe");
    expect(initialsOf("Historia de la Economía")).toBe("he");
  });
});
