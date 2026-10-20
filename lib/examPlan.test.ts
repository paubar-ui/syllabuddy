import { describe, expect, it } from "vitest";
import { addDaysISO } from "./dates";
import { buildExamPlan, examDayFor, examScope, isExam, weakestTopics } from "./examPlan";
import type { Course, CourseSession, Deliverable } from "./types";

const TODAY = "2026-10-20";
const day = (n: number) => addDaysISO(TODAY, n);

const session = (number: number, topic: string, extra: Partial<CourseSession> = {}): CourseSession => ({
  number,
  topic,
  concepts: [],
  readings: [],
  problemSets: [],
  ...extra,
});

const sessions = [
  session(1, "Welfare economics", { concepts: ["Pareto efficiency"], readings: ["Ch. 1"] }),
  session(2, "Externalities I", { concepts: ["Pigouvian taxes", "Coase theorem"], problemSets: ["PS1"] }),
  session(3, "Externalities II", { problemSets: ["PS2"] }),
  session(4, "Public goods"),
  session(5, "Taxation"),
  session(6, "Inequality"),
];
const course: Course = { id: "c1", name: "PEPE", color: "#000", effort: 4, gradeScale: 10, sessions };

const midterm = (dueIn: number, exam: Deliverable["exam"] = {}): Deliverable => ({
  id: "m1",
  courseId: "c1",
  title: "PEPE midterm",
  type: "midterm",
  dueDate: day(dueIn),
  weight: 30,
  estimatedHours: 13,
  loggedMinutes: 0,
  done: false,
  exam,
});

describe("examScope", () => {
  it("uses the sessions the exam covers when known", () => {
    expect(examScope(midterm(10, { coversSessions: [2, 3] }), course).sessions.map((s) => s.number)).toEqual([2, 3]);
  });

  it("guesses the first half for a midterm, everything for a final", () => {
    expect(examScope(midterm(10), course)).toMatchObject({ guessed: true, sessions: sessions.slice(0, 3) });
    expect(examScope({ ...midterm(10), type: "final" }, course).sessions).toHaveLength(6);
  });

  it("uses session dates when they're known", () => {
    const dated = { ...course, sessions: sessions.map((s, i) => ({ ...s, date: day(i * 3 - 6) })) };
    expect(examScope(midterm(4), dated).sessions.map((s) => s.number)).toEqual([1, 2, 3, 4]);
  });
});

describe("buildExamPlan — 10 days out", () => {
  const plan = buildExamPlan({
    exam: midterm(10, { coversSessions: [1, 2, 3, 4], durationMinutes: 75, materials: "closed book, calculator allowed" }),
    course,
    today: TODAY,
    minutesByDate: { [day(0)]: 60, [day(2)]: 90 },
  });

  it("follows setup → core topics → mock → repair → review → exam", () => {
    expect(plan.days.map((d) => d.kind)).toEqual([
      "setup", "core", "core", "core", "core", "core", "core", "mock", "repair", "review", "exam",
    ]);
    expect(plan.days[0]).toMatchObject({ date: TODAY, dayNumber: 1, minutes: 60 });
    expect(plan.days.at(-1)).toMatchObject({ date: day(10), dayNumber: 11, kind: "exam" });
  });

  it("gives each core day its topic's concepts, readings and problem sets", () => {
    const first = plan.days[1];
    expect(first.title).toBe("Welfare economics");
    expect(first.tasks).toContain("Study Welfare economics: Pareto efficiency");
    expect(first.tasks).toContain("Read Ch. 1 (key pages only)");
    const ps = plan.days.find((d) => d.topics.includes(2))!;
    expect(ps.tasks).toContain("Redo PS1 by hand, calculator out — then check against the solutions");
    expect(ps.materials).toContain("PS1 + solutions");
    expect(plan.days[2].minutes).toBe(90);
  });

  it("uses spare core days for a second pass on the least-confident topics", () => {
    const revisits = plan.days.filter((d) => d.kind === "core").slice(4);
    expect(revisits).toHaveLength(2);
    expect(revisits[0].tasks[0]).toMatch(/^Second pass on/);
  });

  it("sets up a mock exam under real conditions ~3 days before", () => {
    const mock = plan.days.find((d) => d.kind === "mock")!;
    expect(mock.date).toBe(day(7));
    expect(mock.tasks[0]).toBe("Do a full mock exam: 75-minute timer, closed book, calculator allowed only — no phone, no notes you won't have");
  });

  it("suggests emailing the professor 3 days before and lists what was guessed", () => {
    expect(plan.emailBy).toBe(day(7));
    expect(plan.assumptions).toEqual([
      "Exam time not confirmed — check it on Blackboard or with your professor.",
      "Exam format not confirmed — the plan assumes a mix of problems and theory questions.",
    ]);
  });

  it("finds the plan day for a date", () => {
    expect(examDayFor(plan, day(8))?.kind).toBe("repair");
    expect(examDayFor(plan, day(20))).toBeUndefined();
  });
});

