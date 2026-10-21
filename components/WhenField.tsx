"use client";
// "When" for a deadline (V2-7): a date, or — when the course is in your Blackboard calendar —
// "Session 15 · Tue 17 Nov", which takes that class's date (and follows it if Blackboard changes).
import { format, parseISO } from "date-fns";
import { input, label } from "@/components/ui";
import type { ClassSession } from "@/lib/types";

export type WhenValue = { date: string } | { session: number };

/** The sessions you can pick: numbered classes, once each, from today on (past ones can't be due). */
export function pickableSessions(sessions: ClassSession[] | undefined, today: string): ClassSession[] {
  const seen = new Set<number>();
  return (sessions ?? [])
    .filter((s) => s.number > 0 && s.date >= today && !seen.has(s.number) && seen.add(s.number))
    .sort((a, b) => a.number - b.number);
}

export const sessionLabel = (s: ClassSession) => `Session ${s.number} · ${format(parseISO(s.date), "EEE d MMM")}`;

/** The due date a When value stands for ("" if unknown). */
export function dateOf(value: WhenValue, sessions: ClassSession[] | undefined): string {
  if ("date" in value) return value.date;
  return sessions?.find((s) => s.number === value.session)?.date ?? "";
}

export function WhenField({
  id,
  value,
  onChange,
  sessions,
  today,
  dateHelp,
}: {
  id: string;
  value: WhenValue;
  onChange: (value: WhenValue) => void;
  sessions: ClassSession[]; // pickable sessions; empty → just a date
  today: string;
  dateHelp?: string;
}) {
  const bySession = "session" in value;
  if (sessions.length === 0) {
    return (
      <div>
        <label htmlFor={id} className={label}>
          Due date
        </label>
        <input
          id={id}
          type="date"
          min={today}
          className={input}
          value={"date" in value ? value.date : ""}
          onChange={(e) => onChange({ date: e.target.value })}
          aria-describedby={dateHelp ? `${id}-help` : undefined}
        />
        {dateHelp && (
          <p id={`${id}-help`} className="mt-1 text-xs text-muted">
            {dateHelp}
          </p>
        )}
      </div>
    );
  }
  return (
    <fieldset>
      <legend className={label}>When</legend>
      <div className="flex gap-3 text-xs">
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={!bySession}
            onChange={() => onChange({ date: dateOf(value, sessions) })}
            className="accent-[var(--accent)]"
          />
          Date
        </label>
        <label className="flex cursor-pointer items-center gap-1">
          <input
            type="radio"
            name={`${id}-mode`}
            checked={bySession}
            onChange={() => onChange({ session: sessions[0].number })}
            className="accent-[var(--accent)]"
          />
          Blackboard session
        </label>
      </div>
      {bySession ? (
        <>
          <label htmlFor={id} className="sr-only">
            Session
          </label>
          <select
            id={id}
            className={`${input} mt-1`}
            value={value.session}
            onChange={(e) => onChange({ session: Number(e.target.value) })}
          >
            {sessions.map((s) => (
              <option key={s.number} value={s.number}>
                {sessionLabel(s)}
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <label htmlFor={id} className="sr-only">
            Due date
          </label>
          <input
            id={id}
            type="date"
            min={today}
            className={`${input} mt-1`}
            value={value.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
        </>
      )}
    </fieldset>
  );
}
