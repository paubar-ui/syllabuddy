import { describe, expect, it } from "vitest";
import { parseSessions } from "./parseSessions";

const TODAY = "2026-10-20";

const ENGLISH = `
Public Economics — Course schedule

Session 1: Introduction — welfare economics, Pareto efficiency. Reading: Ch. 1
Session 2: Externalities I: market failure, Pigouvian taxes, Coase theorem. PS1
Session 3: Externalities II
- Cap and trade
- Emission standards vs taxes
Reading: Gruber Ch. 6
Problem set 2
Session 4: Public goods – free riding, Lindahl pricing (PS3)
Session 5: Midterm exam

Midterm exam (30%): 90 minutes, closed book, calculator allowed.
Format: multiple choice and problems. Covers sessions 1–4.
Final exam: 2 hours, essay questions, one page of notes.
`;

const SPANISH = `
Sesión 1: Introducción – oferta, demanda. Lectura: Capítulo 2
Sesión 2: Elasticidades
Conceptos clave: elasticidad precio, elasticidad renta
Ejercicios 1
Sesión 3: Excedentes y bienestar

Examen parcial: tipo test, 60 minutos, sin calculadora. Temas 1 a 3.
`;

describe("parseSessions (English)", () => {
  const { sessions, exams } = parseSessions(ENGLISH, { today: TODAY });

  it("finds every session with its topic, concepts, readings and problem sets", () => {
    expect(sessions.map((s) => s.number)).toEqual([1, 2, 3, 4]);
    expect(sessions[0]).toMatchObject({
      topic: "Introduction",
      concepts: ["welfare economics", "Pareto efficiency"],
      readings: ["Ch. 1"],
    });
    expect(sessions[1]).toMatchObject({
      topic: "Externalities I",
      concepts: ["market failure", "Pigouvian taxes", "Coase theorem"],
      problemSets: ["PS1"],
    });
  });

  it("reads sub-topic bullets, reading lines and problem sets under a session", () => {
    expect(sessions[2]).toMatchObject({
      topic: "Externalities II",
      concepts: ["Cap and trade", "Emission standards vs taxes"],
      readings: expect.arrayContaining(["Gruber Ch. 6"]),
      problemSets: ["Problem set 2"],
    });
    expect(sessions[3]).toMatchObject({ topic: "Public goods", problemSets: ["PS3"] });
  });

  it("doesn't treat the exam session as a study topic", () => {
    expect(sessions.find((s) => /midterm/i.test(s.topic))).toBeUndefined();
  });

  it("finds exam format, duration, materials and coverage", () => {
    const midterm = exams.find((e) => e.type === "midterm");
    expect(midterm).toEqual({
      type: "midterm",
      format: "multiple choice + problems",
      durationMinutes: 90,
      materials: "closed book, calculator allowed",
      coversSessions: [1, 2, 3, 4],
    });
    expect(exams.find((e) => e.type === "final")).toMatchObject({
      durationMinutes: 120,
      format: "short-answer / essay questions",
      materials: "one formula sheet",
    });
  });
});

describe("parseSessions (Spanish)", () => {
  const { sessions, exams } = parseSessions(SPANISH, { today: TODAY });

  it("reads Spanish sessions, key concepts and exercises", () => {
    expect(sessions.map((s) => [s.number, s.topic])).toEqual([
      [1, "Introducción"],
      [2, "Elasticidades"],
      [3, "Excedentes y bienestar"],
    ]);
    expect(sessions[0].readings).toEqual(["Capítulo 2"]);
    expect(sessions[1].concepts).toEqual(["elasticidad precio", "elasticidad renta"]);
    expect(sessions[1].problemSets).toEqual(["Ejercicios 1"]);
  });

  it("reads Spanish exam details", () => {
    expect(exams[0]).toEqual({
      type: "midterm",
      format: "multiple choice",
      durationMinutes: 60,
      materials: "no calculator",
      coversSessions: [1, 2, 3],
    });
  });
});

describe("parseSessions edge cases", () => {
  it("dates weekly sessions when the semester start is known", () => {
    const { sessions } = parseSessions("Week 1: Basics\nWeek 3: Regression", { today: TODAY, semesterStart: "2026-09-07" });
    expect(sessions.map((s) => s.date)).toEqual(["2026-09-07", "2026-09-21"]);
  });

  it("uses an explicit date on the session line", () => {
    const { sessions } = parseSessions("Session 4 (12/11/2026): Game theory", { today: TODAY });
    expect(sessions[0]).toMatchObject({ number: 4, date: "2026-11-12", topic: "Game theory" });
  });

  it("works out exam coverage from where the exam session sits", () => {
    const { exams } = parseSessions("Session 1: A\nSession 2: B\nSession 3: Midterm\nSession 4: C", { today: TODAY });
    expect(exams).toEqual([{ type: "midterm", coversSessions: [1, 2] }]);
  });

  it("returns nothing for text without a schedule", () => {
    expect(parseSessions("Welcome to the course! Grades: Midterm 30%", { today: TODAY }).sessions).toEqual([]);
    expect(parseSessions("", { today: TODAY })).toEqual({ sessions: [], exams: [] });
  });
});
