"use client";
// The main feature on /app (grading contract): add a deadline by typing its title, and see every
// deadline you've saved. Typing only the title works — date, course and weight get defaults.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import { create } from "zustand";
import { CourseDot, EmptyState, SectionHeader } from "@/components/kit";
import { buttonPrimary, input, label } from "@/components/ui";
import { addDaysISO, daysBetween, describeDaysAway } from "@/lib/dates";
import { newId } from "@/lib/id";
import { flushPlan } from "@/lib/planSync";
import { useStore } from "@/lib/store";

/** Deadlines that are still being saved: they appear in the list once they're safely in your account. */
const useSaving = create<{ ids: string[] }>(() => ({ ids: [] }));

export function AddDeadline({ today }: { today: string }) {
  const courses = useStore((s) => s.courses);
  const addDeadline = useStore((s) => s.addDeadline);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [courseId, setCourseId] = useState("");
  const [weight, setWeight] = useState("");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setStatus({ error: true, text: "Type what's due first, e.g. “Finance midterm”." });
      return;
    }
    const w = weight.trim() === "" ? undefined : Number(weight.replace(",", "."));
    const id = newId();
    useSaving.setState((s) => ({ ids: [...s.ids, id] }));
    setSaving(true);
    const added = addDeadline(
      {
        id,
        title,
        dueDate: dueDate || undefined,
        courseId: courseId || undefined,
        weight: Number.isFinite(w) ? w : undefined,
      },
      today,
    );
    setTitle("");
    await flushPlan(); // saved to your account before it shows up in the list
    useSaving.setState((s) => ({ ids: s.ids.filter((x) => x !== id) }));
    setSaving(false);
    setStatus({
      error: false,
      text: `Saved “${added.title}” — due ${format(parseISO(added.dueDate), "EEE d MMM")}. Your plan was updated.`,
    });
  }

  return (
    <section
      aria-labelledby="add-title"
      className="rounded-xl border border-accent-line bg-surface p-4 shadow-sm sm:p-5"
    >
      <h2 id="add-title" className="text-lg font-semibold tracking-tight">
        Add a deadline
      </h2>
      <p className="text-sm text-muted">
        Type what&apos;s due and press <span className="font-medium text-ink">Add deadline</span> — that&apos;s all. We
        recognise the type from the title (exam, essay, quiz…) and plan the study time for you.
      </p>
      <form onSubmit={onSubmit} className="mt-3">
        <label htmlFor="core-input" className={label}>
          What&apos;s due?
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="core-input"
            data-testid="core-input"
            type="text"
            maxLength={200}
            autoComplete="off"
            placeholder="e.g. Finance midterm, Marketing essay…"
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" data-testid="core-submit" disabled={saving} className={`${buttonPrimary} shrink-0`}>
            {saving ? "Saving…" : "Add deadline"}
          </button>
        </div>

        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-accent">
            More options (date, course, weight) — optional
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="deadline-date" className={label}>
                Due date
              </label>
              <input
                id="deadline-date"
                type="date"
                min={today}
                className={input}
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-describedby="deadline-date-help"
              />
              <p id="deadline-date-help" className="mt-1 text-xs text-muted">
                Default: {format(parseISO(addDaysISO(today, 7)), "EEE d MMM")} (in a week)
              </p>
            </div>
            <div>
              <label htmlFor="deadline-course" className={label}>
                Course
              </label>
              <select
                id="deadline-course"
                className={input}
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              >
                <option value="">{courses[0]?.name ?? "My deadlines"}</option>
                {courses.slice(1).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="deadline-weight" className={label}>
                Weight (% of grade)
              </label>
              <input
                id="deadline-weight"
                type="number"
                min={0}
                max={100}
                inputMode="decimal"
                placeholder="10"
                className={input}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>
        </details>

        <p role="status" className={`mt-2 min-h-5 text-sm ${status?.error ? "text-danger" : "text-muted"}`}>
          {status?.text}
        </p>
      </form>
    </section>
  );
}

