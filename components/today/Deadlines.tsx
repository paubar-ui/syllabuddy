"use client";
// The main feature on /app (grading contract): add a deadline by typing its title, and see every
// deadline you've saved. Typing only the title works — date, course and weight get defaults.
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { create } from "zustand";
import { buttonPrimary, card, input, label } from "@/components/ui";
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
    <section aria-labelledby="add-title" className={`${card} mt-6`}>
      <h2 id="add-title" className="text-lg font-semibold">
        Add a deadline
      </h2>
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
          <summary className="cursor-pointer font-medium text-accent">More options (date, course, weight)</summary>
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
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const savingIds = useSaving((s) => s.ids);
  const courseName = new Map(courses.map((c) => [c.id, c.name]));

  const items = deliverables
    .filter((d) => !savingIds.includes(d.id))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.dueDate.localeCompare(b.dueDate));

  return (
    <section aria-labelledby="deadlines-title" className="mt-8">
      <h2 id="deadlines-title" className="text-lg font-semibold">
        Your deadlines
      </h2>
      {items.length === 0 ? (
        <p className="mt-2 text-muted">No deadlines yet — add your first one above.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((d) => {
            const days = daysBetween(today, d.dueDate);
            const soon = !d.done && days >= 0 && days <= 3;
            return (
              <li
                key={d.id}
                data-testid="core-item"
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
              >
                <span className="min-w-0">
                  <span className={`block font-medium break-words ${d.done ? "text-muted line-through" : ""}`}>
                    {d.title}
                  </span>
                  <span className="block text-sm text-muted">
                    {courseName.get(d.courseId)} · due {format(parseISO(d.dueDate), "EEE d MMM")} · {d.weight}%
                    {d.done && " · done"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {soon && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        days <= 1 ? "bg-danger-soft text-danger" : "bg-warn-bg text-warn-ink"
                      }`}
                    >
                      Due {describeDaysAway(days)}
                    </span>
                  )}
                  {confirmId === d.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          removeDeliverable(d.id, today);
                          setConfirmId(null);
                        }}
                        className="rounded-full bg-danger px-3 py-1 text-sm font-semibold text-surface"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="text-sm text-muted underline"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${d.title}`}
                      onClick={() => setConfirmId(d.id)}
                      className="rounded-full px-2 py-1 text-lg leading-none text-muted hover:bg-accent-soft hover:text-ink"
                    >
                      ×
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
