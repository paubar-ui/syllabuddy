// POST /api/exam-day — optional AI explanation of one exam prep day (V2-6).
// Without ANTHROPIC_API_KEY this returns 501; the plan built from your pasted content works on its own.
import Anthropic from "@anthropic-ai/sdk";
import { connection } from "next/server";
import { z } from "zod";
import { createRateLimiter } from "@/lib/rateLimit";
import { unauthorized, userIdFrom } from "@/lib/serverAuth";

const short = z.string().trim().max(300);
const RequestSchema = z.object({
  course: short,
  exam: short,
  kind: z.enum(["setup", "core", "mock", "repair", "review"]),
  title: short,
  goal: short,
  tasks: z.array(short).max(12),
  examFormat: short.optional(),
  minutes: z.number().int().min(0).max(600).optional(),
});

const rateLimited = createRateLimiter(20, 10 * 60 * 1000);
const error = (status: number, code: string, message: string) => Response.json({ error: code, message }, { status });

/** GET tells the browser whether AI is switched on, so it only shows the button when it is. */
export async function GET(request: Request) {
  await connection(); // read the env var per request, not once at build time
  if (!(await userIdFrom(request))) return unauthorized();
  return Response.json({ available: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return unauthorized();
  if (!process.env.ANTHROPIC_API_KEY) {
    return error(501, "ai_unavailable", "AI explanations are not configured.");
  }
  if (rateLimited(userId)) return error(429, "rate_limited", "Too many requests — try again in a few minutes.");

  let body: z.infer<typeof RequestSchema>;
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, "bad_request", "Unexpected request format.");
    body = parsed.data;
  } catch {
    return error(400, "bad_request", "Body must be JSON.");
  }

  const day = [
    `Course: ${body.course}. Exam: ${body.exam}${body.examFormat ? ` (format: ${body.examFormat})` : ""}.`,
    `Today's study session (${body.kind}${body.minutes ? `, about ${body.minutes} minutes` : ""}): ${body.title}.`,
    `Goal: ${body.goal}`,
    `Tasks:\n${body.tasks.map((t) => `- ${t}`).join("\n")}`,
  ].join("\n");

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: 1200,
      system:
        "You are a calm, practical study coach for university students. Given one day of an exam prep plan, " +
        "explain in at most 150 words how to work through it: what to focus on in each task, how to check " +
        "understanding, and a sensible order. Plain text, short paragraphs, no headings. Don't add new topics.",
      messages: [{ role: "user", content: day }],
    });
    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (response.stop_reason === "refusal" || !text) return error(502, "ai_failed", "No explanation this time.");
    return Response.json({ description: text });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return error(503, "ai_busy", "The AI is busy right now.");
    console.error("Exam day explanation failed:", err instanceof Anthropic.APIError ? err.message : err);
    return error(502, "ai_failed", "The AI request failed.");
  }
}
