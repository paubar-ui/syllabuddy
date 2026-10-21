// "Import with ChatGPT or Claude" (V2-7): a copy–paste round trip, no API key.
// We give the student a prompt; their own AI assistant reads the syllabus and answers in a
// strict line format; we parse that answer here (zod-validated, tolerant of markdown and spaces)
// and point at the exact line when something is wrong.
import { z } from "zod";
import { DELIVERABLE_TYPES } from "./extraction";
import { detectType } from "./parseSyllabus";
import type { CourseSession, DeliverableType } from "./types";

export const ASSISTANT_PROMPT = `You are helping me import my university syllabus into a study planner.
Read the syllabus I paste below and answer with ONLY one code block in exactly this format — no other text:

COURSE: <course name>
SCALE: <maximum grade: 10, 20 or 100>
DELIVERABLE: <title> | <type> | <due date as YYYY-MM-DD, or "Session N" if only the session is given> | <weight %>
SESSION: <session number> | <topic> | <key concepts, comma-separated> | <problem set or reading, or ->

Rules:
- One DELIVERABLE line for every graded item (exams, midterm, final, essays, projects, presentations, quizzes, homework). Skip participation and attendance.
- <type> is one of: exam, midterm, final, essay, project, presentation, quiz, homework, reading, other.
- Never invent dates or weights: use "Session N" when only the session is known, and "?" when the weight is unknown.
- One SESSION line per class session, in order. If two sessions are taught together ("Sessions 5-6"), write 5-6.
- Use the vertical bar | only to separate fields.

Example:
\`\`\`
COURSE: Public Economics
SCALE: 10
DELIVERABLE: Midterm exam | midterm | Session 15 | 30%
DELIVERABLE: Problem set 1 | homework | 2026-10-02 | 5%
SESSION: 1-2 | Welfare economics | Pareto efficiency, social welfare functions | Problem Set 1
SESSION: 3-4 | Externalities | Pigouvian taxes, Coase theorem | Gruber Ch. 5
\`\`\`

Here is my syllabus:
`;

export const SAMPLE_ANSWER = `\`\`\`
COURSE: Behavioral Economics
SCALE: 10
DELIVERABLE: Midterm exam | midterm | Session 16 | 30%
DELIVERABLE: Reading reflection | essay | Session 9 | 10%
DELIVERABLE: Final project | project | Session 28 | 25%
DELIVERABLE: Final exam | final | Session 30 | 35%
SESSION: 1 | Introduction to Behavioral Economics | rational choice, heuristics | Wilkinson & Klaes Ch. 1
SESSION: 2 | Rational Choice vs Behavioral Models | expected utility, bounded rationality | Wilkinson & Klaes Ch. 2
SESSION: 3 | Bounded Rationality | satisficing, cognitive limits | Wilkinson & Klaes Ch. 3
SESSION: 4 | System 1 & System 2 | dual-process theory | Wilkinson & Klaes Ch. 4
\`\`\``;

export type When = { date: string } | { session: number };

export interface ImportedDeliverable {
  line: number;
  title: string;
  type: DeliverableType;
  when: When | null; // null: we need the date from you
  weight: number | null;
}

export interface ImportedCourse {
  name: string;
  gradeScale: number;
  deliverables: ImportedDeliverable[];
  sessions: CourseSession[];
}

export interface ImportProblem {
  line: number; // 1-based, in what you pasted
  message: string;
}

export type ImportResult =
  { ok: true; courses: ImportedCourse[]; warnings: ImportProblem[] } | { ok: false; problems: ImportProblem[] };

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    // A real calendar day (no 30 February), checked in local time so time zones can't shift it.
    const [y, m, day] = s.split("-").map(Number);
    const d = new Date(y, m - 1, day);
    return d.getFullYear() === y && d.getMonth() === m - 1 && d.getDate() === day;
  });
const deliverableSchema = z.object({
  title: z.string().trim().min(1, "the title is empty").max(200),
  type: z.enum(DELIVERABLE_TYPES),
  weight: z.number().min(0, "the weight can't be negative").max(100, "the weight can't be over 100%").nullable(),
});

const TYPE_ALIASES: Record<string, DeliverableType> = {
  "mid-term": "midterm",
  "midterm exam": "midterm",
  "final exam": "final",
  assignment: "homework",
  "problem set": "homework",
  ps: "homework",
  paper: "essay",
  report: "essay",
  "group project": "project",
  test: "quiz",
};

