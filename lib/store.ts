// The app's memory: one Zustand store. It is saved to your account in Supabase by
// lib/planSync.ts (grading contract: no user data in localStorage).
import { create } from "zustand";
import type { BackupData } from "./backup";
import { addDaysISO, todayISO } from "./dates";
import { COURSE_COLORS } from "./draft";
import { newId } from "./id";
import { detectType } from "./parseSyllabus";
import { createDemoSemester, DEMO_AVAILABILITY } from "./demo";
import { estimateHours } from "./estimate";
import type { FocusTimer } from "./focus";
import {
  addPoints,
  blockPoints,
  completeDay,
  DELIVERABLE_BONUS,
  FOCUS_BONUS,
  initialGamification,
  isDayComplete,
  settleMissedDays,
} from "./gamification";
import { emptyPace, updatePace } from "./pace";
import { generateSchedule } from "./scheduler";
import type {
  Availability,
  Course,
  Deliverable,
  Gamification,
  PaceProfile,
  StudyBlock,
} from "./types";

export const DEFAULT_AVAILABILITY: Availability = DEMO_AVAILABILITY;

export interface Data {
  courses: Course[];
  deliverables: Deliverable[];
  blocks: StudyBlock[];
  availability: Availability;
  pace: PaceProfile;
  gamification: Gamification;
  warnings: string[];
  isDemo: boolean;
  /** Minutes logged with the focus timer, per study block. */
  focusMinutes: Record<string, number>;
  /** The focus timer, kept here so it survives a refresh. */
  timer: FocusTimer | null;
  /** The last time missed blocks were moved back into the plan (shown on Today). */
  lastReplan: { date: string; blocks: number; minutes: number } | null;
  /** Optional first name for the briefing's greeting. */
  displayName: string;
}

interface Actions {
  loadDemo: (today?: string) => void;
  /** Replace everything with what the user reviewed in onboarding. Estimates are computed here. */
  setCourses: (courses: Course[], deliverables: Omit<Deliverable, "estimatedHours">[]) => void;
  updateCourse: (id: string, patch: Partial<Omit<Course, "id">>) => void;
  updateDeliverable: (id: string, patch: Partial<Omit<Deliverable, "id">>) => void;
  setAvailability: (availability: Availability) => void;
  generatePlan: (today?: string) => void;
  toggleBlock: (blockId: string, today?: string) => void;
  /** Logs focus-timer minutes on a block; a full 25-minute session also earns the focus bonus. */
  logFocus: (blockId: string, minutes: number, completedSession: boolean, today?: string) => void;
  /** Marks a deliverable done (learns your pace, +50 points) or not done, then replans. */
  setDeliverableDone: (id: string, done: boolean, today?: string) => void;
  /** Score obtained on a deliverable, on the course's scale (undefined clears it). */
  setScore: (id: string, score: number | undefined) => void;
  setTimer: (timer: FocusTimer | null) => void;
  /** Past blocks that were never done become "missed"; their time is planned again from today. */
  replanIfNeeded: (today?: string) => void;
  /** Burnout guard: makes today a day off and moves today's work elsewhere. */
  protectTonight: (today?: string) => void;
  /** Replaces everything with an imported backup. */
  importData: (data: BackupData) => void;
  /** Replaces everything with what was loaded from your account. */
  replaceAll: (data: Partial<Data>) => void;
  /** The main feature: add a deadline by title; everything else has a sensible default. */
  addDeadline: (input: AddDeadlineInput, today?: string) => Deliverable;
  removeDeliverable: (id: string, today?: string) => void;
  /** Run once when the app opens: checks past days for a broken streak. */
  settleDays: (today?: string) => void;
  setMascotTone: (tone: Gamification["mascotTone"]) => void;
  setDisplayName: (name: string) => void;
  reset: () => void;
}

export type SyllabuddyState = Data & Actions;

export interface AddDeadlineInput {
  id?: string;
  title: string;
  dueDate?: string; // default: one week from today
  courseId?: string; // default: your first course, or a new "My deadlines" course
  weight?: number; // default: 10% of the grade
}

const DATA_KEYS = [
  "courses",
  "deliverables",
  "blocks",
  "availability",
  "pace",
  "gamification",
  "warnings",
  "isDemo",
  "focusMinutes",
  "timer",
  "lastReplan",
  "displayName",
] as const satisfies readonly (keyof Data)[];

/** Just the data (no functions) — this is what gets saved to your account. */
export function dataOf(state: SyllabuddyState): Data {
  return Object.fromEntries(DATA_KEYS.map((k) => [k, state[k]])) as unknown as Data;
}

