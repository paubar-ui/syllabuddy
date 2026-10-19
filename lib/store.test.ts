import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";

const TODAY = "2026-10-19";

describe("store", () => {
  beforeEach(() => useStore.getState().reset());

  it("works without localStorage (e.g. on the server)", () => {
    expect(typeof window).toBe("undefined");
    expect(useStore.getState().courses).toEqual([]);
  });

  it("loads the demo semester with a plan", () => {
    useStore.getState().loadDemo(TODAY);
    const s = useStore.getState();
    expect(s.isDemo).toBe(true);
    expect(s.courses).toHaveLength(4);
    expect(s.blocks.some((b) => b.date === TODAY)).toBe(true);
  });

  it("checking off today's blocks logs minutes, awards points and grows the streak", () => {
    useStore.getState().loadDemo(TODAY);
    const todays = useStore.getState().blocks.filter((b) => b.date === TODAY);
    for (const b of todays) useStore.getState().toggleBlock(b.id, TODAY);

    const s = useStore.getState();
    expect(s.gamification.points).toBeGreaterThan(0);
    expect(s.gamification.streak).toBe(1);
    const logged = s.deliverables.reduce((sum, d) => sum + d.loggedMinutes, 0);
    expect(logged).toBe(todays.reduce((sum, b) => sum + b.minutes, 0));
  });

  it("unchecking a block takes the points and minutes back", () => {
    useStore.getState().loadDemo(TODAY);
    const first = useStore.getState().blocks.find((b) => b.date === TODAY)!;
    useStore.getState().toggleBlock(first.id, TODAY);
    useStore.getState().toggleBlock(first.id, TODAY);
    const s = useStore.getState();
    expect(s.gamification.points).toBe(0);
    expect(s.blocks.find((b) => b.id === first.id)?.status).toBe("planned");
    expect(s.deliverables.every((d) => d.loggedMinutes === 0)).toBe(true);
  });

  it("setCourses computes estimates; a new effort level updates them", () => {
    useStore.getState().setCourses(
      [{ id: "c1", name: "Stats", color: "#000", effort: 3, gradeScale: 10 }],
      [{ id: "d1", courseId: "c1", title: "Final", type: "final", dueDate: "2026-12-01", weight: 40, loggedMinutes: 0, done: false }],
    );
    expect(useStore.getState().deliverables[0].estimatedHours).toBe(18);
    useStore.getState().updateCourse("c1", { effort: 5 });
    expect(useStore.getState().deliverables[0].estimatedHours).toBe(29);
  });
});
