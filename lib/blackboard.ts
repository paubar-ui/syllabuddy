// Blackboard calendar → class sessions per course (V2-3).
// Groups timed class events by course, numbers them (Blackboard's own "(Ses. 10)" numbers when the
// titles have them, else 1..N in date order), skips cancelled classes, matches them to your
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
// "Marketing Session 2", "Finance - Lecture 4": a class word with its number at the end.
const SESSION_WORDS =
  /\s*[-–:#·|]?\s*\b(session|sesi[oó]n|class|clase|lecture|seminar|seminario|tutorial|meeting|reuni[oó]n)\s*#?\d+\s*$/i;

// "(Ses. 10)", "(Sesión 3)", "(Sessions 3-4)": session numbers written in the title.
const SESSION_NUMBER =
  /\(?\s*\b(?:ses\.?|sesi[oó]n(?:es)?|sessions?)\s*#?\s*(\d{1,2})(?:\s*(?:-|–|&|y|and|,)\s*(\d{1,2}))?\s*\)?/i;
// How a class is given, written after the title (IE: "Live in-person", "Live online", "Asynchronous").
const DELIVERY =
  /\s*\b(?:live\s+(?:in-person|online)|asynchronous|as[ií]ncron[oa]|online|in-person|presencial|h[ií]brid[oa]|hybrid)\s*$/i;
const ASYNC = /\b(asynchronous|as[ií]ncron[oa])\b/i;
// "COURSE Extra Live in-person": an extra session outside the numbered ones.
const EXTRA = /\s*\bextra\b\s*$/i;
// After "COURSE:" these words mean the rest only describes the class ("Statistics: Class 3").
const CLASS_WORDS = /^(?:session|sesi[oó]n|class|clase|lecture|seminar|seminario|tutorial|lab|meeting|reuni[oó]n)\b/i;
// "## CANCELLED ##", "Cancelada", "Anulado": not a class.
const CANCELLED = /\b(cancel+ed|cancelad[oa]|anulad[oa]|suspendid[oa])\b/i;
// A group / section code at the end of the title, e.g. "T-20.", "S-A" or "SEC-A".
const SECTION_CODE = /\s+(?:[A-Z]{1,4}-?\d{1,4}|[A-Z]{1,4}-[A-Z]{1,2}|SEC(?:TION)?[\s.-]*[A-Z0-9]{1,3})\.?$/;

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
  const summary = event.summary
    .replace(/\s+/g, " ")
    .replace(SESSION_NUMBER, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(DELIVERY, "")
    .replace(EXTRA, "")
    .replace(SECTION_CODE, "")
    .replace(/^[\s:–|·#-]+|[\s:–|·#-]+$/g, "");
  const parts = /^(.{2,80}?)\s*(?::|\s[-–|]\s)\s*(.+)$/.exec(summary);
  if (parts) {
    // "Session 3: Statistics" names the course after the colon; "Statistics: Session 3" before it.
    // Otherwise the colon is part of the name ("ECONOMETRICS II: FORECASTING & IDENTIFICATION").
    const [, before, after] = parts;
    if (SESSION_ONLY.test(before)) return after.replace(SESSION_WORDS, "").trim() || after;
    if (CLASS_WORDS.test(after)) return before.trim();
  }
  const stripped = summary.replace(SESSION_WORDS, "").trim();
  return stripped || summary;
}

export function isClassEvent(event: CalendarEvent): boolean {
  if (event.allDay) return false;
  const minutes = Math.round((new Date(`${event.end}:00`).getTime() - new Date(`${event.start}:00`).getTime()) / 60000);
  return minutes >= 30 && minutes <= 300 && !NOT_A_CLASS.test(event.summary) && !CANCELLED.test(event.summary);
}

/** Session numbers written in a title: "(Ses. 10)" → [10], "(Sessions 3-4)" → [3, 4]. */
export function sessionNumbersOf(summary: string): number[] {
  const m = SESSION_NUMBER.exec(summary);
  if (!m) return [];
  const from = Number(m[1]);
  const to = m[2] ? Number(m[2]) : from;
  if (from < 1 || to < from || to - from > 3) return [from];
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

/**
 * Class sessions grouped per course. When most titles carry Blackboard's own session numbers,
 * those are used (classes without one still count as busy time, with number 0); otherwise
 * classes are numbered 1..N by date and time.
 */
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
      const sorted = [...g.events].sort((a, b) => a.start.localeCompare(b.start));
      const numbered = sorted.filter((e) => sessionNumbersOf(e.summary).length > 0).length;
      const useOwnNumbers = numbered > 0 && numbered >= sorted.length / 2;
      const seen = new Set<string>();
      const sessions: ClassSession[] = [];
      let count = 0;
      for (const e of sorted) {
        const extra = EXTRA.test(e.summary.replace(DELIVERY, "").trim());
        const own = useOwnNumbers && !extra ? sessionNumbersOf(e.summary) : [];
        const numbers = useOwnNumbers ? (own.length ? own : [0]) : [++count];
        for (const number of numbers) {
          const id = `${number}|${e.start}`;
          if (seen.has(id) || (!useOwnNumbers && seen.has(`*|${e.start}`))) continue; // listed twice
          seen.add(id);
          seen.add(`*|${e.start}`);
          sessions.push({
            number,
            date: e.start.slice(0, 10),
            start: e.start.slice(11, 16),
            end: e.end.slice(11, 16),
            ...(ASYNC.test(e.summary) ? { async: true } : {}),
          });
        }
      }
      if (!useOwnNumbers) sessions.forEach((s, i) => (s.number = i + 1)); // renumber after removing duplicates
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

/** How many class meetings (a double session is one meeting). */
export function classCount(course: CalendarCourse): number {
  return new Set(course.sessions.map((s) => `${s.date} ${s.start}`)).size;
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
      if (s.async) continue; // nowhere to be: not busy time
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
      if (s.date !== date || s.async) continue;
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
