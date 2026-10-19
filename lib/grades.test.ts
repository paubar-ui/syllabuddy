import { describe, expect, it } from "vitest";
import { requiredScore } from "./grades";

describe("requiredScore", () => {
  it("works out the average needed on the remaining work", () => {
    // Midterm 30% → 6/10. Need 7 overall: (7×100 − 180) / 70 = 7.43
    const r = requiredScore([{ weight: 30, score: 6 }, { weight: 30 }, { weight: 40 }], 7, 10);
    expect(r).toEqual({
      needed: 7.43,
      possible: true,
      alreadySecured: false,
      currentAverage: 6,
      maxReachable: 8.8,
      remainingWeight: 70,
    });
  });

  it("with nothing graded yet, you need your target everywhere", () => {
    expect(requiredScore([{ weight: 40 }, { weight: 60 }], 75, 100).needed).toBe(75);
  });

  it("says when the target is out of reach", () => {
    const r = requiredScore([{ weight: 60, score: 3 }, { weight: 40 }], 8, 10);
    expect(r.possible).toBe(false);
    expect(r.needed).toBe(15.5);
    expect(r.maxReachable).toBe(5.8);
  });

  it("says when the target is already secured", () => {
    const r = requiredScore([{ weight: 80, score: 10 }, { weight: 20 }], 7, 10);
    expect(r.alreadySecured).toBe(true);
    expect(r.needed).toBe(0);
    expect(r.possible).toBe(true);
  });

  it("handles a fully graded course", () => {
    const passed = requiredScore([{ weight: 50, score: 8 }, { weight: 50, score: 6 }], 7, 10);
    expect(passed).toMatchObject({ needed: 0, possible: true, alreadySecured: true, remainingWeight: 0 });
    const missed = requiredScore([{ weight: 50, score: 6 }, { weight: 50, score: 6 }], 7, 10);
    expect(missed).toMatchObject({ possible: false, alreadySecured: false, maxReachable: 6 });
  });

  it("treats weights that don't add up to 100 proportionally", () => {
    // 45% + 45% (missing 10% participation): 8 on the first half → need 6 on the rest for 7.
    expect(requiredScore([{ weight: 45, score: 8 }, { weight: 45 }], 7, 10).needed).toBe(6);
  });
});
