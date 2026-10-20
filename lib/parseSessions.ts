// Reads a syllabus's session-by-session schedule and exam details (English and Spanish), without AI.
// Used to build exam prep plans that say WHAT to study each day. The user always reviews the result.
import { addDaysISO } from "./dates";
import { findDates, type ParseOptions } from "./parseSyllabus";
import type { CourseSession } from "./types";

export interface ParsedExam {
  type: "midterm" | "final" | "exam";
  format?: string;
  durationMinutes?: number;
  materials?: string;
  coversSessions?: number[];
}

export interface ParsedSchedule {
  sessions: CourseSession[];
  exams: ParsedExam[];
}

// "Session 3:", "Sesión 3 –", "Lecture 7.", "Week 4 —", "Clase 2:", "Tema 5", "S15 –"
const HEADER =
  /^\s*(?:[-*•·▪]\s*)?(?:(?:session|sesi[oó]n|lecture|class|clase|week|semana|tema|unit|unidad)\s*\.?\s*|S)(\d{1,2})\b\s*[:.\-–—)]?\s*(.*)$/i;
const IS_WEEK = /^\s*(?:[-*•·▪]\s*)?(?:week|semana)\b/i;
const EXAM_WORDS = /\b(mid-?terms?|parcial|intermedio|final exam|examen final|final|exam|examen)\b/i;
const BULLET = /^\s*(?:[-*•·▪◦]|\d+[.)]|[a-z][.)])\s+/i;
const READING = /\b(?:readings?|read|lecturas?|leer|bibliograf[ií]a)\b\s*[:\-–]\s*([^.;]+(?:\.\s*\d+[^.;]*)?)/i;
const CHAPTER = /\b(?:ch(?:apter)?|cap(?:[ií]tulo)?)\.?\s*\d+(?:\s*[-–]\s*\d+)?/gi;
const PROBLEM_SET =
  /\b(?:PS\s?\d+|problem\s*sets?\s*\d+|ejercicios?\s*\d+|hoja\s*(?:de\s*ejercicios\s*)?\d+|homework\s*\d+|assignment\s*\d+|tarea\s*\d+)\b/gi;
const KEY_CONCEPTS = /^\s*(?:key concepts?|concepts?|topics?|contenidos?|conceptos?(?: clave)?)\s*[:\-–]\s*(.+)$/i;

const tidy = (t: string) => t.replace(/\s+/g, " ").replace(/^[\s:.\-–—,;]+|[\s:.\-–—,;]+$/g, "").trim();

/** "PS 3" → "PS3", "problem set 4" → "Problem set 4". */
function normalizeProblemSet(raw: string): string {
  const t = tidy(raw);
  if (/^ps\s?\d+$/i.test(t)) return t.replace(/\s/g, "").toUpperCase();
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

const splitList = (t: string) =>
  t
    .split(/[,;]/)
    .map(tidy)
    .filter((x) => x.length > 1);

function extractParts(text: string) {
  const readings: string[] = [];
  const problemSets: string[] = [];
  let rest = text;

  const reading = READING.exec(rest);
  if (reading) {
    readings.push(tidy(reading[1]));
    rest = rest.replace(reading[0], " ");
  }
  for (const ch of rest.match(CHAPTER) ?? []) {
    if (!readings.some((r) => r.includes(ch))) readings.push(tidy(ch));
  }
  rest = rest.replace(CHAPTER, " ");
  for (const ps of rest.match(PROBLEM_SET) ?? []) {
    const n = normalizeProblemSet(ps);
    if (!problemSets.includes(n)) problemSets.push(n);
  }
  rest = rest.replace(PROBLEM_SET, " ").replace(/\(\s*\)/g, " ");
  return { readings, problemSets, rest: tidy(rest) };
}

/** "Externalities I: market failure, Pigouvian taxes" → topic + concepts. */
function splitTopic(rest: string): { topic: string; concepts: string[] } {
  const m = /^(.+?)(?::|\s[-–—]\s)(.+)$/.exec(rest);
  if (m && splitList(m[2]).length > 0) return { topic: tidy(m[1]), concepts: splitList(m[2]) };
  return { topic: tidy(rest), concepts: [] };
}

function parseDuration(text: string): number | undefined {
  const hm = /\b(\d)\s*h\s*(\d{1,2})\b/i.exec(text);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const min = /\b(\d{2,3})\s*(?:min|mins|minutes|minutos)\b/i.exec(text);
  if (min) return Number(min[1]);
  const hours = /\b(\d(?:[.,]\d)?)\s*(?:h|hrs?|hours?|horas?)\b/i.exec(text);
  if (hours) return Math.round(Number(hours[1].replace(",", ".")) * 60);
  return undefined;
}

function parseFormat(text: string): string | undefined {
  const parts: string[] = [];
  if (/multiple[- ]choice|tipo test|\bmcq\b|opci[oó]n m[uú]ltiple/i.test(text)) parts.push("multiple choice");
  if (/\bproblems?\b|\bexercises?\b|ejercicios|problemas|calculations?/i.test(text)) parts.push("problems");
  if (/\bessay\b|short[- ]answer|open questions|desarrollo|preguntas abiertas|written answers/i.test(text)) {
    parts.push("short-answer / essay questions");
  }
  if (/\bcase\b|caso pr[aá]ctico/i.test(text)) parts.push("case study");
  return parts.length ? parts.join(" + ") : undefined;
}

const MATERIALS: [RegExp, string][] = [
  [/closed[- ]book|libro cerrado|sin apuntes|no notes/i, "closed book"],
  [/open[- ]book|libro abierto|con apuntes/i, "open book"],
  [/formula sheet|hoja de f[oó]rmulas|cheat sheet|one page of notes|una hoja/i, "one formula sheet"],
  [/calculator|calculadora/i, "calculator allowed"],
  [/no calculator|sin calculadora/i, "no calculator"],
];

function parseMaterials(text: string): string | undefined {
  const found = MATERIALS.filter(([re]) => re.test(text)).map(([, label]) => label);
  // "no calculator" wins over "calculator allowed"
  const result = found.includes("no calculator") ? found.filter((f) => f !== "calculator allowed") : found;
  return result.length ? result.join(", ") : undefined;
}

function parseCoverage(text: string): number[] | undefined {
  const range =
    /\b(?:sessions?|sesiones|lectures?|clases|temas?|weeks?|semanas|units?|unidades)\s*(\d{1,2})\s*(?:-|–|to|a|through|hasta|al)\s*(\d{1,2})\b/i.exec(text);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    return Array.from({ length: b - a + 1 }, (_, i) => a + i);
  }
  const upTo = /\b(?:up to|until|hasta)\s*(?:the\s*)?(?:sessions?|sesi[oó]n|lectures?|clase|tema|week|semana)\s*(\d{1,2})\b/i.exec(text);
  if (upTo) return Array.from({ length: Number(upTo[1]) }, (_, i) => i + 1);
  return undefined;
}

