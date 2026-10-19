// Offline syllabus reader: finds deliverables, dates, weights, grade scale and attendance
// rules in plain text, in English and Spanish. This is the main path when there's no AI key,
// so it tries hard — but the user always reviews the result before saving.
import { addDaysISO, daysBetween } from "./dates";
import type { ExtractedDeliverable, ExtractedSyllabus } from "./extraction";
import type { DeliverableType } from "./types";

export interface ParseOptions {
  /** ISO date used to guess missing years. */
  today: string;
  /** First day of week 1, so "Week 7" can become a date. Found in the text if not given. */
  semesterStart?: string;
  courseNameHint?: string;
  /** "05/11" means 5 November (default) rather than May 11. */
  dayFirst?: boolean;
}

export interface ParsedSyllabus extends ExtractedSyllabus {
  /** True when the text mentions weeks ("Week 7") but we had no start date to turn them into dates. */
  unresolvedWeeks: boolean;
}

// ---------- Deliverable types ----------

const TYPE_RULES: [DeliverableType, RegExp][] = [
  ["midterm", /\b(mid-?terms?|mid-semester|parcial(es)?|intermedio)\b/i],
  ["presentation", /\b(presentations?|presentaci[oó]n|exposici[oó]n|pitch|moot court)\b/i],
  ["project", /\b(projects?|proyectos?|capstone|group work|trabajo (en|de) grupo|trabajo grupal)\b/i],
  ["essay", /\b(essays?|ensayos?|papers?|informes?|reports?|redacci[oó]n|case brief|memo)\b/i],
  ["final", /\bfinal\b/i],
  ["quiz", /\b(quiz(zes)?|cuestionarios?|pruebas?|tests?|controles?|control)\b/i],
  ["exam", /\b(exams?|ex[aá]men(es)?|examination)\b/i],
  ["homework", /\b(homework|assignments?|problem sets?|problem sheets?|worksheets?|tareas?|deberes|ejercicios|case stud(y|ies)|caso pr[aá]ctico)\b/i],
  ["reading", /\b(readings?|lecturas?)\b/i],
];

const NOT_A_DELIVERABLE = /\b(participation|participaci[oó]n|attendance|asistencia|office hours|tutor[ií]as?)\b/i;

export function detectType(line: string): DeliverableType | null {
  for (const [type, re] of TYPE_RULES) if (re.test(line)) return type;
  return null;
}

const DEFAULT_TITLES: Record<DeliverableType, string> = {
  exam: "Exam",
  midterm: "Midterm exam",
  final: "Final exam",
  essay: "Essay",
  project: "Project",
  presentation: "Presentation",
  quiz: "Quiz",
  homework: "Assignment",
  reading: "Reading",
  other: "Deliverable",
};

// ---------- Dates ----------

const MONTH_WORDS =
  "january|february|march|april|june|july|august|september|october|november|december|" +
  "enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|" +
  "sept|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|ene|abr|ago|dic";
const MONTH = `(${MONTH_WORDS})\\.?(?![a-záéíóú])`;
const MONTH_INDEX: Record<string, number> = {
  jan: 0, ene: 0, feb: 1, mar: 2, apr: 3, abr: 3, may: 4, jun: 5, jul: 6,
  aug: 7, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dec: 11, dic: 11,
};
const monthFromWord = (word: string) => MONTH_INDEX[word.toLowerCase().slice(0, 3)];

