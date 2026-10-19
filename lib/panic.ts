// Panic mode (CLAUDE.md §5.6): not enough time before several deadlines?
// Rank what's due in the window by grade points per hour (weight ÷ hours still needed)
// and hand out your available hours greedily: finish the best-value work fully, do a
// "minimum viable" version of the next, and consciously skip the rest.
import { daysBetween } from "./dates";
import { roundToHalf } from "./estimate";
import type { Course, Deliverable, DeliverableType } from "./types";

export type TriageLabel = "full" | "minimum viable" | "skip";

export interface TriageItem {
  deliverableId: string;
  title: string;
  courseName: string;
  dueDate: string;
  weight: number;
  /** Hours still needed to finish it properly. */
  neededHours: number;
  /** Hours you should spend on it now. */
  hours: number;
  label: TriageLabel;
  reason: string;
}

export interface PanicInput {
  deliverables: Deliverable[];
  courses: Course[];
  today: string;
  hoursAvailable: number;
  windowHours?: number;
}

export interface PanicResult {
  items: TriageItem[];
  hoursAvailable: number;
  hoursPlanned: number;
  hoursNeeded: number;
}

/** A minimum viable version needs at least this share of the work (and at least 30 minutes). */
export const MIN_VIABLE_SHARE = 0.3;

const ESSENTIALS: Record<DeliverableType, string> = {
  exam: "review the key topics and do a few past questions",
  midterm: "review the key topics and do a few past questions",
  final: "focus on the topics that carry the most points",
  essay: "a clear outline and an honest first draft",
  project: "the core deliverable — polish can wait",
  presentation: "a clean structure and one practice run",
  quiz: "the topics you're least sure about",
  homework: "the questions you can answer fastest",
  reading: "skim the introduction, headings and conclusion",
  other: "the parts that count most",
};

const h = (hours: number) => `${hours}h`;

export function triage({ deliverables, courses, today, hoursAvailable, windowHours = 48 }: PanicInput): PanicResult {
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const available = Math.max(0, roundToHalf(hoursAvailable));

  const due = deliverables
    .filter((d) => !d.done)
    .map((d) => ({ d, daysLeft: daysBetween(today, d.dueDate) }))
    .filter(({ daysLeft }) => daysLeft >= 0 && daysLeft * 24 <= windowHours)
    .map(({ d }) => {
      const needed = Math.max(0.5, roundToHalf(d.estimatedHours - d.loggedMinutes / 60));
      return { d, needed, value: d.weight / needed };
    })
    // Best grade points per hour first; ties → earlier deadline.
    .sort((a, b) => b.value - a.value || a.d.dueDate.localeCompare(b.d.dueDate));

  let left = available;
  const items: TriageItem[] = due.map(({ d, needed }, index) => {
    const base = {
      deliverableId: d.id,
      title: d.title,
      courseName: courseName.get(d.courseId) ?? "",
      dueDate: d.dueDate,
      weight: d.weight,
      neededHours: needed,
    };
    if (left >= needed) {
      left -= needed;
      return {
        ...base,
        hours: needed,
        label: "full" as const,
        reason:
          index === 0
            ? `Worth ${d.weight}% of your grade for about ${h(needed)} — the best value, so start here.`
            : `Worth ${d.weight}% for about ${h(needed)} — there's time to finish it properly.`,
      };
    }
    const minimum = Math.max(0.5, roundToHalf(needed * MIN_VIABLE_SHARE));
    if (left >= minimum) {
      const hours = roundToHalf(left);
      left -= hours;
      return {
        ...base,
        hours,
        label: "minimum viable" as const,
        reason: `It needs about ${h(needed)}, so use your ${h(hours)} on ${ESSENTIALS[d.type]}.`,
      };
    }
    return {
      ...base,
      hours: 0,
      label: "skip" as const,
      reason:
        left === 0 && available > 0
          ? `Your time is better spent on the work above. It's okay to let this one go — or ask about an extension.`
          : `Worth ${d.weight}% for about ${h(needed)} of work — not enough time to do it justice now. Consider asking for an extension.`,
    };
  });

  return {
    items,
    hoursAvailable: available,
    hoursPlanned: roundToHalf(available - left),
    hoursNeeded: due.reduce((s, x) => s + x.needed, 0),
  };
}