const initialData = (): Data => ({
  courses: [],
  deliverables: [],
  blocks: [],
  availability: DEFAULT_AVAILABILITY,
  pace: emptyPace(),
  gamification: initialGamification(),
  warnings: [],
  isDemo: false,
  focusMinutes: {},
  timer: null,
  lastReplan: null,
  displayName: "",
});

export const useStore = create<SyllabuddyState>()(
    (set, get) => {
      const estimateFor = (
        d: Pick<Deliverable, "type" | "weight" | "courseId">,
        courses: Course[],
        pace: PaceProfile = get().pace,
      ) =>
        estimateHours({
          type: d.type,
          weight: d.weight,
          effort: courses.find((c) => c.id === d.courseId)?.effort ?? 3,
          courseId: d.courseId,
          pace,
        });

      /** Logs minutes and points for a block, and completes the day if this finished it. */
      const credit = (
        s: SyllabuddyState,
        block: StudyBlock,
        minutes: number,
        bonus: number,
        blocks: StudyBlock[],
        today: string,
      ): Pick<Data, "deliverables" | "gamification"> => {
        const weight = s.deliverables.find((d) => d.id === block.deliverableId)?.weight ?? 0;
        const sign = minutes < 0 ? -1 : 1;
        const deliverables = s.deliverables.map((d) =>
          d.id === block.deliverableId ? { ...d, loggedMinutes: Math.max(0, d.loggedMinutes + minutes) } : d,
        );
        let gamification = addPoints(
          s.gamification,
          today,
          sign * blockPoints(Math.abs(minutes), weight) + bonus,
          minutes,
        );
        const finishedNow = blocks.find((b) => b.id === block.id)?.status === "done";
        if (finishedNow && block.date === today && isDayComplete(blocks.filter((b) => b.date === today))) {
          gamification = completeDay(gamification, today);
        }
        return { deliverables, gamification };
      };

      return {
        ...initialData(),

        loadDemo: (today = todayISO()) => {
          const { courses, deliverables } = createDemoSemester(today);
          const tone = get().gamification.mascotTone;
          set({
            ...initialData(),
            courses,
            deliverables,
            availability: DEMO_AVAILABILITY,
            gamification: { ...initialGamification(), mascotTone: tone },
            isDemo: true,
          });
          get().generatePlan(today);
        },

        setCourses: (courses, deliverables) =>
          set((s) => ({
            courses,
            deliverables: deliverables.map((d) => ({ ...d, estimatedHours: estimateFor(d, courses) })),
            blocks: [],
            warnings: [],
            isDemo: false,
            focusMinutes: {},
            timer: null,
            // Points earned in the demo don't carry over to a real semester.
            gamification: s.isDemo
              ? { ...initialGamification(), mascotTone: s.gamification.mascotTone }
              : s.gamification,
          })),

        updateCourse: (id, patch) =>
          set((s) => {
            const courses = s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c));
            // A new effort level changes how long this course's work should take.
            const deliverables =
              patch.effort === undefined
                ? s.deliverables
                : s.deliverables.map((d) =>
                    d.courseId === id && !d.done ? { ...d, estimatedHours: estimateFor(d, courses) } : d,
                  );
            return { courses, deliverables };
          }),

        updateDeliverable: (id, patch) =>
          set((s) => ({
            deliverables: s.deliverables.map((d) => (d.id === id ? { ...d, ...patch } : d)),
          })),

        setAvailability: (availability) => set({ availability }),

        generatePlan: (today = todayISO()) => {
          const { courses, deliverables, availability, blocks } = get();
          const result = generateSchedule({
            courses,
            deliverables,
            availability,
            today,
            existingBlocks: blocks,
          });
          set({ blocks: result.blocks, warnings: result.warnings });
        },

        toggleBlock: (blockId, today = todayISO()) => {
          const s = get();
          const block = s.blocks.find((b) => b.id === blockId);
          if (!block) return;
          const nowDone = block.status !== "done";
          const undoneStatus: StudyBlock["status"] = block.date < today ? "missed" : "planned";
          const blocks = s.blocks.map((b) =>
            b.id === blockId ? { ...b, status: nowDone ? ("done" as const) : undoneStatus } : b,
          );
          // Minutes already logged with the focus timer aren't counted twice.
          const rest = Math.max(0, block.minutes - (s.focusMinutes[blockId] ?? 0));
          set({ blocks, ...credit(s, block, nowDone ? rest : -rest, 0, blocks, today) });
        },

        logFocus: (blockId, minutes, completedSession, today = todayISO()) => {
          const s = get();
          const block = s.blocks.find((b) => b.id === blockId);
          if (!block || minutes <= 0) return;
          const focused = (s.focusMinutes[blockId] ?? 0) + minutes;
          // Enough focus time on this block checks it off automatically.
          const blocks =
            block.status !== "done" && focused >= block.minutes
              ? s.blocks.map((b) => (b.id === blockId ? { ...b, status: "done" as const } : b))
              : s.blocks;
          set({
            blocks,
            focusMinutes: { ...s.focusMinutes, [blockId]: focused },
            ...credit(s, block, minutes, completedSession ? FOCUS_BONUS : 0, blocks, today),
          });
        },

        setDeliverableDone: (id, done, today = todayISO()) => {
          const s = get();
          const deliverable = s.deliverables.find((d) => d.id === id);
          if (!deliverable || deliverable.done === done) return;
          const effort = s.courses.find((c) => c.id === deliverable.courseId)?.effort ?? 3;
          const pace = done ? updatePace(s.pace, deliverable, effort) : s.pace;
          // Your new pace changes how long the remaining work should take.
          const deliverables = s.deliverables.map((d) => {
            if (d.id === id) return { ...d, done };
            return d.done || pace === s.pace ? d : { ...d, estimatedHours: estimateFor(d, s.courses, pace) };
          });
          const gamification = addPoints(s.gamification, today, done ? DELIVERABLE_BONUS : -DELIVERABLE_BONUS);
          set({ deliverables, pace, gamification });
          get().generatePlan(today);
        },

        setScore: (id, score) =>
          set((s) => ({
            deliverables: s.deliverables.map((d) => {
              if (d.id !== id) return d;
              const { score: _old, ...rest } = d;
              void _old;
              return score === undefined ? rest : { ...rest, score };
            }),
          })),

        setTimer: (timer) => set({ timer }),

        replanIfNeeded: (today = todayISO()) => {
          const overdue = get().blocks.filter((b) => b.status === "planned" && b.date < today);
          if (overdue.length === 0) return;
          get().generatePlan(today); // the scheduler marks them missed and replans from today
          set({
            lastReplan: {
              date: today,
              blocks: overdue.length,
              minutes: overdue.reduce((sum, b) => sum + b.minutes, 0),
            },
          });
        },

        protectTonight: (today = todayISO()) => {
          const { availability } = get();
          if (!availability.daysOff.includes(today)) {
            set({ availability: { ...availability, daysOff: [...availability.daysOff, today].sort() } });
          }
          get().generatePlan(today);
        },

        importData: (data) =>
          set({
            ...initialData(),
            ...data,
            // A running timer or old replan notice doesn't make sense after an import.
            timer: null,
            lastReplan: null,
          }),

        settleDays: (today = todayISO()) =>
          set((s) => ({ gamification: settleMissedDays(s.gamification, s.blocks, today) })),

        setDisplayName: (name) => set({ displayName: name.slice(0, 40) }),

        setMascotTone: (mascotTone) =>
          set((s) => ({ gamification: { ...s.gamification, mascotTone } })),

        replaceAll: (data) => {
          const base = initialData();
          const clean: Partial<Data> = {};
          // Only take fields that look right, so a damaged row can never crash the app.
          for (const k of DATA_KEYS) {
            const v = data?.[k];
            if (v === undefined) continue;
            const expected = base[k];
            if (Array.isArray(expected) ? Array.isArray(v) : typeof v === typeof expected || expected === null) {
              (clean as Record<string, unknown>)[k] = v;
            }
          }
          set({ ...base, ...clean });
        },

        addDeadline: ({ id, title, dueDate, courseId, weight }, today = todayISO()) => {
          const s = get();
          let courses = s.courses;
          let course = courses.find((c) => c.id === courseId) ?? courses[0];
          if (!course) {
            course = { id: newId(), name: "My deadlines", color: COURSE_COLORS[0], effort: 3, gradeScale: 10 };
            courses = [...courses, course];
          }
          const base = {
            id: id ?? newId(),
            courseId: course.id,
            title: title.trim(),
            type: detectType(title) ?? ("other" as const),
            dueDate: dueDate && dueDate >= today ? dueDate : addDaysISO(today, 7),
            weight: weight !== undefined && weight >= 0 && weight <= 100 ? weight : 10,
            loggedMinutes: 0,
            done: false,
          };
          const deliverable: Deliverable = { ...base, estimatedHours: estimateFor(base, courses) };
          set({ courses, deliverables: [...s.deliverables, deliverable], isDemo: false });
          get().generatePlan(today);
          return deliverable;
        },

        removeDeliverable: (id, today = todayISO()) => {
          set((s) => ({
            deliverables: s.deliverables.filter((d) => d.id !== id),
            blocks: s.blocks.filter((b) => b.deliverableId !== id || b.status === "done"),
          }));
          get().generatePlan(today);
        },

        reset: () => set(initialData()),
      };
    },
);
