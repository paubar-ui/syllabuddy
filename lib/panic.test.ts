import { describe, expect, it } from "vitest";
import { addDaysISO } from "./dates";
import { triage } from "./panic";
import type { Course, Deliverable } from "./types";

const TODAY = "2026-10-19";
const courses: Course[] = [{ id: "c1", name: "Finance", color: "#000", effort: 3, gradeScale: 10 }];

let n = 0;
function item(weight: number, hours: number, dueIn: number, extra: Partial<Deliverable> = {}): Deliverable {
  n++;
  return {
    id: `d${n}`,
    courseId: "c1",
    title: `Task ${n}`,
    type: "essay",
    dueDate: addDaysISO(TODAY, dueIn),
    weight,
    estimatedHours: hours,
    loggedMinutes: 0,
    done: false,
    ...extra,
  };
}

const labels = (r: ReturnType<typeof triage>) => r.items.map((i) => [i.title, i.label, i.hours]);

describe("triage", () => {
  it("ranks by grade points per hour and hands out hours greedily", () => {
    const big = item(40, 8, 2, { title: "Big exam", type: "exam" }); // 5 pts/h
    const quick = item(10, 1, 1, { title: "Quick quiz" }); // 10 pts/h, due first
    const medium = item(20, 2, 2, { title: "Short essay" }); // 10 pts/h
    const low = item(5, 6, 1, { title: "Long reading" }); // < 1 pt/h
    const r = triage({ deliverables: [big, quick, medium, low], courses, today: TODAY, hoursAvailable: 6 });
    expect(labels(r)).toEqual([
      ["Quick quiz", "full", 1],
      ["Short essay", "full", 2],
      ["Big exam", "minimum viable", 3],
      ["Long reading", "skip", 0],
    ]);
    expect(r).toMatchObject({ hoursAvailable: 6, hoursPlanned: 6, hoursNeeded: 17 });
  });

  it("gives every item a one-sentence reason, with practical advice for minimum viable", () => {
    const r = triage({
      deliverables: [item(40, 8, 1, { type: "presentation" })],
      courses,
      today: TODAY,
      hoursAvailable: 3,
    });
    expect(r.items[0].label).toBe("minimum viable");
    expect(r.items[0].reason).toBe("It needs about 8h, so use your 3h on a clean structure and one practice run.");
  });

  it("skips work that doesn't fit, but keeps the hours for something smaller", () => {
    const huge = item(30, 10, 1, { title: "Huge" }); // 3 pts/h, minimum viable needs 3h
    const small = item(2, 1, 1, { title: "Small" }); // 2 pts/h
    const r = triage({ deliverables: [huge, small], courses, today: TODAY, hoursAvailable: 1.5 });
    expect(labels(r)).toEqual([
      ["Huge", "skip", 0],
      ["Small", "full", 1],
    ]);
  });

  it("with zero hours, everything is a calm skip with an extension hint", () => {
    const r = triage({ deliverables: [item(30, 2, 1)], courses, today: TODAY, hoursAvailable: 0 });
    expect(r.items[0].label).toBe("skip");
    expect(r.items[0].reason).toContain("extension");
    expect(r.hoursPlanned).toBe(0);
  });

  it("only looks at open work due inside the window", () => {
    const r = triage({
      deliverables: [
        item(10, 1, 0, { title: "Due today" }),
        item(10, 1, 2, { title: "In 48h" }),
        item(10, 1, 3, { title: "In 72h" }),
        item(10, 1, -1, { title: "Overdue" }),
        item(10, 1, 1, { title: "Done", done: true }),
      ],
      courses,
      today: TODAY,
      hoursAvailable: 10,
    });
    expect(r.items.map((i) => i.title).sort()).toEqual(["Due today", "In 48h"]);
    const wider = triage({ deliverables: [item(10, 1, 3)], courses, today: TODAY, hoursAvailable: 5, windowHours: 72 });
    expect(wider.items).toHaveLength(1);
  });

  it("uses the time already logged, with at least 30 minutes left for finishing touches", () => {
    const r = triage({
      deliverables: [item(20, 4, 1, { loggedMinutes: 150 }), item(20, 2, 1, { loggedMinutes: 300 })],
      courses,
      today: TODAY,
      hoursAvailable: 10,
    });
    expect(r.items.map((i) => i.neededHours).sort()).toEqual([0.5, 1.5]);
  });

  it("returns an empty triage when nothing is due", () => {
    expect(triage({ deliverables: [], courses, today: TODAY, hoursAvailable: 4 })).toEqual({
      items: [],
      hoursAvailable: 4,
      hoursPlanned: 0,
      hoursNeeded: 0,
    });
  });

  it("treats negative or odd hours sensibly", () => {
    const r = triage({ deliverables: [item(10, 1, 1)], courses, today: TODAY, hoursAvailable: -3 });
    expect(r.hoursAvailable).toBe(0);
    expect(r.items[0].label).toBe("skip");
  });
});
