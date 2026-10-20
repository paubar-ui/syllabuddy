// Blackboard calendar → class sessions per course (V2-3).
// Groups timed class events by course, numbers them 1..N in date order, matches them to your
// Syllabuddy courses, turns "Session 15" into a real date and marks class hours as busy.
import type { CalendarEvent } from "./calendarIcs";
import type { CalendarCourse, CalendarSync, ClassSession, Course, Deliverable } from "./types";

/** Study blocks are placed from 18:00 (like Today and the calendar export). */
export const STUDY_START_MINUTE = 18 * 60;
export const CLASS_BUFFER_MINUTES = 15;
/** Re-read the calendar link at most this often when the app opens. */
export const RESYNC_HOURS = 6;

// Deadlines and exams in the calendar are not class meetings.
const NOT_A_CLASS =
  /\b(due|deadline|submission|submit|entrega|assignment|tarea|quiz|exam|examen|midterm|final|test|cuestionario|office hours|tutor[ií]a)\b/i;
const SESSION_WORDS =
  /\s*[-–:#·|]?\s*\b(session|sesi[oó]n|class|clase|lecture|seminar|seminario|tutorial|lab|meeting|reuni[oó]n)\b\s*(#?\d+)?\s*$/i;

const SESSION_ONLY = /^\s*(session|sesi[oó]n|class|clase|lecture|seminar|seminario|week|semana)\s*#?\d*\s*$/i;

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Which course an event belongs to: its category, else "COURSE: title", else the title itself. */
export function courseNameOf(event: CalendarEvent): string {
  if (event.categories?.[0]) return event.categories[0];
  const summary = event.summary.replace(/\s+/g, " ").trim();
  const parts = /^(.{2,80}?)\s*(?::|\s[-–|]\s)\s*(.+)$/.exec(summary);
  if (parts) {
    // "Session 3: Statistics" names the course after the colon; "Statistics: Session 3" before it.
    const [, before, after] = parts;
    return SESSION_ONLY.test(before) ? after.replace(SESSION_WORDS, "").trim() || after : before.trim();
  }
  const stripped = summary
    .replace(SESSION_WORDS, "")
    .replace(/\s*#?\d+\s*$/, "")
    .trim();
  return stripped || summary;
}

export function isClassEvent(event: CalendarEvent): boolean {
  if (event.allDay) return false;
  const minutes = Math.round((new Date(`${event.end}:00`).getTime() - new Date(`${event.start}:00`).getTime()) / 60000);
  return minutes >= 30 && minutes <= 300 && !NOT_A_CLASS.test(event.summary);
}

/** Class sessions grouped per course and numbered 1..N by date and time. */
export function groupClassSessions(events: CalendarEvent[]): CalendarCourse[] {
  const groups = new Map<string, { name: string; events: CalendarEvent[] }>();
  for (const e of events) {
    if (!isClassEvent(e)) continue;
    const name = courseNameOf(e);
    const key = normalize(name);
    if (!key) continue;
    const group = groups.get(key) ?? { name, events: [] };
    group.events.push(e);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const seen = new Set<string>();
      const sessions: ClassSession[] = [];
      for (const e of [...g.events].sort((a, b) => a.start.localeCompare(b.start))) {
        if (seen.has(e.start)) continue; // the same class listed twice
        seen.add(e.start);
        sessions.push({
          number: sessions.length + 1,
          date: e.start.slice(0, 10),
          start: e.start.slice(11, 16),
          end: e.end.slice(11, 16),
        });
      }
      return { key, name: g.name, sessions };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** How alike two course names are, 0..1 (shared words; course codes count double). */
export function nameSimilarity(a: string, b: string): number {
  const wa = new Set(
    normalize(a)
      .split(" ")
      .filter((w) => w.length > 1),
  );
  const wb = new Set(
    normalize(b)
      .split(" ")
      .filter((w) => w.length > 1),
  );
  if (!wa.size || !wb.size) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += /\d/.test(w) ? 2 : 1;
  return Math.min(1, shared / Math.min(wa.size, wb.size));
}

/** Best guesses for "Blackboard course ↔ Syllabuddy course"; each course is used once. */
export function guessMapping(
  calendarCourses: CalendarCourse[],
  courses: Pick<Course, "id" | "name">[],
): Record<string, string> {
  const pairs = calendarCourses
    .flatMap((cc) => courses.map((c) => ({ key: cc.key, id: c.id, score: nameSimilarity(cc.name, c.name) })))
    .filter((p) => p.score >= 0.5)
    .sort((a, b) => b.score - a.score);
  const mapping: Record<string, string> = Object.fromEntries(calendarCourses.map((cc) => [cc.key, ""]));
  const used = new Set<string>();
  for (const p of pairs) {
    if (mapping[p.key] || used.has(p.id)) continue;
    mapping[p.key] = p.id;
    used.add(p.id);
  }
  return mapping;
}

/** The calendar course matched to a Syllabuddy course, if any. */
export function calendarCourseFor(sync: CalendarSync | null, courseId: string): CalendarCourse | undefined {
  if (!sync) return undefined;
  const key = Object.entries(sync.mapping).find(([, id]) => id === courseId)?.[0];
  return sync.courses.find((c) => c.key === key);
}

/** Date of session N of a course in the calendar. */
export function sessionDate(calendarCourse: CalendarCourse | undefined, n: number): string | undefined {
  return calendarCourse?.sessions.find((s) => s.number === n)?.date;
}

/**
 * Minutes of each day's study time (from 18:00) taken by classes, with a 15-minute buffer
 * around each class. Daytime classes don't touch evening study time.
 */
export function busyMinutesByDate(sync: CalendarSync | null, studyStart = STUDY_START_MINUTE): Record<string, number> {
  const busy: Record<string, [number, number][]> = {};
  for (const course of sync?.courses ?? []) {
    for (const s of course.sessions) {
      const from = Math.max(studyStart, minutesOf(s.start) - CLASS_BUFFER_MINUTES);
      const to = Math.min(24 * 60, minutesOf(s.end) + CLASS_BUFFER_MINUTES);
      if (to > from) (busy[s.date] ??= []).push([from, to]);
    }
  }
  const result: Record<string, number> = {};
  for (const [date, ranges] of Object.entries(busy)) {
    // Merge overlapping classes so their time isn't counted twice.
    ranges.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [curFrom, curTo] = ranges[0];
    for (const [f, t] of ranges.slice(1)) {
      if (f <= curTo) curTo = Math.max(curTo, t);
      else {
        total += curTo - curFrom;
        [curFrom, curTo] = [f, t];
      }
    }
    result[date] = total + (curTo - curFrom);
  }
  return result;
}

/** When study can start on a day: 18:00, or 15 minutes after an evening class ends. */
export function studyStartMinute(sync: CalendarSync | null, date: string): number {
  let start = STUDY_START_MINUTE;
  for (const course of sync?.courses ?? []) {
    for (const s of course.sessions) {
      if (s.date !== date) continue;
      const end = minutesOf(s.end) + CLASS_BUFFER_MINUTES;
      if (end > start && minutesOf(s.start) - CLASS_BUFFER_MINUTES <= start) start = end;
    }
  }
  return Math.min(start, 23 * 60);
}

/**
 * Puts calendar dates where they belong: deliverables "due in Session N" (unless you changed
 * the date yourself) and course session schedules without dates. Returns null when nothing changed.
 */
export function applyCalendar(
  sync: CalendarSync | null,
  courses: Course[],
  deliverables: Deliverable[],
): { courses: Course[]; deliverables: Deliverable[] } | null {
  if (!sync) return null;
  let changed = false;
  const nextDeliverables = deliverables.map((d) => {
    if (!d.sessionRef || d.done || d.dateFromCalendar === false) return d;
    const date = sessionDate(calendarCourseFor(sync, d.courseId), d.sessionRef);
    if (!date || (date === d.dueDate && d.dateFromCalendar)) return d;
    changed = true;
    return { ...d, dueDate: date, dateFromCalendar: true };
  });
  const nextCourses = courses.map((c) => {
    const cc = calendarCourseFor(sync, c.id);
    if (!cc || !c.sessions?.some((s) => !s.date)) return c;
    const sessions = c.sessions.map((s) => (s.date ? s : { ...s, date: sessionDate(cc, s.number) }));
    if (sessions.every((s, i) => s.date === c.sessions![i].date)) return c;
    changed = true;
    return { ...c, sessions };
  });
  return changed ? { courses: nextCourses, deliverables: nextDeliverables } : null;
}

/** Re-read the link when the app opens? Only for links, and at most every 6 hours. */
export function needsResync(sync: CalendarSync | null, now: Date): boolean {
  if (!sync?.url) return false;
  if (!sync.lastSync) return true;
  return now.getTime() - new Date(sync.lastSync).getTime() >= RESYNC_HOURS * 3600 * 1000;
}

/** Turns what people paste (webcal://, spaces) into an https URL, or null if it isn't one. */
export function normalizeCalendarUrl(input: string): string | null {
  const trimmed = input.trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}
