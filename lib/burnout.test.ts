import { describe, expect, it } from "vitest";
import { addDaysISO } from "./dates";
import { detectBurnout } from "./burnout";

const TODAY = "2026-10-19";
const day = (n: number) => addDaysISO(TODAY, n);
const availability = (daysOff: string[] = []) => ({ maxMinutesPerDay: 180, daysOff });

/** History with `minutes` on each of the given day offsets. */
const history = (minutes: number, offsets: number[]) =>
  offsets.map((n) => ({ date: day(n), minutes, points: 0 }));

describe("detectBurnout — overwork (3+ days above your daily cap)", () => {
  it("triggers after 3 days in a row above the cap, ending yesterday", () => {
    expect(detectBurnout({ history: history(200, [-3, -2, -1]), availability: availability(), today: TODAY })).toEqual({
      triggered: true,
      reason: "overwork",
      days: 3,
    });
  });

  it("counts today when today is already over the cap", () => {
    const r = detectBurnout({ history: history(200, [-2, -1, 0]), availability: availability(), today: TODAY });
    expect(r).toMatchObject({ triggered: true, reason: "overwork" });
  });

  it("does not trigger after only 2 heavy days", () => {
    expect(detectBurnout({ history: history(200, [-2, -1]), availability: availability(), today: TODAY }).triggered).toBe(false);
  });

  it("exactly the cap is not 'above' the cap", () => {
    expect(detectBurnout({ history: history(180, [-3, -2, -1]), availability: availability(), today: TODAY }).triggered).toBe(false);
  });

  it("a lighter day in between breaks the run", () => {
    const h = [...history(200, [-4, -3, -1]), ...history(60, [-2])];
    expect(detectBurnout({ history: h, availability: availability(), today: TODAY }).triggered).toBe(false);
  });

  it("ignores a run that ended days ago", () => {
    expect(detectBurnout({ history: history(200, [-6, -5, -4]), availability: availability(), today: TODAY }).triggered).toBe(false);
  });
});

describe("detectBurnout — no rest (7 days of studying without a day off)", () => {
  it("triggers after 7 study days in a row", () => {
    expect(
      detectBurnout({ history: history(30, [-7, -6, -5, -4, -3, -2, -1]), availability: availability(), today: TODAY }),
    ).toEqual({ triggered: true, reason: "noRest", days: 7 });
  });

  it("6 days is fine", () => {
    expect(
      detectBurnout({ history: history(30, [-6, -5, -4, -3, -2, -1]), availability: availability(), today: TODAY }).triggered,
    ).toBe(false);
  });

  it("a day off resets the count, even if you studied a little that day", () => {
    const h = history(30, [-7, -6, -5, -4, -3, -2, -1]);
    expect(detectBurnout({ history: h, availability: availability([day(-4)]), today: TODAY }).triggered).toBe(false);
  });

  it("a day with zero minutes resets the count", () => {
    const h = [...history(30, [-8, -7, -6, -5, -3, -2, -1]), ...history(0, [-4])];
    expect(detectBurnout({ history: h, availability: availability(), today: TODAY }).triggered).toBe(false);
  });

  it("overwork wins when both apply", () => {
    const h = [...history(30, [-7, -6, -5, -4]), ...history(200, [-3, -2, -1])];
    expect(detectBurnout({ history: h, availability: availability(), today: TODAY })).toMatchObject({ reason: "overwork" });
  });
});

describe("detectBurnout — after protecting tonight", () => {
  it("stays quiet once today is a day off", () => {
    const h = history(200, [-3, -2, -1]);
    expect(detectBurnout({ history: h, availability: availability([TODAY]), today: TODAY }).triggered).toBe(false);
  });

  it("is quiet with no history at all", () => {
    expect(detectBurnout({ history: [], availability: availability(), today: TODAY }).triggered).toBe(false);
  });
});
