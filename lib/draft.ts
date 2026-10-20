// Editable "draft" courses used during onboarding, before they are saved to the store.
// Numbers are kept as strings while the user types; they are converted when saving.
import type { ExtractedSyllabus } from "./extraction";
import { newId } from "./id";
import type { ParsedSchedule } from "./parseSessions";
import type { Course, CourseSession, Deliverable, DeliverableType, Effort, ExamDetails } from "./types";

export const COURSE_COLORS = ["#1d4ed8", "#be185d", "#047857", "#b45309", "#7c3aed", "#0e7490", "#b91c1c"];

export interface DraftItem {
  id: string;
  title: string;
  type: DeliverableType;
  dueDate: string; // "" when missing
  weight: string;
  exam?: ExamDetails; // details found in the syllabus for a midterm / final
}

export interface DraftCourse {
  id: string;
  name: string;
  color: string;
  gradeScale: number;
  attendancePolicy: string | null;
  effort: Effort;
  targetGrade: string;
  items: DraftItem[];
  sessions: CourseSession[];
}

export function emptyItem(makeId = newId): DraftItem {
  return { id: makeId(), title: "", type: "exam", dueDate: "", weight: "" };
}

export function emptyCourse(index: number, makeId = newId): DraftCourse {
  return {
    id: makeId(),
    name: "",
    color: COURSE_COLORS[index % COURSE_COLORS.length],
    gradeScale: 10,
    attendancePolicy: null,
    effort: 3,
    targetGrade: "",
    items: [emptyItem(makeId)],
    sessions: [],
  };
}

export function draftFromExtraction(
  x: ExtractedSyllabus,
  index: number,
  makeId = newId,
  schedule?: ParsedSchedule,
): DraftCourse {
  const examFor = (type: DeliverableType): ExamDetails | undefined => {
    if (!schedule || !["exam", "midterm", "final"].includes(type)) return undefined;
    const found = schedule.exams.find((e) => e.type === type) ?? schedule.exams.find((e) => e.type === "exam");
    if (!found) return undefined;
    const { type: _type, ...details } = found;
    void _type;
    return details;
  };
  const gradeScale = x.gradeScale && [10, 20, 100].includes(x.gradeScale) ? x.gradeScale : 10;
  return {
    ...emptyCourse(index, makeId),
    name: x.courseName ?? "",
    gradeScale,
    attendancePolicy: x.attendancePolicy,
    items: x.deliverables.length
      ? x.deliverables.map((d) => ({
          id: makeId(),
          title: d.title,
          type: d.type,
          dueDate: d.dueDate ?? "",
          weight: d.weight === null ? "" : String(d.weight),
          ...(examFor(d.type) ? { exam: examFor(d.type) } : {}),
        }))
      : [emptyItem(makeId)],
    sessions: schedule?.sessions ?? [],
  };
}

const toNumber = (text: string): number | null => {
  if (text.trim() === "") return null;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function weightTotal(course: DraftCourse): number {
  return course.items.reduce((sum, i) => sum + (toNumber(i.weight) ?? 0), 0);
}

/** Weights usually add up to 100%. Anything outside 95–105% deserves a gentle warning. */
export function weightsLookOff(course: DraftCourse): boolean {
  const total = weightTotal(course);
  return course.items.length > 0 && (total < 95 || total > 105);
}

export interface DraftProblem {
  courseId: string;
  itemId?: string;
  message: string;
}

export function validateDrafts(courses: DraftCourse[]): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (courses.length === 0) problems.push({ courseId: "", message: "Add at least one course." });

  courses.forEach((c, ci) => {
    const courseLabel = c.name.trim() || `Course ${ci + 1}`;
    if (!c.name.trim()) problems.push({ courseId: c.id, message: `${courseLabel}: give the course a name.` });
    if (c.items.length === 0) {
      problems.push({ courseId: c.id, message: `${courseLabel}: add at least one deliverable.` });
    }
    c.items.forEach((item, ii) => {
      const label = `${courseLabel} – ${item.title.trim() || `item ${ii + 1}`}`;
      if (!item.title.trim()) problems.push({ courseId: c.id, itemId: item.id, message: `${label}: add a title.` });
      if (!item.dueDate) problems.push({ courseId: c.id, itemId: item.id, message: `${label}: add a due date.` });
      const w = toNumber(item.weight);
      if (item.weight.trim() !== "" && (w === null || w < 0 || w > 100)) {
        problems.push({ courseId: c.id, itemId: item.id, message: `${label}: weight must be between 0 and 100.` });
      }
    });

    const target = toNumber(c.targetGrade);
    if (c.targetGrade.trim() !== "" && (target === null || target < 0 || target > c.gradeScale)) {
      problems.push({ courseId: c.id, message: `${courseLabel}: target grade must be between 0 and ${c.gradeScale}.` });
    }
  });
  return problems;
}

export function draftsToStore(drafts: DraftCourse[]): {
  courses: Course[];
  deliverables: Omit<Deliverable, "estimatedHours">[];
} {
  const courses: Course[] = drafts.map((d) => {
    const target = toNumber(d.targetGrade);
    return {
      id: d.id,
      name: d.name.trim(),
      color: d.color,
      effort: d.effort,
      gradeScale: d.gradeScale,
      ...(target !== null ? { targetGrade: target } : {}),
      ...(d.attendancePolicy ? { attendancePolicy: d.attendancePolicy } : {}),
      ...(d.sessions.length ? { sessions: d.sessions } : {}),
    };
  });
  const deliverables = drafts.flatMap((d) =>
    d.items.map((i) => ({
      id: i.id,
      courseId: d.id,
      title: i.title.trim(),
      type: i.type,
      dueDate: i.dueDate,
      weight: toNumber(i.weight) ?? 0,
      loggedMinutes: 0,
      done: false,
      ...(i.exam ? { exam: i.exam } : {}),
    })),
  );
  return { courses, deliverables };
}
