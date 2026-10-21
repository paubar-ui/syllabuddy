// Quick-add line (V2-7): "PEPE midterm 30/10 30%" or "Finance PS4 session 12 5%" fills the
// deadline form — course, title, type, date or session, weight. Everything stays editable.
import { findDates, detectType } from "./parseSyllabus";
import type { Course, DeliverableType } from "./types";

export interface QuickAdd {
  title: string;
  courseId?: string;
  type?: DeliverableType;
  dueDate?: string;
  session?: number;
  weight?: number;
}

const SMALL_WORDS = new Set(["and", "the", "of", "for", "to", "in", "y", "de", "del", "la", "el", "los", "las", "&"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** "Public Economics & Political Economy" → "pepe"; "Corporate Finance" → "cf". */
export function initialsOf(name: string): string {
  return words(name)
    .filter((w) => !SMALL_WORDS.has(w))
    .map((w) => w[0])
    .join("");
}

/** Which course a word refers to: its initials, its full name, or a word only that course has. */
function matchCourse(token: string, courses: Pick<Course, "id" | "name">[]): string | undefined {
  const t = words(token)[0];
  if (!t || t.length < 2) return undefined;
  const byInitials = courses.filter((c) => initialsOf(c.name).length >= 2 && initialsOf(c.name) === t);
  if (byInitials.length === 1) return byInitials[0].id;
  if (t.length < 4) return undefined;
  const byWord = courses.filter((c) => words(c.name).some((w) => w === t || (w.length >= 5 && w.startsWith(t))));
  return byWord.length === 1 ? byWord[0].id : undefined;
}

const SESSION = /\b(?:session|sesi[oó]n|ses\.?|class|clase)\s*#?\s*(\d{1,2})\b/i;
const WEIGHT = /(\d{1,3}(?:[.,]\d+)?)\s*%/;

export function parseQuickAdd(text: string, today: string, courses: Pick<Course, "id" | "name">[]): QuickAdd {
  let rest = ` ${text.replace(/\s+/g, " ").trim()} `;
  const result: Partial<QuickAdd> = {};

  const w = WEIGHT.exec(rest);
  if (w) {
    const n = Number(w[1].replace(",", "."));
    if (n >= 0 && n <= 100) result.weight = n;
    rest = rest.replace(w[0], " ");
  }
  const s = SESSION.exec(rest);
  if (s) {
    result.session = Number(s[1]);
    rest = rest.replace(s[0], " ");
  }
  const date = findDates(rest, { today }).find((d) => d.iso && !d.isWeek && !d.session);
  if (date?.iso) {
    result.dueDate = date.iso;
    rest = rest.slice(0, date.start) + " " + rest.slice(date.end);
  }
  // "PS4" / "PS 4" → problem set 4
  rest = rest.replace(/\bps\s?(\d{1,2})\b/i, "Problem set $1");

  // The course: the first word that names exactly one of your courses.
  const tokens = rest.trim().split(" ").filter(Boolean);
  for (let i = 0; i < tokens.length && !result.courseId; i++) {
    const id = matchCourse(tokens[i], courses);
    if (id) {
      result.courseId = id;
      tokens.splice(i, 1);
    }
  }
  const title = tokens
    .join(" ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
  const type = detectType(title);
  if (type) result.type = type;
  return {
    ...result,
    // "midterm" on its own becomes "Midterm"; keep the student's own capitalisation otherwise.
    title: title ? title.charAt(0).toUpperCase() + title.slice(1) : text.trim(),
  };
}
