import { describe, expect, it } from "vitest";
import { ASSISTANT_PROMPT, parseAssistantImport, SAMPLE_ANSWER } from "./assistantImport";

describe("parseAssistantImport — good answers", () => {
  it("reads the sample answer", () => {
    const r = parseAssistantImport(SAMPLE_ANSWER);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const [c] = r.courses;
    expect(c.name).toBe("Behavioral Economics");
    expect(c.gradeScale).toBe(10);
    expect(c.deliverables.map((d) => [d.title, d.type, d.when, d.weight])).toEqual([
      ["Midterm exam", "midterm", { session: 16 }, 30],
      ["Reading reflection", "essay", { session: 9 }, 10],
      ["Final project", "project", { session: 28 }, 25],
      ["Final exam", "final", { session: 30 }, 35],
    ]);
    expect(c.sessions[0]).toEqual({
      number: 1,
      topic: "Introduction to Behavioral Economics",
      concepts: ["rational choice", "heuristics"],
      readings: ["Wilkinson & Klaes Ch. 1"],
      problemSets: [],
    });
  });

  it("is tolerant of markdown, bullets, extra spaces, other date styles and unknown weights", () => {
    const r = parseAssistantImport(`Here you go!
\`\`\`text
**COURSE:**   Public   Economics
SCALE: 100
- DELIVERABLE:  Midterm  |  Mid-term exam |  15/11/2026  | 30 %
* DELIVERABLE: Essay | paper | ? | ?
SESSION: 5-6 | Empirical methods | DiD, IV | Problem Set 2
\`\`\`
Hope this helps.`);
    if (!r.ok) throw new Error(JSON.stringify(r.problems));
    const [c] = r.courses;
    expect(c).toMatchObject({ name: "Public Economics", gradeScale: 100 });
    expect(c.deliverables.map((d) => [d.type, d.when, d.weight])).toEqual([
      ["midterm", { date: "2026-11-15" }, 30],
      ["essay", null, null],
    ]);
    expect(c.sessions[0]).toMatchObject({ number: 5, upTo: 6, problemSets: ["Problem Set 2"] });
  });

  it("handles several courses in one answer", () => {
    const r = parseAssistantImport(
      "COURSE: A\nDELIVERABLE: X | quiz | 2026-11-01 | 5%\nCOURSE: B\nSESSION: 1 | Intro | - | -",
    );
    expect(r.ok && r.courses.map((c) => [c.name, c.deliverables.length, c.sessions.length])).toEqual([
      ["A", 1, 0],
      ["B", 0, 1],
    ]);
  });
});

describe("parseAssistantImport — broken answers point at the line", () => {
  it("bad date, bad weight, too few parts", () => {
    const r = parseAssistantImport(
      "COURSE: A\nDELIVERABLE: Essay | essay | next Friday | 10%\nDELIVERABLE: Quiz | quiz | 2026-11-01 | lots\nDELIVERABLE: Final | final\nDELIVERABLE: Big | exam | 2026-02-30 | 10%\nDELIVERABLE: Huge | exam | 2026-12-01 | 150%",
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.problems).toEqual([
      { line: 2, message: 'the date "next Friday" should look like 2026-11-15 or "Session 15"' },
      { line: 3, message: 'the weight "lots" should be a number like 30%' },
      {
        line: 4,
        message: "DELIVERABLE needs 4 parts separated by | (title | type | date or Session N | weight %), found 2",
      },
      { line: 5, message: 'the date "2026-02-30" should look like 2026-11-15 or "Session 15"' },
      { line: 6, message: "the weight can't be over 100%" },
    ]);
  });

  it("missing course, or nothing useful at all", () => {
    expect(parseAssistantImport("DELIVERABLE: X | quiz | 2026-11-01 | 5%")).toEqual({
      ok: false,
      problems: [{ line: 1, message: "the answer has no COURSE: line" }],
    });
    const r = parseAssistantImport("Sorry, I can't read PDFs.");
    expect(!r.ok && r.problems[0].message).toMatch(/no DELIVERABLE: or SESSION: lines/);
  });

  it("the prompt documents the format and the types", () => {
    expect(ASSISTANT_PROMPT).toContain("DELIVERABLE: <title> | <type>");
    expect(ASSISTANT_PROMPT).toContain("exam, midterm, final, essay");
  });
});
