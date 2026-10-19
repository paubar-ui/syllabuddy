# Syllabuddy — project spec for Claude Code

> Read this whole file before writing any code. Follow it unless the user says otherwise.
> The user (Paula) is a **beginner**: explain what you're doing in plain language, keep steps small,
> and after each phase tell her exactly what to test in the browser.

## 1. What we're building

**One-liner:** Upload your syllabi, tell us how hard each class is for you, and get a daily study plan that keeps you on track — with streaks, a mascot coach and friends to compete with.

**Problem (daily university life):** Students juggle 5–7 syllabi with deadlines scattered across PDFs. They don't know how much to study per day, start too late, and burn out in "hell weeks".

**Context:** Individual university assignment. The app must be a **real, live web app** on Vercel (`https://<name>.vercel.app`) with a **public GitHub repo**. After the deadline an **automated bot tests the live app**, then the professor grades it.

## 2. Non-negotiable rules

1. **Works without login.** Every core feature must be usable instantly. Accounts are only needed for Study Buddies (Phase 4).
2. **Demo mode.** A visible "Try with a demo semester" button on the landing page loads 3–4 realistic sample courses so the bot/graders never see an empty screen.
3. **Works without an AI key.** If `ANTHROPIC_API_KEY` is missing or the AI call fails, fall back to: paste text → simple date-finder (regex) → user reviews/edits → or full manual entry. Never crash.
4. **Never commit secrets.** API keys live only in `.env.local` (git-ignored) and in Vercel's Environment Variables. The repo is public.
5. **Bot-friendly & accessible (WCAG 2.1 AA):** semantic HTML, every button/input has a visible label or `aria-label`, real `<button>`/`<a>`, keyboard navigable, color contrast ≥ 4.5:1, add `data-testid` on key elements (listed in §8). No layout breaks at 375px width.
6. **Privacy / data minimisation:** store as little personal data as possible. Friends only ever see aggregate stats (points, streak, hours) — never courses, grades or syllabi.
7. **Small, working increments.** After each phase: `npm run build` passes, tests pass, commit, push. The live app must work at the end of every phase.

## 3. Tech stack

- **Next.js (App Router) + TypeScript + Tailwind CSS**, deployed on **Vercel**.
- **State:** Zustand with `persist` → `localStorage` (Phases 1–3). Wrap storage access in try/catch.
- **PDF text:** `pdfjs-dist` in the browser (extract text client-side, send only text to the API).
- **AI extraction:** `@anthropic-ai/sdk` in a server route `app/api/extract/route.ts`. Model from env `ANTHROPIC_MODEL` (default `claude-haiku-5-5`). Ask for strict JSON and validate it with **zod**.
- **Dates:** `date-fns`.
- **Calendar export:** generate `.ics` text ourselves (no library needed) or use `ics` package.
- **Phase 4 only:** **Supabase** (Auth with magic link + Postgres) for accounts and the leaderboard.
- **Tests:** **Vitest** for all pure logic in `lib/`. Optional: Playwright smoke test of the demo flow.
- Keep dependencies minimal. No paid services besides the optional AI key.

## 4. Data model (`lib/types.ts`)

