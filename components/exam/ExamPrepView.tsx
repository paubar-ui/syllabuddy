"use client";
// /exam/[deliverableId] — the exam prep page (V2-6): exam card, focus & confidence per topic,
// a day-by-day plan that says WHAT to study, a mock exam log, and PDF / calendar export.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Callout, CourseDot, EmptyState, HowItWorks, PageHeader } from "@/components/kit";
import { buttonPrimary, buttonSecondary, card, input, label, page } from "@/components/ui";
import { daysBetween, describeDaysAway, todayISO } from "@/lib/dates";
import { buildExamPlan, examScope, isExam, minutesByDateFor, type ExamPlanDay } from "@/lib/examPlan";
import { buildExamPlanIcs } from "@/lib/ics";
import { parseSessions } from "@/lib/parseSessions";
import { useStore } from "@/lib/store";
import type { Course, Deliverable, ExamDetails, MistakeReason } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";

const pretty = (iso: string, pattern = "EEE d MMM") => format(parseISO(iso), pattern);
const hours = (minutes: number) => (minutes === 0 ? "—" : `~${Math.round((minutes / 60) * 2) / 2}h`);

const KIND_STYLE: Record<ExamPlanDay["kind"], string> = {
  setup: "border-info-line bg-info-soft text-info-ink",
  core: "border-accent-line bg-accent-soft text-accent",
  mock: "border-warn-line bg-warn-bg text-warn-ink",
  repair: "border-warn-line bg-warn-bg text-warn-ink",
  review: "border-success-line bg-success-soft text-success",
  exam: "border-danger-line bg-danger-soft text-danger",
};
const KIND_LABEL: Record<ExamPlanDay["kind"], string> = {
  setup: "Setup",
  core: "Core",
  mock: "Mock",
  repair: "Repair",
  review: "Review",
  exam: "Exam",
};
const REASONS: Record<MistakeReason, string> = {
  concept: "Concept gap",
  algebra: "Algebra / calculation slip",
  time: "Time pressure",
};

export function ExamPrepView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className={page} aria-busy="true">
        <h1 className="text-2xl font-semibold">Exam prep</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <ExamPrepContent />;
}

