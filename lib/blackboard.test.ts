import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyCalendar,
  CALENDAR_VERSION,
  classesOn,
  openCalendarDeadlines,
  extractDeadlines,
  busyMinutesByDate,
  classCount,
  courseNameOf,
  groupClassSessions,
  guessMapping,
  needsResync,
  normalizeCalendarUrl,
  sessionDate,
  sessionNumbersOf,
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

  it("re-syncs a link at most every 6 hours, and right away if it was read by an older version", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const linked = { ...sync, url: "https://x.edu/a.ics", version: CALENDAR_VERSION };
    expect(needsResync(linked, now)).toBe(true);
    expect(needsResync({ ...linked, lastSync: "2026-10-20T07:00:00Z" }, now)).toBe(false);
    expect(needsResync({ ...linked, lastSync: "2026-10-20T05:59:00Z" }, now)).toBe(true);
    expect(needsResync({ ...linked, lastSync: "2026-10-20T11:00:00Z", version: undefined }, now)).toBe(true);
    expect(needsResync({ ...sync, fileName: "cal.ics" }, now)).toBe(false);
  });
});

describe("IE-style Blackboard titles: “COURSE (Ses. 10) T-20.”", () => {
  const ev = (summary: string, start: string, end: string) => ({
    uid: `${summary}${start}`,
    summary,
    start,
    end,
    allDay: false,
  });
  const ieEvents = [
    ev("MICROECONOMICS, MARKETS & POLICY (Ses. 1) T-20.", "2026-09-07T17:00", "2026-09-07T18:20"),
    ev("MICROECONOMICS, MARKETS & POLICY (Ses. 2) T-20.", "2026-09-08T16:30", "2026-09-08T17:50"),
    ev("MICROECONOMICS, MARKETS & POLICY (Ses. 3-4) T-20.", "2026-09-10T16:30", "2026-09-10T19:20"),
    ev("MICROECONOMICS, MARKETS & POLICY (Ses. 10) T-20.", "2026-09-29T18:00", "2026-09-29T19:20"),
    ev("MICROECONOMICS, MARKETS & POLICY", "2026-10-05T16:30", "2026-10-05T19:20"),
    ev("## CANCELLED ## MICROECONOMICS, MARKETS & POLICY (Ses. 11) T-20.", "2026-10-01T16:30", "2026-10-01T17:50"),
    ev("## CANCELLED ## WORLD HISTORY", "2026-09-10T16:30", "2026-09-10T19:20"),
    ev("Derecho Mercantil (Sesión 2) S-A", "2026-09-09T09:00", "2026-09-09T10:20"),
    ev("Derecho Mercantil (Sesión 1) S-A", "2026-09-02T09:00", "2026-09-02T10:20"),
  ];
  const grouped = groupClassSessions(ieEvents);

  it("groups every class of a course together and skips cancelled ones", () => {
    expect(grouped.map((c) => c.name)).toEqual(["Derecho Mercantil", "MICROECONOMICS, MARKETS & POLICY"]);
    expect(courseNameOf(ieEvents[0])).toBe("MICROECONOMICS, MARKETS & POLICY");
  });

  it("uses Blackboard's own session numbers, including double sessions", () => {
    const micro = grouped[1];
    expect(micro.sessions.map((s) => s.number)).toEqual([1, 2, 3, 4, 10, 0]);
    expect(sessionDate(micro, 4)).toBe("2026-09-10");
    expect(sessionDate(micro, 10)).toBe("2026-09-29");
    expect(sessionDate(micro, 11)).toBeUndefined(); // cancelled
    expect(classCount(micro)).toBe(5);
    expect(sessionDate(grouped[0], 1)).toBe("2026-09-02");
  });

  it("reads session numbers from titles", () => {
    expect(sessionNumbersOf("X (Ses. 10) T-20.")).toEqual([10]);
    expect(sessionNumbersOf("X (Sessions 3-4)")).toEqual([3, 4]);
    expect(sessionNumbersOf("Y (Sesión 7)")).toEqual([7]);
    expect(sessionNumbersOf("Statistics: Class")).toEqual([]);
  });
});