export function DeadlineList({ today }: { today: string }) {
  const courses = useStore((s) => s.courses);
  const deliverables = useStore((s) => s.deliverables);
  const removeDeliverable = useStore((s) => s.removeDeliverable);
  const setDeliverableDone = useStore((s) => s.setDeliverableDone);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [finished, setFinished] = useState("");
  const savingIds = useSaving((s) => s.ids);
  const courseName = new Map(courses.map((c) => [c.id, c.name]));
  const courseColor = new Map(courses.map((c) => [c.id, c.color]));

  // Finished deadlines leave the table (you can still see and reopen them on Courses).
  const items = deliverables
    .filter((d) => !savingIds.includes(d.id) && !d.done)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const doneCount = deliverables.filter((d) => d.done).length;

  return (
    <section aria-labelledby="deadlines-title" className="mt-8">
      <SectionHeader
        id="deadlines-title"
        title="Your deadlines"
        hint="What's still to do, soonest first. Tick one when it's finished: it leaves the list and you get 50 points."
      />
      {items.length === 0 ? (
        doneCount > 0 ? (
          <EmptyState title="All done!">Every deadline is finished. Add a new one in the box above.</EmptyState>
        ) : (
          <EmptyState title="No deadlines yet">Add your first one in the box above — it takes five seconds.</EmptyState>
        )
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">Your deadlines, soonest first</caption>
            <thead className="border-b border-line bg-surface-2 text-xs text-muted">
              <tr>
                <th scope="col" className="w-10 py-2 pl-3 font-medium sm:pl-4">
                  <span className="sr-only">Finished</span>
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Deadline
                </th>
                <th scope="col" className="hidden w-40 px-3 py-2 font-medium sm:table-cell">
                  Course
                </th>
                <th scope="col" className="w-24 px-3 py-2 font-medium sm:w-28">
                  Due
                </th>
                <th scope="col" className="hidden w-20 px-3 py-2 text-right font-medium sm:table-cell">
                  Weight
                </th>
                <th scope="col" className="w-20 px-2 py-2 font-medium sm:w-32">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((d) => {
                const days = daysBetween(today, d.dueDate);
                const soon = !d.done && days >= 0 && days <= 3;
                const color = courseColor.get(d.courseId);
                return (
                  <tr key={d.id} data-testid="core-item" className="align-top">
                    <td className="py-3 pl-3 sm:pl-4">
                      <input
                        type="checkbox"
                        aria-label={`Mark ${d.title} as finished`}
                        data-testid={`finish-${d.id}`}
                        checked={false}
                        onChange={() => {
                          setDeliverableDone(d.id, true, today);
                          setFinished(`${d.title} finished — +50 points! It's moved off this list.`);
                        }}
                        className="mt-0.5 h-5 w-5 cursor-pointer accent-[var(--success)]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="block font-medium break-words">{d.title}</span>
                      {/* On phones the course and weight move under the title. */}
                      <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted sm:hidden">
                        <CourseDot color={color} />
                        {courseName.get(d.courseId)} · {d.weight}%
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-muted sm:table-cell">
                      <span className="flex items-center gap-1.5">
                        <CourseDot color={color} />
                        <span className="min-w-0 break-words">{courseName.get(d.courseId)}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {format(parseISO(d.dueDate), "EEE d MMM")}
                      {soon && (
                        <span
                          className={`mt-1 block w-fit rounded-md border px-1.5 py-0.5 text-xs font-semibold ${
                            days <= 1
                              ? "border-danger-line bg-danger-soft text-danger"
                              : "border-warn-line bg-warn-bg text-warn-ink"
                          }`}
                        >
                          {describeDaysAway(days)}
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 text-right tabular-nums sm:table-cell">{d.weight}%</td>
                    <td className="px-2 py-2.5 text-right">
                      {confirmId === d.id ? (
                        <span className="inline-flex flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              removeDeliverable(d.id, today);
                              setConfirmId(null);
                            }}
                            className="rounded-md bg-danger px-2.5 py-1 text-sm font-semibold text-surface"
                          >
                            Delete
                          </button>
                          <button type="button" onClick={() => setConfirmId(null)} className="text-sm text-muted underline">
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`Delete ${d.title}`}
                          onClick={() => setConfirmId(d.id)}
                          className="rounded-md px-2 py-1 text-lg leading-none text-muted hover:bg-surface-2 hover:text-ink"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p aria-live="polite" className="mt-2 text-sm text-success">
        {finished}
      </p>
      {doneCount > 0 && (
        <p className="mt-1 text-xs text-muted">
          {doneCount} finished deadline{doneCount === 1 ? "" : "s"} hidden.{" "}
          <Link href="/courses" className="font-medium underline underline-offset-2 hover:no-underline">
            See them on Courses
          </Link>
        </p>
      )}
    </section>
  );
}
