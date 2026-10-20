"use client";
// Keeps your plan in Supabase (table planner_state, one private row per user):
// load it when you log in, save every change straight away, and never lose the last change —
// not even when you leave or reload the page while a save is still on its way.
import { useSession } from "./session";
import { dataOf, useStore, type Data } from "./store";
import { getSupabase, supabaseKey, supabaseUrl } from "./supabase";

/** Older versions of Syllabuddy kept the plan in this browser. It's moved into your account once. */
const LEGACY_KEY = "syllabuddy";

let userId: string | null = null;
let accessToken: string | null = null;
let unsubscribe: (() => void) | null = null;
let dirty = false;
let saving: Promise<void> | null = null;

/** Kept up to date by SessionProvider; needed for the last-chance save when a page closes. */
export function setAccessToken(token: string | null) {
  accessToken = token;
}

function readLegacyPlan(): Partial<Data> | null {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    const state = raw ? JSON.parse(raw)?.state : null;
    return state && Array.isArray(state.courses) && state.courses.length > 0 ? state : null;
  } catch {
    return null;
  }
}

function clearLegacyPlan() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage blocked: nothing to clear.
  }
}

const row = (id: string) => ({ user_id: id, state: dataOf(useStore.getState()), updated_at: new Date().toISOString() });

async function saveNow(): Promise<void> {
  const sb = getSupabase();
  if (!sb || !userId) return;
  const { error } = await sb.from("planner_state").upsert(row(userId));
  if (error) console.warn("Couldn't save your plan:", error.message);
}

/** Saves straight away; changes made during a save are saved right after it. */
function requestSave() {
  dirty = true;
  saving ??= (async () => {
    while (dirty) {
      dirty = false;
      await saveNow();
    }
    saving = null;
  })();
}

/** Waits until every change so far is saved (call before logging out or after the main action). */
export async function flushPlan(): Promise<void> {
  while (saving) await saving;
}

/**
 * Last chance when the page is being closed or reloaded with a save still pending:
 * a keepalive request finishes even after the page is gone.
 */
function saveOnExit() {
  if (!userId || !accessToken || !supabaseUrl || !supabaseKey || (!saving && !dirty)) return;
  try {
    void fetch(`${supabaseUrl}/rest/v1/planner_state?on_conflict=user_id`, {
      method: "POST",
      keepalive: true,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row(userId)),
    });
  } catch {
    // Too large for a keepalive request: the regular save has the best chance.
  }
}

if (typeof window !== "undefined") window.addEventListener("pagehide", saveOnExit);

/** Loads the user's plan from Supabase and starts saving changes. */
export async function startPlanSync(id: string): Promise<void> {
  if (userId === id) return; // already loading or loaded for this user
  stopPlanSync();
  const sb = getSupabase();
  if (!sb) return;
  userId = id;
  useSession.setState({ plan: "loading" });

  const { data, error } = await sb.from("planner_state").select("state").eq("user_id", id).maybeSingle();
  if (userId !== id) return; // logged out meanwhile
  if (error) {
    useSession.setState({ plan: "error" });
    return;
  }

  const legacy = data ? null : readLegacyPlan();
  useStore.getState().replaceAll((data?.state as Partial<Data>) ?? legacy ?? {});
  if (!data) await saveNow(); // create your row (with the old in-browser plan, if there was one)
  clearLegacyPlan();

  unsubscribe = useStore.subscribe(requestSave);
  useSession.setState({ plan: "ready" });
}

/** Stops saving and clears the plan from memory (after logout). */
export function stopPlanSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  dirty = false;
  userId = null;
  useStore.getState().reset();
  useSession.setState({ plan: "idle" });
}
