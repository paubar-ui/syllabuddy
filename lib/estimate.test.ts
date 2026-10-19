import { describe, expect, it } from "vitest";
import { estimateHours, paceFactor, roundToHalf, weightFactor } from "./estimate";

describe("weightFactor", () => {
  it("scales with weight and is clamped to 0.5–2", () => {
    expect(weightFactor(0)).toBe(0.5);
    expect(weightFactor(20)).toBe(1);
    expect(weightFactor(40)).toBe(1.5);
    expect(weightFactor(100)).toBe(2);
  });
});

describe("paceFactor", () => {
  it("defaults to 1 and multiplies type and course ratios", () => {
    expect(paceFactor(undefined, "essay")).toBe(1);
    expect(paceFactor({ byType: { essay: 1.5 }, byCourse: { c1: 1.2 } }, "essay", "c1")).toBeCloseTo(1.8);
  });

  it("is clamped to 0.5–2.5", () => {
    expect(paceFactor({ byType: { essay: 3 }, byCourse: { c1: 2 } }, "essay", "c1")).toBe(2.5);
    expect(paceFactor({ byType: { quiz: 0.2 }, byCourse: {} }, "quiz")).toBe(0.5);
  });
});

describe("estimateHours", () => {
  it("applies base × weight × effort", () => {
    // 12 × 1.25 × 1.0
    expect(estimateHours({ type: "exam", weight: 30, effort: 3 })).toBe(15);
    // 12 × 1.5 × 1.6 = 28.8 → 29
    expect(estimateHours({ type: "final", weight: 40, effort: 5 })).toBe(29);
    // 2 × 0.75 × 0.8 = 1.2 → 1
    expect(estimateHours({ type: "homework", weight: 10, effort: 2 })).toBe(1);
  });

  it("uses the learned pace", () => {
    const pace = { byType: { essay: 1.5 }, byCourse: {} };
    // 8 × 1.125 × 1.0 × 1.5 = 13.5
    expect(estimateHours({ type: "essay", weight: 25, effort: 3, pace })).toBe(13.5);
  });

  it("rounds to the nearest half hour and never returns less than 0.5", () => {
    expect(roundToHalf(1.24)).toBe(1);
    expect(roundToHalf(1.26)).toBe(1.5);
    expect(estimateHours({ type: "reading", weight: 0, effort: 1 })).toBe(0.5);
  });
});
