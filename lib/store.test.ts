import { beforeEach, describe, expect, it } from "vitest";
import { remainingMinutes } from "./scheduler";
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

  it("focus minutes count once: a full session + checking off doesn't double the minutes", () => {
    useStore.getState().loadDemo(TODAY);
    const block = useStore.getState().blocks.find((b) => b.date === TODAY && b.minutes > 25)!;
    useStore.getState().logFocus(block.id, 25, true, TODAY);
    let s = useStore.getState();
    const afterFocus = s.gamification.points;
    expect(afterFocus).toBeGreaterThanOrEqual(10 + 5); // focus bonus + at least 5 for 25 min
    expect(s.blocks.find((b) => b.id === block.id)?.status).toBe("planned");

    useStore.getState().toggleBlock(block.id, TODAY);
    s = useStore.getState();
    expect(s.deliverables.find((d) => d.id === block.deliverableId)?.loggedMinutes).toBe(block.minutes);
  });

  it("enough focus time checks the block off by itself", () => {
    useStore.getState().loadDemo(TODAY);
    const block = useStore.getState().blocks.find((b) => b.date === TODAY)!;
    useStore.getState().logFocus(block.id, block.minutes, false, TODAY);
    expect(useStore.getState().blocks.find((b) => b.id === block.id)?.status).toBe("done");
  });

  it("marking a deliverable done learns your pace, gives +50 and removes its blocks", () => {
    useStore.getState().loadDemo(TODAY);
    const essays = useStore.getState().deliverables.filter((x) => x.type === "essay");
    const [d, other] = [essays[0], essays[1]];
    useStore.getState().updateDeliverable(d.id, { loggedMinutes: Math.round(d.estimatedHours * 60 * 1.5) });
    useStore.getState().setDeliverableDone(d.id, true, TODAY);

    const s = useStore.getState();
    expect(s.gamification.points).toBe(50);
    expect(s.pace.byType.essay).toBeGreaterThan(1);
    expect(s.blocks.some((b) => b.deliverableId === d.id && b.status === "planned")).toBe(false);
    // Other essays now get more time.
    expect(s.deliverables.find((x) => x.id === other.id)!.estimatedHours).toBeGreaterThan(other.estimatedHours);

    useStore.getState().setDeliverableDone(d.id, false, TODAY);
    expect(useStore.getState().gamification.points).toBe(0);
  });

  it("stores and clears scores", () => {
    useStore.getState().loadDemo(TODAY);
    const id = useStore.getState().deliverables[0].id;
    useStore.getState().setScore(id, 7.5);
    expect(useStore.getState().deliverables[0].score).toBe(7.5);
    useStore.getState().setScore(id, undefined);
    expect("score" in useStore.getState().deliverables[0]).toBe(false);
  });

  it("replans missed blocks from past days, once", () => {
    useStore.getState().loadDemo("2026-10-17");
    const pastPlanned = useStore.getState().blocks.filter((b) => b.date < TODAY && b.status === "planned");
    expect(pastPlanned.length).toBeGreaterThan(0);

    useStore.getState().replanIfNeeded(TODAY);
    const s = useStore.getState();
    expect(s.blocks.filter((b) => b.date < TODAY && b.status === "planned")).toEqual([]);
    expect(s.blocks.filter((b) => b.status === "missed")).toHaveLength(pastPlanned.length);
    expect(s.lastReplan).toEqual({
      date: TODAY,
      blocks: pastPlanned.length,
      minutes: pastPlanned.reduce((sum, b) => sum + b.minutes, 0),
    });
    // The missed time is back in the plan: work due after today is fully planned again from today.
    for (const d of s.deliverables.filter((x) => !x.done && x.dueDate > TODAY)) {
      const planned = s.blocks
        .filter((b) => b.deliverableId === d.id && b.status === "planned")
        .reduce((sum, b) => sum + b.minutes, 0);
      expect(planned).toBe(remainingMinutes(d));
    }

    const before = useStore.getState().lastReplan;
    useStore.getState().replanIfNeeded(TODAY);
    expect(useStore.getState().lastReplan).toBe(before);
  });

  it("protect tonight makes today a day off and clears today's plan", () => {
    useStore.getState().loadDemo(TODAY);
    useStore.getState().protectTonight(TODAY);
    const s = useStore.getState();
    expect(s.availability.daysOff).toContain(TODAY);
    expect(s.blocks.filter((b) => b.date === TODAY && b.status === "planned")).toEqual([]);
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
