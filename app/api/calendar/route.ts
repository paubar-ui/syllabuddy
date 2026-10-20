// POST /api/calendar — reads your Blackboard calendar share link (V2-3).
// The browser can't fetch another site's calendar itself, so this server route does it:
// logged-in users only, https only, public addresses only, 10-second timeout, 2 MB limit.
// The link is a private secret: it is never logged or stored here.
import { z } from "zod";
import { normalizeCalendarUrl } from "@/lib/blackboard";
import { createRateLimiter } from "@/lib/rateLimit";
import { checkPublicHttpsUrl } from "@/lib/safeUrl";
import { supabaseKey, supabaseUrl } from "@/lib/supabase";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const RequestSchema = z.object({ url: z.string().max(2000) });
const rateLimited = createRateLimiter(20, 10 * 60 * 1000);

const error = (status: number, code: string, message: string) => Response.json({ error: code, message }, { status });

/** Who is asking: the Supabase user behind the login token, or null. */
async function userIdFrom(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ") || !supabaseUrl || !supabaseKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseKey, Authorization: auth },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: string };
    return user.id ?? null;
  } catch {
    return null;
  }
}

async function readLimited(res: Response): Promise<string | null> {
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) return null;
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
  const userId = await userIdFrom(request);
  if (!userId) return error(401, "login_required", "Please log in again.");
  if (rateLimited(userId)) return error(429, "rate_limited", "Too many tries — wait a few minutes and try again.");

  let raw: string;
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) return error(400, "bad_request", "Send { url }.");
    raw = parsed.data.url;
  } catch {
    return error(400, "bad_request", "Body must be JSON.");
  }
  const normalized = normalizeCalendarUrl(raw);
  if (!normalized)
    return error(400, "bad_link", "That doesn't look like a calendar link. It should start with https://.");

  try {
    let target = normalized;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await checkPublicHttpsUrl(target);
      if (!url) return error(400, "bad_link", "We can only read public https calendar links.");
      const res = await fetch(url, {
        redirect: "manual",
        headers: { Accept: "text/calendar, text/plain;q=0.8, */*;q=0.1", "User-Agent": "Syllabuddy calendar sync" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        target = new URL(res.headers.get("location")!, url).toString();
        continue;
      }
      if (res.status === 429 || res.status >= 500) {
        return error(503, "link_busy", "The calendar server is busy right now. Try again in a little while.");
      }
      if (!res.ok) {
        return error(
          502,
          "link_failed",
          "Blackboard didn't share the calendar — the link may have expired. Copy a fresh link.",
        );
      }
      const text = await readLimited(res);
      if (text === null) return error(413, "too_big", "That calendar is too big (over 2 MB).");
      if (!text.includes("BEGIN:VCALENDAR")) {
        return error(
          422,
          "not_a_calendar",
          "That link doesn't open a calendar. Check you copied the calendar share link.",
        );
      }
      return Response.json({ text });
    }
    return error(502, "link_failed", "The link redirects too many times.");
  } catch {
    // Deliberately not logging the link: it's private.
    return error(502, "link_failed", "We couldn't reach that calendar right now. Try again later.");
  }
}
