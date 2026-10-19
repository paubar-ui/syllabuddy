import { describe, expect, it } from "vitest";
import { addDaysISO, daysBetween } from "./dates";
import { createDemoSemester, DEMO_AVAILABILITY } from "./demo";
import { generateSchedule } from "./scheduler";

const TODAY = "2026-10-19";

describe("demo semester", () => {
  const { courses, deliverables } = createDemoSemester(TODAY);

  it("has 4 courses with 4–6 deliverables each, weights adding to 100%", () => {
    expect(courses).toHaveLength(4);
    for (const c of courses) {
      const items = deliverables.filter((d) => d.courseId === c.id);
      expect(items.length).toBeGreaterThanOrEqual(4);
      expect(items.length).toBeLessThanOrEqual(6);
      expect(items.reduce((sum, d) => sum + d.weight, 0)).toBe(100);
    }
  });

  it("spreads due dates over the next 10 weeks", () => {
    for (const d of deliverables) {
      const days = daysBetween(TODAY, d.dueDate);
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(70);
      expect(d.estimatedHours).toBeGreaterThan(0);
    }
  });

  it("gives a Today with 2+ blocks and no warnings, whatever weekday you open it", () => {
    for (let i = 0; i < 7; i++) {
      const today = addDaysISO(TODAY, i);
      const demo = createDemoSemester(today);
      const { blocks, warnings } = generateSchedule({ ...demo, availability: DEMO_AVAILABILITY, today });
      expect(blocks.filter((b) => b.date === today).length).toBeGreaterThanOrEqual(2);
      expect(warnings).toEqual([]);
    }
  });
});
