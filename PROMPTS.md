# Syllabuddy — prompts to paste into Claude Code

Paste these **one at a time**, in order. Wait until Claude Code finishes and you've tested the result before pasting the next one.
After each prompt: open http://localhost:3000, click around, then commit & push (see SETUP-GUIDE, Part E).

Tip: between phases, type `/clear` to start fresh — Claude Code re-reads CLAUDE.md automatically.

---

## Prompt 0 — Kick-off & scaffold

```
Read CLAUDE.md carefully. I'm a beginner, so explain each step in simple words.

Set up the project:
1. Create a Next.js app (App Router, TypeScript, Tailwind, ESLint) in this folder, keeping CLAUDE.md, PROMPTS.md and .env.local (if create-next-app refuses because the folder isn't empty, scaffold in a temporary folder and move the files in).
2. Install: zustand, zod, date-fns, @anthropic-ai/sdk, pdfjs-dist, and vitest for tests.
3. Make sure .gitignore includes .env*.local and node_modules.
4. Create .env.example with ANTHROPIC_API_KEY= and ANTHROPIC_MODEL=claude-haiku-5-5 (no real values).
5. Create lib/types.ts from section 4 of CLAUDE.md.
6. Initialise git and make a first commit.
7. Start the dev server and tell me what to open in my browser.
```

## Prompt 1a — Core logic (no UI yet)

```
Phase 1, part A. Implement and unit-test (Vitest) the pure logic from CLAUDE.md:
- lib/estimate.ts (5.1)
- lib/scheduler.ts (5.2, including warnings when work doesn't fit)
- lib/gamification.ts (5.7: points, streak, streak freezes)
- lib/mascot.ts (message bank: 3 tones × situations)
- lib/demo.ts: a realistic demo semester with 4 university courses (e.g. Corporate Finance, Marketing Management, Statistics, Business Law), 4–6 deliverables each with weights adding to 100%, due dates spread over the next 10 weeks from today.
- lib/store.ts: Zustand store persisted to localStorage (wrapped in try/catch).
Run the tests and show me they pass.
```

## Prompt 1b — Core screens

```
Phase 1, part B. Build the screens from section 7 of CLAUDE.md:
- "/" landing page with the one-liner, 3 benefits, mascot "Tick", and the two buttons (demo + start).
- "/onboarding" 4 steps: paste text or upload PDF (extract text in the browser with pdfjs-dist) → call /api/extract → review/edit table (highlight missing dates, warn if weights ≠ 100%) → effort slider (1–5) and target grade per course → weekly availability → generate plan.
- app/api/extract/route.ts as in section 6, with zod validation, rate limit, and a 501 response when there is no API key. When 501 or error, the UI falls back to a regex date-finder plus manual entry, with a friendly message.
- "/today": mascot message, streak, points, today's blocks with checkboxes, deadlines in the next 72h.
- Mobile bottom navigation. Add every data-testid from section 8 that applies.
IMPORTANT: I don't have an API key right now, so the non-AI path is the MAIN path, not just a fallback. Make it genuinely good: a smart parser (lib/parseSyllabus.ts, unit-tested) that finds dates in many formats (e.g. "15/11/2026", "Nov 15", "15 de noviembre", "Week 7" when a start date is given), grade weights ("30%", "Midterm – 30"), deliverable types from keywords (exam, midterm, final, essay, project, presentation, quiz, in English and Spanish), and attendance rules. Pre-fill the review table with what it finds. Keep the AI route in the code so I can switch it on later just by adding ANTHROPIC_API_KEY in Vercel.
Make it look clean, friendly and accessible (WCAG AA contrast, labels, keyboard).
Then walk me through testing the full demo flow on my laptop and at phone width.
```

## Prompt 2 — Productivity features

```
Phase 2 from CLAUDE.md:
- "/focus/[blockId]": Pomodoro timer 25/5 with start/pause/stop, logs minutes to the deliverable, awards points (+10 bonus per completed focus session). Keep working if the tab is in the background (use timestamps, not just setInterval).
- lib/pace.ts (5.4) — when a deliverable is marked done, update the pace profile; future estimates use it. Show "Your pace: essays take you 1.3× longer than planned" on the courses page.
- lib/ics.ts (5.8) + "Export to calendar" button on /plan. Test that the file imports into Google Calendar.
- lib/grades.ts (5.3) + grade calculator on /courses: enter scores so far, see what you need on the remaining work, or a kind message if the target isn't reachable.
- "/plan": week view + semester workload heatmap.
Unit-test all new lib functions. Then tell me exactly what to test by hand.
```

## Prompt 3 — Smart features

```
Phase 3 from CLAUDE.md:
- Replanning: missed blocks from past days are marked missed and their time is rescheduled from today (5.2). Show a gentle mascot message about it.
- lib/burnout.ts (5.5): detection + mascot message + "Protect tonight" button that adds today as a day off and replans.
- "/panic" (5.6): form (hours available, window), triage result with full / minimum viable / skip and a one-line reason each. Calm tone. Add a visible "Panic mode" entry point on /today.
- "/settings": mascot tone (gentle / coach / savage), availability, export/import my data as JSON, reset data.
Unit-test burnout and panic logic with edge cases. Run lint, tests and build.
```

## Prompt 4 — Study buddies (accounts)

```
Phase 4 from CLAUDE.md. Walk me through creating a free Supabase project step by step (I'm a beginner) and which keys go in .env.local and in Vercel.
Then build:
- Magic-link email login (only needed for /buddies).
- Tables: profiles (id, display_name), friendships (via invite codes), weekly_stats (user_id, week, points, streak, minutes). Enable Row Level Security so users only read their friends' aggregate stats.
- Sync only aggregate stats to Supabase — courses, grades and syllabi stay on the device.
- "/buddies": my invite code, add friend by code, weekly leaderboard (points, streak, hours) with a mascot comment.
- Without login, /buddies shows a demo leaderboard with 4 fake friends and a "Log in to add real friends" button.
Give me the SQL to paste into Supabase's SQL editor.
```

## Prompt 5 — Bot-proofing & polish (before submitting)

```
We're about to submit. An automated bot will test the live app. Please:
1. Check every data-testid in CLAUDE.md section 8 exists and works.
2. Test the full demo flow and every page with no API key and with an empty localStorage. Nothing may crash or show a blank screen.
3. Add a Playwright smoke test for: landing → demo → today → check a block → plan → export → courses → grade calculator → panic → buddies (demo).
4. Check accessibility: labels, focus states, contrast, keyboard, alt text, page titles, lang attribute.
5. Check mobile at 375px.
6. Add error boundaries and a friendly 404 page.
7. Run lint, tests, build. Fix everything. Summarise what you changed.
```

## Prompt 6 — README

```
Write a great README.md: name + one-liner, live link (https://<my-project>.vercel.app — ask me), screenshot placeholders, the problem, features list, how it works (scheduler, pace learning, panic mode), tech stack, how to run locally, environment variables (names only), privacy notes, and how AI was used to build it.
```

## Prompt 7 — Step 9 summary

```
Here is the Step 9 summary template from my assignment brief: <PASTE TEMPLATE HERE>.
Fill in every line using what we built. Keep it honest and specific. Live link: <URL>. Repo: <URL>.
```

---

## If something breaks

```
Something is wrong: <describe what you clicked and what happened, paste any red error text>.
Find the cause, explain it simply, fix it, and re-run the tests.
```

```
The Vercel deployment failed. Here is the build log: <paste>. Fix it and tell me when to push again.
```
