// POST /api/extract — optional AI reading of a syllabus (CLAUDE.md §6).
// Without ANTHROPIC_API_KEY this returns 501 and the browser uses the offline parser instead.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { connection } from "next/server";
import { z } from "zod";
import { todayISO } from "@/lib/dates";
import { DELIVERABLE_TYPES, MAX_TEXT_CHARS, normalizeExtraction } from "@/lib/extraction";

const RequestSchema = z.object({
  text: z.string().trim().min(1),
  courseNameHint: z.string().trim().max(200).optional(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  semesterStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// What we ask Claude to return. Strict shapes here; normalizeExtraction() re-checks values.
const OutputSchema = z.object({
  courseName: z.string().nullable(),
  gradeScale: z.number().nullable(),
  attendancePolicy: z.string().nullable(),
  deliverables: z.array(
    z.object({
      title: z.string(),
      type: z.enum(DELIVERABLE_TYPES),
      dueDate: z.string().nullable(),
      weight: z.number().nullable(),
    }),
  ),
});

// ---------- Simple in-memory rate limit (per server instance) ----------
const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 10;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear(); // keep memory bounded
  return false;
}

const error = (status: number, code: string, message: string) =>
  Response.json({ error: code, message }, { status });

/** GET tells the browser whether AI is switched on, so it can skip the POST (and its 501) if not. */
export async function GET() {
  await connection(); // read the env var per request, not once at build time
  return Response.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return error(501, "ai_unavailable", "AI extraction is not configured. Use the offline reader.");
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return error(429, "rate_limited", "Too many requests — try again in a few minutes.");
  }

  let body: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, "bad_request", "Send { text: string }.");
    body = parsed.data;
  } catch {
    return error(400, "bad_request", "Body must be JSON.");
  }

  if (body.text.length > MAX_TEXT_CHARS) {
    return error(413, "too_long", `Syllabus text is over ${MAX_TEXT_CHARS} characters.`);
  }

  const today = body.today ?? todayISO();
  const context = [
    `Today is ${today}.`,
    body.semesterStart
      ? `The semester's week 1 starts on ${body.semesterStart}; convert "Week N" to the Monday of that week.`
      : `No semester start date is known: if a deliverable is only given as "Week N" or "Session N", set dueDate to null.`,
    body.courseNameHint ? `The student calls this course "${body.courseNameHint}".` : "",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const client = new Anthropic();
    const response = await client.messages.parse({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 16000,
      system:
        "You read university course syllabi (English or Spanish) and list every graded deliverable. " +
        "For each one give a short title, its type, its due date as YYYY-MM-DD (or null if the syllabus " +
        "doesn't say), and its weight as a percentage of the final grade (or null). Dates without a year " +
        "belong to the current academic year. Skip participation and attendance as deliverables, but copy " +
        "the attendance rule into attendancePolicy. gradeScale is the maximum grade (e.g. 10 or 100), or null. " +
        "Never invent dates or weights.",
      messages: [
        {
          role: "user",
          content: `${context}\n\n<syllabus>\n${body.text}\n</syllabus>`,
        },
      ],
      output_config: { format: zodOutputFormat(OutputSchema) },
    });

    if (response.stop_reason === "refusal" || !response.parsed_output) {
      return error(502, "ai_failed", "The AI couldn't read this syllabus.");
    }
    const result = normalizeExtraction(response.parsed_output);
    if (!result) return error(502, "ai_failed", "The AI returned an unexpected format.");
    return Response.json({ source: "ai", result });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return error(503, "ai_busy", "The AI is busy right now.");
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${err.status}:`, err.message);
    } else {
      console.error("Extraction failed:", err);
    }
    return error(502, "ai_failed", "The AI request failed.");
  }
}
