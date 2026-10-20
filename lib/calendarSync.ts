"use client";
// Reading the Blackboard calendar from the browser (V2-3): a share link goes through our
// /api/calendar route (with your login token); an uploaded .ics file is read right here.
import { groupClassSessions, normalizeCalendarUrl } from "./blackboard";
import { parseIcs } from "./calendarIcs";
import { useStore } from "./store";
import { getSupabase } from "./supabase";

export type SyncResult = { ok: true; courses: number; sessions: number } | { ok: false; message: string };

const MAX_FILE_BYTES = 2 * 1024 * 1024;

function save(text: string, source: { url?: string; fileName?: string }): SyncResult {
  const courses = groupClassSessions(parseIcs(text));
  if (courses.length === 0) {
    return {
      ok: false,
      message: "We read the calendar but found no class sessions in it (only deadlines or all-day events).",
    };
  }
  useStore.getState().setCalendar({ ...source, lastSync: new Date().toISOString(), courses });
  return { ok: true, courses: courses.length, sessions: courses.reduce((n, c) => n + c.sessions.length, 0) };
}

export async function syncFromUrl(input: string): Promise<SyncResult> {
  const url = normalizeCalendarUrl(input);
  if (!url)
    return {
      ok: false,
      message: "That doesn't look like a calendar link. It should start with https:// or webcal://.",
    };
  const token = (await getSupabase()?.auth.getSession())?.data.session?.access_token;
  if (!token) return { ok: false, message: "Please log in again, then retry." };
  try {
    const res = await fetch("/api/calendar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
    const json = (await res.json()) as { text?: string; message?: string };
    if (!res.ok || !json.text) return { ok: false, message: json.message ?? "We couldn't read that calendar." };
    return save(json.text, { url });
  } catch {
    return { ok: false, message: "We couldn't reach the calendar — check your internet connection." };
  }
}

export async function syncFromFile(file: File): Promise<SyncResult> {
  if (file.size > MAX_FILE_BYTES) return { ok: false, message: "That file is too big (over 2 MB)." };
  const text = await file.text();
  if (!text.includes("BEGIN:VCALENDAR")) return { ok: false, message: "That file isn't a calendar (.ics) file." };
  return save(text, { fileName: file.name });
}

/** Re-reads the saved link; on failure keeps the last good data and shows a friendly message. */
export async function resync(): Promise<SyncResult> {
  const url = useStore.getState().calendar?.url;
  if (!url) return { ok: false, message: "There's no calendar link to re-read." };
  const result = await syncFromUrl(url);
  if (!result.ok) {
    useStore
      .getState()
      .setCalendarError(
        `Your Blackboard calendar link stopped working (${result.message}) Paste a fresh link on Plan.`,
      );
  }
  return result;
}
