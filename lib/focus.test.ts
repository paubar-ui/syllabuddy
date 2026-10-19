import { describe, expect, it } from "vitest";
import { BREAK_MS, FOCUS_MS, formatClock, newTimer, pause, remaining, skipBreak, start, stop, tick } from "./focus";

const MIN = 60_000;
const T0 = 1_000_000;

describe("focus timer", () => {
  it("counts down from 25 minutes using timestamps", () => {
    const t = start(newTimer("b1"), T0);
    expect(remaining(t, T0)).toBe(FOCUS_MS);
    expect(remaining(t, T0 + 10 * MIN)).toBe(15 * MIN);
  });

  it("pauses and resumes without losing time", () => {
    let t = start(newTimer("b1"), T0);
    t = pause(t, T0 + 10 * MIN);
    expect(remaining(t, T0 + 60 * MIN)).toBe(15 * MIN); // paused: the clock doesn't move
    t = start(t, T0 + 60 * MIN);
    expect(remaining(t, T0 + 65 * MIN)).toBe(10 * MIN);
  });

  it("finishes a session, then starts the 5-minute break automatically", () => {
    const t = start(newTimer("b1"), T0);
    const r = tick(t, T0 + 26 * MIN);
    expect(r.completedFocus).toBe(true);
    expect(r.timer.phase).toBe("break");
    expect(r.timer.sessions).toBe(1);
    expect(remaining(r.timer, T0 + 26 * MIN)).toBe(4 * MIN); // break started at minute 25
  });

  it("catches up correctly after the tab slept through focus and break", () => {
    const t = start(newTimer("b1"), T0);
    const r = tick(t, T0 + 2 * 60 * MIN);
    expect(r).toMatchObject({ completedFocus: true, completedBreak: true });
    expect(r.timer).toMatchObject({ phase: "focus", running: false, accumulatedMs: 0, sessions: 1 });
  });

  it("does nothing while time is left", () => {
    const t = start(newTimer("b1"), T0);
    expect(tick(t, T0 + MIN)).toEqual({ timer: t, completedFocus: false, completedBreak: false });
  });

  it("stopping logs whole focused minutes, and nothing for breaks", () => {
    const t = start(newTimer("b1"), T0);
    expect(stop(t, T0 + 12.7 * MIN).focusedMinutes).toBe(12);
    const inBreak = tick(t, T0 + FOCUS_MS + MIN).timer;
    expect(stop(inBreak, T0 + FOCUS_MS + 2 * MIN).focusedMinutes).toBe(0);
    expect(stop(inBreak, T0 + FOCUS_MS + 2 * MIN).timer.sessions).toBe(1);
  });

  it("can skip the break", () => {
    const inBreak = tick(start(newTimer("b1"), T0), T0 + FOCUS_MS).timer;
    const t = skipBreak(inBreak);
    expect(t).toMatchObject({ phase: "focus", running: false });
    expect(remaining(t, T0 + FOCUS_MS + BREAK_MS)).toBe(FOCUS_MS);
  });

  it("formats the clock", () => {
    expect(formatClock(FOCUS_MS)).toBe("25:00");
    expect(formatClock(90_500)).toBe("01:31");
    expect(formatClock(0)).toBe("00:00");
  });
});