describe("IE delivery tags: “Live in-person”, “Asynchronous”, “Extra”", () => {
  const ev = (summary: string, start: string, end: string) => ({
    uid: `${summary}${start}`,
    summary,
    start,
    end,
    allDay: false,
  });
  const grouped = groupClassSessions([
    ev(
      "ECONOMETRICS II: FORECASTING & IDENTIFICATION  (Ses. 1) Live in-person ",
      "2026-09-07T10:00",
      "2026-09-07T11:20",
    ),
    ev("ECONOMETRICS II: FORECASTING & IDENTIFICATION  (Ses. 2) Asynchronous ", "2026-09-09T19:00", "2026-09-09T20:20"),
    ev("ECONOMETRICS II: FORECASTING & IDENTIFICATION Extra Live in-person ", "2026-09-11T19:00", "2026-09-11T20:20"),
    ev("ECONOMIC REPORTING LAB  (Ses. 1-2) Live online ", "2026-09-08T10:00", "2026-09-08T12:50"),
    ev("GERMAN BEGINNER 1  (Ses. 3) Live online ", "2026-09-08T13:00", "2026-09-08T14:20"),
  ]);

  it("keeps full course names and drops the delivery tags", () => {
    expect(grouped.map((c) => c.name)).toEqual([
      "ECONOMETRICS II: FORECASTING & IDENTIFICATION",
      "ECONOMIC REPORTING LAB",
      "GERMAN BEGINNER 1",
    ]);
  });

  it("extra sessions are unnumbered; asynchronous ones keep their number but aren't busy time", () => {
    const eco = grouped[0];
    expect(eco.sessions.map((s) => s.number)).toEqual([1, 2, 0]);
    expect(sessionDate(eco, 2)).toBe("2026-09-09");
    const busy = busyMinutesByDate({ courses: grouped, mapping: {} });
    expect(busy["2026-09-09"]).toBeUndefined(); // asynchronous evening session
    expect(busy["2026-09-11"]).toBe(110); // extra session 19:00–20:20 → busy 18:45–20:35
  });
});

describe("deadlines in the calendar", () => {
  const ev = (summary: string, start: string, end: string, allDay = false) => ({
    uid: `${summary}${start}`,
    summary,
    start,
    end,
    allDay,
  });
  const events = [
    ev("Deadline of Watch video - Session 19a: Globalisation", "2026-10-22T23:59", "2026-10-22T23:59"),
    ev("H5: Hypothesis hand-in", "2026-11-03T23:59", "2026-11-03T23:59"),
    ev("Midterm Exam", "2026-11-10T19:00", "2026-11-10T19:00"),
    ev("Old essay", "2026-10-01T23:59", "2026-10-01T23:59"),
    ev("## CANCELLED ## Quiz 2", "2026-11-05T23:59", "2026-11-05T23:59"),
    ev("National holiday", "2026-11-01", "2026-11-02", true),
    ev("LANGUAGES EXAM PREPARATION  (Ses. 2) Live online ", "2026-11-12T19:30", "2026-11-12T21:00"),
  ];

  it("lists upcoming hand-ins and exams, not classes, holidays, cancelled or past ones", () => {
    expect(extractDeadlines(events, "2026-10-21")).toEqual([
      { uid: events[0].uid, title: "Watch video - Session 19a: Globalisation", date: "2026-10-22" },
      { uid: events[1].uid, title: "H5: Hypothesis hand-in", date: "2026-11-03" },
      { uid: events[2].uid, title: "Midterm Exam", date: "2026-11-10" },
    ]);
  });

  it("a session number makes it a class, even with “exam” in the name", () => {
    expect(groupClassSessions(events).map((c) => c.name)).toEqual(["LANGUAGES EXAM PREPARATION"]);
  });
});

describe("classes and deadlines for the plan", () => {
  it("lists a day's classes once each (double sessions too), with your course name when matched", () => {
    const cc = {
      key: "eco",
      name: "ECONOMETRICS",
      sessions: [
        { number: 3, date: "2026-10-21", start: "16:30", end: "19:20" },
        { number: 4, date: "2026-10-21", start: "16:30", end: "19:20" },
        { number: 0, date: "2026-10-21", start: "09:00", end: "10:20", async: true },
      ],
    };
    const day = classesOn({ courses: [cc], mapping: { eco: "c1" } }, "2026-10-21", [
      { id: "c1", name: "Econometrics" },
    ]);
    expect(day.map((c) => [c.start, c.name, c.number, c.async])).toEqual([
      ["09:00", "Econometrics", 0, true],
      ["16:30", "Econometrics", 3, false],
    ]);
  });

  it("hides calendar deadlines you added, ignored or that are past", () => {
    const sync = {
      courses: [],
      mapping: {},
      deadlines: [
        { uid: "a", title: "H5", date: "2026-10-30" },
        { uid: "b", title: "H6", date: "2026-11-06" },
        { uid: "c", title: "Old", date: "2026-10-01" },
      ],
      handled: { a: "added" as const },
    };
    expect(openCalendarDeadlines(sync, "2026-10-21").map((d) => d.uid)).toEqual(["b"]);
  });
});