const ORD = "(?:st|nd|rd|th|º|°)?";
const DATE_PATTERNS: { re: RegExp; kind: "iso" | "dayMonth" | "monthDay" | "numeric" | "week" }[] = [
  { kind: "iso", re: /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g },
  {
    kind: "dayMonth",
    re: new RegExp(`\\b(\\d{1,2})${ORD}(?:\\s+de|\\s+of)?[\\s-]+${MONTH}(?:,?\\s+(?:de\\s+|del\\s+)?(\\d{4}))?`, "gi"),
  },
  { kind: "monthDay", re: new RegExp(`\\b${MONTH}\\s+(\\d{1,2})${ORD}\\b(?:,?\\s+(\\d{4}))?`, "gi") },
  { kind: "numeric", re: /\b(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?\b/g },
  { kind: "week", re: /\b(?:week|semana|wk)\.?\s*(\d{1,2})\b/gi },
];

interface DateMatch {
  iso: string | null; // null for a week we couldn't resolve
  start: number;
  end: number;
  isWeek: boolean;
}

function makeISO(year: number, month: number, day: number): string | null {
  const d = new Date(year, month, day);
  if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) return null;
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** No year written: pick this year, or next year if that would be long ago. */
function withInferredYear(month: number, day: number, today: string): string | null {
  const year = Number(today.slice(0, 4));
  const iso = makeISO(year, month, day);
  if (!iso) return null;
  return daysBetween(today, iso) < -120 ? makeISO(year + 1, month, day) : iso;
}

export function findDates(line: string, opts: ParseOptions): DateMatch[] {
  const found: DateMatch[] = [];
  const overlaps = (s: number, e: number) => found.some((m) => s < m.end && e > m.start);

  for (const { kind, re } of DATE_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      let iso: string | null = null;

      if (kind === "iso") {
        iso = makeISO(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      } else if (kind === "dayMonth" || kind === "monthDay") {
        const [day, word, year] = kind === "dayMonth" ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
        const month = monthFromWord(word);
        iso = year
          ? makeISO(Number(year), month, Number(day))
          : withInferredYear(month, Number(day), opts.today);
      } else if (kind === "numeric") {
        const [, a, sep, b, y] = m;
        // Without a year only "15/11" counts — "1-2 pages" or "2.5" are not dates.
        if (!y && sep !== "/") continue;
        let [day, month] = [Number(a), Number(b)];
        const dayFirst = opts.dayFirst ?? true;
        if (month > 12 || (!dayFirst && day <= 12)) [day, month] = [month, day];
        if (y) {
          const year = y.length === 2 ? 2000 + Number(y) : Number(y);
          iso = makeISO(year, month - 1, day);
        } else {
          iso = withInferredYear(month - 1, day, opts.today);
        }
      } else {
        const week = Number(m[1]);
        if (week < 1 || week > 30) continue;
        found.push({
          iso: opts.semesterStart ? addDaysISO(opts.semesterStart, (week - 1) * 7) : null,
          start,
          end,
          isWeek: true,
        });
        continue;
      }
      if (iso) found.push({ iso, start, end, isWeek: false });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// ---------- Weights ----------

const NUM = "(\\d{1,3}(?:[.,]\\d+)?)";
const WEIGHT_PATTERNS = [
  new RegExp(`${NUM}\\s*%`),
  new RegExp(`\\b(?:weight|peso|worth|vale|ponderaci[oó]n|value)\\s*[:=]?\\s*${NUM}`, "i"),
  new RegExp(`[-–—:|]\\s*${NUM}\\s*(?:pts?\\.?|points|puntos)?\\s*(?=$|[\\s,;)|–—-])`, "i"),
];

export function findWeight(line: string): { value: number; start: number; end: number } | null {
  for (const re of WEIGHT_PATTERNS) {
    const m = re.exec(line);
    if (!m) continue;
    const value = Number(m[1].replace(",", "."));
    if (value > 0 && value <= 100) return { value, start: m.index, end: m.index + m[0].length };
  }
  return null;
}

// ---------- Titles ----------

const EDGE_JUNK = /^[\s\-–—:|,;.()[\]*•·▪>]+|[\s\-–—:|,;.([*•·▪]+$/g;
const LEADING_WORDS = /^(due|deadline|fecha|entrega|on|by|the|el|la)\b\s*/i;
const TRAILING_WORDS =
  /\s*\b(due|due date|deadline|on|by|el|del|de|para|fecha|fecha de entrega|entrega|date|weight|peso|worth|pts|points|puntos|of final grade|of the grade|de la nota)$/i;

function cleanTitle(line: string, cuts: { start: number; end: number }[], type: DeliverableType): string {
  let text = line;
  for (const c of [...cuts].sort((a, b) => b.start - a.start)) {
    text = text.slice(0, c.start) + " " + text.slice(c.end);
  }
  text = text
    .replace(/^\s*(\d+[.)]|[-*•·▪])\s+/, "")
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+/g, " ");
  for (let prev = ""; prev !== text; ) {
    prev = text;
    text = text.replace(EDGE_JUNK, "").replace(LEADING_WORDS, "").replace(TRAILING_WORDS, "").trim();
  }
  if (text.length < 3) return DEFAULT_TITLES[type];
  const title = text.length > 80 ? `${text.slice(0, 77).trimEnd()}…` : text;
  return title[0].toUpperCase() + title.slice(1);
}

// ---------- Whole syllabus ----------

const COURSE_LABEL = /^\s*(?:course(?: name| title)?|subject|asignatura|materia|curso)\s*[:\-–]\s*(.+)$/i;
const START_LINE =
  /\b(semester|term|course|classes|lectures|clases|curso|semestre|cuatrimestre)\b.*\b(starts?|begins?|commences?|inicio|comienza|empieza)\b|\b(start date|fecha de inicio|inicio de clases|first day of class(es)?)\b/i;
const ATTENDANCE = /\b(attendance|absences?|asistencia|faltas|ausencias|inasistencias)\b/i;

function detectGradeScale(text: string): number | null {
  const m =
    /\b(?:out of|sobre|scale of|escala de|0\s*[-–]\s*|1\s*[-–]\s*)\s*(10|20|100)\b/i.exec(text) ??
    /\/\s*(10|20|100)\b(?!\s*[/.-]\s*\d)/.exec(text);
  return m ? Number(m[1]) : null;
}

function detectCourseName(lines: string[]): string | null {
  for (const line of lines.slice(0, 40)) {
    const m = COURSE_LABEL.exec(line);
    if (m) return m[1].trim().slice(0, 120);
  }
  for (const line of lines.slice(0, 5)) {
    const name = line.replace(/\b(syllabus|course outline|programa( de la asignatura)?|gu[ií]a docente)\b/gi, "")
      .replace(EDGE_JUNK, "")
      .trim();
    if (name.length >= 3 && name.length <= 80 && !/\d{1,2}[/.-]\d|%/.test(name)) return name;
  }
  return null;
}

/** A line listing several graded items ("Midterm 30%, Final 40%") is split into one segment each. */
function segments(line: string): string[] {
  const percents = line.match(/\d\s*%/g)?.length ?? 0;
  if (percents < 2) return [line];
  return line.split(/[;,•·]|\s{3,}|\t/).map((s) => s.trim()).filter(Boolean);
}

export function parseSyllabus(text: string, opts: ParseOptions): ParsedSyllabus {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim().length > 0);

  let semesterStart = opts.semesterStart;
  if (!semesterStart) {
    for (const line of lines) {
      if (!START_LINE.test(line)) continue;
      const first = findDates(line, opts).find((d) => !d.isWeek && d.iso);
      if (first?.iso) {
        semesterStart = first.iso;
        break;
      }
    }
  }
  const dateOpts: ParseOptions = { ...opts, semesterStart };

  const attendance = lines.filter((l) => ATTENDANCE.test(l)).slice(0, 2).join(" ").trim();
  const deliverables: ExtractedDeliverable[] = [];
  const seen = new Set<string>();
  let unresolvedWeeks = false;

  const parts = lines.flatMap(segments);
  parts.forEach((part, i) => {
    if (part.length > 300 || NOT_A_DELIVERABLE.test(part) || START_LINE.test(part)) return;
    const type = detectType(part);
    if (!type) return;

    const ownDates = findDates(part, dateOpts);
    const ownWeight = findWeight(blank(part, ownDates));
    let dates = ownDates;
    let weight = ownWeight?.value ?? null;
    // "Final exam" on one line, "Date: 15 Dec · 40%" on the next ones.
    for (let j = i + 1; j <= i + 2 && j < parts.length && (!dates.length || weight === null); j++) {
      if (detectType(parts[j])) break;
      const nextDates = findDates(parts[j], dateOpts);
      if (!dates.length) dates = nextDates;
      weight ??= findWeight(blank(parts[j], nextDates))?.value ?? null;
    }
    if (!dates.length && weight === null) return;

    const date = dates.find((d) => d.iso) ?? dates[0];
    if (date?.isWeek && !date.iso) unresolvedWeeks = true;

    // Only cut text that was found on this line itself.
    const cuts = [...ownDates, ...(ownWeight ? [ownWeight] : [])];
    const item: ExtractedDeliverable = {
      title: cleanTitle(part, cuts, type),
      type,
      dueDate: date?.iso ?? null,
      weight,
    };
    const key = `${item.type}|${item.dueDate}|${item.weight}|${item.title.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    deliverables.push(item);
  });

  return {
    courseName: opts.courseNameHint?.trim() || detectCourseName(lines),
    gradeScale: detectGradeScale(text),
    attendancePolicy: attendance ? attendance.slice(0, 300) : null,
    deliverables,
    unresolvedWeeks,
  };
}

/** Replaces matched dates with spaces so "15-11" isn't read as a weight. Keeps positions. */
function blank(line: string, spans: { start: number; end: number }[]): string {
  let out = line;
  for (const s of spans) out = out.slice(0, s.start) + " ".repeat(s.end - s.start) + out.slice(s.end);
  return out;
}
