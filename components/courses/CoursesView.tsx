"use client";
// /courses: your learned pace, every course's deliverables (mark done, enter scores) and a grade calculator.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { Callout, CourseDot, EmptyState, HowItWorks, PageHeader } from "@/components/kit";
import { buttonPrimary, card, input, label, page } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import { requiredScore } from "@/lib/grades";
import { paceInsights } from "@/lib/pace";
import { isExam } from "@/lib/examPlan";
import { useStore } from "@/lib/store";
import type { Course, Deliverable, Effort } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";

const num = (n: number) => String(Math.round(n * 100) / 100);
const parseNumber = (text: string) => {
  if (text.trim() === "") return undefined;
  const n = Number(text.replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

const EFFORT_LABELS: Record<Effort, string> = {
  1: "1 · Easy for me",
  2: "2 · Fairly easy",
  3: "3 · Medium",
  4: "4 · Hard",
  5: "5 · Very hard",
};

export function CoursesView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Courses</h1>
        <p className="mt-2 text-muted">Loading your courses…</p>
      </main>
    );
  }
  return <CoursesContent />;
}

function CoursesContent() {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const pace = useStore((s) => s.pace);
  const insights = paceInsights(pace);

  if (courses.length === 0) {
    return (
      <main id="main" className={page}>
        <PageHeader
          title="Courses"
          description="All your courses and their graded work: mark things done, enter your scores and see what you need to reach your target grade."
        />
        <EmptyState
          title="No courses yet"
          action={
            <>
              <Link href="/onboarding" className={buttonPrimary}>
                Add a syllabus
              </Link>
              <DemoButton label="Load a sample semester" variant="secondary" />
            </>
          }
        >
          Add a syllabus and we&apos;ll create the course with all its deadlines and grade weights. Single deadlines you
          add on Today appear here too.
        </EmptyState>
      </main>
    );
  }

  return (
    <main id="main" className={page}>
      <PageHeader
        title="Courses"
        description="All your courses and their graded work. Tick what you've finished, enter the scores you get, and check what you need to reach your target grade."
        action={
          <Link href="/onboarding" className={buttonPrimary}>
            Add a syllabus
          </Link>
        }
      />

      <div className="space-y-3">
        <Callout tone="info" title="How long things take you">
          <h2 id="pace-title" className="sr-only">
            Your pace
          </h2>
          {insights.length === 0 ? (
            <p>
              Not enough data yet. When you finish something, tick it here: Syllabuddy compares the time you logged with
              the time it planned and adjusts future estimates.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {insights.map((i) => (
                <li key={i.type}>Your pace: {i.text.charAt(0).toLowerCase() + i.text.slice(1)}.</li>
              ))}
            </ul>
          )}
        </Callout>
        <HowItWorks title="What to do on this page">
          <p>
            <span className="font-medium">Tick a deliverable</span> when it&apos;s handed in or the exam is over: you
            get 50 points, its remaining study blocks disappear and your pace is updated.
          </p>
          <p>
            <span className="font-medium">Enter your score</span> once you get a grade back. The grade calculator below
            each course uses it to tell you what you need on the rest.
          </p>
          <p>
            <span className="font-medium">Change the difficulty</span> if a course turns out easier or harder than you
            thought — your plan is updated straight away.
          </p>
        </HowItWorks>
      </div>

      <div className="mt-6 space-y-6">
        {courses.map((course, i) => (
          <CourseCard
            key={course.id}
            course={course}
            // The first calculator gets the plain test id; ids must be unique on a page.
            calculatorTestId={i === 0 ? "grade-calculator" : `grade-calculator-${course.id}`}
            items={deliverables
              .filter((d) => d.courseId === course.id)
              .sort((a, b) => a.dueDate.localeCompare(b.dueDate))}
          />
        ))}
      </div>
    </main>
  );
}

function CourseCard({
  course,
  items,
  calculatorTestId,
}: {
  course: Course;
  items: Deliverable[];
  calculatorTestId: string;
}) {
  const updateCourse = useStore((s) => s.updateCourse);
  const generatePlan = useStore((s) => s.generatePlan);
  const setDeliverableDone = useStore((s) => s.setDeliverableDone);
  const [announcement, setAnnouncement] = useState("");

  return (
    <section
      aria-labelledby={`course-${course.id}`}
      className={card}
      style={{ borderTop: `4px solid ${course.color}` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`course-${course.id}`} className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <CourseDot color={course.color} />
            {course.name}
          </h2>
          <p className="text-sm text-muted">
            {items.filter((d) => d.done).length} of {items.length} done ·{" "}
            {num(items.reduce((sum, d) => sum + d.loggedMinutes, 0) / 60)}h logged
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={`effort-${course.id}`} className="text-sm text-muted">
            Difficulty
          </label>
          <select
            id={`effort-${course.id}`}
            className={`${input} w-auto py-1 text-sm`}
            value={course.effort}
            onChange={(e) => {
              updateCourse(course.id, {
                effort: Number(e.target.value) as Effort,
              });
              generatePlan(todayISO());
              setAnnouncement("Difficulty updated — your plan was adjusted.");
            }}
          >
            {([1, 2, 3, 4, 5] as Effort[]).map((e) => (
              <option key={e} value={e}>
                {EFFORT_LABELS[e]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {course.attendancePolicy && <p className="mt-2 text-sm text-muted">Attendance: {course.attendancePolicy}</p>}

      <ul className="mt-4 divide-y divide-line">
        {items.map((d) => {
          const doneId = `done-${d.id}`;
          return (
            <li key={d.id} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_1fr_8rem]">
              <input
                id={doneId}
                type="checkbox"
                checked={d.done}
                onChange={(e) => {
                  setDeliverableDone(d.id, e.target.checked, todayISO());
                  setAnnouncement(
                    e.target.checked ? `${d.title} marked done. +50 points!` : `${d.title} marked not done.`,
                  );
                }}
                className="mt-1 h-5 w-5 cursor-pointer accent-[var(--success)]"
              />
              <label htmlFor={doneId} className="cursor-pointer">
                <span className={`block font-medium ${d.done ? "text-muted line-through" : ""}`}>{d.title}</span>
                <span className="block text-sm text-muted">
                  Due {format(parseISO(d.dueDate), "d MMM")} · {d.weight}% · {num(d.loggedMinutes / 60)}h of{" "}
                  {num(d.estimatedHours)}h logged
                </span>
              </label>
              {isExam(d) && !d.done && (
                <Link
                  href={`/exam/${d.id}`}
                  data-testid={`exam-prep-link-${d.id}`}
                  className="col-start-2 text-sm font-medium text-accent underline underline-offset-2 hover:no-underline sm:col-start-2"
                >
                  Open exam prep plan
                </Link>
              )}
              <div className="col-start-2 sm:col-start-3">
                <ScoreInput deliverable={d} scale={course.gradeScale} />
              </div>
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <GradeCalculator course={course} items={items} testId={calculatorTestId} />
    </section>
  );
}

function ScoreInput({ deliverable, scale }: { deliverable: Deliverable; scale: number }) {
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

function GradeCalculator({ course, items, testId }: { course: Course; items: Deliverable[]; testId: string }) {
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
        Enter the scores you already have above, then your target. We work out the average you need on everything
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
            : "Enter your scores above and a target grade to see what you need on the rest.")}
      </p>
    </div>
  );
}
