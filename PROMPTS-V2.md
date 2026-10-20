# Syllabuddy v2 — upgrade prompts

Paste one at a time into Claude Code, test, then let it commit & push. Order matters: **V2-1 first** (it protects your grade).

---

## V2-1 — Guest / demo mode (do this first)

```
Important for grading: an automated bot will test the live app and it cannot create an account. Right now "/" only offers Sign up / Log in and "/app" redirects to /login, so the bot sees nothing.

Fix it:
- Add a clear "Try it without an account" button on the landing page (data-testid="demo-button") that loads the demo semester into a guest session stored in localStorage and opens the Today view.
- Every feature must work in guest mode. Show a small, calm banner: "You're in guest mode — create an account to save your plan across devices" with a sign-up button. On sign-up, migrate the guest data to the account.
- /app should never hard-redirect to /login: show the guest option instead.
- Re-check that all data-testids from CLAUDE.md section 8 exist. Run lint, tests, build. Commit and push.
```

## V2-2 — Grown-up redesign + easier navigation

```
I want the app to look less childish and be easier to navigate. Think Linear / Notion / Things 3: calm, professional, confident.

Design:
- Neutral palette (near-white / near-black backgrounds, grey text scale) + ONE accent color used only for primary actions and progress. Each course gets a muted color tag.
- Typography: Inter (or Geist), clear hierarchy, no playful fonts. Sentence case. Fewer emojis (none in UI chrome).
- Mascot: remove the cartoon clock face. Keep "Tick" only as a small monochrome logo mark; mascot messages become a short "Coach" line of text. Default tone = "coach"; "savage" stays optional in settings.
- Light + dark mode, WCAG AA contrast, visible focus states.

Navigation:
- Max 4 main destinations: Today · Plan · Courses · Settings (Buddies/Panic/Focus reached from inside those pages). Desktop: left sidebar. Mobile: bottom bar.
- Every screen has ONE obvious primary action.
- Helpful empty states ("No courses yet → Add a syllabus").
- First-run onboarding as a 3-step wizard with progress indicator and Back buttons; it can be skipped.
- Breadcrumbs/back buttons on detail pages; no dead ends.

Before coding, describe the new layout of Today, Plan and Courses in a few bullet points and wait for my OK. Then implement, keeping all data-testids.
```

## V2-6 — Exam prep plans: what to study in each session

```
For every midterm/final, generate an "Exam prep plan" that says WHAT to study in each session, not just "study Finance 2h". It must work WITHOUT an AI key. Reference format (a plan a student found really useful): exam card → what each lecture covers → day-by-day plan → mock exam day → how to work → assumptions.

1. Syllabus parsing (lib/parseSessions.ts, unit-tested): extract the session-by-session schedule — session/week number, topic title, sub-topics/key concepts, readings, problem sets (PS3, "Problem set 4", "Ejercicios"…). Also extract exam details: format (multiple choice, problems, essay), duration, allowed materials, weight, and which sessions it covers. Show it all in the review table so the user can fix it.

2. Exam setup screen (when the user opens an exam, data-testid="exam-prep"):
   - Exam card: date, format, allowed materials, weight, scope (pre-filled; editable).
   - "Focus": user picks which sessions are core vs light (e.g. "Prof said focus on Lectures 4–7").
   - Confidence per topic (1–5 quick sliders).

3. Plan generator (lib/examPlan.ts, unit-tested), using available time from the scheduler:
   - Day 1: setup & diagnostic (download past exam/mock, problem-set solutions, notes; rate confidence; light read of first core topic).
   - Core topics: one or two per day, more time for low confidence + high effort; each day lists that topic's key concepts from the syllabus + "redo PS<n> by hand" when a problem set is linked.
   - Mock exam day ~3 days before: full rehearsal under real conditions (timers from the exam duration, allowed materials only), then mark and log mistakes by topic.
   - Repair day: re-study the 2 weakest topics from the mistake log + build a one-page formula/concept sheet.
   - Day before: light review of the "light" sessions + formula sheet, early night.
   - Exam day: 20–30 min skim only, plus a reading-time strategy.
   - Each day shows ~hours, and blocks fit around classes and other courses' work.
   - "Assumptions" box listing anything guessed (e.g. "exam time not confirmed").
   - Suggest "Email your professor questions by <3 days before>".

4. UI: a clean, document-like exam plan page (calm typography, table for the exam card, day rows with date · tasks · ~hours), and each day's tasks appear inside that day's study blocks on Today. Add "Mock exam log": the user records lost points by topic and reason (concept gap / algebra slip / time pressure) and the repair day updates automatically. Export the exam plan as PDF (print stylesheet) and .ics.

5. If ANTHROPIC_API_KEY exists later, use AI to write richer per-day descriptions — same structure.

6. Add a demo course with a full session schedule and a midterm 10 days from today, so the guest/demo mode shows an exam plan immediately.

7. Session detail: every study block (on Plan AND Today) is clickable and opens a detail panel (side drawer on desktop, bottom sheet on mobile, data-testid="session-detail") with:
   - Course + session title (e.g. "PEPE midterm · Externalities I"), date, time, duration, "Day 3 of 11 · exam in 7 days".
   - Goal for the session in one sentence.
   - Checklist of tasks (key concepts to cover, "Redo PS3 problems by hand, calculator out") — ticking all of them completes the block.
   - Materials to have ready (notes for that lecture, problem set + solutions, mock exam).
   - How to work tip (e.g. 50 min focus + 10 min break).
   - Buttons: Start focus timer · Mark done · Move to another day · a small notes field.
   - Keyboard accessible, closes with Esc, focus returns to the block.

8. Scheduler fix for exams: an exam's prep must start right away when the exam is close (≤ 14 days), following the exam plan above, instead of leaving the first days empty and squeezing everything into the last days.
```