describe("focus, confidence and the mock log", () => {
  it("light sessions move to the review day", () => {
    const plan = buildExamPlan({ exam: midterm(10, { coversSessions: [1, 2, 3, 4], focus: { 4: "light" } }), course, today: TODAY });
    expect(plan.core).toEqual([1, 2, 3]);
    expect(plan.days.find((d) => d.kind === "review")!.tasks[0]).toBe("Light review of Public goods");
  });

  it("repair day targets the topics with the most lost points, then lowest confidence", () => {
    const exam = midterm(10, {
      coversSessions: [1, 2, 3, 4],
      confidence: { 1: 5, 2: 4, 3: 2, 4: 1 },
      mockLog: [
        { session: 2, points: 6, reason: "concept" },
        { session: 2, points: 2, reason: "algebra" },
        { session: 1, points: 3, reason: "time" },
      ],
    });
    expect(weakestTopics(exam.exam, sessions.slice(0, 4))).toEqual([2, 1]);
    const repair = buildExamPlan({ exam, course, today: TODAY }).days.find((d) => d.kind === "repair")!;
    expect(repair.goal).toBe("Fix your two weakest topics from the mock: Externalities I and Welfare economics.");
    expect(repair.tasks[0]).toBe("Re-study Externalities I: Pigouvian taxes, Coase theorem");
    // Without a mock log: lowest confidence first
    expect(weakestTopics({ confidence: { 1: 5, 2: 4, 3: 2, 4: 1 } }, sessions.slice(0, 4))).toEqual([4, 3]);
  });
});

describe("short on time and missing data", () => {
  it("with 3 days left: setup with all topics, review, exam — no mock", () => {
    const plan = buildExamPlan({ exam: midterm(2, { coversSessions: [1, 2] }), course, today: TODAY });
    expect(plan.days.map((d) => d.kind)).toEqual(["setup", "review", "exam"]);
    expect(plan.days[0].tasks.join(" ")).toContain("Welfare economics");
    expect(plan.assumptions).toContain("Fewer than 4 days left — the plan skips the separate mock exam and repair days.");
  });

  it("on exam day itself: just the exam day", () => {
    const plan = buildExamPlan({ exam: midterm(0), course, today: TODAY });
    expect(plan.days.map((d) => d.kind)).toEqual(["exam"]);
  });

  it("without a session schedule it still makes a generic plan", () => {
    const plan = buildExamPlan({ exam: midterm(8), course: { ...course, sessions: [] }, today: TODAY });
    expect(plan.days.filter((d) => d.kind === "core")[0].tasks[0]).toMatch(/Work through your notes/);
    expect(plan.assumptions).toContain("No session schedule found — add it from the syllabus to get a topic for every day.");
  });

  it("knows which deliverables are exams", () => {
    expect(isExam({ type: "final" })).toBe(true);
    expect(isExam({ type: "essay" })).toBe(false);
  });
});
