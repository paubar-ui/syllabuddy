// Reads the session schedule of a syllabus (pasted text or PDF text) the way a person skims it,
// without AI and without one university's template:
//   1. clean: drop page numbers, "Edited by…" lines and dates; keep the rest
//   2. find the schedule part (after PROGRAM / SCHEDULE / CONTENTS, before EVALUATION / BIBLIOGRAPHY)
//   3. cut it into blocks at "Session 3", "SESSIONS 5 - 6", "Week 4", "Clase 2"…
//   4. sort each block's lines by meaning, using general academic words (English and Spanish):
//      title, lecture concepts, readings, practice / problem sets — and spot exam blocks.
// The result is always shown as an editable list before it's used.
import type { CourseSession } from "./types";

export interface ScheduleExam {
  type: "midterm" | "final" | "exam";
  session: number; // the session it takes place in
  details: { durationMinutes?: number; materials?: string; format?: string };
}

export interface ReadSchedule {
  topics: CourseSession[];
  exams: ScheduleExam[];
}

// ---------- 1. cleaning ----------
const PAGE_NOISE = [
  /^\d{1,3}$/, // page numbers
  /^page \d+( of \d+)?$/i,
  /^p[aá]gina \d+( de \d+)?$/i,
  /^edited by\b/i,
  /^---\s*page \d+\s*---$/i,
  /^\d{1,2}(st|nd|rd|th)?\s+(of\s+)?[a-z]+\s+\d{4}$/i, // "25th June 2026"
  /^[a-z]+\s+\d{1,2}(st|nd|rd|th)?,?\s+\d{4}$/i, // "June 25, 2026"
];
const isNoise = (line: string) => PAGE_NOISE.some((re) => re.test(line));

// ---------- 2. where the schedule is ----------
const START =
  /^(program(me)?|programa|schedule|course schedule|session plan|course (content|outline|program)|contents?|contenidos?|temario|calendar(io)?|syllabus|planning)\b[\s:]*$/i;
const END =
  /^(evaluation|evaluaci[oó]n|grading|assessment|bibliograph|bibliograf|references|referencias|re-?sit|retake|attendance|asistencia|behavio(u)?r rules|academic integrity|ethical|policies|professor|office hours|ai policy|decalogue)/i;

// ---------- 3. block headers ----------
const HEADER =
  /^(sessions?|sesi[oó]n(?:es)?|clases?|class(?:es)?|lectures?|week|weeks|semana|tema|unit|unidad|module|m[oó]dulo)\s*(\d{1,2})(?:\s*(?:-|–|—|to|a|y|&|and)\s*(\d{1,2}))?\b\s*[:.)\-–—]?\s*(.*)$/i;
const family = (word: string) =>
  /^(week|weeks|semana)$/i.test(word)
    ? "week"
    : /^(tema|unit|unidad|module|m[oó]dulo)$/i.test(word)
      ? "unit"
      : "session";

// ---------- 4. what a line means ----------
const DELIVERY =
  /\(?\s*\b(live\s+(?:in-person|online)|in-person|online|asynchronous|as[ií]ncron[oa]|presencial|h[ií]brid[oa]|hybrid|virtual)\b\s*\)?/gi;
type Field = "lecture" | "practice" | "reading" | "further" | "skip";
const LABELS: [Field, RegExp][] = [
  [
    "further",
    /^(further|additional|optional|recommended|complementary)\s+(readings?|materials?)\b|^lecturas? (complementarias|recomendadas|opcionales)\b/i,
  ],
  [
    "reading",
    /^(readings?|book chapters?|chapters?|textbook|required readings?|lecturas?|lectura obligatoria|bibliograf[ií]a b[aá]sica|materials?|materiales|videos?|slides)\b/i,
  ],
  [
    "practice",
    /^(practice|practical|seminar|tutorial|workshop|lab|exercises?|problem sets?|ps\s?\d|case( study)?|caso|pr[aá]cticas?|ejercicios?|taller|debate|discussion|presentations?|teamwork|group work|activity|actividad)\b/i,
  ],
  [
    "lecture",
    /^(lecture|lectures|theory|teor[ií]a|clase te[oó]rica|contents?|contenidos?|topics?|temas?|key concepts?)\b/i,
  ],
  ["skip", /^(note|nota|professor|profesor|room|aula)\b/i],
];
// An exam block says "exam" (not just "midterm": "MIDTERM PRESENTATIONS" are presentations).
/** A label at the start of a line. Practice words stand alone ("Practice / Teamwork"); the others
 * need a colon ("Reading: …", "Lecture (session 1): …") so a wrapped "Theory" isn't one. */
