"use client";
// "Import with ChatGPT or Claude" (V2-7): copy our prompt → paste it with your syllabus into your
// own AI assistant → paste its answer back → check the review table → save. No API key needed.
import { useState } from "react";
import { WhenField, dateOf, pickableSessions, sessionLabel, type WhenValue } from "@/components/WhenField";
import { buttonPrimary, buttonSecondary, card, input, label } from "@/components/ui";
import { ASSISTANT_PROMPT, SAMPLE_ANSWER, parseAssistantImport, type ImportProblem } from "@/lib/assistantImport";
import { guessMapping } from "@/lib/blackboard";
import { DELIVERABLE_TYPES } from "@/lib/extraction";
import { useStore } from "@/lib/store";
import type { Course, CourseSession, DeliverableType } from "@/lib/types";
import { TYPE_LABELS } from "./shared";

interface DraftRow {
  key: string;
  include: boolean;
  title: string;
  type: DeliverableType;
  when: WhenValue;
  weight: string;
  sessionAsked?: number; // the answer said "Session N"
}

interface DraftCourse {
  key: string;
  name: string;
  gradeScale: number;
  calendarKey: string; // Blackboard course, "" = none
  rows: DraftRow[];
  sessions: CourseSession[];
}

export function AssistantImport({
  target,
  today,
  onDone,
  onCancel,
  onTypeInstead,
}: {
  /** Import into this course (from its folder); otherwise courses are created from the answer. */
  target?: Course;
  today: string;
  onDone: (message: string) => void;
  onCancel: () => void;
  /** "Or just type your deadlines": close this and open the normal form. */
  onTypeInstead: () => void;
}) {
  const calendar = useStore((s) => s.calendar);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [problems, setProblems] = useState<ImportProblem[]>([]);
  const [warnings, setWarnings] = useState<ImportProblem[]>([]);
  const [drafts, setDrafts] = useState<DraftCourse[] | null>(null);
  const [error, setError] = useState("");

  const sessionsFor = (calendarKey: string) =>
    pickableSessions(calendar?.courses.find((c) => c.key === calendarKey)?.sessions, today);

  function read() {
    const result = parseAssistantImport(answer);
    setError("");
    if (!result.ok) {
      setProblems(result.problems);
      setDrafts(null);
      return;
    }
    setProblems([]);
    setWarnings(result.warnings);
    const courses = target ? result.courses.slice(0, 1) : result.courses;
    setDrafts(
      courses.map((c, ci) => {
        // Which Blackboard course is this? The folder's own match, else a guess by name.
        const calendarKey = target
          ? (Object.entries(calendar?.mapping ?? {}).find(([, id]) => id === target.id)?.[0] ?? "")
          : (Object.entries(guessMapping(calendar?.courses ?? [], [{ id: "new", name: c.name }])).find(
              ([, id]) => id === "new",
            )?.[0] ?? "");
        const sessions = sessionsFor(calendarKey);
        return {
          key: `c${ci}`,
          name: target?.name ?? c.name,
          gradeScale: target?.gradeScale ?? c.gradeScale,
          calendarKey,
          sessions: c.sessions,
          rows: c.deliverables.map((d, di) => {
            const when: WhenValue =
              d.when && "session" in d.when
                ? sessions.some((s) => s.number === (d.when as { session: number }).session)
                  ? { session: d.when.session }
                  : { date: "" }
                : { date: d.when && "date" in d.when ? d.when.date : "" };
            const due = dateOf(when, sessions);
            return {
              key: `c${ci}d${di}`,
              // Deadlines already past aren't planned; you can still tick them.
              include: !due || due >= today,
              title: d.title,
              type: d.type,
              when,
              weight: d.weight === null ? "" : String(d.weight),
              sessionAsked: d.when && "session" in d.when ? d.when.session : undefined,
            };
          }),
        };
      }),
    );
  }

  const updateCourse = (key: string, patch: Partial<DraftCourse>) =>
    setDrafts((ds) => ds && ds.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  const updateRow = (courseKey: string, rowKey: string, patch: Partial<DraftRow>) =>
    setDrafts(
      (ds) =>
        ds &&
        ds.map((c) =>
          c.key === courseKey ? { ...c, rows: c.rows.map((r) => (r.key === rowKey ? { ...r, ...patch } : r)) } : c,
        ),
    );

  function save() {
    if (!drafts) return;
    for (const c of drafts) {
      if (!c.name.trim()) return setError("Every course needs a name.");
      const sessions = sessionsFor(c.calendarKey);
      for (const r of c.rows.filter((r) => r.include)) {
        const due = dateOf(r.when, sessions);
        if (!r.title.trim()) return setError(`${c.name}: a deadline has no title.`);
        if (!due) return setError(`${c.name} – ${r.title}: pick its date (or untick it).`);
        if (due < today) return setError(`${c.name} – ${r.title}: that date has passed — untick it or change it.`);
        const w = r.weight.trim() === "" ? 0 : Number(r.weight.replace(",", "."));
        if (!Number.isFinite(w) || w < 0 || w > 100) return setError(`${c.name} – ${r.title}: weight must be 0–100%.`);
      }
    }
    const store = useStore.getState();
    let added = 0;
    for (const c of drafts) {
      const course = target ?? store.addCourse(c.name);
      if (!target) store.updateCourse(course.id, { gradeScale: c.gradeScale });
      if (c.sessions.length) store.setCourseSessions(course.id, c.sessions);
      const sessions = sessionsFor(c.calendarKey);
      for (const r of c.rows.filter((r) => r.include)) {
        const w = r.weight.trim() === "" ? 0 : Number(r.weight.replace(",", "."));
        useStore.getState().addDeadline(
          {
            title: r.title,
            type: r.type,
            dueDate: dateOf(r.when, sessions),
            courseId: course.id,
            weight: w,
            ...("session" in r.when ? { sessionRef: r.when.session } : {}),
          },
          today,
        );
        added++;
      }
      // Link the Blackboard course: session topics get their class dates (exam prep knows when).
      if (c.calendarKey) useStore.getState().setCalendarMapping(c.calendarKey, course.id, today);
    }
    const n = drafts.length;
    onDone(
      target
        ? `Imported ${added} deadline${added === 1 ? "" : "s"} into ${target.name}.`
        : `Imported ${n} course${n === 1 ? "" : "s"} with ${added} deadline${added === 1 ? "" : "s"}.`,
    );
  }

  return (
    <section aria-labelledby="ai-import-title" data-testid="assistant-import" className={`${card} mt-2`}>
      <h2 id="ai-import-title" className="text-lg font-semibold tracking-tight">
        Import with ChatGPT or Claude
      </h2>
      {!drafts && (
        <>
          <div className="mt-2 flex items-center gap-3" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= step ? "bg-accent" : "bg-line"}`} />
            ))}
          </div>
          <p className="mt-1 text-xs font-medium text-muted" aria-live="polite">
            Step {step} of 3
          </p>

          {step === 1 && (
            <div className="mt-3 text-sm">
              <p className="font-medium">Copy our prompt</p>
              <p className="text-muted">It tells your AI assistant exactly how to answer, so we can read it.</p>
              <button
                type="button"
                data-testid="copy-prompt"
                className={`${buttonPrimary} mt-3 w-full py-3 text-base sm:w-auto sm:px-8`}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(ASSISTANT_PROMPT);
                    setCopied("Copied!");
                  } catch {
                    setCopied("Open “See the prompt” below and copy it (⌘C / Ctrl+C).");
                  }
                  setStep(2);
                }}
              >
                Copy prompt
              </button>
              <details className="mt-3">
                <summary className="cursor-pointer text-accent">See the prompt</summary>
                <label htmlFor="ai-prompt" className="sr-only">
                  Prompt for your AI assistant
                </label>
                <textarea
                  id="ai-prompt"
                  readOnly
                  value={ASSISTANT_PROMPT}
                  className={`${input} mt-1 h-36 font-mono text-xs`}
                  onFocus={(e) => e.target.select()}
                />
              </details>
            </div>
          )}

          {step === 2 && (
            <div className="mt-3 text-sm">
              <p role="status" className="text-success">
                {copied}
              </p>
              <p className="font-medium">Paste it into ChatGPT, Claude or any assistant you use</p>
              <p className="text-muted">
                Add your syllabus right after it (paste the text or attach the PDF) and send. Copy the whole answer.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={buttonPrimary} onClick={() => setStep(3)}>
                  I have the answer
                </button>
                <button type="button" className={buttonSecondary} onClick={() => setStep(1)}>
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="mt-3 text-sm">
              <label htmlFor="ai-answer" className="font-medium">
                Paste the assistant&apos;s answer
              </label>
              <p className="text-muted">It should look like this:</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 p-2 font-mono text-xs leading-relaxed">
                {
                  "COURSE: Public Economics\nDELIVERABLE: Midterm | midterm | Session 15 | 30%\nSESSION: 3 | Externalities | Pigouvian taxes | PS2"
                }
              </pre>
              <textarea
                id="ai-answer"
                data-testid="assistant-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className={`${input} mt-2 min-h-32 font-mono text-xs`}
                placeholder="Paste here"
                aria-invalid={problems.length > 0}
                aria-describedby={problems.length ? "ai-problems" : undefined}
              />
              {problems.length > 0 && (
                <div
                  id="ai-problems"
                  role="alert"
                  className="mt-2 rounded-lg border border-danger-line bg-danger-soft p-3"
                >
                  <p className="font-semibold text-danger">
                    Please fix {problems.length === 1 ? "this line" : "these lines"}:
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {problems.map((p, i) => (
                      <li key={i}>
                        Line {p.line}: {p.message}.
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="read-answer"
                  className={buttonPrimary}
                  disabled={!answer.trim()}
                  onClick={read}
                >
                  Read the answer
                </button>
                <button
                  type="button"
                  data-testid="paste-sample"
                  className={buttonSecondary}
                  onClick={() => setAnswer(SAMPLE_ANSWER)}
                >
                  Paste sample
                </button>
                <button type="button" className={buttonSecondary} onClick={() => setStep(2)}>
                  Back
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
            <button
              type="button"
              data-testid="type-instead"
              onClick={onTypeInstead}
              className="font-medium text-accent underline underline-offset-2 hover:no-underline"
            >
              Or just type your deadlines
            </button>
            <button type="button" onClick={onCancel} className="text-muted underline underline-offset-2 hover:text-ink">
              Cancel
            </button>
          </div>
        </>
      )}

      {drafts && (
        <div data-testid="assistant-review" className="mt-3 space-y-4">
          {warnings.length > 0 && (
            <p className="text-xs text-muted">
              Skipped: {warnings.map((w) => `line ${w.line} (${w.message})`).join("; ")}.
            </p>
          )}
          {drafts.map((c) => {
            const sessions = sessionsFor(c.calendarKey);
            return (
              <div key={c.key} className="rounded-xl border border-line p-3">
                {!target && (
                  <div className="grid gap-3 sm:grid-cols-[1fr_8rem_1fr]">
                    <div>
                      <label htmlFor={`${c.key}-name`} className={label}>
                        Course name
                      </label>
                      <input
                        id={`${c.key}-name`}
                        className={`${input} font-semibold`}
                        value={c.name}
                        onChange={(e) => updateCourse(c.key, { name: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`${c.key}-scale`} className={label}>
                        Grades out of
                      </label>
                      <select
                        id={`${c.key}-scale`}
                        className={input}
                        value={c.gradeScale}
                        onChange={(e) => updateCourse(c.key, { gradeScale: Number(e.target.value) })}
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    {calendar && (
                      <div>
                        <label htmlFor={`${c.key}-bb`} className={label}>
                          Blackboard course
                        </label>
                        <select
                          id={`${c.key}-bb`}
                          className={input}
                          value={c.calendarKey}
                          onChange={(e) => {
                            const next = pickableSessions(
                              calendar.courses.find((cc) => cc.key === e.target.value)?.sessions,
                              today,
                            );
                            updateCourse(c.key, {
                              calendarKey: e.target.value,
                              rows: c.rows.map((r) => {
                                const asked = r.sessionAsked;
                                return asked && next.some((s) => s.number === asked)
                                  ? { ...r, when: { session: asked } }
                                  : "session" in r.when
                                    ? { ...r, when: { date: "" } }
                                    : r;
                              }),
                            });
                          }}
                        >
                          <option value="">Not in Blackboard</option>
                          {calendar.courses
                            .filter((cc) => cc.sessions.length > 1)
                            .map((cc) => (
                              <option key={cc.key} value={cc.key}>
                                {cc.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}
                {c.rows.length === 0 ? (
                  <p className="mt-2 text-sm text-muted">No deadlines in the answer.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {c.rows.map((r) => {
                      const asked = r.sessionAsked;
                      const fromBb =
                        "session" in r.when
                          ? sessions.find((s) => s.number === (r.when as { session: number }).session)
                          : undefined;
                      return (
                        <li
                          key={r.key}
                          className={`grid grid-cols-[auto_1fr] gap-x-2 gap-y-2 rounded-lg border p-2 sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.1fr)_minmax(0,1.6fr)_5rem] sm:items-end ${
                            r.include ? "border-line" : "border-dashed border-line bg-surface-2"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={r.include}
                            onChange={(e) => updateRow(c.key, r.key, { include: e.target.checked })}
                            aria-label={`Import ${r.title}`}
                            className="mt-2 h-5 w-5 cursor-pointer self-start accent-[var(--accent)] sm:mt-0 sm:self-center"
                          />
                          <div>
                            <label htmlFor={`${r.key}-t`} className={label}>
                              Title
                            </label>
                            <input
                              id={`${r.key}-t`}
                              className={input}
                              value={r.title}
                              onChange={(e) => updateRow(c.key, r.key, { title: e.target.value })}
                            />
                          </div>
                          <div className="col-start-2 sm:col-start-auto">
                            <label htmlFor={`${r.key}-ty`} className={label}>
                              Type
                            </label>
                            <select
                              id={`${r.key}-ty`}
                              className={input}
                              value={r.type}
                              onChange={(e) => updateRow(c.key, r.key, { type: e.target.value as DeliverableType })}
                            >
                              {DELIVERABLE_TYPES.map((t) => (
                                <option key={t} value={t}>
                                  {TYPE_LABELS[t]}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="col-start-2 sm:col-start-auto">
                            <WhenField
                              id={`${r.key}-w`}
                              value={r.when}
                              onChange={(when) => updateRow(c.key, r.key, { when })}
                              sessions={sessions}
                              today={today}
                            />
                            {fromBb ? (
                              <p className="mt-1 text-xs text-success">Date from Blackboard: {sessionLabel(fromBb)}</p>
                            ) : asked && !dateOf(r.when, sessions) ? (
                              <p className="mt-1 text-xs text-warn-ink">
                                The syllabus says session {asked}
                                {calendar ? " — pick the Blackboard course above, or the date." : " — pick its date."}
                              </p>
                            ) : null}
                          </div>
                          <div className="col-start-2 sm:col-start-auto">
                            <label htmlFor={`${r.key}-wt`} className={label}>
                              Weight %
                            </label>
                            <input
                              id={`${r.key}-wt`}
                              inputMode="decimal"
                              className={input}
                              value={r.weight}
                              onChange={(e) => updateRow(c.key, r.key, { weight: e.target.value })}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {c.sessions.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-accent">
                      {c.sessions.length} session topic{c.sessions.length === 1 ? "" : "s"} — saved for exam prep
                    </summary>
                    <ol className="mt-2 space-y-0.5 pl-1">
                      {c.sessions.map((s) => (
                        <li key={s.number}>
                          <span className="tabular-nums text-muted">
                            {s.number}
                            {s.upTo ? `–${s.upTo}` : ""}.
                          </span>{" "}
                          <span className="font-medium">{s.topic}</span>
                          {s.concepts.length > 0 && <span className="text-muted"> — {s.concepts.join(", ")}</span>}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            );
          })}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="assistant-save" className={buttonPrimary} onClick={save}>
              Save {target ? "deadlines" : drafts.length === 1 ? "course" : "courses"}
            </button>
            <button type="button" className={buttonSecondary} onClick={() => setDrafts(null)}>
              Back to the answer
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
