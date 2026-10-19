import { describe, expect, it } from "vitest";
import { addDaysISO } from "./dates";
import { generateSchedule, rampTargets, splitIntoBlocks } from "./scheduler";
import type { Availability, Course, Deliverable, StudyBlock } from "./types";

const TODAY = "2026-10-19"; // a Monday
const day = (n: number) => addDaysISO(TODAY, n);

const course: Course = { id: "c1", name: "Finance", color: "#000", effort: 3, gradeScale: 10 };

const every = (minutes: number, extra: Partial<Availability> = {}): Availability => ({
  minutesPerWeekday: [minutes, minutes, minutes, minutes, minutes, minutes, minutes],
  maxMinutesPerDay: 300,
  daysOff: [],
  ...extra,
});

let n = 0;
function deliverable(hours: number, dueIn: number, extra: Partial<Deliverable> = {}): Deliverable {
  n++;
  return {
    id: `d${n}`,
    courseId: "c1",
    title: `Task ${n}`,
    type: "exam",
    dueDate: day(dueIn),
    weight: 20,
    estimatedHours: hours,
    loggedMinutes: 0,
    done: false,
    ...extra,
  };
}

function minutesByDate(blocks: StudyBlock[], deliverableId?: string) {
  const map = new Map<string, number>();
  for (const b of blocks) {
    if (deliverableId && b.deliverableId !== deliverableId) continue;
    map.set(b.date, (map.get(b.date) ?? 0) + b.minutes);
  }
  return map;
}

const total = (blocks: StudyBlock[]) => blocks.reduce((sum, b) => sum + b.minutes, 0);

describe("helpers", () => {
  it("rampTargets sums to the total and increases towards the deadline", () => {
    const t = rampTargets(720, 6);
    expect(t.reduce((a, b) => a + b, 0)).toBe(720);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
  });

  it("rampTargets merges slices smaller than one block", () => {
    const t = rampTargets(60, 6);
    expect(t.reduce((a, b) => a + b, 0)).toBe(60);
    expect(t.every((m) => m === 0 || m >= 25)).toBe(true);
  });

  it("splitIntoBlocks keeps blocks between 25 and 90 minutes", () => {
    expect(splitIntoBlocks(60)).toEqual([60]);
    expect(splitIntoBlocks(95)).toEqual([50, 45]);
    expect(splitIntoBlocks(200)).toEqual([70, 65, 65]);
  });
});

