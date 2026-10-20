// Checks supabase/schema.sql in an in-memory Postgres (PGlite) with a small stand-in for
// Supabase's auth schema, then tests the Row Level Security rules as different users.
// Run with: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";

const schema = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const C = "00000000-0000-0000-0000-00000000000c";

// --- Supabase stand-ins ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  insert into auth.users values ('${A}'), ('${B}'), ('${C}');
`);
await db.exec(schema);
await db.exec(schema); // must be safe to run twice
await db.exec(`grant usage on schema public to authenticated, anon;
  grant select, insert, update, delete on all tables in schema public to authenticated;`);

let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; };
async function as(user, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  try { return await db.query(sql, params); } finally { await db.exec("reset role;"); }
}
async function fails(user, sql, params = []) {
  try { await as(user, sql, params); return null; } catch (e) { return e.message; }
}

const codeA = (await as(A, "select public.ensure_my_profile('Ana') as c")).rows[0].c;
const codeB = (await as(B, "select public.ensure_my_profile('Ben') as c")).rows[0].c;
await as(C, "select public.ensure_my_profile('Cleo')");
ok(/^[0-9A-F]{6}$/.test(codeA) && codeA !== codeB, `invite codes look right (${codeA}, ${codeB})`);
ok((await as(A, "select public.ensure_my_profile('Ana R') as c")).rows[0].c === codeA, "renaming keeps the same code");

ok((await as(A, "select public.add_friend_by_code($1) as n", [codeB.toLowerCase()])).rows[0].n === "Ben", "A adds B by code (case-insensitive)");
ok((await fails(A, "select public.add_friend_by_code($1)", [codeA]))?.includes("your own code"), "can't add yourself");
ok((await fails(A, "select public.add_friend_by_code('ZZZZZZ')"))?.includes("No one has"), "unknown code is rejected");

const names = async (u) => (await as(u, "select display_name from public.profiles order by display_name")).rows.map((r) => r.display_name);
ok(JSON.stringify(await names(A)) === '["Ana R","Ben"]', "A sees self + friend B, not C");
ok(JSON.stringify(await names(B)) === '["Ana R","Ben"]', "friendship works both ways");
ok(JSON.stringify(await names(C)) === '["Cleo"]', "C sees only herself");

ok((await as(A, "select code from public.invite_codes")).rows.length === 1, "A can read only her own invite code");
ok((await fails(A, "insert into public.friendships values ($1, $2)", [A, C])) !== null, "can't insert friendships directly");

await as(A, "insert into public.weekly_stats (user_id, week, points, streak, minutes) values ($1, '2026-10-19', 120, 3, 240)", [A]);
await as(B, "insert into public.weekly_stats (user_id, week, points, streak, minutes) values ($1, '2026-10-19', 90, 1, 150)", [B]);
await as(C, "insert into public.weekly_stats (user_id, week, points, streak, minutes) values ($1, '2026-10-19', 300, 9, 600)", [C]);
await as(A, "insert into public.weekly_stats (user_id, week, points) values ($1, '2026-10-19', 150) on conflict (user_id, week) do update set points = excluded.points", [A]);
const statsA = (await as(A, "select user_id, points from public.weekly_stats order by points desc")).rows;
ok(statsA.length === 2 && statsA[0].points === 150, "A sees her (updated) stats and B's, not C's");
ok((await fails(A, "insert into public.weekly_stats (user_id, week, points) values ($1, '2026-10-19', 999)", [C])) !== null, "A can't write stats for someone else");
await as(A, "update public.weekly_stats set points = 0 where user_id = $1", [B]);
ok((await as(B, "select points from public.weekly_stats")).rows.some((r) => r.points === 90), "A can't change B's stats");
ok((await fails(A, "update public.profiles set display_name = 'x' where id = $1 returning id", [B])) === null &&
   (await names(B)).includes("Ben"), "A can't rename B");

const joined = (await as(A, "select s.points, p.display_name from public.weekly_stats s join public.profiles p on p.id = s.user_id where s.week = '2026-10-19' order by s.points desc")).rows;
ok(joined.map((r) => r.display_name).join(",") === "Ana R,Ben", "leaderboard join works for A");

ok((await fails(A, "select public.add_friend_by_code('x')")) !== null, "anon-like junk code fails");
await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
let anonBlocked = false; try { await db.query("select * from public.profiles"); } catch { anonBlocked = true; }
await db.exec("reset role;");
ok(anonBlocked, "logged-out visitors can't read anything");

await as(A, "select public.remove_friend($1)", [B]);
ok(JSON.stringify(await names(A)) === '["Ana R"]' && JSON.stringify(await names(B)) === '["Ben"]', "remove_friend removes both directions");

// --- planner_state: each user's plan is private ---
await as(A, "insert into public.planner_state (state) values ($1)", [JSON.stringify({ deliverables: [{ title: "QA item A" }] })]);
await as(B, "insert into public.planner_state (state) values ($1)", [JSON.stringify({ deliverables: [{ title: "QA item B" }] })]);
const planA = (await as(A, "select user_id, state from public.planner_state")).rows;
ok(planA.length === 1 && planA[0].user_id === A && JSON.stringify(planA[0].state).includes("QA item A"), "A reads only her own plan (default user_id = auth.uid())");
ok((await as(B, "select state from public.planner_state")).rows.every((r) => !JSON.stringify(r.state).includes("QA item A")), "B can't read A's plan");
ok((await fails(A, "insert into public.planner_state (user_id, state) values ($1, '{}')", [C])) !== null, "A can't create a plan for someone else");
await as(B, "update public.planner_state set state = '{}' where user_id = $1", [A]);
ok(JSON.stringify((await as(A, "select state from public.planner_state")).rows[0].state).includes("QA item A"), "B can't overwrite A's plan");
await as(A, "update public.planner_state set state = $1", [JSON.stringify({ deliverables: [{ title: "QA item A2" }] })]);
ok(JSON.stringify((await as(A, "select state from public.planner_state")).rows[0].state).includes("QA item A2"), "A can update her own plan");
await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false); set role anon;");
let anonPlan = false; try { await db.query("select * from public.planner_state"); } catch { anonPlan = true; }
await db.exec("reset role;");
ok(anonPlan, "logged-out visitors can't read any plan");

await as(B, "select public.delete_my_data()");
const left = (await db.query("select count(*)::int as n from public.weekly_stats where user_id = $1", [B])).rows[0].n
  + (await db.query("select count(*)::int as n from public.profiles where id = $1", [B])).rows[0].n
  + (await db.query("select count(*)::int as n from public.invite_codes where user_id = $1", [B])).rows[0].n;
ok(left === 0, "delete_my_data removes profile, code and stats");

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