function labelOf(line: string): Field | undefined {
  const found = LABELS.find(([, re]) => re.test(line))?.[0];
  if (!found || found === "practice") return found;
  return /^[^:]{0,60}:/.test(line) ? found : undefined;
}

const EXAM = /\b(exam(ination)?|examen|test|parcial|prueba)\b/i;
// Sessions that aren't study content: presentations, reviews, exam preparation.
const NOT_CONTENT =
  /\b(presentations?|presentaci[oó]n(es)?|review|repaso|revisi[oó]n|preparation|preparaci[oó]n|exam prep|q&a|tutor[ií]a|no class|holiday|festivo)\b/i;
// A title that clearly continues on the next line ("BEHAVIORAL ECONOMICS, FINANCE &").
const CONTINUES = /([&,(\-–]|\b(and|y|of|de|del|the|for|vs\.?|in|on|to))$/i;

const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const clean = (s: string) =>
  s
    .replace(DELIVERY, " ")
    .replace(/\(see bibliography\)|\(s\/c\)|\(ver bibliograf[ií]a\)/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim()
    .replace(/^[-–—:;,.•·\s]+|[-–—:;,\s]+$/g, "");

/** "Lecture (session 1): A; B; C." → the text after the label. */
function afterLabel(line: string): string {
  const m = /^[^:]{0,60}?(?:\([^)]*\))?\s*:\s*(.*)$/.exec(line);
  if (m && LABELS.some(([, re]) => re.test(line))) return m[1];
  return line.replace(/^\S+(\s*[./]\s*\S+)*\s*/, (w) => (LABELS.some(([, re]) => re.test(w)) ? "" : w));
}

/** Key concepts from a lecture description: split on ";" (or sentences, then commas). */
export function conceptsFrom(text: string): string[] {
  const t = clean(text);
  if (!t) return [];
  let parts = t.split(/;\s*/).flatMap((p) => p.split(/\.\s+(?=[A-Z])/));
  parts = parts.flatMap((p) => (p.length > 90 ? p.split(/,\s*/) : [p]));
  return [...new Set(parts.map((p) => clean(p).replace(/\.$/, "")).filter((p) => p.length > 2))].slice(0, 12).map((p) => cap(p, 90));
}

function examDetails(lines: string[]): ScheduleExam["details"] {
  const text = lines.join(" ");
  const details: ScheduleExam["details"] = {};
  const h = /(\d+(?:[.,]\d+)?)\s*(h|hours?|horas?)\b/i.exec(text);
  const m = /(\d{2,3})\s*(min|minutes|minutos)\b/i.exec(text);
  if (h) details.durationMinutes = Math.round(Number(h[1].replace(",", ".")) * 60);
  else if (m) details.durationMinutes = Number(m[1]);
  const materials = lines.find((l) =>
    /allowed|permitid|closed book|open book|calculator|calculadora|formula sheet|notes/i.test(l),
  );
  if (materials) details.materials = cap(clean(materials), 160);
  const format = lines.find(
    (l) => /multiple choice|test tipo|problems?|essay|short answer|written|oral|preguntas/i.test(l) && l !== materials,
  );
  if (format) details.format = cap(clean(format), 160);
  return details;
}

interface Block {
  from: number;
  to: number;
  head: string; // text after the header on the same line
  lines: string[];
}

/** Steps 1–3: the schedule's blocks. */
function blocksOf(text: string): Block[] {
  const all = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l && !isNoise(l));
  let start = all.findIndex((l) => START.test(l));
  let lines = start >= 0 ? all.slice(start + 1) : all;
  // If the "PROGRAM" heading had no sessions after it, read everything.
  if (!lines.some((l) => HEADER.test(l))) {
    start = -1;
    lines = all;
  }
  const end = lines.findIndex((l, i) => i > 0 && END.test(l) && l === l.toUpperCase() && /[A-Z]/.test(l));
  if (end > 0) lines = lines.slice(0, end);

  const blocks: Block[] = [];
  let level: string | null = null;
  for (const line of lines) {
    const h = HEADER.exec(line);
    if (h) {
      const fam = family(h[1]);
      const from = Number(h[2]);
      const to = h[3] ? Number(h[3]) : from;
      const current = blocks.at(-1);
      level ??= fam;
      // "Session 1" repeated under "SESSION 1 (LIVE IN-PERSON)", or "Week 3 — Title" inside
      // a session block: part of the current block, not a new one.
      const sameSessions = current && from >= current.from && from <= current.to;
      if (fam === level && !sameSessions && to >= from && to - from < 6) {
        blocks.push({ from, to, head: h[4] ?? "", lines: [] });
        continue;
      }
      if (current) {
        const rest = clean(h[4] ?? "");
        if (rest) current.lines.push(rest);
        continue;
      }
    }
    blocks.at(-1)?.lines.push(line);
  }
  return blocks;
}

