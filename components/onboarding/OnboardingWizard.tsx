"use client";
// Onboarding: 1) paste/upload a syllabus → 2) review what we found → 3) effort & target grades
// → 4) weekly free time → generate the plan. Nothing is saved until the very last button.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { todayISO } from "@/lib/dates";
import {
  draftFromExtraction,
  draftsToStore,
  emptyCourse,
  emptyItem,
  validateDrafts,
  weightTotal,
  weightsLookOff,
  type DraftCourse,
  type DraftItem,
  type DraftProblem,
} from "@/lib/draft";
import {
  DELIVERABLE_TYPES,
  MAX_TEXT_CHARS,
  normalizeExtraction,
  type ExtractedSyllabus,
} from "@/lib/extraction";
import { parseSyllabus } from "@/lib/parseSyllabus";
import { extractPdfText } from "@/lib/pdf";
import { useStore } from "@/lib/store";
import type { Effort } from "@/lib/types";
import { useHydrated } from "@/lib/useHydrated";
import { availabilityFromForm, formFromAvailability } from "@/lib/availability";
import { AvailabilityFields } from "../AvailabilityFields";
import { buttonLink, buttonPrimary, buttonSecondary, card, input, label } from "../ui";

type Step = 1 | 2 | 3 | 4;
const STEPS = ["Add syllabus", "Review", "Effort & goals", "Free time"];
const TYPE_LABELS: Record<(typeof DELIVERABLE_TYPES)[number], string> = {
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

export function OnboardingWizard() {
  const [step, setStep] = useState<Step>(1);
  const [drafts, setDrafts] = useState<DraftCourse[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Move keyboard/screen-reader focus to the new step's heading.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0 });
  }, [step]);

  const updateCourse = (id: string, patch: Partial<DraftCourse>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  return (
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:py-10">
      <p className="text-sm font-semibold uppercase tracking-wider text-accent">Set up your semester</p>
      <ol className="mt-3 grid grid-cols-4 gap-2" aria-label="Progress">
        {STEPS.map((name, i) => {
          const n = i + 1;
          return (
            <li key={name} aria-current={n === step ? "step" : undefined} className="text-xs sm:text-sm">
              <span
                className={`block h-1.5 rounded-full ${n <= step ? "bg-accent" : "bg-line"}`}
                aria-hidden="true"
              />
              <span className={`mt-1 block ${n === step ? "font-semibold text-ink" : "text-muted"}`}>
                <span className="sr-only">Step {n}: </span>
                {name}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="mt-6">
        {step === 1 && (
          <StepSyllabus
            headingRef={headingRef}
            courseCount={drafts.length}
            onDone={(draft, message) => {
              setDrafts((ds) => [...ds, draft]);
              setNotice(message);
              setStep(2);
            }}
            onManual={() => {
              setDrafts((ds) => [...ds, emptyCourse(ds.length)]);
              setNotice("Add your course and its deliverables below.");
              setStep(2);
            }}
            onBackToReview={drafts.length ? () => setStep(2) : undefined}
          />
        )}
        {step === 2 && (
          <StepReview
            headingRef={headingRef}
            drafts={drafts}
            setDrafts={setDrafts}
            notice={notice}
            onAddSyllabus={() => {
              setNotice(null);
              setStep(1);
            }}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepEffort
            headingRef={headingRef}
            drafts={drafts}
            updateCourse={updateCourse}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && <StepAvailability headingRef={headingRef} drafts={drafts} onBack={() => setStep(3)} />}
      </div>
    </main>
  );
}

type HeadingRef = React.RefObject<HTMLHeadingElement | null>;

function StepHeading({ headingRef, children }: { headingRef: HeadingRef; children: ReactNode }) {
  return (
    <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-bold sm:text-3xl">
      {children}
    </h1>
  );
}

/** Asks the server whether an AI key is configured (no key → offline reader only). */
async function aiAvailable(): Promise<boolean> {
  try {
    const res = await fetch("/api/extract", { cache: "no-store" });
    return res.ok && (await res.json()).available === true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step 1 — paste text or upload a PDF
// ---------------------------------------------------------------------------

function StepSyllabus({
  headingRef,
  courseCount,
  onDone,
  onManual,
  onBackToReview,
}: {
  headingRef: HeadingRef;
  courseCount: number;
  onDone: (draft: DraftCourse, message: string) => void;
  onManual: () => void;
  onBackToReview?: () => void;
}) {
  const hydrated = useHydrated();
  const hasPlan = useStore((s) => s.courses.length > 0);
  const [text, setText] = useState("");
  const [courseName, setCourseName] = useState("");
  const [semesterStart, setSemesterStart] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setStatus(`Reading ${file.name}…`);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      const content = isPdf ? await extractPdfText(file) : await file.text();
      if (!content.trim()) {
        setStatus(
          `We couldn't find any text in ${file.name}. If it's a scanned document, copy the text and paste it below instead.`,
        );
      } else {
        setText(content);
        setStatus(`Loaded the text of ${file.name}. Check it below, then press “Find deliverables”.`);
      }
    } catch {
      setStatus(`Sorry, ${file.name} couldn't be read. You can paste the text below instead.`);
    } finally {
      setBusy(false);
    }
  }

  async function extract() {
    if (!text.trim()) {
      setStatus("Paste your syllabus text (or upload a file) first.");
      return;
    }
    setBusy(true);
    setStatus("Looking for deliverables…");
    const today = todayISO();
    const start = semesterStart || undefined;
    const hint = courseName.trim() || undefined;

    let aiResult: ExtractedSyllabus | null = null;
    if (text.length <= MAX_TEXT_CHARS && (await aiAvailable())) {
      try {
        const res = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, courseNameHint: hint, today, semesterStart: start }),
        });
        if (res.ok) aiResult = normalizeExtraction((await res.json()).result);
      } catch {
        // Offline or server error: the offline reader below takes over.
      }
    }

    const offline = parseSyllabus(text, { today, semesterStart: start, courseNameHint: hint });
    const useAi = aiResult !== null && aiResult.deliverables.length >= offline.deliverables.length;
    const result = useAi && aiResult ? aiResult : offline;
    const found = result.deliverables.length;
    const missingDates = result.deliverables.filter((d) => !d.dueDate).length;

    let message =
      found === 0
        ? "We couldn't spot any deliverables automatically — no problem, add them by hand below."
        : `${useAi ? "Claude read" : "We read"} your syllabus and found ${found} deliverable${found === 1 ? "" : "s"}. Please check the dates and weights.`;
    if (missingDates > 0) {
      message += ` ${missingDates} ${missingDates === 1 ? "has" : "have"} no date yet (highlighted in red).`;
    }
    if (!useAi && offline.unresolvedWeeks) {
      message += " Some deadlines are given as week numbers — add the semester start date to turn them into dates.";
    }
    setBusy(false);
    onDone(draftFromExtraction(result, courseCount), message);
  }

  return (
    <section aria-labelledby="step1-title">
      <StepHeading headingRef={headingRef}>
        <span id="step1-title">{courseCount ? "Add another syllabus" : "Add your first syllabus"}</span>
      </StepHeading>
      <p className="mt-2 text-muted">
        Paste the text of a syllabus or upload it as a PDF. We&apos;ll find the deadlines and grade weights, and
        you&apos;ll check everything before saving. One course at a time.
      </p>
      {hydrated && hasPlan && courseCount === 0 && (
        <p className="mt-3 rounded-xl bg-warn-bg px-4 py-3 text-sm text-warn-ink">
          You already have a plan. Finishing this setup will replace it.
        </p>
      )}

      <div className={`${card} mt-6 space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="course-name" className={label}>
              Course name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="course-name"
              className={input}
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              placeholder="e.g. Corporate Finance"
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="semester-start" className={label}>
              Semester start <span className="font-normal text-muted">(for “Week 7” dates)</span>
            </label>
            <input
              id="semester-start"
              type="date"
              className={input}
              value={semesterStart}
              onChange={(e) => setSemesterStart(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="syllabus-file" className={label}>
            Upload a syllabus <span className="font-normal text-muted">(PDF or .txt — read on your device)</span>
          </label>
          <input
            id="syllabus-file"
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            onChange={(e) => onFile(e.target.files?.[0])}
            disabled={busy}
            className="block w-full text-sm text-muted file:mr-3 file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:font-semibold file:text-ink"
          />
        </div>

        <div>
          <label htmlFor="syllabus-text" className={label}>
            Syllabus text
          </label>
          <textarea
            id="syllabus-text"
            data-testid="syllabus-input"
            className={`${input} min-h-56 font-mono text-sm`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste here, for example:\nMidterm exam – 30% – 12/11/2026\nGroup project (25%) due Dec 3\nFinal exam 45% – 20 de enero"}
          />
        </div>

        <p aria-live="polite" className="min-h-6 text-sm text-muted">
          {status}
        </p>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button type="button" data-testid="extract-button" onClick={extract} disabled={busy} className={buttonPrimary}>
            {busy ? "Working…" : "Find deliverables"}
          </button>
          <button type="button" onClick={onManual} disabled={busy} className={buttonSecondary}>
            Enter a course by hand
          </button>
          {onBackToReview && (
            <button type="button" onClick={onBackToReview} className={`${buttonLink} sm:ml-auto`}>
              Back to review
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — review & edit what we found
// ---------------------------------------------------------------------------

function StepReview({
  headingRef,
  drafts,
  setDrafts,
  notice,
  onAddSyllabus,
  onNext,
}: {
  headingRef: HeadingRef;
  drafts: DraftCourse[];
  setDrafts: React.Dispatch<React.SetStateAction<DraftCourse[]>>;
  notice: string | null;
  onAddSyllabus: () => void;
  onNext: () => void;
}) {
  const [problems, setProblems] = useState<DraftProblem[]>([]);
  const summaryRef = useRef<HTMLDivElement>(null);

  const updateCourse = (id: string, patch: Partial<DraftCourse>) =>
    setDrafts((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const updateItem = (courseId: string, itemId: string, patch: Partial<DraftItem>) =>
    setDrafts((ds) =>
      ds.map((d) =>
        d.id === courseId ? { ...d, items: d.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)) } : d,
      ),
    );

  function save() {
    const found = validateDrafts(drafts);
    setProblems(found);
    if (found.length) requestAnimationFrame(() => summaryRef.current?.focus());
    else onNext();
  }

  const itemHasProblem = (itemId: string) => problems.some((p) => p.itemId === itemId);

  return (
    <section>
      <StepHeading headingRef={headingRef}>Check your deliverables</StepHeading>
      {notice && (
        <p role="status" className="mt-3 rounded-xl bg-accent-soft px-4 py-3 text-sm">
          {notice}
        </p>
      )}

      {problems.length > 0 && (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          className="mt-4 rounded-xl border border-danger bg-danger-soft px-4 py-3 text-sm"
        >
          <p className="font-semibold text-danger">Please fix {problems.length === 1 ? "this" : "these"} first:</p>
          <ul className="mt-1 list-disc pl-5">
            {problems.map((p, i) => (
              <li key={i}>{p.message}</li>
            ))}
          </ul>
        </div>
      )}

      <div data-testid="review-table" className="mt-6 space-y-6">
        {drafts.length === 0 && <p className="text-muted">No courses yet — add a syllabus first.</p>}
        {drafts.map((course, ci) => {
          const total = weightTotal(course);
          const off = weightsLookOff(course);
          return (
            <fieldset key={course.id} className={card}>
              <legend className="sr-only">Course {ci + 1}</legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label htmlFor={`name-${course.id}`} className={label}>
                    Course name
                  </label>
                  <input
                    id={`name-${course.id}`}
                    className={`${input} font-semibold`}
                    value={course.name}
                    onChange={(e) => updateCourse(course.id, { name: e.target.value })}
                    aria-invalid={!course.name.trim() && problems.length > 0}
                  />
                </div>
                <div className="sm:w-36">
                  <label htmlFor={`scale-${course.id}`} className={label}>
                    Grades out of
                  </label>
                  <select
                    id={`scale-${course.id}`}
                    className={input}
                    value={course.gradeScale}
                    onChange={(e) => updateCourse(course.id, { gradeScale: Number(e.target.value) })}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={100}>100</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setDrafts((ds) => ds.filter((d) => d.id !== course.id))}
                  className={`${buttonLink} self-start text-sm sm:self-end sm:pb-2.5`}
                >
                  Remove course
                </button>
              </div>
              {course.attendancePolicy && (
                <p className="mt-3 text-sm text-muted">
                  <span className="font-medium text-ink">Attendance: </span>
                  {course.attendancePolicy}
                </p>
              )}

              <ul className="mt-4 space-y-3">
                {course.items.map((item, ii) => {
                  const missingDate = !item.dueDate;
                  const rowLabel = item.title.trim() || `Deliverable ${ii + 1}`;
                  return (
                    <li
                      key={item.id}
                      className={`grid grid-cols-2 gap-2 rounded-xl border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_5rem_auto] sm:items-end ${
                        missingDate || itemHasProblem(item.id) ? "border-danger bg-danger-soft" : "border-line"
                      }`}
                    >
                      <div className="col-span-2 sm:col-span-1">
                        <label htmlFor={`title-${item.id}`} className={label}>
                          Title
                        </label>
                        <input
                          id={`title-${item.id}`}
                          className={input}
                          value={item.title}
                          onChange={(e) => updateItem(course.id, item.id, { title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`type-${item.id}`} className={label}>
                          Type
                        </label>
                        <select
                          id={`type-${item.id}`}
                          className={input}
                          value={item.type}
                          onChange={(e) =>
                            updateItem(course.id, item.id, { type: e.target.value as DraftItem["type"] })
                          }
                        >
                          {DELIVERABLE_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`date-${item.id}`} className={label}>
                          Due date
                          {missingDate && <span className="ml-1 font-semibold text-danger">· missing</span>}
                        </label>
                        <input
                          id={`date-${item.id}`}
                          type="date"
                          className={`${input} ${missingDate ? "border-danger" : ""}`}
                          value={item.dueDate}
                          aria-invalid={missingDate}
                          onChange={(e) => updateItem(course.id, item.id, { dueDate: e.target.value })}
                        />
                      </div>
                      <div>
                        <label htmlFor={`weight-${item.id}`} className={label}>
                          Weight %
                        </label>
                        <input
                          id={`weight-${item.id}`}
                          inputMode="decimal"
                          className={input}
                          value={item.weight}
                          onChange={(e) => updateItem(course.id, item.id, { weight: e.target.value })}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${rowLabel}`}
                        onClick={() =>
                          updateCourse(course.id, { items: course.items.filter((i) => i.id !== item.id) })
                        }
                        className="self-end justify-self-end rounded-full px-3 py-2 text-sm font-medium text-muted hover:bg-accent-soft hover:text-ink"
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => updateCourse(course.id, { items: [...course.items, emptyItem()] })}
                  className={`${buttonLink} text-sm`}
                >
                  + Add deliverable
                </button>
                <p className={`text-sm ${off ? "font-medium text-warn-ink" : "text-muted"}`}>
                  {off ? (
                    <span className="rounded-lg bg-warn-bg px-2 py-1">
                      Weights add up to {total}% — usually it&apos;s 100%.
                    </span>
                  ) : (
                    <>Weights add up to {total}%.</>
                  )}
                </p>
              </div>
            </fieldset>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <button type="button" onClick={onAddSyllabus} className={buttonSecondary}>
          + Add another syllabus
        </button>
        <button
          type="button"
          onClick={() => setDrafts((ds) => [...ds, emptyCourse(ds.length)])}
          className={buttonSecondary}
        >
          + Add a course by hand
        </button>
        <button type="button" data-testid="save-courses-button" onClick={save} className={`${buttonPrimary} sm:ml-auto`}>
          Save courses
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — how hard is each course, and what grade are you aiming for?
// ---------------------------------------------------------------------------

const EFFORT_LABELS: Record<Effort, string> = {
  1: "Easy for me",
  2: "Fairly easy",
  3: "Medium",
  4: "Hard",
  5: "Very hard for me",
};

function StepEffort({
  headingRef,
  drafts,
  updateCourse,
  onBack,
  onNext,
}: {
  headingRef: HeadingRef;
  drafts: DraftCourse[];
  updateCourse: (id: string, patch: Partial<DraftCourse>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  function next() {
    const bad = validateDrafts(drafts).find((p) => p.message.includes("target grade"));
    if (bad) setError(bad.message);
    else onNext();
  }

  return (
    <section>
      <StepHeading headingRef={headingRef}>How hard is each course for you?</StepHeading>
      <p className="mt-2 text-muted">
        Harder courses get more study time. Your target grade is optional — it helps the grade calculator later.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <ul className="mt-6 space-y-4">
        {drafts.map((c) => (
          <li key={c.id} className={card}>
            <p className="flex items-center gap-2 font-semibold">
              <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ background: c.color }} />
              {c.name}
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_10rem]">
              <div>
                <label htmlFor={`effort-${c.id}`} className={label}>
                  Difficulty: <span className="font-semibold">{EFFORT_LABELS[c.effort]}</span>
                </label>
                <input
                  id={`effort-${c.id}`}
                  data-testid={`effort-slider-${c.id}`}
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={c.effort}
                  aria-valuetext={`${c.effort} of 5, ${EFFORT_LABELS[c.effort]}`}
                  onChange={(e) => updateCourse(c.id, { effort: Number(e.target.value) as Effort })}
                  className="w-full accent-[var(--accent)]"
                />
                <div className="flex justify-between text-xs text-muted" aria-hidden="true">
                  <span>Easy</span>
                  <span>Very hard</span>
                </div>
              </div>
              <div>
                <label htmlFor={`target-${c.id}`} className={label}>
                  Target grade (/{c.gradeScale})
                </label>
                <input
                  id={`target-${c.id}`}
                  inputMode="decimal"
                  className={input}
                  value={c.targetGrade}
                  placeholder={c.gradeScale === 100 ? "e.g. 75" : "e.g. 8"}
                  onChange={(e) => updateCourse(c.id, { targetGrade: e.target.value })}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onBack} className={buttonSecondary}>
          Back
        </button>
        <button type="button" onClick={next} className={buttonPrimary}>
          Next: free time
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — weekly availability, then generate the plan
// ---------------------------------------------------------------------------

function StepAvailability({
  headingRef,
  drafts,
  onBack,
}: {
  headingRef: HeadingRef;
  drafts: DraftCourse[];
  onBack: () => void;
}) {
  const router = useRouter();
  const saved = useStore((s) => s.availability);
  const [form, setForm] = useState(() => formFromAvailability(saved));
  const [error, setError] = useState<string | null>(null);

  function generate() {
    const parsed = availabilityFromForm(form, []);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const problems = validateDrafts(drafts);
    if (problems.length) {
      setError(problems[0].message);
      return;
    }
    const store = useStore.getState();
    const { courses, deliverables } = draftsToStore(drafts);
    store.setCourses(courses, deliverables);
    store.setAvailability(parsed.availability);
    store.generatePlan();
    router.push("/today");
  }

  return (
    <section>
      <StepHeading headingRef={headingRef}>When can you study?</StepHeading>
      <p className="mt-2 text-muted">Roughly how many hours on a normal week? You can change this any time.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <div className={`${card} mt-6`}>
        <AvailabilityFields value={form} onChange={setForm} />
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <button type="button" onClick={onBack} className={buttonSecondary}>
          Back
        </button>
        <button type="button" data-testid="generate-plan-button" onClick={generate} className={buttonPrimary}>
          Generate my plan
        </button>
      </div>
    </section>
  );
}