const strip = (s: string) =>
  s
    .replace(/\*\*|__|`/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** "Session 15", "S15", "Sesión 15", "15" in the When field. */
function parseWhen(raw: string): When | null | "bad" {
  const v = strip(raw).replace(/^"|"$/g, "");
  if (!v || v === "?" || /^(unknown|tbd|tba|n\/a|-)$/i.test(v)) return null;
  const session = /^(?:session|sesi[oó]n|ses\.?|class|clase|s)\s*#?\s*(\d{1,2})$/i.exec(v);
  if (session) return { session: Number(session[1]) };
  if (isoDate.safeParse(v).success) return { date: v };
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(v); // 15/11/2026, tolerated
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    if (isoDate.safeParse(iso).success) return { date: iso };
  }
  return "bad";
}

function parseWeight(raw: string): number | null | "bad" {
  const v = strip(raw).replace(/%$/, "").trim();
  if (!v || v === "?" || v === "-") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : "bad";
}

function parseType(raw: string, title: string): DeliverableType {
  const v = strip(raw).toLowerCase();
  if ((DELIVERABLE_TYPES as readonly string[]).includes(v)) return v as DeliverableType;
  return TYPE_ALIASES[v] ?? detectType(`${v} ${title}`) ?? "other";
}

/** Reads what the AI assistant answered. Lines that aren't ours (prose, fences) are skipped. */
export function parseAssistantImport(text: string): ImportResult {
  const problems: ImportProblem[] = [];
  const warnings: ImportProblem[] = [];
  const courses: ImportedCourse[] = [];
  const lines = text.replace(/\r/g, "").split("\n");

  const current = () => {
    if (!courses.length) courses.push({ name: "", gradeScale: 10, deliverables: [], sessions: [] });
    return courses.at(-1)!;
  };

  lines.forEach((raw, i) => {
    const line = i + 1;
    const cleaned = raw
      .replace(/^\s*(?:[-*•>]\s+|\d+[.)]\s+)?/, "")
      .replace(/\*\*/g, "")
      .trim();
    if (!cleaned || /^```/.test(cleaned)) return;
    const m = /^(COURSE|SCALE|DELIVERABLE|SESSION)\s*:\s*(.*)$/i.exec(cleaned);
    if (!m) {
      if (/\|/.test(cleaned))
        warnings.push({ line, message: `skipped — it doesn't start with DELIVERABLE: or SESSION:` });
      return;
    }
    const key = m[1].toUpperCase();
    const rest = m[2].trim();

    if (key === "COURSE") {
      const name = strip(rest).slice(0, 120);
      if (!name) {
        problems.push({ line, message: "COURSE has no name" });
        return;
      }
      // A second COURSE line starts the next course (one answer can hold several syllabi).
      if (courses.length && !courses.at(-1)!.name) courses.at(-1)!.name = name;
      else courses.push({ name, gradeScale: 10, deliverables: [], sessions: [] });
      return;
    }
    if (key === "SCALE") {
      const n = Number(strip(rest).replace(/^\/|\/$/g, ""));
      if ([10, 20, 100].includes(n)) current().gradeScale = n;
      else warnings.push({ line, message: `SCALE "${strip(rest)}" isn't 10, 20 or 100 — using 10` });
      return;
    }

    const fields = rest.split("|").map((f) => f.trim());
    if (key === "DELIVERABLE") {
      if (fields.length < 4) {
        problems.push({
          line,
          message: `DELIVERABLE needs 4 parts separated by | (title | type | date or Session N | weight %), found ${fields.length}`,
        });
        return;
      }
      const [titleRaw, typeRaw, whenRaw, weightRaw] = fields;
      const title = strip(titleRaw);
      const when = parseWhen(whenRaw);
      const weight = parseWeight(weightRaw);
      if (when === "bad") {
        problems.push({ line, message: `the date "${strip(whenRaw)}" should look like 2026-11-15 or "Session 15"` });
        return;
      }
      if (weight === "bad") {
        problems.push({ line, message: `the weight "${strip(weightRaw)}" should be a number like 30%` });
        return;
      }
      const checked = deliverableSchema.safeParse({ title, type: parseType(typeRaw, title), weight });
      if (!checked.success) {
        problems.push({ line, message: checked.error.issues[0]?.message ?? "invalid deliverable" });
        return;
      }
      current().deliverables.push({ line, ...checked.data, when });
      return;
    }

    // SESSION
    const nums = /^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/.exec(strip(fields[0] ?? ""));
    if (!nums || fields.length < 2 || !strip(fields[1])) {
      problems.push({
        line,
        message: `SESSION needs a number and a topic: SESSION: 3 | Topic | concepts | problem set`,
      });
      return;
    }
    const extra = strip(fields[3] ?? "");
    const isReading = /\b(ch(apter)?\.?|reading|lectura|pp?\.)\s*\d|\(\d{4}\)/i.test(extra);
    current().sessions.push({
      number: Number(nums[1]),
      ...(nums[2] && Number(nums[2]) > Number(nums[1]) ? { upTo: Number(nums[2]) } : {}),
      topic: strip(fields[1]).slice(0, 120),
      concepts: strip(fields[2] ?? "")
        .split(/[,;]/)
        .map((c) => c.trim())
        .filter((c) => c && c !== "-")
        .slice(0, 12),
      readings: extra && extra !== "-" && isReading ? [extra.slice(0, 140)] : [],
      problemSets: extra && extra !== "-" && !isReading ? [extra.slice(0, 80)] : [],
    });
  });

  for (const c of courses) {
    if (!c.name) problems.push({ line: 1, message: "the answer has no COURSE: line" });
    c.sessions.sort((a, b) => a.number - b.number);
  }
  if (!courses.length || courses.every((c) => !c.deliverables.length && !c.sessions.length)) {
    if (!problems.length) {
      problems.push({
        line: 1,
        message: "no DELIVERABLE: or SESSION: lines found — paste the assistant's whole answer",
      });
    }
  }
  return problems.length ? { ok: false, problems } : { ok: true, courses, warnings };
}
