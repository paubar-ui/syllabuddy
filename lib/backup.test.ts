import { describe, expect, it } from "vitest";
import { createBackup, parseBackup, type BackupData } from "./backup";
import { createDemoSemester, DEMO_AVAILABILITY } from "./demo";
import { initialGamification } from "./gamification";

const demo = createDemoSemester("2026-10-19");
const data: BackupData = {
  ...demo,
  blocks: [{ id: "b1", deliverableId: demo.deliverables[0].id, date: "2026-10-19", minutes: 50, status: "done" }],
  availability: DEMO_AVAILABILITY,
  pace: { byType: { essay: 1.2 }, byCourse: {} },
  gamification: initialGamification(),
  isDemo: true,
  focusMinutes: { b1: 25 },
  displayName: "Paula",
  taskChecks: {},
  blockNotes: {},
};

describe("backup", () => {
  it("round-trips through export and import", () => {
    const text = createBackup(data, new Date("2026-10-19T10:00:00Z"));
    expect(parseBackup(text)).toEqual({ ok: true, data });
  });

  it("rejects text that isn't JSON", () => {
    expect(parseBackup("not json")).toEqual({ ok: false, error: "This file isn't valid JSON." });
  });

  it("rejects other JSON files", () => {
    expect(parseBackup(JSON.stringify({ hello: "world" }))).toMatchObject({
      ok: false,
      error: "This doesn't look like a Syllabuddy backup file.",
    });
  });

  it("rejects a damaged Syllabuddy backup instead of loading bad data", () => {
    const broken = JSON.parse(createBackup(data, new Date()));
    broken.data.deliverables[0].weight = 500;
    expect(parseBackup(JSON.stringify(broken))).toMatchObject({ ok: false, error: expect.stringContaining("damaged") });
  });

  it("fills in fields that older backups may not have", () => {
    const old = JSON.parse(createBackup(data, new Date()));
    delete old.data.focusMinutes;
    const r = parseBackup(JSON.stringify(old));
    expect(r.ok && r.data.focusMinutes).toEqual({});
  });
});
