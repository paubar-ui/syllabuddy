// Export / import of your data as a JSON file (Settings).
// Imports are validated with zod, so a broken or foreign file can never corrupt the app.
import { z } from "zod";
import { DELIVERABLE_TYPES } from "./extraction";

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const effort = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);

const dataSchema = z.object({
  courses: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      color: z.string(),
      effort,
      targetGrade: z.number().optional(),
      gradeScale: z.number().positive(),
      attendancePolicy: z.string().optional(),
    }),
  ),
  deliverables: z.array(
    z.object({
      id: z.string(),
      courseId: z.string(),
      title: z.string(),
      type: z.enum(DELIVERABLE_TYPES),
      dueDate: isoDay,
      weight: z.number().min(0).max(100),
      score: z.number().optional(),
      estimatedHours: z.number().min(0),
      loggedMinutes: z.number().min(0),
      done: z.boolean(),
    }),
  ),
  blocks: z.array(
    z.object({
      id: z.string(),
      deliverableId: z.string(),
      date: isoDay,
      minutes: z.number().positive(),
      status: z.enum(["planned", "done", "missed"]),
    }),
  ),
  availability: z.object({
    minutesPerWeekday: z.tuple([z.number(), z.number(), z.number(), z.number(), z.number(), z.number(), z.number()]),
    maxMinutesPerDay: z.number().positive(),
    daysOff: z.array(isoDay),
  }),
  pace: z.object({
    byType: z.partialRecord(z.enum(DELIVERABLE_TYPES), z.number()),
    byCourse: z.record(z.string(), z.number()),
  }),
  gamification: z.object({
    points: z.number(),
    streak: z.number(),
    bestStreak: z.number(),
    streakFreezes: z.number(),
    lastCompletedDate: isoDay.optional(),
    lastCheckedDate: isoDay.optional(),
    mascotTone: z.enum(["gentle", "coach", "savage"]),
    history: z.array(z.object({ date: isoDay, minutes: z.number(), points: z.number() })),
  }),
  isDemo: z.boolean().default(false),
  focusMinutes: z.record(z.string(), z.number()).default({}),
  displayName: z.string().max(40).default(""),
});

export type BackupData = z.infer<typeof dataSchema>;

const backupSchema = z.object({
  app: z.literal("syllabuddy"),
  version: z.literal(1),
  exportedAt: z.string(),
  data: dataSchema,
});

export function createBackup(data: BackupData, now: Date): string {
  return JSON.stringify({ app: "syllabuddy", version: 1, exportedAt: now.toISOString(), data }, null, 2);
}

export type ParseResult = { ok: true; data: BackupData } | { ok: false; error: string };

export function parseBackup(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "This file isn't valid JSON." };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    const looksLikeOurs = typeof json === "object" && json !== null && (json as { app?: unknown }).app === "syllabuddy";
    return {
      ok: false,
      error: looksLikeOurs
        ? "This Syllabuddy backup is damaged or from an unsupported version."
        : "This doesn't look like a Syllabuddy backup file.",
    };
  }
  return { ok: true, data: parsed.data.data };
}
