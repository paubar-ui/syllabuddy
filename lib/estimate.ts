// How many hours a deliverable probably needs (CLAUDE.md §5.1).
import type { DeliverableType, Effort, PaceProfile } from "./types";

export const BASE_HOURS: Record<DeliverableType, number> = {
  exam: 12,
  final: 12,
  midterm: 8,
  project: 15,
  essay: 8,
  presentation: 6,
  quiz: 2,
  homework: 2,
  reading: 1,
  other: 3,
};

export const EFFORT_FACTORS = [0.6, 0.8, 1.0, 1.3, 1.6] as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Heavier-weighted work gets more time: 0% → 0.5×, 20% → 1×, 60%+ → 2×. */
export function weightFactor(weight: number): number {
  return clamp(0.5 + weight / 40, 0.5, 2);
}

export function effortFactor(effort: Effort): number {
  return EFFORT_FACTORS[effort - 1];
}

/** Learned speed: >1 means this kind of work usually takes you longer than planned. */
export function paceFactor(
  pace: PaceProfile | undefined,
  type: DeliverableType,
  courseId?: string,
): number {
  const byType = pace?.byType[type] ?? 1;
  const byCourse = courseId ? (pace?.byCourse[courseId] ?? 1) : 1;
  return clamp(byType * byCourse, 0.5, 2.5);
}

export function roundToHalf(hours: number): number {
  return Math.round(hours * 2) / 2;
}

export interface EstimateInput {
  type: DeliverableType;
  weight: number;
  effort: Effort;
  courseId?: string;
  pace?: PaceProfile;
}

export function estimateHours({ type, weight, effort, courseId, pace }: EstimateInput): number {
  const raw =
    BASE_HOURS[type] * weightFactor(weight) * effortFactor(effort) * paceFactor(pace, type, courseId);
  return Math.max(0.5, roundToHalf(raw));
}