describe("generateSchedule", () => {
  it("places a small task the day before it's due", () => {
    const d = deliverable(2, 3);
    const { blocks, warnings } = generateSchedule({
      courses: [course], deliverables: [d], availability: every(180), today: TODAY,
    });
    expect(warnings).toEqual([]);
    expect(total(blocks)).toBe(120);
    expect([...minutesByDate(blocks).keys()]).toEqual([day(2)]);
  });

  it("is back-loaded: later days get more, but work starts ceil(hours/2) days early", () => {
    const d = deliverable(12, 10);
    const { blocks } = generateSchedule({
      courses: [course], deliverables: [d], availability: every(300), today: TODAY,
    });
    const byDate = minutesByDate(blocks);
    expect(total(blocks)).toBe(720);
    expect(byDate.has(day(10))).toBe(false); // nothing on the deadline day
    expect(Math.min(...[...byDate.keys()].map((k) => k.localeCompare(day(4))))).toBeGreaterThanOrEqual(0); // starts 6 days before
    const amounts = [...byDate.entries()].sort().map(([, m]) => m);
    for (let i = 1; i < amounts.length; i++) expect(amounts[i]).toBeGreaterThanOrEqual(amounts[i - 1]);
  });

  it("makes every block 25–90 minutes, in 5-minute steps", () => {
    const { blocks } = generateSchedule({
      courses: [course],
      deliverables: [deliverable(12, 10), deliverable(3.5, 4), deliverable(1, 2)],
      availability: every(200),
      today: TODAY,
    });
    for (const b of blocks) {
      expect(b.minutes).toBeGreaterThanOrEqual(25);
      expect(b.minutes).toBeLessThanOrEqual(90);
      expect(b.minutes % 5).toBe(0);
    }
  });

  it("respects daily availability, the daily cap and days off", () => {
    const availability = every(200, { maxMinutesPerDay: 120, daysOff: [day(5), day(6)] });
    const { blocks } = generateSchedule({
      courses: [course],
      deliverables: [deliverable(15, 8), deliverable(6, 9)],
      availability,
      today: TODAY,
    });
    for (const [date, minutes] of minutesByDate(blocks)) {
      expect(minutes).toBeLessThanOrEqual(120);
      expect([day(5), day(6)]).not.toContain(date);
    }
  });

  it("uses per-weekday availability (0 minutes on Sundays)", () => {
    const availability: Availability = {
      minutesPerWeekday: [120, 120, 120, 120, 120, 120, 0], maxMinutesPerDay: 300, daysOff: [],
    };
    const { blocks } = generateSchedule({
      courses: [course], deliverables: [deliverable(10, 9)], availability, today: TODAY,
    });
    expect(minutesByDate(blocks).has(day(6))).toBe(false); // 2026-10-25 is a Sunday
  });

  it("warns with the hours that don't fit", () => {
    const { blocks, warnings } = generateSchedule({
      courses: [course],
      deliverables: [deliverable(6, 2, { title: "final" })],
      availability: every(60),
      today: TODAY,
    });
    expect(total(blocks)).toBe(180);
    expect(warnings).toEqual(["Finance – final: 3h don't fit — consider Panic Mode or more availability."]);
  });

  it("gives the deadline day at most 25% of the work", () => {
    const d = deliverable(4, 1);
    const { blocks, warnings } = generateSchedule({
      courses: [course], deliverables: [d], availability: every(120), today: TODAY,
    });
    expect(minutesByDate(blocks).get(day(0))).toBe(120);
    expect(minutesByDate(blocks).get(day(1))).toBe(60);
    expect(warnings).toHaveLength(1);
  });

  it("serves the earliest deadline first, ties go to the higher weight", () => {
    const later = deliverable(2, 3);
    const lowWeight = deliverable(2, 2, { weight: 10 });
    const highWeight = deliverable(2, 2, { weight: 40 });
    const { blocks, warnings } = generateSchedule({
      courses: [course],
      deliverables: [later, lowWeight, highWeight],
      availability: every(120),
      today: TODAY,
    });
    expect(minutesByDate(blocks, highWeight.id).get(day(1))).toBe(120);
    expect(minutesByDate(blocks, lowWeight.id).get(day(0))).toBe(120);
    expect(minutesByDate(blocks, later.id).get(day(2))).toBe(120);
    expect(warnings).toEqual([]);
  });

  it("skips done deliverables and subtracts logged minutes", () => {
    const { blocks } = generateSchedule({
      courses: [course],
      deliverables: [deliverable(4, 5, { done: true }), deliverable(4, 5, { loggedMinutes: 180 })],
      availability: every(300),
      today: TODAY,
    });
    expect(total(blocks)).toBe(60);
  });

  it("warns about overdue deliverables instead of scheduling them", () => {
    const { blocks, warnings } = generateSchedule({
      courses: [course], deliverables: [deliverable(2, -1)], availability: every(120), today: TODAY,
    });
    expect(blocks).toEqual([]);
    expect(warnings[0]).toContain("due date has passed");
  });

  it("replans: past planned blocks become missed, done blocks are kept and use up capacity", () => {
    const d = deliverable(3, 4, { loggedMinutes: 60 });
    const existing: StudyBlock[] = [
      { id: "old-missed", deliverableId: d.id, date: day(-1), minutes: 60, status: "planned" },
      { id: "old-done", deliverableId: d.id, date: day(-2), minutes: 60, status: "done" },
      { id: "today-done", deliverableId: d.id, date: day(0), minutes: 60, status: "done" },
      { id: "future", deliverableId: d.id, date: day(3), minutes: 60, status: "planned" },
    ];
    const { blocks } = generateSchedule({
      courses: [course],
      deliverables: [d],
      availability: every(90),
      today: TODAY,
      existingBlocks: existing,
    });
    expect(blocks.find((b) => b.id === "old-missed")?.status).toBe("missed");
    expect(blocks.find((b) => b.id === "old-done")?.status).toBe("done");
    expect(blocks.find((b) => b.id === "future")).toBeUndefined();
    // 180 estimated − 60 logged = 120 minutes to plan again from today.
    expect(total(blocks.filter((b) => b.status === "planned"))).toBe(120);
    // Today already has 60 done of 90 available.
    expect(minutesByDate(blocks.filter((b) => b.status === "planned")).get(day(0)) ?? 0).toBeLessThanOrEqual(30);
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length);
  });
});
