// Pomodoro timer maths: 25 minutes focus, 5 minutes break.
// Everything is computed from timestamps, so the timer stays right even if the tab sleeps
// in the background — the page only re-reads the clock, it never counts ticks.

export const FOCUS_MS = 25 * 60_000;
export const BREAK_MS = 5 * 60_000;

export type FocusPhase = "focus" | "break";

export interface FocusTimer {
  blockId: string;
  phase: FocusPhase;
  running: boolean;
  /** When the current running stretch began (ms since 1970), or null when paused/idle. */
  startedAt: number | null;
  /** Time already spent in this phase before the current stretch (pauses split stretches). */
  accumulatedMs: number;
  /** Completed focus sessions for this block during this visit. */
  sessions: number;
}

export function newTimer(blockId: string): FocusTimer {
  return { blockId, phase: "focus", running: false, startedAt: null, accumulatedMs: 0, sessions: 0 };
}

export const phaseLength = (phase: FocusPhase) => (phase === "focus" ? FOCUS_MS : BREAK_MS);

export function elapsed(t: FocusTimer, now: number): number {
  return t.accumulatedMs + (t.running && t.startedAt !== null ? Math.max(0, now - t.startedAt) : 0);
}

export function remaining(t: FocusTimer, now: number): number {
  return Math.max(0, phaseLength(t.phase) - elapsed(t, now));
}

/** Not started yet in this phase (nothing elapsed and not running). */
export const isIdle = (t: FocusTimer) => !t.running && t.accumulatedMs === 0;

export function start(t: FocusTimer, now: number): FocusTimer {
  return t.running ? t : { ...t, running: true, startedAt: now };
}

export function pause(t: FocusTimer, now: number): FocusTimer {
  return t.running ? { ...t, running: false, startedAt: null, accumulatedMs: elapsed(t, now) } : t;
}

export interface TickResult {
  timer: FocusTimer;
  completedFocus: boolean;
  completedBreak: boolean;
}

/**
 * Moves the timer forward to `now`. A finished focus session starts the break automatically;
 * a finished break waits for you to start the next session. Works even if hours have passed.
 */
export function tick(t: FocusTimer, now: number): TickResult {
  let timer = t;
  let completedFocus = false;
  let completedBreak = false;

  if (timer.running && timer.phase === "focus" && elapsed(timer, now) >= FOCUS_MS) {
    const focusEndedAt = now - (elapsed(timer, now) - FOCUS_MS);
    timer = { ...timer, phase: "break", running: true, startedAt: focusEndedAt, accumulatedMs: 0, sessions: timer.sessions + 1 };
    completedFocus = true;
  }
  if (timer.running && timer.phase === "break" && elapsed(timer, now) >= BREAK_MS) {
    timer = { ...timer, phase: "focus", running: false, startedAt: null, accumulatedMs: 0 };
    completedBreak = true;
  }
  return { timer, completedFocus, completedBreak };
}

/** Stops the session. Returns whole focus minutes to log (breaks don't count). */
export function stop(t: FocusTimer, now: number): { timer: FocusTimer; focusedMinutes: number } {
  const focusedMinutes = t.phase === "focus" ? Math.floor(Math.min(elapsed(t, now), FOCUS_MS) / 60_000) : 0;
  return { timer: { ...newTimer(t.blockId), sessions: t.sessions }, focusedMinutes };
}

export function skipBreak(t: FocusTimer): FocusTimer {
  return t.phase === "break" ? { ...t, phase: "focus", running: false, startedAt: null, accumulatedMs: 0 } : t;
}

/** 90_000 → "01:30". Rounds up so the clock shows 00:01 until the very end. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}
