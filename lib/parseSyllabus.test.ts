import { describe, expect, it } from "vitest";
import { normalizeExtraction } from "./extraction";
import { detectType, findDates, findWeight, parseSyllabus } from "./parseSyllabus";

const TODAY = "2026-10-19";
const opts = { today: TODAY };
const firstDate = (line: string, o: Parameters<typeof findDates>[1] = opts) =>
  findDates(line, o).find((d) => d.iso)?.iso ?? null;

describe("findDates", () => {
  it("reads numeric dates, day first by default", () => {
    expect(firstDate("Due 15/11/2026")).toBe("2026-11-15");
    expect(firstDate("Due 05/11/2026")).toBe("2026-11-05");
    expect(firstDate("Due 15.11.2026")).toBe("2026-11-15");
    expect(firstDate("Due 15-11-26")).toBe("2026-11-15");
    expect(firstDate("Due 2026-11-15")).toBe("2026-11-15");
    expect(firstDate("Due 05/11", { ...opts, dayFirst: false })).toBe("2026-05-11".replace("2026", "2027"));
  });

  it("swaps day and month when the month can't be > 12", () => {
    expect(firstDate("Due 11/25/2026")).toBe("2026-11-25");
  });

  it("reads English month names", () => {
    expect(firstDate("Essay due Nov 15")).toBe("2026-11-15");
    expect(firstDate("Essay due November 15th, 2026")).toBe("2026-11-15");
    expect(firstDate("Essay due 15 November")).toBe("2026-11-15");
    expect(firstDate("Essay due on the 3rd of December")).toBe("2026-12-03");
    expect(firstDate("Monday, Dec. 7")).toBe("2026-12-07");
  });

  it("reads Spanish month names", () => {
    expect(firstDate("Entrega el 15 de noviembre")).toBe("2026-11-15");
    expect(firstDate("Examen: 20 de enero de 2027")).toBe("2027-01-20");
    expect(firstDate("lunes 7 dic")).toBe("2026-12-07");
    expect(firstDate("2 de septiembre del 2026")).toBe("2026-09-02");
  });

  it("puts dates without a year in the upcoming academic year", () => {
    expect(firstDate("Final exam Jan 20")).toBe("2027-01-20");
    expect(firstDate("Quiz Sep 30")).toBe("2026-09-30"); // just passed, same year
  });

  it("turns weeks into dates only when the semester start is known", () => {
    expect(firstDate("Week 7: Midterm")).toBeNull();
    expect(firstDate("Week 7: Midterm", { ...opts, semesterStart: "2026-09-07" })).toBe("2026-10-19");
    expect(firstDate("Semana 3 – Quiz", { ...opts, semesterStart: "2026-09-07" })).toBe("2026-09-21");
  });

  it("ignores things that only look like dates", () => {
    expect(firstDate("Read pages 1-2")).toBeNull();
    expect(firstDate("Grade 2.5 points")).toBeNull();
    expect(firstDate("Due 31/02/2026")).toBeNull();
    expect(firstDate("Marketing mix")).toBeNull();
  });
});

describe("findWeight", () => {
  it("finds percentages and labelled weights", () => {
    expect(findWeight("Midterm (30%)")?.value).toBe(30);
    expect(findWeight("Final exam 40 % of grade")?.value).toBe(40);
    expect(findWeight("Essay 12,5%")?.value).toBe(12.5);
    expect(findWeight("Project – weight: 25")?.value).toBe(25);
    expect(findWeight("Examen final, peso 35")?.value).toBe(35);
  });

  it("finds a number after a dash or colon", () => {
    expect(findWeight("Midterm – 30")?.value).toBe(30);
    expect(findWeight("Quiz: 10 points")?.value).toBe(10);
  });

  it("returns null when there is no weight", () => {
    expect(findWeight("Midterm exam")).toBeNull();
    expect(findWeight("Bring 150 pages")).toBeNull();
  });
});

describe("detectType", () => {
  it("knows English and Spanish keywords", () => {
    expect(detectType("Midterm exam")).toBe("midterm");
    expect(detectType("Examen parcial")).toBe("midterm");
    expect(detectType("Final exam")).toBe("final");
    expect(detectType("Examen final")).toBe("final");
    expect(detectType("Final project")).toBe("project");
    expect(detectType("Trabajo en grupo")).toBe("project");
    expect(detectType("Research paper")).toBe("essay");
    expect(detectType("Ensayo argumentativo")).toBe("essay");
    expect(detectType("Group presentation")).toBe("presentation");
    expect(detectType("Presentación oral")).toBe("presentation");
    expect(detectType("Quiz 2")).toBe("quiz");
    expect(detectType("Prueba corta")).toBe("quiz");
    expect(detectType("Problem set 3")).toBe("homework");
    expect(detectType("Lectura obligatoria")).toBe("reading");
    expect(detectType("Welcome to the course")).toBeNull();
  });
});

const ENGLISH = `
Syllabus – Corporate Finance
Professor: Jane Doe
Classes start on 7 September 2026.
Grades are out of 10.
Attendance: students missing more than 30% of sessions fail the course.

Assessment
- Problem set 1 – 10% – due 25/10/2026
- Week 9: Midterm exam (25%)
- Valuation case study, 20%, Nov 30
- Participation 5%
- Final exam
  Date: January 20, 2027 · Weight: 40%
`;

