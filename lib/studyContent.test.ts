import { describe, expect, it } from "vitest";
import { topicsFromText } from "./studyContent";

describe("topicsFromText (pasted study content)", () => {
  it("one topic per line, with details after a colon, bullets and numbers removed", () => {
    const topics = topicsFromText(
      "- Probability: Bayes, independence\n2) Random variables\n\n• Hypothesis testing — p-values; t-tests",
      "2026-10-21",
    );
    expect(topics).toEqual([
      { number: 1, topic: "Probability", concepts: ["Bayes", "independence"], readings: [], problemSets: [] },
      { number: 2, topic: "Random variables", concepts: [], readings: [], problemSets: [] },
      { number: 3, topic: "Hypothesis testing", concepts: ["p-values", "t-tests"], readings: [], problemSets: [] },
    ]);
  });

  it("reads a session list with readings and problem sets", () => {
    const topics = topicsFromText(
      "Session 1: Welfare — Pareto efficiency. Ch. 1\nSession 2: Externalities. PS1",
      "2026-10-21",
    );
    expect(topics.map((t) => [t.number, t.topic])).toEqual([
      [1, "Welfare"],
      [2, "Externalities"],
    ]);
    expect(topics[1].problemSets).toEqual(["PS1"]);
    expect(topics[0]).not.toHaveProperty("date");
  });

  it("ignores empty input", () => {
    expect(topicsFromText("  \n \n", "2026-10-21")).toEqual([]);
  });
});
