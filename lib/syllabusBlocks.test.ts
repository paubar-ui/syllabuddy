import { describe, expect, it } from "vitest";
import { conceptsFrom, readSchedule, topicsForExam } from "./syllabusBlocks";

// Made-up syllabi in two common layouts (one session per block; pairs of sessions with labels).
const ONE_PER_BLOCK = `COURSE INFO
Professor: Someone
PROGRAM
SESSION 1 (LIVE IN-PERSON)
Session 1
Introduction to Game Theory
Practice . Teams.
Reading: Chapter 1 from Osborne (2004),
An Introduction to Game
Theory
SESSION 2 (LIVE IN-PERSON)
Session 2
Nash Equilibrium
Practice / Teamwork
4
Edited by Documentation
13th July 2026
Reading: Chapter 2 from Osborne (2004),
An Introduction to Game
Theory
SESSION 3 (LIVE IN-PERSON)
MIDTERM EXAM
Exam
SESSION 4 (LIVE IN-PERSON)
Session 4
MIDTERM PRESENTATIONS I
Presentations / Teamwork
SESSION 5 (LIVE ONLINE)
Session 5
Repeated Games
Practice
reading: Chapter 3 from Osborne (2004)
SESSION 6 (LIVE IN-PERSON)
Final Exam
EVALUATION CRITERIA
Midterm 30%`;

const PAIRS = `PROGRAM
SESSIONS 1 - 2 (LIVE IN-PERSON)
Week 1 — Market failures
Lecture (session 1): Course overview. Externalities; public goods; information
asymmetries and adverse selection.
Seminar (session 2) : Problem Set 1 — externalities, Pigouvian taxes.
Book Chapters: Gruber (2016). Public Finance. Ch 5 (See Bibliography) (s/c)
Further Readings:
Coase (1960). The Problem of Social Cost.
SESSIONS 3 - 4 (LIVE IN-PERSON)
Midterm Exam
2h writing time, 15' reading time
pen and paper and calculator allowed
SESSIONS 5 - 6 (LIVE IN-PERSON)
Week 2 — Taxation
Lecture: Tax incidence; deadweight loss.
Seminar: Problem Set 2.
BIBLIOGRAPHY
Gruber (2016)`;

describe("readSchedule — one session per block", () => {
  const r = readSchedule(ONE_PER_BLOCK);

  it("takes the real title, not '(LIVE IN-PERSON)' or the repeated 'Session 1'", () => {
    expect(r.topics.map((t) => [t.number, t.topic])).toEqual([
      [1, "Introduction to Game Theory"],
      [2, "Nash Equilibrium"],
      [5, "Repeated Games"],
    ]);
  });

  it("joins wrapped readings and ignores page numbers and 'Edited by' lines", () => {
    expect(r.topics[0].readings).toEqual(["Chapter 1 from Osborne (2004), An Introduction to Game Theory"]);
    expect(r.topics[1].readings).toEqual(["Chapter 2 from Osborne (2004), An Introduction to Game Theory"]);
    expect(r.topics[0].practice).toBe("Practice. Teams.");
  });

  it("spots the exams and skips presentation sessions", () => {
    expect(r.exams.map((e) => [e.type, e.session])).toEqual([
      ["midterm", 3],
      ["final", 6],
    ]);
  });

  it("ticks the sessions before the midterm for the midterm, after it for the final", () => {
    expect([...topicsForExam(r, "midterm")]).toEqual([1, 2]);
    expect([...topicsForExam(r, "final")]).toEqual([5]);
  });
});

describe("readSchedule — sessions in pairs with Lecture / Seminar / Book Chapters", () => {
  const r = readSchedule(PAIRS);

  it("uses the week title and the lecture's concepts", () => {
    const [first, second] = r.topics;
    expect(first).toMatchObject({ number: 1, upTo: 2, topic: "Market failures" });
    expect(first.concepts).toEqual([
      "Course overview",
      "Externalities",
      "public goods",
      "information asymmetries and adverse selection",
    ]);
    expect(first.readings).toEqual(["Gruber (2016). Public Finance. Ch 5", "Further readings (see the syllabus)"]);
    expect(first.problemSets).toEqual(["Problem Set 1"]);
    expect(second).toMatchObject({ number: 5, upTo: 6, topic: "Taxation", problemSets: ["Problem Set 2"] });
  });

  it("reads the midterm's length and allowed materials", () => {
    expect(r.exams).toEqual([
      {
        type: "midterm",
        session: 3,
        details: { durationMinutes: 120, materials: "pen and paper and calculator allowed" },
      },
    ]);
  });

  it("stops at the bibliography", () => {
    expect(r.topics).toHaveLength(2);
  });
});

describe("conceptsFrom", () => {
  it("splits on semicolons and sentences", () => {
    expect(conceptsFrom("Overview and motivation. Utility; budget constraints; the Slutsky equation.")).toEqual([
      "Overview and motivation",
      "Utility",
      "budget constraints",
      "the Slutsky equation",
    ]);
  });
});
