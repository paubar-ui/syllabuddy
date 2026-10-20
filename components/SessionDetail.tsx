"use client";
// The session detail panel (V2-6): click any study block on Today or Plan to see what to do in it —
// goal, checklist, materials, a tip — and start focus, mark it done, move it, or keep notes.
// Uses the native <dialog>: focus stays inside, Esc closes it, and focus returns to the block.
import { format, parseISO } from "date-fns";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CourseDot } from "@/components/kit";
import { buttonPrimary, buttonSecondary, input, label } from "@/components/ui";
import { addDaysISO } from "@/lib/dates";
import { isExam } from "@/lib/examPlan";
import { blockDetail } from "@/lib/sessionDetail";
import { useStore } from "@/lib/store";

export function SessionDetail({
  blockId,
  today,
  onClose,
}: {
  blockId: string | null;
  today: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (blockId && !dialog.open) {
      opener.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!blockId && dialog.open) {
      dialog.close();
    }
  }, [blockId]);

  return (
    <dialog
      ref={ref}
      data-testid={blockId ? "session-detail" : undefined}
      aria-labelledby="session-detail-title"
      onClose={() => {
        onClose();
        opener.current?.focus();
      }}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close(); // click on the backdrop
      }}
      className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md overflow-y-auto border-l border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {blockId && <DetailBody blockId={blockId} today={today} close={() => ref.current?.close()} />}
    </dialog>
  );
}

