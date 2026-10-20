// The shape of "what we found in a syllabus", shared by the AI route and the offline parser.
// Every value is validated with zod; invalid deliverables are dropped instead of crashing.
import { z } from "zod";
import type { DeliverableType } from "./types";

/** Longest syllabus text we send to the AI route. */
export const MAX_TEXT_CHARS = 60_000;

export const DELIVERABLE_TYPES = [
  "exam",
  "midterm",
  "final",
  "essay",
  "project",
  "presentation",
  "quiz",
  "homework",
  "reading",
  "other",
] as const satisfies readonly DeliverableType[];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00`).getTime()));

export const extractedDeliverableSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(DELIVERABLE_TYPES).catch("other"),
  dueDate: isoDate.nullable().catch(null),
  weight: z.number().min(0).max(100).nullable().catch(null),
  /** "Due in Session 15": the date can come from the Blackboard calendar (V2-3). */
  sessionRef: z.number().int().min(1).max(60).optional().catch(undefined),
});

export type ExtractedDeliverable = z.infer<typeof extractedDeliverableSchema>;

export interface ExtractedSyllabus {
  courseName: string | null;
  gradeScale: number | null;
  attendancePolicy: string | null;
  deliverables: ExtractedDeliverable[];
}

const syllabusSchema = z.object({
  courseName: z.string().trim().min(1).max(200).nullable().catch(null),
  gradeScale: z.number().positive().max(1000).nullable().catch(null),
  attendancePolicy: z.string().trim().max(2000).nullable().catch(null),
  deliverables: z.array(z.unknown()).catch([]),
});

/** Validates untrusted data (e.g. AI output). Returns null only if it isn't an object at all. */
export function normalizeExtraction(raw: unknown): ExtractedSyllabus | null {
  const parsed = syllabusSchema.safeParse(raw);
  if (!parsed.success) return null;
  const deliverables = parsed.data.deliverables.flatMap((item) => {
    const d = extractedDeliverableSchema.safeParse(item);
    return d.success ? [d.data] : [];
  });
  return { ...parsed.data, deliverables };
}
