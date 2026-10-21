"use client";
// Pieces shared by My courses and a course's folder page: score input, grade calculator, labels.
import { useState } from "react";
import { input, label } from "@/components/ui";
import { requiredScore } from "@/lib/grades";
import { useStore } from "@/lib/store";
import type { Course, Deliverable, DeliverableType, Effort } from "@/lib/types";

export const num = (n: number) => String(Math.round(n * 100) / 100);
export const parseNumber = (text: string) => {
  if (text.trim() === "") return undefined;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export const EFFORT_LABELS: Record<Effort, string> = {
  1: "1 · Easy for me",
  2: "2 · Fairly easy",
  3: "3 · Medium",
  4: "4 · Hard",
  5: "5 · Very hard",
};

export const TYPE_LABELS: Record<DeliverableType, string> = {
  exam: "Exam",
  midterm: "Midterm",
  final: "Final exam",
  essay: "Essay / paper",
  project: "Project",
  presentation: "Presentation",
  quiz: "Quiz",
  homework: "Homework",
  reading: "Reading",
  other: "Other",
};

export function ScoreInput({ deliverable, scale }: { deliverable: Deliverable; scale: number }) {
  const setScore = useStore((s) => s.setScore);
  const [text, setText] = useState(deliverable.score === undefined ? "" : String(deliverable.score));
  const value = parseNumber(text);
  const invalid = value !== undefined && (Number.isNaN(value) || value < 0 || value > scale);
  const id = `score-${deliverable.id}`;

  return (
    <div>
      <label htmlFor={id} className="mb-0.5 block text-xs text-muted">
        Score (/{scale})
      </label>
      <input
        id={id}
        inputMode="decimal"
        className={`${input} py-1 ${invalid ? "border-danger" : ""}`}
        value={text}
        placeholder="—"
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const v = parseNumber(e.target.value);
          if (v === undefined) setScore(deliverable.id, undefined);
          else if (!Number.isNaN(v) && v >= 0 && v <= scale) setScore(deliverable.id, v);
        }}
      />
      {invalid && (
        <p id={`${id}-error`} className="mt-0.5 text-xs text-danger">
          0–{scale}
        </p>
      )}
    </div>
  );
}

export function GradeCalculator({ course, items, testId }: { course: Course; items: Deliverable[]; testId: string }) {
  const updateCourse = useStore((s) => s.updateCourse);
  const [text, setText] = useState(course.targetGrade === undefined ? "" : String(course.targetGrade));
  const target = parseNumber(text);
  const validTarget = target !== undefined && !Number.isNaN(target) && target >= 0 && target <= course.gradeScale;
  const id = `target-${course.id}`;
  const scale = course.gradeScale;

  let result: { tone: "good" | "info" | "kind"; text: string } | null = null;
  if (validTarget && items.length > 0) {
    const r = requiredScore(
      items.map((d) => ({ weight: d.weight, score: d.score })),
      target,
      scale,
    );
    const average = r.currentAverage !== null ? ` So far you're averaging ${num(r.currentAverage)}/${scale}.` : "";
    if (r.alreadySecured) {
      result = {
        tone: "good",
        text:
          r.remainingWeight > 0
            ? `You've already secured ${num(target)}/${scale} — even a 0 on the rest keeps you there.`
            : `You reached your target: your final grade is ${num(r.maxReachable)}/${scale}.`,
      };
    } else if (r.possible) {
      result = {
        tone: "info",
        text: `To reach ${num(target)}/${scale}, you need an average of ${num(r.needed)}/${scale} on the remaining ${num(r.remainingWeight)}% of the course.${average}`,
      };
    } else {
      result = {
        tone: "kind",
        text:
          r.remainingWeight > 0
            ? `${num(target)}/${scale} isn't reachable any more — the most you can still get is ${num(r.maxReachable)}/${scale}. That's okay: aiming for ${num(r.maxReachable)} is a great new goal, and every point still counts.`
            : `Your final grade is ${num(r.maxReachable)}/${scale}, a bit under your target of ${num(target)}. You finished the course — be proud of that, and take what you learned into the next one.`,
      };
    }
  }

  const toneClass = {
    good: "bg-success-soft text-ink",
    info: "bg-accent-soft text-ink",
    kind: "bg-warn-bg text-warn-ink",
  };

  return (
    <div data-testid={testId} className="mt-4 rounded-xl border border-line bg-surface-2 p-4">
      <h3 className="font-semibold">Grade calculator</h3>
      <p className="text-sm text-muted">
        Enter the scores you already have in the table, then your target. We work out the average you need on everything
        that&apos;s left.
      </p>
      <div className="mt-2 max-w-48">
        <label htmlFor={id} className={label}>
          Target grade (/{scale})
        </label>
        <input
          id={id}
          inputMode="decimal"
          className={`${input} ${text && !validTarget ? "border-danger" : ""}`}
          value={text}
          placeholder={scale === 100 ? "e.g. 75" : "e.g. 8"}
          aria-invalid={Boolean(text) && !validTarget}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseNumber(e.target.value);
            if (v === undefined) updateCourse(course.id, { targetGrade: undefined });
            else if (!Number.isNaN(v) && v >= 0 && v <= scale) updateCourse(course.id, { targetGrade: v });
          }}
        />
      </div>
      <p
        aria-live="polite"
        className={`mt-3 rounded-lg px-3 py-2 text-sm ${result ? toneClass[result.tone] : "text-muted"}`}
      >
        {result?.text ??
          (text && !validTarget
            ? `Enter a target between 0 and ${scale}.`
            : "Enter your scores in the table and a target grade to see what you need on the rest.")}
      </p>
    </div>
  );
}