function examType(line: string): ParsedExam["type"] {
  if (/mid-?term|parcial|intermedio/i.test(line)) return "midterm";
  if (/\bfinal\b/i.test(line)) return "final";
  return "exam";
}

export function parseSessions(text: string, opts: Pick<ParseOptions, "today" | "semesterStart">): ParsedSchedule {
  const lines = text.replace(/\r/g, "").split("\n");
  const sessions = new Map<number, CourseSession>();
  const examAt: { type: ParsedExam["type"]; session: number }[] = [];
  let current: CourseSession | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      current = null;
      continue;
    }
    const header = HEADER.exec(line);
    if (header && !/%/.test(header[2])) {
      const number = Number(header[1]);
      const rest = header[2] ?? "";
      if (EXAM_WORDS.test(rest) && !/[:\-–—].*,/.test(rest)) {
        // "Session 8: Midterm exam" — the exam happens here; it isn't a study topic.
        examAt.push({ type: examType(rest), session: number });
        current = null;
        continue;
      }
      const dates = findDates(line, { today: opts.today });
      const parts = extractParts(rest.replace(/\(?\b\d{1,2}[/.]\d{1,2}(?:[/.]\d{2,4})?\b\)?/g, " "));
      const { topic, concepts } = splitTopic(
        dates.reduce((t, d) => t.replace(line.slice(d.start, d.end), " "), parts.rest),
      );
      const session: CourseSession = {
        number,
        topic: topic || `Session ${number}`,
        concepts,
        readings: parts.readings,
        problemSets: parts.problemSets,
      };
      const date = dates.find((d) => d.iso && !d.isWeek)?.iso;
      if (date) session.date = date;
      else if (opts.semesterStart && IS_WEEK.test(line)) session.date = addDaysISO(opts.semesterStart, (number - 1) * 7);
      if (!sessions.has(number)) sessions.set(number, session);
      current = sessions.get(number)!;
      continue;
    }
    if (!current) continue;

    // Lines that belong to the current session: bullets, "Key concepts: …", "Reading: …", "PS3".
    const key = KEY_CONCEPTS.exec(line);
    const isBullet = BULLET.test(line);
    const parts = extractParts(line.replace(BULLET, ""));
    if (key) {
      current.concepts.push(...splitList(extractParts(key[1]).rest));
    } else if (isBullet && parts.rest && !READING.test(line)) {
      current.concepts.push(...splitList(parts.rest).slice(0, 6));
    }
    for (const r of parts.readings) if (!current.readings.includes(r)) current.readings.push(r);
    for (const p of parts.problemSets) if (!current.problemSets.includes(p)) current.problemSets.push(p);
    if (!isBullet && !key && !parts.readings.length && !parts.problemSets.length) current = null;
  }

  // Exam details: look at each line that mentions an exam and the few lines after it.
  const exams = new Map<ParsedExam["type"], ParsedExam>();
  lines.forEach((line, i) => {
    if (!EXAM_WORDS.test(line) || HEADER.test(line)) return;
    const type = examType(line);
    // This line plus the next few — stopping at a blank line or a line about another exam.
    const block = [line];
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      if (!lines[j].trim() || (EXAM_WORDS.test(lines[j]) && examType(lines[j]) !== type)) break;
      block.push(lines[j]);
    }
    const window = block.join(" ");
    const exam = exams.get(type) ?? { type };
    exam.format ??= parseFormat(window);
    exam.durationMinutes ??= parseDuration(window);
    exam.materials ??= parseMaterials(window);
    exam.coversSessions ??= parseCoverage(window);
    exams.set(type, exam);
  });
  for (const { type, session } of examAt) {
    const exam = exams.get(type) ?? { type };
    exam.coversSessions ??= [...sessions.keys()].filter((n) => n < session).sort((a, b) => a - b);
    exams.set(type, exam);
  }

  return {
    sessions: [...sessions.values()].sort((a, b) => a.number - b.number),
    exams: [...exams.values()],
  };
}
