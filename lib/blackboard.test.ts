import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCalendar,
  busyMinutesByDate,
  courseNameOf,
  groupClassSessions,
  guessMapping,
  needsResync,
  normalizeCalendarUrl,
  sessionDate,
  studyStartMinute,
} from "./blackboard";
import { parseIcs } from "./calendarIcs";
import type { CalendarSync, Course, Deliverable } from "./types";

const ics = readFileSync(join(__dirname, "__fixtures__", "blackboard.ics"), "utf8");
const events = parseIcs(ics);
const calendarCourses = groupClassSessions(events);
const byName = (name: string) => calendarCourses.find((c) => c.name === name)!;

describe("parseIcs", () => {
  it("expands weekly classes, skips EXDATEs and ignores alarms", () => {
    const stats = events.filter((e) => e.summary === "Statistics: Class");
    expect(stats).toHaveLength(14); // COUNT=15 minus the cancelled 13 Oct class
    expect(stats[0]).toMatchObject({ start: "2026-09-15T10:00", end: "2026-09-15T11:30", location: "Room 2.04" });
    expect(stats.map((e) => e.start.slice(0, 10))).not.toContain("2026-10-13");
    expect(stats.at(-1)!.start).toBe("2026-12-22T10:00");
  });

  it("unfolds long lines, unescapes text and reads all-day events", () => {
    expect(events.some((e) => e.summary === "Session 1: Public Economics and Policy Evaluation")).toBe(true);
    expect(events.find((e) => e.uid === "mic-2@bb")!.description).toBe("Bring the reading, chapter 2.\nSee you there");
    expect(events.find((e) => e.uid === "holiday@bb")).toMatchObject({ allDay: true, start: "2026-10-12" });
  });
});

describe("class sessions", () => {
  it("groups classes per course and numbers them by date", () => {
    expect(calendarCourses.map((c) => c.name)).toEqual([
      "Microeconomics (MIC-101)",
      "Public Economics and Policy Evaluation",
      "Statistics",
    ]);
    const stats = byName("Statistics");
    expect(stats.sessions).toHaveLength(14);
    expect(stats.sessions[5]).toEqual({ number: 6, date: "2026-10-27", start: "10:00", end: "11:30" });
    expect(byName("Microeconomics (MIC-101)").sessions.map((s) => s.number)).toEqual([1, 2, 3]);
  });

  it("leaves out deadlines and all-day events", () => {
    const all = calendarCourses.flatMap((c) => c.sessions.map((s) => s.date));
    expect(all).not.toContain("2026-09-25"); // problem set due
    expect(all).not.toContain("2026-10-12"); // holiday
  });

  it("finds the course name in common title styles", () => {
    const e = (summary: string) => ({
      uid: "",
      summary,
      start: "2026-01-01T10:00",
      end: "2026-01-01T11:00",
      allDay: false,
    });
    expect(courseNameOf(e("Finance - Lecture 4"))).toBe("Finance");
    expect(courseNameOf(e("Clase 3: Derecho Mercantil"))).toBe("Derecho Mercantil");
    expect(courseNameOf(e("Marketing Session 2"))).toBe("Marketing");
    expect(courseNameOf({ ...e("Lecture"), categories: ["MKT-201 Marketing"] })).toBe("MKT-201 Marketing");
  });

  it("resolves “Session N” to the date of that course's Nth class", () => {
    expect(sessionDate(byName("Statistics"), 15)).toBeUndefined(); // only 14 classes
    expect(sessionDate(byName("Statistics"), 4)).toBe("2026-10-06");
    expect(sessionDate(byName("Statistics"), 5)).toBe("2026-10-20"); // 13 Oct was cancelled
  });
});

const courses: Course[] = [
  { id: "stats", name: "Statistics for Business", color: "#000", effort: 3, gradeScale: 10 },
  { id: "micro", name: "Microeconomics", color: "#000", effort: 3, gradeScale: 10 },
  { id: "law", name: "Contract Law", color: "#000", effort: 3, gradeScale: 10 },
];
const mapping = guessMapping(calendarCourses, courses);
const sync: CalendarSync = { courses: calendarCourses, mapping };

describe("matching and dates", () => {
  it("guesses which Blackboard course is which Syllabuddy course", () => {
    expect(mapping).toEqual({
      "microeconomics mic 101": "micro",
      "public economics and policy evaluation": "",
      statistics: "stats",
    });
  });

  it("fills “Session N” deadlines and undated schedules, but never dates you changed", () => {
    const d = (id: string, extra: Partial<Deliverable>): Deliverable => ({
      id,
      courseId: "stats",
      title: id,
      type: "midterm",
      dueDate: "2026-12-01",
      weight: 30,
      estimatedHours: 8,
      loggedMinutes: 0,
      done: false,
      ...extra,
    });
    const withSessions: Course[] = [
      { ...courses[0], sessions: [{ number: 2, topic: "Probability", concepts: [], readings: [], problemSets: [] }] },
      ...courses.slice(1),
    ];
    const result = applyCalendar(sync, withSessions, [
      d("fromCalendar", { sessionRef: 4, dateFromCalendar: true }),
      d("newOne", { sessionRef: 5, dueDate: "" }),
      d("edited", { sessionRef: 6, dateFromCalendar: false }),
      d("plain", {}),
    ])!;
    expect(result.deliverables.map((x) => x.dueDate)).toEqual(["2026-10-06", "2026-10-20", "2026-12-01", "2026-12-01"]);
    expect(result.courses[0].sessions![0].date).toBe("2026-09-22");
    expect(applyCalendar(sync, result.courses, result.deliverables)).toBeNull(); // nothing left to change
  });
});

describe("class hours as busy time", () => {
  it("only evening classes (plus a 15-minute buffer) take study time", () => {
    const busy = busyMinutesByDate(sync);
    expect(busy["2026-09-15"]).toBeUndefined(); // Statistics 10:00–11:30
    expect(busy["2026-09-14"]).toBe(120); // Micro 19:00–20:30 → busy 18:45–20:45
  });

  it("study starts 15 minutes after a class that runs into the evening", () => {
    expect(studyStartMinute(sync, "2026-09-15")).toBe(18 * 60);
    const late: CalendarSync = {
      mapping: {},
      courses: [{ key: "x", name: "X", sessions: [{ number: 1, date: "2026-09-14", start: "17:00", end: "19:30" }] }],
    };
    expect(studyStartMinute(late, "2026-09-14")).toBe(19 * 60 + 45);
  });
});

describe("links", () => {
  it("accepts https and webcal links only", () => {
    expect(normalizeCalendarUrl(" webcal://learn.example.edu/cal/abc.ics ")).toBe(
      "https://learn.example.edu/cal/abc.ics",
    );
    expect(normalizeCalendarUrl("http://learn.example.edu/cal.ics")).toBeNull();
    expect(normalizeCalendarUrl("not a link")).toBeNull();
  });

  it("re-syncs a link at most every 6 hours", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(needsResync({ ...sync, url: "https://x.edu/a.ics" }, now)).toBe(true);
    expect(needsResync({ ...sync, url: "https://x.edu/a.ics", lastSync: "2026-10-20T07:00:00Z" }, now)).toBe(false);
    expect(needsResync({ ...sync, url: "https://x.edu/a.ics", lastSync: "2026-10-20T05:59:00Z" }, now)).toBe(true);
    expect(needsResync({ ...sync, fileName: "cal.ics" }, now)).toBe(false);
  });
});
