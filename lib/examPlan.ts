// Exam prep plans (V2-6): what to study in EACH session before a midterm or final — not just
// "study Finance 2h". Works without AI: built from the syllabus schedule, the exam details,
// your focus (core / light sessions), your confidence per topic and your mock-exam mistakes.
//
// Shape (by days left before the exam):
//   setup & diagnostic → core topics (1–2 per day) → mock exam (~3 days before) → repair day
//   → light review the day before → exam day.  Short on time? Mock and repair are skipped.
import { addDaysISO, daysBetween } from "./dates";
import type { Course, CourseSession, Deliverable, ExamDetails } from "./types";

export const EXAM_TYPES = ["exam", "midterm", "final"] as const;
export const isExam = (d: Pick<Deliverable, "type">) => (EXAM_TYPES as readonly string[]).includes(d.type);

export type ExamDayKind = "setup" | "core" | "mock" | "repair" | "review" | "exam";

export interface ExamPlanDay {
  date: string;
  dayNumber: number; // 1-based
  kind: ExamDayKind;
  title: string;
  goal: string;
  tasks: string[];
  materials: string[];
  minutes: number; // planned study minutes on this day (from the scheduler)
  topics: number[]; // session numbers studied this day
}

export interface ExamPlan {
  days: ExamPlanDay[];
  scope: CourseSession[];
  core: number[];
  light: number[];
  assumptions: string[];
  emailBy: string;
}

export interface ExamPlanInput {
  exam: Deliverable;
  course: Course;
  today: string;
  /** Study minutes the scheduler planned for this exam, per day. */
  minutesByDate?: Record<string, number>;
}

export const DEFAULT_DURATION = 90;

/** Which sessions the exam covers: as stated, else by date, else a sensible guess. */
export function examScope(exam: Deliverable, course: Course): { sessions: CourseSession[]; guessed: boolean } {
  // Content you pasted for this exam is exactly what it covers.
  if (exam.exam?.topics?.length) return { sessions: exam.exam.topics, guessed: false };
  const all = [...(course.sessions ?? [])].sort((a, b) => a.number - b.number);
  if (all.length === 0) return { sessions: [], guessed: false };
  const covers = exam.exam?.coversSessions;
  if (covers?.length) return { sessions: all.filter((s) => covers.includes(s.number)), guessed: false };
  if (all.every((s) => s.date)) return { sessions: all.filter((s) => s.date! < exam.dueDate), guessed: true };
  if (exam.type === "midterm") return { sessions: all.slice(0, Math.ceil(all.length / 2)), guessed: true };
  return { sessions: all, guessed: true };
}

/** The topics to repair: most points lost in the mock first, then lowest confidence. */
export function weakestTopics(details: ExamDetails | undefined, scope: CourseSession[], count = 2): number[] {
  const lost = new Map<number, number>();
  for (const m of details?.mockLog ?? []) lost.set(m.session, (lost.get(m.session) ?? 0) + m.points);
  const confidence = (n: number) => details?.confidence?.[n] ?? 3;
  return scope
    .map((s) => s.number)
    .sort((a, b) => (lost.get(b) ?? 0) - (lost.get(a) ?? 0) || confidence(a) - confidence(b) || a - b)
    .slice(0, count);
}

function topicTasks(s: CourseSession): { tasks: string[]; materials: string[] } {
  const tasks = [s.concepts.length ? `Study ${s.topic}: ${s.concepts.join(", ")}` : `Study ${s.topic} from your notes`];
  for (const r of s.readings) tasks.push(`Read ${r} (key pages only)`);
  for (const ps of s.problemSets) tasks.push(`Redo ${ps} by hand, calculator out — then check against the solutions`);
  if (s.practice && s.problemSets.length === 0 && !/^practice\.?$/i.test(s.practice))
    tasks.push(`Go over what you did in class: ${s.practice}`);
  tasks.push(`Write down 3 questions about ${s.topic} you still can't answer`);
  const materials = [`Your notes for session ${s.number} (${s.topic})`, ...s.readings];
  for (const ps of s.problemSets) materials.push(`${ps} + solutions`);
  return { tasks, materials };
}

