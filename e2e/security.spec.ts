// Data isolation, proven against the real Supabase project with two fresh users A and B
// (V2-8). Uses only the public (anon) key — exactly what any visitor's browser has.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

function supabaseEnv() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL as string,
    key: (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  };
}

const { url, key } = supabaseEnv();
const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const email = (tag: string) => `qa-sec-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
const week = "2026-10-19";

async function newUser(tag: string): Promise<{ sb: SupabaseClient; id: string }> {
  const sb = client();
  const { data, error } = await sb.auth.signUp({ email: email(tag), password: "Qa-test-password-123" });
  expect(error, `sign up ${tag}`).toBeNull();
  expect(data.session, `"Confirm email" must be off so ${tag} is signed in straight away`).not.toBeNull();
  return { sb, id: data.user!.id };
}

test.describe.configure({ mode: "serial" });

test("data isolation: A can't read or change B's plan; leaderboard only after connecting; logged-out is rejected", async ({
  request,
}) => {
  // Database rules don't depend on screen size: run once.
  test.skip(test.info().project.name !== "desktop", "runs on desktop only");
  const A = await newUser("a");
  const B = await newUser("b");

  // --- plans (courses, deadlines, everything) are private ---
  const secret = { courses: [{ id: "c1", name: "B's secret course" }], deliverables: [{ title: "B's secret deadline" }] };
  expect((await B.sb.from("planner_state").upsert({ user_id: B.id, state: secret })).error).toBeNull();
  const aReadsB = await A.sb.from("planner_state").select("*").eq("user_id", B.id);
  expect(aReadsB.data, "A can't read B's plan").toEqual([]);
  const aReadsAll = await A.sb.from("planner_state").select("user_id");
  expect(aReadsAll.data?.every((r) => r.user_id === A.id), "A only ever sees her own row").toBe(true);
  await A.sb.from("planner_state").update({ state: {} }).eq("user_id", B.id);
  const bStill = await B.sb.from("planner_state").select("state").eq("user_id", B.id).single();
  expect(JSON.stringify(bStill.data?.state), "A can't overwrite B's plan").toContain("B's secret course");
  const aCreatesForB = await A.sb.from("planner_state").insert({ user_id: B.id, state: {} });
  expect(aCreatesForB.error, "A can't create a row for B").not.toBeNull();
  await A.sb.from("planner_state").delete().eq("user_id", B.id);
  expect((await B.sb.from("planner_state").select("user_id").eq("user_id", B.id)).data, "A can't delete B's plan").toHaveLength(1);

  // --- leaderboard: aggregates of connected users only, through the server-side function ---
  await A.sb.rpc("ensure_my_profile", { p_display_name: "Ana QA" });
  const codeB = (await B.sb.rpc("ensure_my_profile", { p_display_name: "Ben QA" })).data as string;
  await B.sb.from("weekly_stats").upsert({ user_id: B.id, week, points: 42, streak: 2, minutes: 90 });
  const before = await A.sb.rpc("my_leaderboard", { p_week: week });
  expect(before.error, "the my_leaderboard() function exists (run supabase/schema.sql)").toBeNull();
  expect((before.data as { display_name: string }[]).map((r) => r.display_name), "B isn't on A's board before connecting").toEqual([
    "Ana QA",
  ]);
  expect((await A.sb.from("profiles").select("id").eq("id", B.id)).data, "A can't read B's profile directly").toEqual([]);
  expect((await A.sb.from("weekly_stats").select("*").eq("user_id", B.id)).data, "A can't read B's stats directly").toEqual(
    [],
  );

  expect((await A.sb.rpc("add_friend_by_code", { p_code: codeB })).error).toBeNull();
  const after = (await A.sb.rpc("my_leaderboard", { p_week: week })).data as Record<string, unknown>[];
  const ben = after.find((r) => r.display_name === "Ben QA");
  expect(ben, "B appears after A enters B's invite code").toMatchObject({ points: 42, streak: 2, minutes: 90 });
  expect(Object.keys(ben!).sort(), "only display name and weekly totals (+ id, is_me)").toEqual([
    "display_name",
    "id",
    "is_me",
    "minutes",
    "points",
    "streak",
  ]);
  expect((await A.sb.from("planner_state").select("*").eq("user_id", B.id)).data, "being friends doesn't open B's plan").toEqual(
    [],
  );

  // --- logged out: no data, no leaderboard, no API, no protected pages ---
  const anon = client();
  expect((await anon.from("planner_state").select("*")).data ?? [], "anonymous: no plans").toEqual([]);
  expect((await anon.from("profiles").select("*")).data ?? [], "anonymous: no profiles").toEqual([]);
  expect((await anon.rpc("my_leaderboard", { p_week: week })).error, "anonymous: no leaderboard").not.toBeNull();
  expect((await request.post("/api/calendar", { data: { url: "https://example.com/a.ics" } })).status()).toBe(401);
  expect((await request.get("/api/exam-day")).status()).toBe(401);
  expect((await request.post("/api/exam-day", { data: {} })).status()).toBe(401);
  for (const path of ["/app", "/courses", "/plan", "/settings", "/buddies"]) {
    const res = await request.get(path, { maxRedirects: 0 });
    expect(res.status(), `${path} redirects on the server`).toBe(307);
    expect(res.headers().location, `${path} → /login`).toContain("/login?next=");
  }

  // Clean up what we can with user rights.
  await A.sb.rpc("delete_my_data");
  await B.sb.rpc("delete_my_data");
  await A.sb.from("planner_state").delete().eq("user_id", A.id);
  await B.sb.from("planner_state").delete().eq("user_id", B.id);
});
