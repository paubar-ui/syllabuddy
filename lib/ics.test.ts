import { describe, expect, it } from "vitest";
import { buildExamPlanIcs, buildIcs, escapeText, foldLine } from "./ics";
import type { Course, Deliverable, StudyBlock } from "./types";

const courses: Course[] = [{ id: "c1", name: "Finance, Corporate", color: "#000", effort: 3, gradeScale: 10 }];
const deliverables: Deliverable[] = [
  { id: "d1", courseId: "c1", title: "Midterm; part 1", type: "midterm", dueDate: "2026-11-12", weight: 30, estimatedHours: 8, loggedMinutes: 0, done: false },
  { id: "d2", courseId: "c1", title: "Old quiz", type: "quiz", dueDate: "2026-10-01", weight: 10, estimatedHours: 1, loggedMinutes: 60, done: true },
];
const blocks: StudyBlock[] = [
  { id: "b2", deliverableId: "d1", date: "2026-11-10", minutes: 45, status: "planned" },
  { id: "b1", deliverableId: "d1", date: "2026-11-10", minutes: 60, status: "planned" },
  { id: "b3", deliverableId: "d1", date: "2026-11-11", minutes: 400, status: "planned" },
  { id: "b4", deliverableId: "d1", date: "2026-11-09", minutes: 30, status: "done" },
];
const now = new Date(Date.UTC(2026, 9, 19, 8, 5, 9));
const ics = buildIcs({ courses, deliverables, blocks, now });
const events = ics.split("BEGIN:VEVENT").slice(1);

describe("buildIcs", () => {
  it("is a calendar with CRLF line endings and no bare LF", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("has one event per planned block and per open deadline, each with UID and DTSTAMP", () => {
    expect(events).toHaveLength(4); // 3 planned blocks + 1 open deadline
    for (const e of events) {
      expect(e).toMatch(/\r\nUID:[^\r\n]+@syllabuddy\r\n/);
      expect(e).toContain("\r\nDTSTAMP:20261019T080509Z\r\n");
    }
    expect(ics).not.toContain("block-b4"); // done blocks are not exported
    expect(ics).not.toContain("Old quiz"); // finished deliverables neither
  });

  it("places a day's blocks back to back from 18:00", () => {
    expect(events[0]).toContain("DTSTART:20261110T180000\r\nDTEND:20261110T190000");
    expect(events[1]).toContain("DTSTART:20261110T190000\r\nDTEND:20261110T194500");
  });

  it("starts a day's study after an evening class when told to", () => {
    const shifted = buildIcs({
      courses,
      deliverables,
      blocks,
      now,
      startMinuteFor: (date) => (date === "2026-11-10" ? 19 * 60 + 35 : 18 * 60),
    }).split("BEGIN:VEVENT");
    expect(shifted[1]).toContain("DTSTART:20261110T193500\r\nDTEND:20261110T203500");
    expect(shifted[2]).toContain("DTSTART:20261110T203500\r\nDTEND:20261110T212000");
    expect(shifted[3]).toContain("DTSTART:20261111T180000");
  });

  it("rolls a very long evening into the next day correctly", () => {
    expect(events[2]).toContain("DTSTART:20261111T180000\r\nDTEND:20261112T004000");
  });

  it("makes deadlines all-day events", () => {
    expect(events[3]).toContain("DTSTART;VALUE=DATE:20261112\r\nDTEND;VALUE=DATE:20261113");
    expect(events[3]).toContain("SUMMARY:Due: Midterm\\; part 1 (Finance\\, Corporate)");
  });
});

describe("text helpers", () => {
  it("escapes special characters", () => {
    expect(escapeText("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });

  it("folds long lines at 75 bytes, even with accents", () => {
    const line = `SUMMARY:${"Presentación ".repeat(12)}`;
    const folded = foldLine(line);
    const encoder = new TextEncoder();
    for (const part of folded.split("\r\n")) expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, "")).toBe(line);
    expect(foldLine("SHORT:line")).toBe("SHORT:line");
  });
});

describe("buildExamPlanIcs", () => {
  it("makes one all-day event per plan day with the tasks in the description", () => {
    const text = buildExamPlanIcs({
      examTitle: "Statistics midterm",
      courseName: "Statistics",
      days: [
        { date: "2026-10-20", dayNumber: 1, title: "Setup & diagnostic", goal: "Get ready.", tasks: ["Gather notes", "Rate confidence"] },
        { date: "2026-10-21", dayNumber: 2, title: "Probability", goal: "Understand it.", tasks: ["Redo PS2"] },
      ],
      now: new Date(Date.UTC(2026, 9, 20, 9, 0, 0)),
    });
    const events = text.split("BEGIN:VEVENT").slice(1);
    expect(events).toHaveLength(2);
    expect(events[0]).toContain("DTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021");
    expect(events[0]).toContain("UID:exam-prep-statistics-midterm-2026-10-20@syllabuddy");
    expect(text.replace(/\r\n /g, "")).toContain("DESCRIPTION:Get ready.\\n\\n- Gather notes\\n- Rate confidence");
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
});