describe("parseSyllabus (English)", () => {
  const result = parseSyllabus(ENGLISH, opts);

  it("finds course name, grade scale and attendance", () => {
    expect(result.courseName).toBe("Corporate Finance");
    expect(result.gradeScale).toBe(10);
    expect(result.attendancePolicy).toMatch(/missing more than 30%/);
  });

  it("finds every graded deliverable with type, date and weight", () => {
    expect(result.deliverables).toEqual([
      { title: "Problem set 1", type: "homework", dueDate: "2026-10-25", weight: 10 },
      { title: "Midterm exam", type: "midterm", dueDate: "2026-11-02", weight: 25 },
      { title: "Valuation case study", type: "homework", dueDate: "2026-11-30", weight: 20 },
      { title: "Final exam", type: "final", dueDate: "2027-01-20", weight: 40 },
    ]);
    expect(result.unresolvedWeeks).toBe(false);
  });
});

const SPANISH = `
Asignatura: Derecho Mercantil
Calificación sobre 10.
La asistencia es obligatoria (mínimo 80%).

Evaluación:
Examen parcial – 30% – 12 de noviembre
Ensayo sobre contratos: 20%, entrega el 3 de diciembre
Presentación oral en grupo (15%) - semana 12
Examen final 35% 18/01/2027
`;

describe("parseSyllabus (Spanish)", () => {
  it("finds deliverables and flags weeks it couldn't resolve", () => {
    const result = parseSyllabus(SPANISH, opts);
    expect(result.courseName).toBe("Derecho Mercantil");
    expect(result.gradeScale).toBe(10);
    expect(result.attendancePolicy).toMatch(/asistencia es obligatoria/);
    expect(result.deliverables).toEqual([
      { title: "Examen parcial", type: "midterm", dueDate: "2026-11-12", weight: 30 },
      { title: "Ensayo sobre contratos", type: "essay", dueDate: "2026-12-03", weight: 20 },
      { title: "Presentación oral en grupo", type: "presentation", dueDate: null, weight: 15 },
      { title: "Examen final", type: "final", dueDate: "2027-01-18", weight: 35 },
    ]);
    expect(result.unresolvedWeeks).toBe(true);
  });

  it("resolves weeks once a semester start is given", () => {
    const result = parseSyllabus(SPANISH, { ...opts, semesterStart: "2026-09-07" });
    expect(result.deliverables[2].dueDate).toBe("2026-11-23");
    expect(result.unresolvedWeeks).toBe(false);
  });
});

describe("parseSyllabus edge cases", () => {
  it("splits one line that lists several graded items", () => {
    const result = parseSyllabus("Grading: Midterm 30%, Final exam 40%, Essay 30%", opts);
    expect(result.deliverables.map((d) => [d.type, d.weight])).toEqual([
      ["midterm", 30],
      ["final", 40],
      ["essay", 30],
    ]);
  });

  it("uses the course name hint and survives empty or junk input", () => {
    expect(parseSyllabus("", { ...opts, courseNameHint: "Stats" })).toEqual({
      courseName: "Stats", gradeScale: null, attendancePolicy: null, deliverables: [], unresolvedWeeks: false,
    });
    expect(parseSyllabus("lorem ipsum\n\n\t%%%", opts).deliverables).toEqual([]);
  });
});

describe("normalizeExtraction", () => {
  it("keeps valid items, fixes bad fields and drops invalid ones", () => {
    const result = normalizeExtraction({
      courseName: "Stats",
      gradeScale: 10,
      attendancePolicy: null,
      deliverables: [
        { title: "Midterm", type: "midterm", dueDate: "2026-11-02", weight: 30 },
        { title: "Weird", type: "banana", dueDate: "next week", weight: 300 },
        { title: "", type: "quiz", dueDate: null, weight: 10 },
        "not an object",
      ],
    });
    expect(result?.deliverables).toEqual([
      { title: "Midterm", type: "midterm", dueDate: "2026-11-02", weight: 30 },
      { title: "Weird", type: "other", dueDate: null, weight: null },
    ]);
  });

  it("returns null for non-objects", () => {
    expect(normalizeExtraction("hello")).toBeNull();
  });
});

describe("“Session N” due dates (Blackboard calendar)", () => {
  const parse = (text: string) => parseSyllabus(text, { today: "2026-09-01" }).deliverables;

  it("records the session number when that's all the syllabus gives", () => {
    const [a, b, c] = parse(
      "Midterm exam – Session 15 – 30%\nGroup presentation (Sesión 22) 20%\nProblem set 3, due S9, 10%",
    );
    expect(a).toMatchObject({ type: "midterm", title: "Midterm exam", dueDate: null, weight: 30, sessionRef: 15 });
    expect(b).toMatchObject({ type: "presentation", dueDate: null, weight: 20, sessionRef: 22 });
    expect(c).toMatchObject({ type: "homework", dueDate: null, weight: 10, sessionRef: 9 });
  });

  it("keeps a written date but remembers the session too", () => {
    const [a] = parse("Final exam – Session 30 (15 December) – 40%");
    expect(a).toMatchObject({ dueDate: "2026-12-15", sessionRef: 30 });
  });

  it("doesn't turn schedule lines into deadlines, except exams held in class", () => {
    const items = parse("Session 4: Externalities. Problem set 2\nSession 15: MIDTERM EXAM\nClase 5: Bienes públicos. Lectura cap. 3");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "midterm", sessionRef: 15 });
  });
});
