# Security — Syllabuddy

How accounts and data are protected, and how it's tested. The database rules live in
[`supabase/schema.sql`](supabase/schema.sql).

## Accounts

- **Supabase Auth, email + password.** Passwords are hashed by Supabase; the app never sees or stores them.
- **"Confirm email" is off** in the Supabase project (Authentication → Sign In / Providers → Email), as the
  grading contract asks: a new account is signed in straight away, so a bot (or a student) can sign up and use
  `/app` without opening an inbox. The automated tests check this on every run (sign-up must return a session).
- **Wrong password** → "Wrong email or password. Please try again." and no session.
- **Password reset:** *Log in → Forgot password?* sends a reset link (`/forgot-password`). The link opens
  `/reset-password`, where you choose a new password. The answer is the same whether or not the email has an
  account, so the form can't be used to find out who uses Syllabuddy.
- **The session is a cookie** (`@supabase/ssr`), so the server can check it.
- **Logged-in pages are checked on the server** — [`proxy.ts`](proxy.ts) runs before `/app`, `/today`, `/plan`,
  `/courses`, `/focus`, `/panic`, `/settings`, `/onboarding`, `/buddies` and `/exam` are sent, verifies the session
  token (`getClaims()`) and redirects to `/login?next=…` (HTTP 307) if there's no valid session. The browser
  checks again ([`AuthGate`](components/AuthGate.tsx)) while your plan loads.
- **Keys:** only the Supabase URL and the publishable (anon) key reach the browser. No service-role key exists in
  the app or the repository; secrets live in `.env.local` (git-ignored) and in Vercel.

## Tables and Row Level Security

RLS is **on for every table**. `auth.uid()` is the logged-in user. Nothing is readable by logged-out visitors
(`anon` has no policies and no function rights).

| Table | What's in it | Policies |
|---|---|---|
| `planner_state` | One row per user: courses, deadlines, study blocks, availability, points, streak, Blackboard calendar link | **select / insert / update / delete: own row only** (`user_id = auth.uid()`). `user_id` defaults to `auth.uid()`. |
| `profiles` | Display name for Study Buddies (only if you join) | **select: own** · **insert: own** · **update: own** (`id = auth.uid()`). Friends' names are only visible through `my_leaderboard()`. |
| `invite_codes` | Your 6-character invite code | **select: own** (`user_id = auth.uid()`). Created only by `ensure_my_profile()`. No insert/update/delete policies. |
| `friendships` | Who is connected to whom (stored both directions) | **select: own** (`user_id = auth.uid()`). No insert/update/delete policies: changed only by `add_friend_by_code()` / `remove_friend()`. |
| `weekly_stats` | Your weekly points, streak and study minutes | **select / insert / update: own rows only** (`user_id = auth.uid()`). Friends' totals are only visible through `my_leaderboard()`. |

### Functions (security definer, callable only by logged-in users)

All run with `set search_path = public`, check `auth.uid()` themselves, and have `execute` revoked from
`public` and `anon`.

| Function | What it does |
|---|---|
| `my_leaderboard(p_week)` | **The leaderboard.** Returns, for you and the people connected to you by an invite code, **only** `display_name`, `points`, `streak`, `minutes` (plus `id`, so you can remove a friend, and `is_me`). Never courses, deadlines, plans, codes or emails. |
| `ensure_my_profile(name)` | Creates/renames your profile and returns your invite code. |
| `add_friend_by_code(code)` | Connects you with the owner of that code (both directions). Sharing your code is how you accept someone; max 50. |
| `remove_friend(id)` | Disconnects both directions. |
| `delete_my_data()` | Deletes your profile, code, friendships and stats (GDPR erasure). Your plan row can be deleted by you directly. |
| `is_friend(id)` | Helper (kept for compatibility; no policy depends on it any more). |

## API routes

| Route | Without a session | Notes |
|---|---|---|
| `POST /api/calendar` | **401** | Fetches a Blackboard calendar link: https only, public addresses only (SSRF check), 10 s timeout, 2 MB limit; the link is never logged. Rate-limited per user. |
| `GET/POST /api/exam-day` | **401** | Optional AI explanation (only if `ANTHROPIC_API_KEY` is set). Rate-limited per user. |

No route takes another user's id, so there is nothing to return 403/404 for: every route only ever acts as the
logged-in user, and the database rules above apply to everything it reads or writes.

## How it's tested

- **`npm run test:sql`** — runs `supabase/schema.sql` in an in-memory Postgres (PGlite) with users A, B and C:
  each reads only their own profile, stats, code and plan; nobody can write for someone else; the leaderboard
  shows B to A only after A enters B's code and only returns display name and weekly totals; C (not connected)
  never appears; logged-out visitors can read nothing and can't call the leaderboard.
- **`npx playwright test e2e/security.spec.ts`** — the same against the **real Supabase project** with two fresh
  users A and B created through the public API: A can't read, change, create or delete B's plan; B is on A's
  leaderboard only after connecting, with only aggregate fields; being friends never opens B's plan; logged-out
  requests get no data, the API routes answer 401, and protected pages redirect to `/login` on the server (307).
- **`npm run test:e2e`** — the grading bot's flow: sign up in a clean browser, save, log out, wrong password,
  another browser, another user, no anonymous access.

## Reporting

Found a problem? Please open a private security advisory on the GitHub repository rather than a public issue.