/** Steps 1–4. */
export function readSchedule(text: string): ReadSchedule {
  const blocks = blocksOf(text);
  const topics: CourseSession[] = [];
  const exams: ScheduleExam[] = [];

  for (const b of blocks) {
    const head = clean(b.head);
    // Group the block's lines into fields; lines without a label continue the previous field.
    const fields: { field: Field | "title"; text: string }[] = [];
    if (head) fields.push({ field: "title", text: head });
    for (const raw of b.lines) {
      const line = raw.trim();
      const label = labelOf(line);
      if (label) fields.push({ field: label, text: line });
      else if (fields.length && fields.at(-1)!.field !== "title") fields.at(-1)!.text += ` ${line}`;
      else if (!fields.length || fields.at(-1)!.field === "title") {
        if (fields.length && CONTINUES.test(fields.at(-1)!.text)) {
          // a wrapped title ("MIDTERM" / "EXAM")
          fields.at(-1)!.text += ` ${line}`;
        } else if (!fields.length) fields.push({ field: "title", text: line });
        else fields.push({ field: "lecture", text: line });
      }
    }

    const title = clean(fields.find((f) => f.field === "title")?.text ?? "");
    const allText = [title, ...b.lines].join(" ");
    const lecture = fields.filter((f) => f.field === "lecture").map((f) => afterLabel(f.text));
    const practice = fields.filter((f) => f.field === "practice").map((f) => clean(afterLabel(f.text) || f.text));
    const readings = fields
      .filter((f) => f.field === "reading")
      .map((f) => cap(clean(afterLabel(f.text)), 140))
      .filter(Boolean);
    const further = fields.some((f) => f.field === "further");

    const labelledLecture = fields.some((f) => f.field === "lecture" && labelOf(f.text) !== undefined);
    // An exam block: its title says exam, it isn't a review, and it has no lecture or readings.
    if (EXAM.test(title) && !NOT_CONTENT.test(title) && !labelledLecture && !readings.length) {
      const word = (title || allText).toLowerCase();
      exams.push({
        type: /mid-?term|parcial|intermedio/.test(word) ? "midterm" : /final/.test(word) ? "final" : "exam",
        session: b.from,
        details: examDetails(b.lines),
      });
      continue;
    }

    // Presentations, reviews and exam-preparation sessions aren't study topics.
    if (NOT_CONTENT.test(title) && !labelledLecture && !readings.length) continue;

    const concepts = lecture.flatMap(conceptsFrom);
    const problemSets = [
      ...new Set(
        practice
          .flatMap((p) => p.match(/\b(problem sets?|ps)\s?\d+\b|\bejercicios? \d+\b/gi) ?? [])
          .map((p) =>
            p
              .replace(/^ps\s?/i, "Problem Set ")
              .replace(/^problem sets?/i, "Problem Set")
              .replace(/\s+/g, " "),
          ),
      ),
    ];
    const topic = title || concepts[0] || `Session ${b.from}`;
    topics.push({
      number: b.from,
      ...(b.to > b.from ? { upTo: b.to } : {}),
      topic: cap(topic, 120),
      concepts: concepts.filter((c) => c !== topic),
      readings: [...new Set(readings)].concat(further ? ["Further readings (see the syllabus)"] : []),
      problemSets,
      ...(practice.length ? { practice: cap(practice.join(" · "), 200) } : {}),
    });
  }
  return { topics, exams };
}

/** Which topics an exam covers by default: before the midterm for a midterm, after it for a final. */
export function topicsForExam(read: ReadSchedule, type: string): Set<number> {
  const midterm = read.exams.find((e) => e.type === "midterm")?.session;
  return new Set(
    read.topics
      .filter((t) => {
        if (midterm === undefined) return true;
        if (type === "midterm") return t.number < midterm;
        if (type === "final") return t.number > midterm;
        return true;
      })
      .map((t) => t.number),
  );
}
