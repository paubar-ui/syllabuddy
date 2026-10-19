// Learns how long work really takes you (CLAUDE.md §5.4).
//
// When a deliverable is done: ratio = actual hours / planned hours, where "planned" is the
// base estimate *without* your pace (otherwise a correct prediction would drag the pace back to 1).
// Type and course ratios are both updated with an exponential moving average (alpha = 0.3).
// Because the estimate multiplies them, each one learns the part the other doesn't explain,
// so their product converges to your real ratio instead of counting it twice.
import { clamp, estimateHours } from "./estimate";
import type { Deliverable, DeliverableType, Effort, PaceProfile } from "./types";

export const PACE_ALPHA = 0.3;
export const MIN_LOGGED_MINUTES = 15;

const ema = (previous: number, target: number) => previous * (1 - PACE_ALPHA) + target * PACE_ALPHA;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function emptyPace(): PaceProfile {
  return { byType: {}, byCourse: {} };
}

export function updatePace(pace: PaceProfile, deliverable: Deliverable, effort: Effort): PaceProfile {
  if (deliverable.loggedMinutes < MIN_LOGGED_MINUTES) return pace;
  const planned = estimateHours({ type: deliverable.type, weight: deliverable.weight, effort });
  const ratio = clamp(deliverable.loggedMinutes / 60 / planned, 0.25, 4);

  const typeNow = pace.byType[deliverable.type] ?? 1;
  const courseNow = pace.byCourse[deliverable.courseId] ?? 1;
  return {
    byType: { ...pace.byType, [deliverable.type]: round2(ema(typeNow, ratio / courseNow)) },
    byCourse: { ...pace.byCourse, [deliverable.courseId]: round2(ema(courseNow, ratio / typeNow)) },
  };
}

const PLURAL: Record<DeliverableType, string> = {
  exam: "exams",
  midterm: "midterms",
  final: "finals",
  essay: "essays",
  project: "projects",
  presentation: "presentations",
  quiz: "quizzes",
  homework: "homework assignments",
  reading: "readings",
  other: "other tasks",
};

export interface PaceInsight {
  type: DeliverableType;
  ratio: number;
  text: string;
}

/** Human sentences for types that differ noticeably (≥ 10%) from plan, biggest difference first. */
export function paceInsights(pace: PaceProfile): PaceInsight[] {
  return (Object.entries(pace.byType) as [DeliverableType, number][])
    .filter(([, ratio]) => Math.abs(ratio - 1) >= 0.1)
    .sort(([, a], [, b]) => Math.abs(b - 1) - Math.abs(a - 1))
    .map(([type, ratio]) => {
      const shown = ratio.toFixed(1);
      const text =
        ratio > 1
          ? `${PLURAL[type]} take you ${shown}× longer than planned`
          : `${PLURAL[type]} take you ${shown}× the planned time — faster than expected`;
      return { type, ratio, text: text[0].toUpperCase() + text.slice(1) };
    });
}
