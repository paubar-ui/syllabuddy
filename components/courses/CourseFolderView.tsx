"use client";
// /courses/[courseId] — one course's folder: its deadlines in a table (add, tick done, scores,
// delete), the grade calculator and the course's settings.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CourseDot, EmptyState, HowItWorks, PageHeader } from "@/components/kit";
import { buttonPrimary, buttonSecondary, card, input, label, page } from "@/components/ui";
import { addDaysISO, daysBetween, describeDaysAway, todayISO } from "@/lib/dates";
import { isExam } from "@/lib/examPlan";
import { DELIVERABLE_TYPES } from "@/lib/extraction";
import { useStore } from "@/lib/store";
import type { Course, Deliverable, DeliverableType, Effort } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";
import { EFFORT_LABELS, GradeCalculator, ScoreInput, TYPE_LABELS, num, parseNumber } from "./shared";

type SortKey = "due" | "weight" | "type";

export function CourseFolderView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Course</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <FolderContent />;
}

function FolderContent() {
  const { courseId } = useParams<{ courseId: string }>();
  const course = useStore((s) => s.courses.find((c) => c.id === courseId));
  const allDeliverables = useStore((s) => s.deliverables);
  const setDeliverableDone = useStore((s) => s.setDeliverableDone);
  const removeDeliverable = useStore((s) => s.removeDeliverable);
  const [today] = useState(todayISO);
  const [sort, setSort] = useState<SortKey>("due");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  if (!course) {
    return (
      <main id="main" className={page}>
        <PageHeader back={{ href: "/courses", label: "My courses" }} title="Course not found" />
        <EmptyState title="We couldn't find this course">It may have been deleted.</EmptyState>
      </main>
    );
  }

  const items = allDeliverables.filter((d) => d.courseId === course.id);
  const sorted = [...items].sort((a, b) => {
    if (sort === "weight") return b.weight - a.weight || a.dueDate.localeCompare(b.dueDate);
    if (sort === "type") return a.type.localeCompare(b.type) || a.dueDate.localeCompare(b.dueDate);
    return Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate);
  });
  const doneCount = items.filter((d) => d.done).length;

  return (
    <main id="main" className={page}>
      <PageHeader
        back={{ href: "/courses", label: "My courses" }}
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <CourseDot color={course.color} />
            Course folder
          </span>
        }
        title={course.name}
        description={`${items.length} deadline${items.length === 1 ? "" : "s"} · ${doneCount} done · ${num(
          items.reduce((sum, d) => sum + d.loggedMinutes, 0) / 60,
        )}h studied`}
      />

      <AddDeadlineRow course={course} today={today} onAdded={(t) => setAnnouncement(`${t} added to ${course.name}.`)} />
      <p aria-live="polite" className="mt-2 text-sm text-success">
        {announcement}
      </p>

      <section aria-labelledby="deadlines-title" className="mt-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 id="deadlines-title" className="text-lg font-semibold tracking-tight">
            Deadlines
          </h2>
          {items.length > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <label htmlFor="sort-deadlines" className="text-muted">
                Sort by
              </label>
              <select
                id="sort-deadlines"
                className={`${input} w-auto py-1 text-sm`}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="due">Due date</option>
                <option value="weight">Weight</option>
                <option value="type">Type</option>
              </select>
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No deadlines yet — add the first one above.</p>
        ) : (
          <div className="relative mt-2 overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full min-w-[34rem] text-left text-sm" data-testid="course-deadlines">
              <caption className="sr-only">Deadlines of {course.name}</caption>
              <thead className="border-b border-line bg-surface-2 text-xs text-muted">
                <tr>
                  <th scope="col" className="w-10 py-2 pl-3">
                    <span className="sr-only">Done</span>
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Deadline
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Type
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Due
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Weight
                  </th>
                  <th scope="col" className="w-28 px-3 py-2 font-medium">
                    Score
                  </th>
                  <th scope="col" className="w-20 px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted.map((d) => (
                  <DeadlineRow
                    key={d.id}
                    d={d}
                    course={course}
                    today={today}
                    confirming={confirmId === d.id}
                    onToggle={(done) => {
                      setDeliverableDone(d.id, done, today);
                      setAnnouncement(done ? `${d.title} marked done. +50 points!` : `${d.title} marked not done.`);
                    }}
                    onAskDelete={() => setConfirmId(d.id)}
                    onCancelDelete={() => setConfirmId(null)}
                    onDelete={() => {
                      removeDeliverable(d.id, today);
                      setConfirmId(null);
                      setAnnouncement(`${d.title} deleted.`);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <GradeCalculator course={course} items={items} testId="grade-calculator" />

      <CourseSettings course={course} today={today} />

      <div className="mt-6">
        <HowItWorks title="What to do in a course folder">
          <p>
            <span className="font-medium">Add each deadline</span> with its date and how much it counts. Syllabuddy
            plans study time for it straight away.
          </p>
          <p>
            <span className="font-medium">Tick a deadline</span> when it&apos;s handed in or the exam is over: +50
            points, and its remaining study blocks disappear.
          </p>
          <p>
            <span className="font-medium">Enter your score</span> when you get a grade back; the grade calculator tells
            you what you need on the rest.
          </p>
        </HowItWorks>
      </div>
    </main>
  );
}

function DeadlineRow({
  d,
  course,
  today,
  confirming,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
}: {
  d: Deliverable;
  course: Course;
  today: string;
  confirming: boolean;
  onToggle: (done: boolean) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const days = daysBetween(today, d.dueDate);
  const soon = !d.done && days >= 0 && days <= 3;
  return (
    <tr data-testid={`course-row-${d.id}`} className="align-top">
      <td className="py-3 pl-3">
        <input
          type="checkbox"
          aria-label={`${d.title} done`}
          checked={d.done}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-0.5 h-5 w-5 cursor-pointer accent-[var(--success)]"
        />
      </td>
      <td className="px-3 py-3">
        <span className={`block font-medium break-words ${d.done ? "text-muted line-through" : ""}`}>{d.title}</span>
        {isExam(d) && !d.done && (
          <Link
            href={`/exam/${d.id}`}
            data-testid={`exam-prep-link-${d.id}`}
            className="text-xs font-medium text-accent underline underline-offset-2 hover:no-underline"
          >
            Exam prep plan
          </Link>
        )}
      </td>
      <td className="px-3 py-3 text-muted">{TYPE_LABELS[d.type]}</td>
      <td className="px-3 py-3 tabular-nums">
        {format(parseISO(d.dueDate), "EEE d MMM")}
        {soon && <span className="block text-xs font-semibold text-warn-ink">{describeDaysAway(days)}</span>}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{d.weight}%</td>
      <td className="px-3 py-2">
        <ScoreInput deliverable={d} scale={course.gradeScale} />
      </td>
      <td className="px-2 py-2.5 text-right">
        {confirming ? (
          <span className="inline-flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md bg-danger px-2.5 py-1 text-sm font-semibold text-surface"
            >
              Delete
            </button>
            <button type="button" onClick={onCancelDelete} className="text-sm text-muted underline">
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-label={`Delete ${d.title}`}
            onClick={onAskDelete}
            className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink"
          >
            ×
          </button>
        )}
      </td>
    </tr>
  );
}

function AddDeadlineRow({
  course,
  today,
  onAdded,
}: {
  course: Course;
  today: string;
  onAdded: (title: string) => void;
}) {
  const addDeadline = useStore((s) => s.addDeadline);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<DeliverableType>("homework");
  const [due, setDue] = useState(() => addDaysISO(today, 7));
  const [weight, setWeight] = useState("");
  const [error, setError] = useState("");

  return (
    <form
      aria-labelledby="add-deadline-title"
      className={`${card} mt-2`}
      onSubmit={(e) => {
        e.preventDefault();
        const w = parseNumber(weight);
        if (!title.trim()) return setError("Give the deadline a title.");
        if (!due || due < today) return setError("Pick a due date from today on.");
        if (w !== undefined && (Number.isNaN(w) || w < 0 || w > 100)) return setError("Weight must be 0–100%.");
        addDeadline({ title, type, dueDate: due, courseId: course.id, weight: w ?? 10 }, today);
        onAdded(title.trim());
        setTitle("");
        setType("homework");
        setWeight("");
        setError("");
      }}
    >
      <h2 id="add-deadline-title" className="text-base font-semibold">
        Add a deadline
      </h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_5.5rem_auto] sm:items-end">
        <div>
          <label htmlFor="dl-title" className={label}>
            Title
          </label>
          <input
            id="dl-title"
            data-testid="course-deadline-title"
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Problem set 3"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor="dl-type" className={label}>
            Type
          </label>
          <select
            id="dl-type"
            className={input}
            value={type}
            onChange={(e) => setType(e.target.value as DeliverableType)}
          >
            {DELIVERABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="dl-due" className={label}>
            Due date
          </label>
          <input
            id="dl-due"
            type="date"
            min={today}
            className={input}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="dl-weight" className={label}>
            Weight %
          </label>
          <input
            id="dl-weight"
            inputMode="decimal"
            className={input}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            placeholder="10"
          />
        </div>
        <button type="submit" data-testid="course-deadline-add" className={buttonPrimary}>
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function CourseSettings({ course, today }: { course: Course; today: string }) {
  const updateCourse = useStore((s) => s.updateCourse);
  const generatePlan = useStore((s) => s.generatePlan);
  const removeCourse = useStore((s) => s.removeCourse);
  const router = useRouter();
  const [name, setName] = useState(course.name);
  const [confirming, setConfirming] = useState(false);

  return (
    <section aria-labelledby="course-settings-title" className={`${card} mt-6`}>
      <h2 id="course-settings-title" className="text-lg font-semibold tracking-tight">
        Course settings
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="course-name-edit" className={label}>
            Name
          </label>
          <input
            id="course-name-edit"
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              if (trimmed && trimmed !== course.name) updateCourse(course.id, { name: trimmed.slice(0, 120) });
              else setName(course.name);
            }}
          />
        </div>
        <div>
          <label htmlFor="course-effort-edit" className={label}>
            How hard is it for you?
          </label>
          <select
            id="course-effort-edit"
            className={input}
            value={course.effort}
            onChange={(e) => {
              updateCourse(course.id, { effort: Number(e.target.value) as Effort });
              generatePlan(today);
            }}
          >
            {([1, 2, 3, 4, 5] as Effort[]).map((v) => (
              <option key={v} value={v}>
                {EFFORT_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="course-scale-edit" className={label}>
            Grades out of
          </label>
          <select
            id="course-scale-edit"
            className={input}
            value={course.gradeScale}
            onChange={(e) => updateCourse(course.id, { gradeScale: Number(e.target.value) })}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>
      <div className="mt-4 border-t border-line pt-3">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Delete {course.name} and all its deadlines?</span>
            <button
              type="button"
              className="rounded-md bg-danger px-2.5 py-1 font-semibold text-surface"
              onClick={() => {
                removeCourse(course.id, today);
                router.push("/courses");
              }}
            >
              Delete course
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="text-sm font-medium text-danger underline"
            onClick={() => setConfirming(true)}
          >
            Delete this course
          </button>
        )}
      </div>
    </section>
  );
}
