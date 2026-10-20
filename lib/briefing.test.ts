import { describe, expect, it } from "vitest";
import {
  comingUp,
  formatDuration,
  getAheadSuggestion,
  greeting,
  headsUp,
  summaryLine,
  todayTimeline,
  yesterdayStats,
  type HeadsUpInput,
} from "./briefing";
import { addDaysISO } from "./dates";
import type { Availability, Course, Deliverable, StudyBlock } from "./types";

const TODAY = "2026-10-20"; // a Tuesday
const day = (n: number) => addDaysISO(TODAY, n);

const courses: Course[] = [{ id: "c1", name: "Finance", color: "#1d4ed8", effort: 3, gradeScale: 10 }];

const deliverable = (id: string, dueIn: number, extra: Partial<Deliverable> = {}): Deliverable => ({
  id,
  courseId: "c1",
  title: `Task ${id}`,
  type: "homework",
  dueDate: day(dueIn),
  weight: 10,
  estimatedHours: 2,
  loggedMinutes: 0,
  done: false,
  ...extra,
});

const block = (id: string, deliverableId: string, dayOffset: number, minutes: number, status: StudyBlock["status"] = "planned"): StudyBlock => ({
  id,
  deliverableId,
  date: day(dayOffset),
  minutes,
  status,
});

const roomy: Availability = { minutesPerWeekday: [180, 180, 180, 180, 180, 180, 180], maxMinutesPerDay: 300, daysOff: [] };

describe("greeting and durations", () => {
  it("greets by time of day, with an optional first name", () => {
    expect(greeting(8)).toBe("Good morning");
    expect(greeting(13, "Paula")).toBe("Good afternoon, Paula");
    expect(greeting(21, "  ")).toBe("Good evening");
  });

  it("formats durations", () => {
    expect(formatDuration(135)).toBe("2h 15m");
    expect(formatDuration(50)).toBe("50m");
    expect(formatDuration(120)).toBe("2h");
  });
});

describe("timeline and summary", () => {
  const ds = [deliverable("d1", 2, { title: "Finance problem set" }), deliverable("d2", 5)];
  const blocks = [block("b-2", "d2", 0, 50), block("b-1", "d1", 0, 60, "done"), block("b-3", "d1", 1, 60)];

  it("lists today's blocks back to back from 18:00, in a stable order", () => {
    const t = todayTimeline(blocks, ds, courses, TODAY);
    expect(t.map((i) => [i.block.id, i.start, i.end, i.title])).toEqual([
      ["b-1", "18:00", "19:00", "Finance problem set"],
      ["b-2", "19:00", "19:50", "Task d2"],
    ]);
    expect(t[0].courseName).toBe("Finance");
  });

  it("summarises the day in one sentence", () => {
    const t = todayTimeline(blocks, ds, courses, TODAY);
    const next = comingUp(ds, courses, TODAY)[0];
    expect(summaryLine(t, next)).toBe("2 study blocks today (1h 50m) · next deadline: Finance problem set in 2 days.");
    expect(summaryLine([], undefined)).toBe("No study blocks today.");
    const allDone = t.map((i) => ({ ...i, block: { ...i.block, status: "done" as const } }));
    expect(summaryLine(allDone, undefined)).toBe("All 2 study blocks done today.");
  });

  it("shows open deadlines for the next 7 days, soonest first", () => {
    const items = comingUp(
      [deliverable("late", 8), deliverable("soon", 1), deliverable("done", 2, { done: true }), deliverable("past", -1), deliverable("today", 0)],
      courses,
      TODAY,
    );
    expect(items.map((i) => [i.deliverable.id, i.daysLeft])).toEqual([
      ["today", 0],
      ["soon", 1],
    ]);
  });

  it("counts yesterday's blocks", () => {
    expect(yesterdayStats([block("y1", "d1", -1, 30, "done"), block("y2", "d1", -1, 30, "missed"), block("t", "d1", 0, 30)], TODAY)).toEqual({
      done: 1,
      total: 2,
    });
  });

  it("suggests the next planned block on a free day", () => {
    expect(getAheadSuggestion([block("later", "d1", 3, 30), block("next", "d1", 1, 30), block("old", "d1", -1, 30)], TODAY)?.id).toBe("next");
    expect(getAheadSuggestion([], TODAY)).toBeUndefined();
  });
});

describe("heads up", () => {
  const base: HeadsUpInput = {
    today: TODAY,
    burnout: { triggered: false },
    protectedTonight: false,
    lastReplan: null,
    replanDismissed: false,
    deliverables: [],
    blocks: [],
    availability: roomy,
  };

  it("is empty on a calm day", () => {
    expect(headsUp(base)).toEqual([]);
  });

  it("offers to protect tonight after burnout, but not once it's protected", () => {
    const alerts = headsUp({ ...base, burnout: { triggered: true, reason: "overwork", days: 3 } });
    expect(alerts[0]).toMatchObject({ id: "burnout", action: { kind: "protectTonight" } });
    expect(headsUp({ ...base, burnout: { triggered: true, reason: "overwork", days: 3 }, protectedTonight: true })).toEqual([]);
  });

  it("explains today's replanning until dismissed", () => {
    const lastReplan = { date: TODAY, blocks: 3, minutes: 150 };
    expect(headsUp({ ...base, lastReplan })[0]).toMatchObject({ id: "replanned", text: expect.stringContaining("2h 30m") });
    expect(headsUp({ ...base, lastReplan, replanDismissed: true })).toEqual([]);
    expect(headsUp({ ...base, lastReplan: { ...lastReplan, date: day(-1) } })).toEqual([]);
  });

  it("flags a deadline this week with no study time at all", () => {
    const alerts = headsUp({ ...base, deliverables: [deliverable("d1", 3, { title: "Law essay" })] });
    expect(alerts[0]).toMatchObject({ id: "noStudyTime", title: "No study time for Law essay", action: { href: "/panic" } });
    // Planned blocks, done work or a later deadline: no alert.
    expect(headsUp({ ...base, deliverables: [deliverable("d1", 3)], blocks: [block("b", "d1", 1, 60)] })).toEqual([]);
    expect(headsUp({ ...base, deliverables: [deliverable("d1", 3, { done: true })] })).toEqual([]);
    expect(headsUp({ ...base, deliverables: [deliverable("d1", 10)] })).toEqual([]);
  });

  it("warns about a heavy week (85%+ of free time planned)", () => {
    const busy = Array.from({ length: 7 }, (_, i) => block(`b${i}`, "d1", i, 160));
    const alerts = headsUp({ ...base, deliverables: [deliverable("d1", 20)], blocks: busy });
    expect(alerts[0]).toMatchObject({ id: "heavyWeek", action: { href: "/plan" } });
    const light = busy.map((b) => ({ ...b, minutes: 60 }));
    expect(headsUp({ ...base, deliverables: [deliverable("d1", 20)], blocks: light })).toEqual([]);
  });

  it("never shows more than two alerts, most important first", () => {
    const busy = Array.from({ length: 7 }, (_, i) => block(`b${i}`, "d1", i, 170));
    const alerts = headsUp({
      ...base,
      burnout: { triggered: true, reason: "noRest", days: 7 },
      lastReplan: { date: TODAY, blocks: 1, minutes: 30 },
      deliverables: [deliverable("d1", 20), deliverable("d2", 2)],
      blocks: busy,
    });
    expect(alerts.map((a) => a.id)).toEqual(["burnout", "replanned"]);
  });
});
