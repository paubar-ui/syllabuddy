import { describe, expect, it } from "vitest";
import { availabilityFromForm, formFromAvailability, toHours, toMinutes } from "./availability";

describe("availability form", () => {
  it("converts between hours text and minutes", () => {
    expect(toHours(150)).toBe("2.5");
    expect(toMinutes("2,5")).toBe(150);
    expect(toMinutes("")).toBe(0);
    expect(toMinutes("-1")).toBe(0);
    expect(toMinutes("abc")).toBe(0);
    expect(toMinutes("30")).toBe(16 * 60);
  });

  it("round-trips an availability, keeping days off", () => {
    const a = { minutesPerWeekday: [60, 90, 120, 0, 30, 0, 180] as [number, number, number, number, number, number, number], maxMinutesPerDay: 240, daysOff: ["2026-10-20"] };
    expect(availabilityFromForm(formFromAvailability(a), a.daysOff)).toEqual({ ok: true, availability: a });
  });

  it("refuses a week with no study time and defaults a missing cap", () => {
    expect(availabilityFromForm({ hours: Array(7).fill("0"), maxHours: "4" }, [])).toEqual({
      ok: false,
      error: "Add some study time on at least one day.",
    });
    const r = availabilityFromForm({ hours: ["1", "", "", "", "", "", ""], maxHours: "" }, []);
    expect(r.ok && r.availability.maxMinutesPerDay).toBe(300);
  });
});