```ts
type Effort = 1 | 2 | 3 | 4 | 5;               // 1 = easy for me, 5 = very hard for me
type DeliverableType = 'exam' | 'midterm' | 'final' | 'essay' | 'project' | 'presentation' | 'quiz' | 'homework' | 'reading' | 'other';

interface Course {
  id: string; name: string; color: string;
  effort: Effort;
  targetGrade?: number;                         // on the course's scale, e.g. 8.5 / 10
  gradeScale: number;                           // e.g. 10 or 100
  attendancePolicy?: string;                    // raw text from syllabus, optional
}

interface Deliverable {
  id: string; courseId: string; title: string; type: DeliverableType;
  dueDate: string;                              // ISO date
  weight: number;                               // % of final grade, 0–100
  score?: number;                               // grade obtained, once known
  estimatedHours: number;                       // computed, user can override
  loggedMinutes: number;                        // from focus timer + manual logs
  done: boolean;
}

interface StudyBlock {
  id: string; deliverableId: string; date: string; // ISO date
  minutes: number; status: 'planned' | 'done' | 'missed';
}

interface Availability {
  minutesPerWeekday: [number, number, number, number, number, number, number]; // Mon..Sun
  maxMinutesPerDay: number;                     // hard cap (burnout guard), default 300
  daysOff: string[];                            // ISO dates
}

interface PaceProfile {                         // learned ratios actual/estimated
  byType: Partial<Record<DeliverableType, number>>;
  byCourse: Record<string, number>;
}

interface Gamification {
  points: number; streak: number; bestStreak: number;
  streakFreezes: number; lastCompletedDate?: string;
  mascotTone: 'gentle' | 'coach' | 'savage';
  history: { date: string; minutes: number; points: number }[];
}
```

## 5. Core logic (pure functions in `lib/`, each with Vitest tests)

### 5.1 Estimate hours — `lib/estimate.ts`
- Base hours by type: exam/final 12, midterm 8, project 15, essay 8, presentation 6, quiz 2, homework 2, reading 1, other 3.
- `hours = base × weightFactor × effortFactor × paceFactor`
  - `weightFactor = clamp(0.5 + weight/40, 0.5, 2)`
  - `effortFactor = [0.6, 0.8, 1.0, 1.3, 1.6][effort-1]`
  - `paceFactor` = from PaceProfile (type ratio × course ratio, default 1, clamp 0.5–2.5).
- Round to nearest 0.5h. User can override per deliverable.

### 5.2 Scheduler — `lib/scheduler.ts`
- Input: courses, deliverables (not done), availability, today, existing done blocks.
- Process deliverables by due date (earliest first), ties → higher weight first.
- For each, spread remaining minutes over the days from today to dueDate−1 (deadline day only gets up to 25%), **back-loaded**: later days get more (linear ramp), but start no later than `ceil(hours/2)` days before due.
- Respect per-day available minutes and `maxMinutesPerDay`; skip `daysOff`. Blocks are 25–90 min.
- If it doesn't fit: schedule what fits and return a `warnings[]` entry ("Finance final: 3h don't fit — consider Panic Mode or more availability").
- **Replanning:** past `planned` blocks become `missed`; their minutes go back into the pool and the plan regenerates from today. Never delete `done` blocks.

### 5.3 Grade calculator — `lib/grades.ts`
- `requiredScore(components, targetGrade, scale)` → score needed on remaining components (assume equal performance across remaining ones). Return `{ needed, possible: needed <= scale, alreadySecured }`.

### 5.4 Pace learning — `lib/pace.ts`
- When a deliverable is marked done: `ratio = actualHours / estimatedHours`. Update with exponential moving average (`alpha = 0.3`) for its type and its course. Ignore if loggedMinutes < 15.

### 5.5 Burnout guard — `lib/burnout.ts`
- Trigger if (a) ≥ 3 consecutive days with logged minutes > maxMinutesPerDay, or (b) 7 consecutive days with > 0 study minutes and no day off.
- Effect: mascot message suggesting an evening off + offer a one-click "Protect tonight" that adds today to `daysOff` and replans.

### 5.6 Panic mode — `lib/panic.ts`
- Input: hours available in the next N hours (default 48), deliverables due within that window.
- Rank by **grade points per hour** = `weight / remainingHours`. Allocate hours greedily.
- Output: ordered triage list with `full` / `minimum viable` / `skip` labels and a one-sentence rationale each. Tone: calm and clear.