function ExamPrepContent() {
  const { deliverableId } = useParams<{ deliverableId: string }>();
  const exam = useStore((s) => s.deliverables.find((d) => d.id === deliverableId));
  const course = useStore((s) => s.courses.find((c) => c.id === exam?.courseId));
  const blocks = useStore((s) => s.blocks);
  const [today] = useState(todayISO);

  const plan = useMemo(
    () =>
      exam && course
        ? buildExamPlan({
            exam,
            course,
            today,
            minutesByDate: minutesByDateFor(blocks, exam.id),
          })
        : null,
    [exam, course, blocks, today],
  );

  if (!exam || !course || !plan) {
    return (
      <main id="main" className={page}>
        <PageHeader back={{ href: "/courses", label: "Courses" }} title="Exam not found" />
        <EmptyState title="We couldn't find this exam">
          It may have been deleted. Open it again from Courses.
        </EmptyState>
      </main>
    );
  }
  if (!isExam(exam)) {
    return (
      <main id="main" className={page}>
        <PageHeader back={{ href: "/courses", label: "Courses" }} title={exam.title} />
        <EmptyState title="Exam prep plans are for exams">
          This deliverable is a {exam.type}. Prep plans are made for midterms, finals and exams.
        </EmptyState>
      </main>
    );
  }

  const daysLeft = daysBetween(today, exam.dueDate);

  function exportIcs() {
    const text = buildExamPlanIcs({
      examTitle: exam!.title,
      courseName: course!.name,
      days: plan!.days,
      now: new Date(),
    });
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exam!.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-prep.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <main id="main" data-testid="exam-prep" className={page}>
      <PageHeader
        back={{ href: "/courses", label: "Courses" }}
        eyebrow={
          <span className="inline-flex items-center gap-1.5">
            <CourseDot color={course.color} />
            {course.name} · exam {daysLeft < 0 ? "is over" : describeDaysAway(daysLeft)}
          </span>
        }
        title={`${exam.title} — prep plan`}
        description="What to study in each session until the exam, built from your syllabus. Adjust the exam details and your confidence below and the plan updates straight away."
        action={
          <div data-print-hide className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.print()} className={buttonSecondary}>
              Save as PDF
            </button>
            <button type="button" onClick={exportIcs} className={buttonPrimary}>
              Add to calendar
            </button>
          </div>
        }
      />

      <ExamCard exam={exam} course={course} />

      {(course.sessions ?? []).length === 0 && <AddSchedule course={course} today={today} />}

      {plan.scope.length > 0 && <FocusAndConfidence exam={exam} course={course} />}

      {/* ---------------- The plan ---------------- */}
      <section aria-labelledby="plan-title" className="mt-8">
        <h2 id="plan-title" className="text-lg font-semibold tracking-tight">
          Day by day
        </h2>
        <p className="text-sm text-muted">
          Each day lists what to cover. The same tasks appear in that day&apos;s study blocks on Today — click a block
          to tick them off.
        </p>
        {daysLeft >= 3 && (
          <Callout
            tone="info"
            className="mt-3"
            title={`Email your professor any questions by ${pretty(plan.emailBy, "EEEE d MMMM")}`}
          >
            Unsure about the format, what&apos;s covered or what you can bring? Asking early gives them time to answer.
          </Callout>
        )}
        <ol className="mt-4 space-y-3">
          {plan.days.map((day) => (
            <li
              key={day.date}
              className={`${card} ${day.date === today ? "ring-2 ring-accent" : ""} break-inside-avoid`}
              aria-current={day.date === today ? "date" : undefined}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-sm tabular-nums text-muted">
                    Day {day.dayNumber} · {pretty(day.date)}
                    {day.date === today && " · today"}
                  </span>
                  <span className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${KIND_STYLE[day.kind]}`}>
                    {KIND_LABEL[day.kind]}
                  </span>
                </p>
                <span className="text-sm tabular-nums text-muted">{day.kind === "exam" ? "" : hours(day.minutes)}</span>
              </div>
              <h3 className="mt-1 font-semibold">{day.title}</h3>
              <p className="text-sm text-muted">{day.goal}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {day.tasks.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        {plan.assumptions.length > 0 && (
          <Callout tone="warn" className="mt-4" title="Assumptions — check these">
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {plan.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Callout>
        )}
      </section>

      <MockLog exam={exam} course={course} />

      <div data-print-hide className="mt-6">
        <HowItWorks title="How this plan is made">
          <p>
            <span className="font-medium">Setup</span> first: gather past exams and notes and rate your confidence.{" "}
            <span className="font-medium">Core days</span> take one or two topics each, in syllabus order, with their
            key concepts, readings and problem sets; spare days revisit your least-confident topics.
          </p>
          <p>
            About 3 days before: a <span className="font-medium">mock exam</span> under real conditions, then a{" "}
            <span className="font-medium">repair day</span> on the two topics where you lost the most points. The day
            before is light review and an early night.
          </p>
          <p>
            Hours per day come from your plan, fitted around your other courses and the free time you set in Settings.
          </p>
        </HowItWorks>
      </div>
    </main>
  );
}

function ExamCard({ exam, course }: { exam: Deliverable; course: Course }) {
  const updateExam = useStore((s) => s.updateExam);
  const [editing, setEditing] = useState(false);
  const details = exam.exam ?? {};
  const scope = examScope(exam, course).sessions;
  const [form, setForm] = useState({
    time: details.time ?? "",
    format: details.format ?? "",
    duration: details.durationMinutes ? String(details.durationMinutes) : "",
    materials: details.materials ?? "",
    covers: details.coversSessions?.length ? `${details.coversSessions[0]}-${details.coversSessions.at(-1)}` : "",
  });

  function save() {
    const patch: Partial<ExamDetails> = {
      time: form.time.trim() || undefined,
      format: form.format.trim() || undefined,
      durationMinutes: Number(form.duration) > 0 ? Math.round(Number(form.duration)) : undefined,
      materials: form.materials.trim() || undefined,
    };
    const range = /^\s*(\d{1,2})\s*[-–]\s*(\d{1,2})\s*$/.exec(form.covers);
    if (range) {
      const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
      patch.coversSessions = Array.from({ length: b - a + 1 }, (_, i) => a + i);
    } else if (!form.covers.trim()) {
      patch.coversSessions = undefined;
    }
    updateExam(exam.id, patch);
    setEditing(false);
  }

  const rows: [string, string][] = [
    ["Date", `${pretty(exam.dueDate, "EEEE d MMMM yyyy")}${details.time ? ` at ${details.time}` : ""}`],
    ["Format", details.format ?? "Not confirmed"],
    ["Length", details.durationMinutes ? `${details.durationMinutes} minutes` : "Not confirmed"],
    ["Allowed materials", details.materials ?? "Not confirmed"],
    ["Weight", `${exam.weight}% of your grade`],
    [
      "Covers",
      scope.length
        ? `Sessions ${scope[0].number}–${scope.at(-1)!.number}: ${scope.map((s) => s.topic).join(", ")}`
        : "Not known yet",
    ],
  ];

  return (
    <section aria-labelledby="card-title" className={card}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="card-title" className="text-lg font-semibold tracking-tight">
          Exam card
        </h2>
        {!editing && (
          <button type="button" data-print-hide onClick={() => setEditing(true)} className={buttonSecondary}>
            Edit details
          </button>
        )}
      </div>
      {!editing ? (
        <table className="mt-3 w-full text-left text-sm">
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-t border-line align-top">
                <th scope="row" className="w-40 py-2 pr-3 font-medium text-muted">
                  {k}
                </th>
                <td className={`py-2 ${v === "Not confirmed" ? "text-warn-ink" : ""}`}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Field
            id="exam-time"
            label="Start time"
            value={form.time}
            placeholder="e.g. 09:00"
            onChange={(time) => setForm({ ...form, time })}
          />
          <Field
            id="exam-format"
            label="Format"
            value={form.format}
            placeholder="e.g. problems + short answers"
            onChange={(f) => setForm({ ...form, format: f })}
          />
          <Field
            id="exam-duration"
            label="Length (minutes)"
            value={form.duration}
            placeholder="e.g. 90"
            inputMode="numeric"
            onChange={(duration) => setForm({ ...form, duration })}
          />
          <Field
            id="exam-materials"
            label="Allowed materials"
            value={form.materials}
            placeholder="e.g. closed book, calculator"
            onChange={(materials) => setForm({ ...form, materials })}
          />
          <Field
            id="exam-covers"
            label="Covers sessions (e.g. 1-6)"
            value={form.covers}
            placeholder="e.g. 4-7"
            onChange={(covers) => setForm({ ...form, covers })}
          />
          <div className="flex items-end gap-2">
            <button type="submit" className={buttonPrimary}>
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className={buttonSecondary}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Field({
  id,
  label: text,
  value,
  placeholder,
  inputMode,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  inputMode?: "numeric";
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>
        {text}
      </label>
      <input
        id={id}
        className={input}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function FocusAndConfidence({ exam, course }: { exam: Deliverable; course: Course }) {
  const updateExam = useStore((s) => s.updateExam);
  const scope = examScope(exam, course).sessions;
  const focus = exam.exam?.focus ?? {};
  const confidence = exam.exam?.confidence ?? {};

  return (
    <section aria-labelledby="focus-title" data-print-hide className={`${card} mt-6`}>
      <h2 id="focus-title" className="text-lg font-semibold tracking-tight">
        Focus and confidence
      </h2>
      <p className="text-sm text-muted">
        Did your professor say what matters most? Mark those sessions <span className="font-medium">core</span> and the
        rest <span className="font-medium">light</span> (light ones get a quick review the day before). Then rate how
        confident you feel — low ratings get extra time and a second pass.
      </p>
      <ul className="mt-3 divide-y divide-line">
        {scope.map((s) => {
          const isLight = focus[s.number] === "light";
          const level = confidence[s.number] ?? 3;
          return (
            <li key={s.number} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto_12rem] sm:items-center">
              <p className="text-sm">
                <span className="tabular-nums text-muted">Session {s.number} · </span>
                <span className="font-medium">{s.topic}</span>
              </p>
              <fieldset className="flex gap-1">
                <legend className="sr-only">Focus for {s.topic}</legend>
                {(["core", "light"] as const).map((f) => {
                  const active = (f === "light") === isLight;
                  return (
                    <label
                      key={f}
                      className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs font-semibold ${
                        active ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`focus-${s.number}`}
                        value={f}
                        checked={active}
                        onChange={() =>
                          updateExam(exam.id, {
                            focus: { ...focus, [s.number]: f },
                          })
                        }
                        className="sr-only"
                      />
                      {f === "core" ? "Core" : "Light"}
                    </label>
                  );
                })}
              </fieldset>
              <div>
                <label htmlFor={`conf-${s.number}`} className="text-xs text-muted">
                  Confidence: <span className="font-semibold text-ink">{level} of 5</span>
                </label>
                <input
                  id={`conf-${s.number}`}
                  type="range"
                  min={1}
                  max={5}
                  value={level}
                  aria-valuetext={`${level} of 5`}
                  onChange={(e) =>
                    updateExam(exam.id, {
                      confidence: {
                        ...confidence,
                        [s.number]: Number(e.target.value) as 1 | 2 | 3 | 4 | 5,
                      },
                    })
                  }
                  className="w-full accent-[var(--accent)]"
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MockLog({ exam, course }: { exam: Deliverable; course: Course }) {
  const updateExam = useStore((s) => s.updateExam);
  const scope = examScope(exam, course).sessions;
  const log = exam.exam?.mockLog ?? [];
  const [session, setSession] = useState(String(scope[0]?.number ?? ""));
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState<MistakeReason>("concept");
  const name = (n: number) => scope.find((s) => s.number === n)?.topic ?? `Session ${n}`;

  if (scope.length === 0) return null;
  return (
    <section aria-labelledby="mock-title" data-print-hide className={`${card} mt-6`}>
      <h2 id="mock-title" className="text-lg font-semibold tracking-tight">
        Mock exam log
      </h2>
      <p className="text-sm text-muted">
        After your mock exam, log each lost point: which topic and why. The repair day above then targets your two
        weakest topics automatically.
      </p>
      <form
        className="mt-3 grid gap-3 sm:grid-cols-[1fr_7rem_1fr_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const p = Number(points.replace(",", "."));
          if (!session || !(p > 0)) return;
          updateExam(exam.id, {
            mockLog: [...log, { session: Number(session), points: p, reason }],
          });
          setPoints("");
        }}
      >
        <div>
          <label htmlFor="mock-topic" className={label}>
            Topic
          </label>
          <select id="mock-topic" className={input} value={session} onChange={(e) => setSession(e.target.value)}>
            {scope.map((s) => (
              <option key={s.number} value={s.number}>
                {s.number}. {s.topic}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="mock-points" className={label}>
            Points lost
          </label>
          <input
            id="mock-points"
            inputMode="decimal"
            className={input}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="mock-reason" className={label}>
            Why
          </label>
          <select
            id="mock-reason"
            className={input}
            value={reason}
            onChange={(e) => setReason(e.target.value as MistakeReason)}
          >
            {(Object.keys(REASONS) as MistakeReason[]).map((r) => (
              <option key={r} value={r}>
                {REASONS[r]}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={buttonPrimary}>
          Log it
        </button>
      </form>
      {log.length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {log.map((m, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="font-medium">{m.points} pts</span> · {name(m.session)} · {REASONS[m.reason]}
              </span>
              <button
                type="button"
                aria-label={`Remove ${m.points} points on ${name(m.session)}`}
                onClick={() =>
                  updateExam(exam.id, {
                    mockLog: log.filter((_, j) => j !== i),
                  })
                }
                className="rounded-md px-2 text-muted hover:bg-surface-2 hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddSchedule({ course, today }: { course: Course; today: string }) {
  const setCourseSessions = useStore((s) => s.setCourseSessions);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  return (
    <section aria-labelledby="schedule-title" data-print-hide className="mt-6">
      <Callout tone="info" title="Add the session schedule for a topic-by-topic plan">
        <p>
          Paste the course schedule from the syllabus (e.g. “Session 3: Externalities — market failure, Pigouvian taxes.
          PS2”). We&apos;ll read the topics, key concepts, readings and problem sets.
        </p>
        <label htmlFor="schedule-text" className="sr-only">
          Session schedule
        </label>
        <textarea
          id="schedule-text"
          className={`${input} mt-2 min-h-28 font-mono text-sm`}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonPrimary}
            onClick={() => {
              const { sessions } = parseSessions(text, { today });
              if (sessions.length === 0) {
                setStatus("No sessions found — make sure each line starts with “Session 1”, “Week 1”, “Lecture 1”…");
                return;
              }
              setCourseSessions(course.id, sessions);
              setStatus(null);
            }}
          >
            Read schedule
          </button>
          <span role="status" className="text-sm">
            {status}
          </span>
          <Link href="/courses" className="text-sm font-medium underline underline-offset-2">
            Back to courses
          </Link>
        </div>
      </Callout>
    </section>
  );
}
