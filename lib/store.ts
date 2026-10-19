// The app's memory: one Zustand store, saved to localStorage so data survives a refresh.
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { todayISO } from "./dates";
import { createDemoSemester, DEMO_AVAILABILITY } from "./demo";
import { estimateHours } from "./estimate";
import {
  addPoints,
  blockPoints,
  completeDay,
  initialGamification,
  isDayComplete,
  settleMissedDays,
} from "./gamification";
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

/** localStorage can be missing (server render) or blocked (private mode) — never crash. */
const safeLocalStorage: StateStorage = {
  getItem: (key) => {
    try {
      return typeof window === "undefined" ? null : window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (typeof window !== "undefined") window.localStorage.setItem(key, value);
    } catch {
      // Storage full or blocked: keep working in memory.
    }
  },
  removeItem: (key) => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(key);
    } catch {
      // Ignore.
    }
  },
};

interface Data {
  courses: Course[];
  deliverables: Deliverable[];
  blocks: StudyBlock[];
  availability: Availability;
  pace: PaceProfile;
  gamification: Gamification;
  warnings: string[];
  isDemo: boolean;
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
  /** Run once when the app opens: checks past days for a broken streak. */
  settleDays: (today?: string) => void;
  setMascotTone: (tone: Gamification["mascotTone"]) => void;
  reset: () => void;
}

export type SyllabuddyState = Data & Actions;

const initialData = (): Data => ({
  courses: [],
  deliverables: [],
  blocks: [],
  availability: DEFAULT_AVAILABILITY,
  pace: { byType: {}, byCourse: {} },
  gamification: initialGamification(),
  warnings: [],
  isDemo: false,
});

export const useStore = create<SyllabuddyState>()(
  persist(
    (set, get) => {
      const estimateFor = (d: Pick<Deliverable, "type" | "weight" | "courseId">, courses: Course[]) =>
        estimateHours({
          type: d.type,
          weight: d.weight,
          effort: courses.find((c) => c.id === d.courseId)?.effort ?? 3,
          courseId: d.courseId,
          pace: get().pace,
        });

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
          set({
            courses,
            deliverables: deliverables.map((d) => ({ ...d, estimatedHours: estimateFor(d, courses) })),
            blocks: [],
            warnings: [],
            isDemo: false,
          }),

        updateCourse: (id, patch) =>
          set((s) => {
            const courses = s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c));
            // A new effort level changes how long this course's work should take.
            const deliverables =
              patch.effort === undefined
                ? s.deliverables
                : s.deliverables.map((d) =>
                    d.courseId === id ? { ...d, estimatedHours: estimateFor(d, courses) } : d,
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
          const deliverable = s.deliverables.find((d) => d.id === block.deliverableId);
          const nowDone = block.status !== "done";
          const sign = nowDone ? 1 : -1;
          const undoneStatus: StudyBlock["status"] = block.date < today ? "missed" : "planned";

          const blocks = s.blocks.map((b) =>
            b.id === blockId ? { ...b, status: nowDone ? ("done" as const) : undoneStatus } : b,
          );
          const deliverables = s.deliverables.map((d) =>
            d.id === block.deliverableId
              ? { ...d, loggedMinutes: Math.max(0, d.loggedMinutes + sign * block.minutes) }
              : d,
          );
          let gamification = addPoints(
            s.gamification,
            today,
            sign * blockPoints(block.minutes, deliverable?.weight ?? 0),
            sign * block.minutes,
          );
          if (nowDone && block.date === today) {
            const todayBlocks = blocks.filter((b) => b.date === today);
            if (isDayComplete(todayBlocks)) gamification = completeDay(gamification, today);
          }
          set({ blocks, deliverables, gamification });
        },

        settleDays: (today = todayISO()) =>
          set((s) => ({ gamification: settleMissedDays(s.gamification, s.blocks, today) })),

        setMascotTone: (mascotTone) =>
          set((s) => ({ gamification: { ...s.gamification, mascotTone } })),

        reset: () => set(initialData()),
      };
    },
    {
      name: "syllabuddy",
      version: 1,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: ({
        courses,
        deliverables,
        blocks,
        availability,
        pace,
        gamification,
        warnings,
        isDemo,
      }): Data => ({ courses, deliverables, blocks, availability, pace, gamification, warnings, isDemo }),
    },
  ),
);