function DetailBody({ blockId, today, close }: { blockId: string; today: string; close: () => void }) {
  const block = useStore((s) => s.blocks.find((b) => b.id === blockId));
  const blocks = useStore((s) => s.blocks);
  const deliverable = useStore((s) => s.deliverables.find((d) => d.id === block?.deliverableId));
  const course = useStore((s) => s.courses.find((c) => c.id === deliverable?.courseId));
  const checked = useStore((s) => s.taskChecks[blockId]) ?? [];
  const savedNote = useStore((s) => s.blockNotes[blockId]) ?? "";
  const toggleTask = useStore((s) => s.toggleTask);
  const toggleBlock = useStore((s) => s.toggleBlock);
  const moveBlock = useStore((s) => s.moveBlock);
  const setBlockNote = useStore((s) => s.setBlockNote);
  const [note, setNote] = useState(savedNote);
  const [moving, setMoving] = useState(false);
  const [moveTo, setMoveTo] = useState(() => addDaysISO(today, 1));
  const [status, setStatus] = useState("");

  if (!block || !deliverable) {
    return (
      <div className="p-5">
        <h2 id="session-detail-title" className="text-lg font-semibold">
          Study block not found
        </h2>
        <p className="mt-1 text-sm text-muted">It may have been moved when your plan was updated.</p>
        <button type="button" onClick={close} className={`${buttonSecondary} mt-4`}>
          Close
        </button>
      </div>
    );
  }

  const detail = blockDetail({ block, deliverable, course, blocks, today });
  const done = block.status === "done";

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-line bg-surface p-5">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <CourseDot color={course?.color} />
            {course?.name ?? "Course"} · {deliverable.title}
          </p>
          <h2 id="session-detail-title" className="mt-0.5 text-lg font-semibold tracking-tight">
            {detail.heading}
          </h2>
          <p className="text-sm text-muted">
            {format(parseISO(block.date), "EEEE d MMMM")} · {block.minutes} min
            {done && " · done"}
          </p>
          {detail.dayInfo && <p className="mt-1 text-sm font-medium text-accent">{detail.dayInfo}</p>}
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="rounded-md px-2 py-1 text-xl leading-none text-muted hover:bg-surface-2 hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="flex-1 space-y-5 p-5">
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Goal</h3>
          <p className="mt-1">{detail.goal}</p>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Checklist</h3>
          <p className="text-xs text-muted">Tick everything and the block is marked done.</p>
          <ul className="mt-2 space-y-2">
            {detail.tasks.map((task, i) => {
              const id = `task-${blockId}-${i}`;
              return (
                <li key={task} className="flex items-start gap-2.5">
                  <input
                    id={id}
                    type="checkbox"
                    checked={done || checked.includes(task)}
                    disabled={done}
                    onChange={() => {
                      toggleTask(blockId, task, detail.tasks, today);
                      const nowDone = useStore.getState().blocks.find((b) => b.id === blockId)?.status === "done";
                      if (nowDone) setStatus("All tasks done — block marked as done.");
                    }}
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)]"
                  />
                  <label htmlFor={id} className="cursor-pointer text-sm">
                    {task}
                  </label>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Have ready</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
            {detail.materials.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-lg border border-info-line bg-info-soft p-3 text-sm text-info-ink">
          <span className="font-semibold">How to work: </span>
          {detail.tip}
        </section>

        {detail.examDay && (
          <AiExplanation
            request={{
              course: course?.name ?? "",
              exam: deliverable.title,
              kind: detail.examDay.kind,
              title: detail.examDay.title,
              goal: detail.examDay.goal,
              tasks: detail.examDay.tasks,
              examFormat: deliverable.exam?.format,
              minutes: block.minutes,
            }}
          />
        )}

        {isExam(deliverable) && (
          <Link
            href={`/exam/${deliverable.id}`}
            className="inline-block text-sm font-medium text-accent underline underline-offset-2 hover:no-underline"
          >
            See the full exam prep plan
          </Link>
        )}

        <div className="flex flex-wrap gap-2">
          {!done && (
            <Link href={`/focus/${block.id}`} className={buttonPrimary}>
              Start focus
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              toggleBlock(blockId, today);
              setStatus(done ? "Marked as not done." : "Marked as done.");
            }}
            className={buttonSecondary}
          >
            {done ? "Mark not done" : "Mark done"}
          </button>
          {!done && (
            <button
              type="button"
              onClick={() => setMoving((m) => !m)}
              aria-expanded={moving}
              className={buttonSecondary}
            >
              Move to another day
            </button>
          )}
        </div>

        {moving && !done && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!moveTo || moveTo < today) return;
              moveBlock(blockId, moveTo, today);
              setMoving(false);
              setStatus(`Moved to ${format(parseISO(moveTo), "EEEE d MMMM")}. The rest of your plan was adjusted.`);
            }}
          >
            <div>
              <label htmlFor="move-date" className={label}>
                New day
              </label>
              <input
                id="move-date"
                type="date"
                min={today}
                max={deliverable.dueDate}
                value={moveTo}
                onChange={(e) => setMoveTo(e.target.value)}
                className={input}
              />
            </div>
            <button type="submit" className={buttonPrimary}>
              Move
            </button>
          </form>
        )}

        <p role="status" className="text-sm text-success">
          {status}
        </p>

        <section>
          <label htmlFor={`note-${blockId}`} className={label}>
            Notes
          </label>
          <textarea
            id={`note-${blockId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== savedNote && setBlockNote(blockId, note)}
            placeholder="Questions for class, what to pick up next time…"
            className={`${input} min-h-24`}
          />
          <p className="mt-1 text-xs text-muted">Saved when you click outside the box.</p>
        </section>
      </div>
    </div>
  );
}

/** Optional: a richer explanation of an exam prep day, only when AI is switched on (ANTHROPIC_API_KEY). */
function AiExplanation({ request }: { request: Record<string, unknown> }) {
  const [available, setAvailable] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; text?: string }>({
    status: "idle",
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/exam-day", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((j: { available?: boolean }) => !cancelled && setAvailable(Boolean(j.available)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;
  if (state.status === "done") {
    return (
      <section className="rounded-lg border border-line p-3 text-sm">
        <p className="font-semibold">In more detail</p>
        <p className="mt-1 whitespace-pre-line">{state.text}</p>
      </section>
    );
  }
  return (
    <div>
      <button
        type="button"
        disabled={state.status === "loading"}
        onClick={async () => {
          setState({ status: "loading" });
          try {
            const res = await fetch("/api/exam-day", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(request),
            });
            const json = (await res.json()) as { description?: string };
            setState(res.ok && json.description ? { status: "done", text: json.description } : { status: "error" });
          } catch {
            setState({ status: "error" });
          }
        }}
        className={buttonSecondary}
      >
        {state.status === "loading" ? "Explaining…" : "Explain this session in more detail"}
      </button>
      {state.status === "error" && (
        <p role="status" className="mt-1 text-sm text-muted">
          Couldn&apos;t get an explanation right now — the checklist above has everything you need.
        </p>
      )}
    </div>
  );
}
