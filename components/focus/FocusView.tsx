"use client";
// Pomodoro focus timer for one study block: 25 min focus, 5 min break.
// The timer lives in the store (survives refresh) and is computed from timestamps,
// so it stays right while the tab is in the background.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { HowItWorks, PageHeader } from "@/components/kit";
import { Tick } from "@/components/Tick";
import { buttonPrimary, buttonSecondary, card } from "@/components/ui";
import { todayISO } from "@/lib/dates";
import {
  FOCUS_MS,
  formatClock,
  isIdle,
  newTimer,
  pause,
  phaseLength,
  remaining,
  skipBreak,
  start,
  stop,
  tick,
  type FocusTimer,
} from "@/lib/focus";
import { blockPoints, FOCUS_BONUS } from "@/lib/gamification";
import { useStore } from "@/lib/store";
import { useHydrated } from "@/lib/useHydrated";

export function FocusView() {
  const hydrated = useHydrated();
  if (!hydrated) {
    return (
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6 pb-28 md:pb-10" aria-busy="true">
        <h1 className="text-2xl font-bold">Focus</h1>
        <p className="mt-2 text-muted">Loading…</p>
      </main>
    );
  }
  return <FocusContent />;
}

/** A soft two-note chime when a phase ends. Silently does nothing if audio isn't allowed. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.25);
      osc.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
  } catch {
    // No audio — the on-screen message is enough.
  }
}

function FocusContent() {
  const { blockId } = useParams<{ blockId: string }>();
  const block = useStore((s) => s.blocks.find((b) => b.id === blockId));
  const deliverable = useStore((s) => s.deliverables.find((d) => d.id === block?.deliverableId));
  const course = useStore((s) => s.courses.find((c) => c.id === deliverable?.courseId));
  const focused = useStore((s) => s.focusMinutes[blockId] ?? 0);
  const storedTimer = useStore((s) => s.timer);
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);

  // A timer for a different block is set aside; this page always shows this block's timer.
  const timer: FocusTimer = storedTimer?.blockId === blockId ? storedTimer : newTimer(blockId);
  const weight = deliverable?.weight ?? 0;

  /** Moves the timer to "now" and credits any session that finished meanwhile. */
  const advance = useCallback(() => {
    const t = Date.now();
    setNow(t);
    const s = useStore.getState();
    if (s.timer?.blockId !== blockId || !s.timer.running) return;
    const result = tick(s.timer, t);
    if (!result.completedFocus && !result.completedBreak) return;
    s.setTimer(result.timer);
    if (result.completedFocus) {
      s.logFocus(blockId, FOCUS_MS / 60_000, true, todayISO());
      setMessage(
        `Session done! +${blockPoints(25, weight) + FOCUS_BONUS} points (including the +${FOCUS_BONUS} focus bonus). Enjoy a 5-minute break.`,
      );
      chime();
    }
    if (result.completedBreak) {
      setMessage((m) => (result.completedFocus ? m : "Break's over. Ready for another round?"));
      if (!result.completedFocus) chime();
    }
  }, [blockId, weight]);

  useEffect(() => {
    const id = window.setInterval(advance, 1000);
    // Background tabs may run timers slowly: catch up as soon as the tab is visible again.
    const onVisible = () => document.visibilityState === "visible" && advance();
    document.addEventListener("visibilitychange", onVisible);
    // Catch up right away on load (e.g. a session that finished while you were on another page).
    const first = window.setTimeout(advance, 0);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [advance]);

  const left = remaining(timer, now);
  const clock = formatClock(left);
  const label = timer.phase === "focus" ? "Focus" : "Break";

  useEffect(() => {
    const original = document.title;
    if (timer.running) document.title = `${clock} · ${label} · Syllabuddy`;
    return () => {
      document.title = original;
    };
  }, [clock, label, timer.running]);

  if (!block || !deliverable) {
    return (
      <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-10 pb-28 text-center md:pb-10">
        <Tick size={48} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-bold">Study block not found</h1>
        <p className="mt-2 text-muted">It may have moved when your plan was updated.</p>
        <Link href="/app" className={`${buttonSecondary} mt-6`}>
          Back to today
        </Link>
      </main>
    );
  }

  const set = (t: FocusTimer) => {
    useStore.getState().setTimer(t);
    setNow(Date.now());
  };

  function onStart() {
    setMessage(null);
    // Switching from another block's timer: keep the minutes focused there.
    const other = useStore.getState().timer;
    if (other && other.blockId !== blockId) {
      const { focusedMinutes } = stop(other, Date.now());
      if (focusedMinutes > 0) useStore.getState().logFocus(other.blockId, focusedMinutes, false, todayISO());
    }
    set(start(timer, Date.now()));
  }

  function onStop() {
    const { timer: stopped, focusedMinutes } = stop(timer, Date.now());
    set(stopped);
    if (focusedMinutes > 0) {
      useStore.getState().logFocus(blockId, focusedMinutes, false, todayISO());
      setMessage(`Stopped. ${focusedMinutes} focused minute${focusedMinutes === 1 ? "" : "s"} logged — +${blockPoints(focusedMinutes, weight)} points.`);
    } else {
      setMessage("Stopped. Nothing logged — sessions under a minute don't count.");
    }
  }

  const progress = 1 - left / phaseLength(timer.phase);
  const blockDone = block.status === "done";

  return (
    <main id="main" className="mx-auto w-full max-w-xl flex-1 px-4 py-6 pb-28 sm:px-6 md:py-8 md:pb-10">
      <PageHeader
        back={{ href: "/app", label: "Today" }}
        eyebrow={`Focus session · ${course?.name ?? ""}`}
        title={deliverable.title}
        description={`${block.minutes}-minute block · ${focused} min focused so far${blockDone ? " · block done" : ""}. Press Start, put your phone away, and work on just this until the timer ends.`}
      />

      <section aria-labelledby="timer-label" className={`${card} mt-6 flex flex-col items-center py-8`}>
        <p id="timer-label" className={`text-sm font-semibold ${timer.phase === "focus" ? "text-accent" : "text-success"}`}>
          {label}
          {timer.sessions > 0 && ` · ${timer.sessions} session${timer.sessions === 1 ? "" : "s"} done`}
        </p>
        <div className="relative mt-4 h-56 w-56">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--line)" strokeWidth="6" />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={timer.phase === "focus" ? "var(--accent)" : "var(--success)"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 45}
              strokeDashoffset={2 * Math.PI * 45 * (1 - progress)}
            />
          </svg>
          <p
            className="absolute inset-0 flex items-center justify-center font-mono text-5xl font-bold tabular-nums"
            role="timer"
            aria-label={`${label}: ${clock} left`}
          >
            {clock}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {!timer.running && (
            <button
              type="button"
              data-testid="focus-start-button"
              onClick={onStart}
              className={buttonPrimary}
            >
              {isIdle(timer) ? (timer.phase === "focus" ? "Start focus" : "Start break") : "Resume"}
            </button>
          )}
          {timer.running && (
            <button type="button" onClick={() => set(pause(timer, Date.now()))} className={buttonPrimary}>
              Pause
            </button>
          )}
          {timer.phase === "focus" && !isIdle(timer) && (
            <button type="button" onClick={onStop} className={buttonSecondary}>
              Stop &amp; log time
            </button>
          )}
          {timer.phase === "break" && (
            <button type="button" onClick={() => set(skipBreak(timer))} className={buttonSecondary}>
              Skip break
            </button>
          )}
        </div>
        <p aria-live="polite" className="mt-4 min-h-6 max-w-sm text-center text-sm">
          {message}
        </p>
      </section>

      <div className="mt-4">
        <HowItWorks title="How a focus session works">
          <p>25 minutes of focus, then a 5-minute break that starts by itself (the Pomodoro technique).</p>
          <p>
            Each full session logs 25 minutes on this deadline and earns a +{FOCUS_BONUS} bonus. Stopping early logs the
            whole minutes you focused. When you&apos;ve focused for the whole block, it&apos;s ticked off for you.
          </p>
          <p>The timer keeps running if you switch tabs or close the page, and a soft chime plays when a phase ends.</p>
        </HowItWorks>
      </div>
    </main>
  );
}