## V2-3 — Blackboard calendar sync (class hours + "Session 15" → real date)

```
Add Blackboard calendar import (no Blackboard login or API needed — the student pastes their calendar share link):
- Settings → "Connect Blackboard calendar": explain how to get the link (Blackboard → Calendar → Calendar settings → Share calendar → copy link). The user pastes the .ics URL. Also allow uploading an .ics file as an alternative.
- Server route /api/calendar fetches the .ics (only https, size limit, timeout) and parses events with a library like node-ical. Store the URL only for that user (treat it like a private secret; never log it).
- Detect class sessions per course: group events by course name/code, sort by date, number them 1..N. Let the user confirm the mapping "Blackboard course ↔ Syllabuddy course" in a simple table.
- Use class hours as BUSY time in the scheduler (no study blocks during class, plus a 15-min buffer).
- Syllabus parsing: when a deliverable says "Session 15", "Sesión 15" or "S15", resolve its date to the 15th session of that course automatically. Show "Date from Blackboard: Tue 17 Nov" in the review table; the user can still edit it.
- Re-sync button + automatic re-sync when the app opens (max once per 6h). If the link stops working, show a friendly message.
- Unit-test the session-numbering and "Session N" resolution with a sample .ics fixture.
```

## (Parked) V2-4b — Read emails you forward

```
Add "Email inbox" import so students can turn course emails into deadlines without giving us access to their mailbox:
- Each logged-in user gets a private forwarding address (e.g. <random-token>@<inbound domain>). Use an inbound-email service with a free tier that posts emails to a webhook (e.g. Postmark Inbound or CloudMailin) — pick one, explain why, and walk me through setup step by step.
- Webhook /api/inbound-email: verify the request signature/secret, match the token to the user, store only subject, sender, date and plain-text body (no attachments), delete raw emails after 30 days.
- Parse each email (no AI needed): find dates, times, course names/codes, and keywords like deadline, due, exam, midterm, quiz, postponed, moved, cancelled, room change (English + Spanish). Create SUGGESTIONS, never automatic changes.
- New "Inbox" card on Today: "3 updates from your emails" → each suggestion shows the email snippet and buttons Add / Update deadline / Ignore. Accepting replans the schedule.
- Also allow pasting an email's text manually (works in guest mode, so the bot can test it with a sample email button).
- Settings explains: forward individual emails, or set an Outlook/Gmail rule to auto-forward emails from your professors.
- If ANTHROPIC_API_KEY exists later, use AI to improve the parsing.
- Unit-test the email parser with 6+ sample emails (EN/ES).
```

## (Parked) V2-4 — Quizzes + smart review days

```
Add a Quiz feature that works WITHOUT an AI key, and gets better if a key is added later:
- Per course, the user can upload slides/notes (PDF) or paste text. Extract text in the browser.
- Without AI: build flashcard quizzes from the material (key terms in bold/headings → "Define X", fill-in-the-blank from key sentences) and let the user add/edit their own cards.
- If ANTHROPIC_API_KEY exists: generate 10 multiple-choice questions with explanations via /api/quiz (zod-validated JSON, rate limited).
- Quiz player: one question at a time, instant feedback, score at the end, wrong answers saved for review. Quiz completion awards points.
- Scheduler: add short (15–20 min) quiz blocks using spaced repetition before each exam/midterm — e.g. 10, 5, 2 and 1 days before — and after each class session if Blackboard calendar is connected. Show them in Today/Plan with a "Quiz" label.
- Unit-test the quiz-day scheduling.
```

## V2-5 — Daily briefing as the first screen (no emails)

```
Make a "daily briefing" the first thing a returning user sees — inside the app, no emails.

Routing:
- New visitors (no data, not logged in) see the marketing landing page with the "Try it without an account" button.
- Anyone who already has a plan (guest data in localStorage OR logged in) and opens "/" goes straight to the briefing (Today page). Add a small "About Syllabuddy" link so the landing page is still reachable.

Briefing block at the top of Today (data-testid="daily-briefing"):
- Greeting by time of day + date ("Good morning, Paula — Tuesday 20 October").
- One-sentence summary: "3 study blocks today (2h 15m) · 1 class · next deadline: Finance problem set in 2 days."
- Today's timeline: classes (from Blackboard calendar if connected) and study blocks in time order, each with a checkbox / "Start focus" button.
- "Coming up" — deadlines in the next 7 days, sorted by date, with course color tag and weight %.
- "Heads up" — at most 2 smart alerts: a heavy week ahead (workload heatmap), missed blocks that were rescheduled, burnout guard, a deadline with no study time yet. Each with one action button.
- Progress: streak + points + "yesterday you did X of Y blocks".
- One short coach line at the end (tone from settings).
- On a day with nothing planned: a calm "Free day" state with an optional "Get ahead" suggestion.
Keep it scannable in under 10 seconds on a phone: short lines, clear hierarchy, no walls of text.
Logic for summary/alerts goes in lib/briefing.ts with unit tests. Keep all existing data-testids. Run lint, tests, build, commit, push.
```