export function buildExamPlan({ exam, course, today, minutesByDate = {} }: ExamPlanInput): ExamPlan {
  const details = exam.exam ?? {};
  const { sessions: scope, guessed } = examScope(exam, course);
  const light = scope.filter((s) => details.focus?.[s.number] === "light").map((s) => s.number);
  const coreSessions = scope.filter((s) => !light.includes(s.number));
  const core = coreSessions.map((s) => s.number);
  const byNumber = new Map(scope.map((s) => [s.number, s]));
  const name = (n: number) => byNumber.get(n)?.topic ?? `Session ${n}`;

  const start = today < exam.dueDate ? today : exam.dueDate;
  const daysBefore = Math.max(0, daysBetween(start, exam.dueDate));
  const duration = details.durationMinutes ?? DEFAULT_DURATION;
  const materialsAllowed = details.materials ?? "closed book";

  // Which kind of day each date is.
  const kinds = new Map<string, ExamDayKind>();
  kinds.set(exam.dueDate, "exam");
  if (daysBefore >= 1) kinds.set(addDaysISO(exam.dueDate, -1), "review");
  const withMock = daysBefore >= 4;
  if (withMock) {
    kinds.set(addDaysISO(exam.dueDate, -3), "mock");
    kinds.set(addDaysISO(exam.dueDate, -2), "repair");
  }
  const prepDates: string[] = [];
  for (let i = 0; i <= daysBefore; i++) {
    const date = addDaysISO(start, i);
    if (!kinds.has(date)) prepDates.push(date);
  }
  if (prepDates.length > 0) kinds.set(prepDates[0], "setup");
  const coreDates = prepDates.slice(1);
  for (const d of coreDates) kinds.set(d, "core");

  // Spread core topics over the core days; spare days revisit the least-confident topics.
  const topicsByDate = new Map<string, number[]>();
  if (coreDates.length > 0 && core.length > 0) {
    if (core.length <= coreDates.length) {
      const revisit = [...core].sort(
        (a, b) => (details.confidence?.[a] ?? 3) - (details.confidence?.[b] ?? 3) || a - b,
      );
      coreDates.forEach((d, i) =>
        topicsByDate.set(d, [i < core.length ? core[i] : revisit[(i - core.length) % revisit.length]]),
      );
    } else {
      const perDay = Math.ceil(core.length / coreDates.length);
      coreDates.forEach((d, i) => topicsByDate.set(d, core.slice(i * perDay, (i + 1) * perDay)));
    }
  }
  // No core days at all (exam very close): fold the core topics into the setup day.
  if (coreDates.length === 0 && prepDates.length > 0 && core.length > 0) topicsByDate.set(prepDates[0], core);

  const weak = weakestTopics(details, coreSessions.length ? coreSessions : scope);
  const seen = new Set<number>();

  const days: ExamPlanDay[] = [...kinds.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kind], index) => {
      const topics = topicsByDate.get(date) ?? [];
      const base = { date, dayNumber: index + 1, kind, minutes: minutesByDate[date] ?? 0, topics };
      switch (kind) {
        case "setup": {
          const first = topics[0] ?? core[0];
          const tasks = [
            "Gather a past exam or mock exam, the problem-set solutions and your lecture notes",
            "Rate your confidence for each topic on the exam prep page (1 = lost, 5 = could teach it)",
          ];
          const materials = ["Past exam / mock", "Problem-set solutions", "Lecture notes"];
          if (topics.length > 1) {
            for (const n of topics) {
              const t = topicTasks(byNumber.get(n)!);
              tasks.push(...t.tasks.slice(0, 2));
              materials.push(...t.materials.slice(0, 1));
            }
          } else if (first !== undefined) {
            tasks.push(`Light first read of ${name(first)}`);
          }
          topics.forEach((n) => seen.add(n));
          return {
            ...base,
            title: "Setup & diagnostic",
            goal: "Get everything you need in one place and find out where you stand.",
            tasks,
            materials,
          };
        }
        case "core": {
          const tasks: string[] = [];
          const materials: string[] = [];
          for (const n of topics) {
            const s = byNumber.get(n);
            if (!s) continue;
            const t = topicTasks(s);
            if (seen.has(n)) tasks.push(`Second pass on ${s.topic}: redo the questions you got wrong last time`);
            else tasks.push(...t.tasks);
            materials.push(...t.materials);
            seen.add(n);
          }
          if (tasks.length === 0) tasks.push("Work through your notes in order and summarise each lecture on one page");
          return {
            ...base,
            title: topics.length ? topics.map(name).join(" + ") : "Core study",
            goal: topics.length
              ? `Understand ${topics.map(name).join(" and ")} well enough to solve exam questions on it.`
              : "Cover the next part of the course properly.",
            tasks,
            materials: materials.length ? materials : ["Lecture notes"],
          };
        }
        case "mock":
          return {
            ...base,
            title: "Mock exam",
            goal: "Rehearse the real exam under real conditions, then find out exactly where you lose points.",
            tasks: [
              `Do a full mock exam: ${duration}-minute timer, ${materialsAllowed} only — no phone, no notes you won't have`,
              "Mark it honestly with the solutions",
              "Log every lost point by topic and reason in the Mock exam log (concept gap, algebra slip, time pressure)",
            ],
            materials: ["Past exam or mock", "Solutions", "A timer"],
          };
        case "repair": {
          const logged = (details.mockLog?.length ?? 0) > 0;
          const tasks = weak.map((n) => {
            const s = byNumber.get(n);
            return s?.concepts.length ? `Re-study ${s.topic}: ${s.concepts.join(", ")}` : `Re-study ${name(n)}`;
          });
          tasks.push("Redo every mock question you got wrong, without looking at the solution first");
          tasks.push("Build a one-page formula / concept sheet");
          return {
            ...base,
            topics: weak,
            title: "Repair day",
            goal: logged
              ? `Fix your two weakest topics from the mock: ${weak.map(name).join(" and ")}.`
              : "Fix your weakest topics — log your mock mistakes first and this day updates automatically.",
            tasks,
            materials: ["Your marked mock exam", ...weak.map((n) => `Your notes for ${name(n)}`)],
          };
        }
        case "review":
          return {
            ...base,
            topics: light,
            title: "Light review",
            goal: "Refresh, don't cram: go to bed confident.",
            tasks: [
              light.length ? `Light review of ${light.map(name).join(", ")}` : "Skim your summaries of every topic",
              "Read through your formula / concept sheet twice",
              "Pack what you're allowed to bring, then an early night — sleep beats one more hour of study",
            ],
            materials: ["Formula / concept sheet", "Your summaries"],
          };
        default:
          return {
            ...base,
            title: "Exam day",
            goal: "Arrive calm and use your time well.",
            tasks: [
              "20–30 minute skim of your formula sheet only — no new material",
              "In the exam: read the whole paper first, start with the questions worth the most points per minute, keep 10 minutes to check",
            ],
            materials: [
              materialsAllowed === "closed book" ? "Pens and your student ID" : `Allowed: ${materialsAllowed}`,
            ],
          };
      }
    });

  const assumptions: string[] = [];
  if (!details.time) assumptions.push("Exam time not confirmed — check it on Blackboard or with your professor.");
  if (!details.format)
    assumptions.push("Exam format not confirmed — the plan assumes a mix of problems and theory questions.");
  if (!details.durationMinutes)
    assumptions.push(`Exam length not confirmed — the mock exam uses ${DEFAULT_DURATION} minutes.`);
  if (!details.materials) assumptions.push("Allowed materials not confirmed — the mock exam assumes closed book.");
  if ((course.sessions ?? []).length === 0) {
    assumptions.push("No session schedule found — add it from the syllabus to get a topic for every day.");
  } else if (guessed) {
    assumptions.push(
      `Exam scope not confirmed — the plan assumes sessions ${scope[0]?.number ?? "?"}–${scope.at(-1)?.number ?? "?"}.`,
    );
  }
  if (!withMock) assumptions.push("Fewer than 4 days left — the plan skips the separate mock exam and repair days.");

  const emailBy = daysBefore >= 3 ? addDaysISO(exam.dueDate, -3) : start;
  return { days, scope, core, light, assumptions, emailBy };
}

/** The plan day for a given date (used by Today and the session detail panel). */
export function examDayFor(plan: ExamPlan, date: string): ExamPlanDay | undefined {
  return plan.days.find((d) => d.date === date);
}

/** Planned (or done) study minutes per day for one deliverable, from the schedule. */
export function minutesByDateFor(
  blocks: { deliverableId: string; date: string; minutes: number; status: string }[],
  deliverableId: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const b of blocks) {
    if (b.deliverableId !== deliverableId || b.status === "missed") continue;
    result[b.date] = (result[b.date] ?? 0) + b.minutes;
  }
  return result;
}

/** "I'll organise it myself": your own plan for a day, one task per line. */
export function myPlanTasks(details: ExamDetails | undefined, date: string): string[] {
  return (details?.myPlan?.[date] ?? "")
    .split("\n")
    .map((t) => t.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}
