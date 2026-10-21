"use client";
// /courses — My courses: one folder per course. Add a course by name; open a folder to see its
// deadlines in a table, enter scores and use the grade calculator.
import Link from "next/link";
import { useState } from "react";
import { DemoButton } from "@/components/DemoButton";
import { Callout, HowItWorks, PageHeader } from "@/components/kit";
import { buttonPrimary, buttonSecondary, card, input, label, page } from "@/components/ui";
import { daysBetween, describeDaysAway, todayISO } from "@/lib/dates";
import { paceInsights } from "@/lib/pace";
import { useStore } from "@/lib/store";
import type { Effort } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";
import { AssistantImport } from "./AssistantImport";
import { EFFORT_LABELS } from "./shared";

export function CoursesView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">My courses</h1>
        <p className="mt-2 text-muted">Loading your courses…</p>
      </main>
    );
  }
  return <CoursesContent />;
}

function CoursesContent() {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const isDemo = useStore((s) => s.isDemo);
  const pace = useStore((s) => s.pace);
  const insights = paceInsights(pace);
  const [today] = useState(todayISO);
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  return (
    <main id="main" className={page}>
      <PageHeader
        title="My courses"
        description="One folder per course. Open a folder to add its deadlines, see them in a table, enter your scores and check what you need for your target grade."
        action={
          !adding &&
          !importing && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                data-testid="add-course-button"
                onClick={() => setAdding(true)}
                className={buttonPrimary}
              >
                + Add course
              </button>
              <button
                type="button"
                data-testid="assistant-import-button"
                onClick={() => setImporting(true)}
                className={buttonSecondary}
              >
                Import with ChatGPT or Claude
              </button>
            </div>
          )
        }
      />

      {importing && (
        <AssistantImport
          today={today}
          onCancel={() => setImporting(false)}
          onTypeInstead={() => {
            setImporting(false);
            setAdding(true);
          }}
          onDone={(message) => {
            setImporting(false);
            setAnnouncement(message);
          }}
        />
      )}

      {!importing && (adding || courses.length === 0) && (
        <AddCourseForm
          replacesSample={isDemo}
          onCancel={courses.length ? () => setAdding(false) : undefined}
          onAdded={(name) => {
            setAdding(false);
            setAnnouncement(`${name} added. Open its folder to add deadlines.`);
          }}
        />
      )}
      <p aria-live="polite" className="mt-2 text-sm text-success">
        {announcement}
      </p>

      {courses.length === 0 ? (
        <div className={`${card} mt-4 text-sm text-muted`}>
          <p>
            No courses yet. Add each course you&apos;re taking — for example <em>Behavioral Economics</em> or{" "}
            <em>Public Economics</em> — then open its folder to add its deadlines.
          </p>
          <div className="mt-3">
            <DemoButton label="Or load a sample semester" variant="secondary" />
          </div>
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Your courses">
          {courses.map((course) => {
            const items = deliverables.filter((d) => d.courseId === course.id);
            const open = items.filter((d) => !d.done).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
            const next = open[0];
            const days = next ? daysBetween(today, next.dueDate) : null;
            return (
              <li key={course.id}>
                <Link
                  href={`/courses/${course.id}`}
                  data-testid={`course-folder-${course.id}`}
                  className="group flex aspect-square flex-col rounded-xl border border-line bg-surface p-4 shadow-sm transition hover:border-accent hover:shadow-md focus-visible:border-accent"
                  style={{ borderTop: `6px solid ${course.color}` }}
                >
                  <FolderIcon color={course.color} />
                  <span className="mt-2 line-clamp-3 font-semibold leading-snug break-words group-hover:underline">
                    {course.name}
                  </span>
                  <span className="mt-auto text-xs text-muted">
                    {open.length === 0 ? (items.length ? "All done" : "No deadlines yet") : `${open.length} to do`}
                    {next && days !== null && days >= 0 && (
                      <span className="block truncate">
                        Next: {next.title} · {describeDaysAway(days)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {courses.length > 0 && (
        <div className="mt-6 space-y-3">
          <Callout tone="info" title="How long things take you">
            {insights.length === 0 ? (
              <p>
                Not enough data yet. When you finish something, tick it in its course folder: Syllabuddy compares the
                time you logged with the time it planned and adjusts future estimates.
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
              <span className="font-medium">Add a course</span> with the button at the top: just its name and how hard
              it is for you.
            </p>
            <p>
              <span className="font-medium">Open a folder</span> to add that course&apos;s deadlines, tick them when
              they&apos;re done, enter your scores and use the grade calculator.
            </p>
            <p>Deadlines you add on Today land in their course folder too.</p>
          </HowItWorks>
        </div>
      )}
    </main>
  );
}

function AddCourseForm({
  replacesSample,
  onAdded,
  onCancel,
}: {
  replacesSample: boolean;
  onAdded: (name: string) => void;
  onCancel?: () => void;
}) {
  const addCourse = useStore((s) => s.addCourse);
  const [name, setName] = useState("");
  const [effort, setEffort] = useState<Effort>(3);
  const [error, setError] = useState("");

  return (
    <form
      aria-labelledby="add-course-title"
      className={`${card} mt-2`}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) {
          setError("Give the course a name.");
          return;
        }
        addCourse(name, effort);
        onAdded(name.trim());
        setName("");
        setEffort(3);
        setError("");
      }}
    >
      <h2 id="add-course-title" className="text-lg font-semibold tracking-tight">
        Add a course
      </h2>
      {replacesSample && (
        <p className="mt-1 text-sm text-warn-ink">Adding your own course replaces the sample semester.</p>
      )}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_12rem]">
        <div>
          <label htmlFor="new-course-name" className={label}>
            Course name
          </label>
          <input
            id="new-course-name"
            data-testid="new-course-name"
            className={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Behavioral Economics"
            autoComplete="off"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "new-course-error" : undefined}
          />
        </div>
        <div>
          <label htmlFor="new-course-effort" className={label}>
            How hard is it for you?
          </label>
          <select
            id="new-course-effort"
            className={input}
            value={effort}
            onChange={(e) => setEffort(Number(e.target.value) as Effort)}
          >
            {([1, 2, 3, 4, 5] as Effort[]).map((v) => (
              <option key={v} value={v}>
                {EFFORT_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && (
        <p id="new-course-error" role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" data-testid="create-course-button" className={buttonPrimary}>
          Create course
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className={buttonSecondary}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function FolderIcon({ color }: { color: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7" fill="none" strokeWidth="1.6" stroke={color}>
      <path
        d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"
        fill={color}
        fillOpacity="0.12"
      />
    </svg>
  );
}