### 5.7 Gamification — `lib/gamification.ts`
- Points: completed block = `round(minutes/5) × (1 + weight/50)`; focus session = +10 bonus; finishing a deliverable = +50.
- Streak: +1 if all of today's planned blocks are done (or ≥ 1 block if the day had ≤ 1). Missing a day consumes a streak freeze if available, else resets. Earn 1 freeze per 7-day streak (max 2).
- Mascot ("Tick", a small clock character — drawn as simple SVG/emoji, original design): message bank in `lib/mascot.ts` with 3 tones × situations (morning plan, all done, missed yesterday, deadline in 72h, streak milestone, burnout). Savage = cheeky, never insulting or guilt-tripping about wellbeing.

### 5.8 Calendar export — `lib/ics.ts`
- `.ics` with one VEVENT per planned block (default 18:00 start, sequential) and one all-day VEVENT per deadline. Download as `syllabuddy.ics`. Validate the format (CRLF line endings, UID, DTSTAMP).

## 6. AI extraction — `app/api/extract/route.ts`
- POST `{ text: string, courseNameHint?: string }` (limit text to ~60k chars).
- If no API key → return `501` and the client uses the regex fallback.
- Prompt Claude to return **only JSON**: `{ courseName, gradeScale, attendancePolicy, deliverables: [{ title, type, dueDate (YYYY-MM-DD or null), weight }] }`. Tell it today's date and the academic year so it can resolve dates like "Week 7" only when a start date is given; otherwise `dueDate: null`.
- Validate with zod; drop invalid items; return them. The UI **always** shows a review table where the user fixes dates/weights before saving. Highlight items with missing dates. Warn if weights don't add up to ~100%.
- Simple rate limit per IP (in-memory) to protect the key.

## 7. Pages / UX

| Route | Purpose |
|---|---|
| `/` | Landing: one-liner, 3 benefit bullets, mascot, **"Try with a demo semester"** + **"Start with my syllabi"** |
| `/onboarding` | Step 1 upload/paste syllabi → Step 2 review table → Step 3 effort sliders + target grades → Step 4 availability → generate plan |
| `/today` | Main daily screen: mascot message, streak, today's blocks (check off, start focus timer), upcoming deadlines (72h) |
| `/plan` | Week view of blocks + workload heatmap of the semester; "Export to calendar" button |
| `/courses` | Courses & deliverables, edit, mark done, enter scores, **grade calculator** per course |
| `/focus/[blockId]` | Pomodoro 25/5 timer, logs minutes to deliverable, awards points |
| `/panic` | Panic mode form + triage result |
| `/buddies` | Phase 4: login, invite code, weekly leaderboard (demo mode shows fake friends) |
| `/settings` | Mascot tone, availability, reset data, export/import JSON |

Design: clean, friendly, mobile-first, rounded cards, one accent color, good contrast, light & dark mode. Bottom nav on mobile (Today · Plan · Courses · Buddies).

## 8. Required `data-testid`s (for the grading bot)
`demo-button`, `start-button`, `syllabus-input`, `extract-button`, `review-table`, `save-courses-button`, `effort-slider-<courseId>`, `generate-plan-button`, `today-list`, `block-checkbox-<id>`, `streak-count`, `points-count`, `mascot-message`, `export-ics-button`, `grade-calculator`, `focus-start-button`, `panic-button`, `panic-result`, `leaderboard`.

## 9. Phases (build in this order, deploy after each)
1. **Core:** scaffold, landing, demo semester, upload/paste + extraction + review, effort & availability, scheduler, Today view, check-off, streak, points, mascot.
2. **Productivity:** focus timer, pace learning, .ics export, grade calculator, workload heatmap.
3. **Smart:** burnout guard, panic mode, replanning of missed blocks.
4. **Social:** Supabase auth, profiles (display name only), friend invite codes, weekly leaderboard; demo leaderboard without login.

## 10. Definition of done (every phase)
- `npm run lint`, `npm run test`, `npm run build` all pass.
- Demo flow works end-to-end at 375px and desktop.
- No console errors. No secrets in the repo (`git grep sk-ant` returns nothing).
- README updated (what it is, live link, features, how to run, tech, AI usage note).
- Commit with a clear message and push → Vercel redeploys → check the live URL.
