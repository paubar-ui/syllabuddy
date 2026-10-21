"use client";
// Plan → "Deadlines from Blackboard" (V2-3): Blackboard lists hand-ins and exams but not their
// course, so you pick the course and add each one with a click — no typing.
import { format, parseISO } from "date-fns";
import { useState } from "react";
import { buttonPrimary, card, input } from "@/components/ui";
import { openCalendarDeadlines } from "@/lib/blackboard";
import { useStore } from "@/lib/store";
import type { CalendarDeadline } from "@/lib/types";

export function CalendarDeadlines({ today }: { today: string }) {
  const calendar = useStore((s) => s.calendar);
  const [announcement, setAnnouncement] = useState("");
  const open = openCalendarDeadlines(calendar, today);
  if (!calendar || (open.length === 0 && !announcement)) return null;

  return (
    <section aria-labelledby="bb-deadlines-title" data-testid="calendar-deadlines" className={`${card} mb-8`}>
      <h2 id="bb-deadlines-title" className="text-lg font-semibold tracking-tight">
        Deadlines from Blackboard
      </h2>
      <p className="text-sm text-muted">
        Your Blackboard calendar has these upcoming deadlines. Blackboard doesn&apos;t say which course they belong to,
        so pick one and add it to your plan — or ignore it.
      </p>
      {open.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {open.map((d) => (
            <DeadlineRow key={d.uid} deadline={d} today={today} onDone={setAnnouncement} />
          ))}
        </ul>
      )}
      <p aria-live="polite" className="mt-2 text-sm text-success">
        {announcement}
      </p>
    </section>
  );
}

function DeadlineRow({
  deadline,
  today,
  onDone,
}: {
  deadline: CalendarDeadline;
  today: string;
  onDone: (message: string) => void;
}) {
  const courses = useStore((s) => s.courses);
  const addDeadline = useStore((s) => s.addDeadline);
  const handle = useStore((s) => s.handleCalendarDeadline);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const id = `bb-course-${deadline.uid.replace(/[^a-zA-Z0-9]+/g, "-")}`;

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{deadline.title}</p>
        <p className="text-sm text-muted">{format(parseISO(deadline.date), "EEEE d MMMM")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="sr-only">
          Course for {deadline.title}
        </label>
        <select
          id={id}
          className={`${input} w-auto max-w-[14rem] py-1.5`}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          {courses.length === 0 && <option value="">My deadlines</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={buttonPrimary}
          onClick={() => {
            addDeadline({ title: deadline.title, dueDate: deadline.date, courseId: courseId || undefined }, today);
            handle(deadline.uid, "added");
            onDone(`Added “${deadline.title}” to your plan.`);
          }}
        >
          Add
        </button>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
          onClick={() => {
            handle(deadline.uid, "ignored");
            onDone(`Ignored “${deadline.title}”.`);
          }}
        >
          Ignore
        </button>
      </div>
    </li>
  );
}
