import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// These tests use the real Supabase project from .env.local (or the live site with
// PLAYWRIGHT_BASE_URL) and create throwaway accounts, just like the grading bot does.

const PASSWORD = "Qa-test-password-123";

/** Read the public Supabase values the same way the app does (for the "no access without login" check). */
function supabaseEnv() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
}

const uniqueEmail = (tag: string) =>
  `qa-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;

function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function signUp(page: Page, tag: string) {
  const email = uniqueEmail(tag);
  await page.goto("/signup");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill(PASSWORD);
  await page.getByTestId("signup-submit").click();
  await expect(page).toHaveURL(/\/app$/, { timeout: 15_000 });
  await expect(page.getByTestId("core-input")).toBeVisible({ timeout: 15_000 });
  return email;
}

async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("\n    ")}`,
  );
  expect(summary, `Accessibility problems on ${label}`).toEqual([]);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page is wider than the screen").toBeLessThanOrEqual(0);
}

test("landing: a stranger sees what it is, who it's for, and one Sign up button", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  await expect(page).toHaveTitle(/Syllabuddy/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("daily study plan");
  await expect(page.getByText("For university students")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Sign up/ })).toHaveCount(1);
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page, "/");
  await page.getByRole("link", { name: /^Sign up/ }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(errors).toEqual([]);
});

test("the grading bot's checks: sign up, save, log out, wrong password, other browser, other user, no anonymous access", async ({ page, browser }) => {
  const errors = watchForErrors(page);
  const item = `QA-${Math.random().toString(36).slice(2, 8).toUpperCase()} grading bot test`;

  // 2. Sign up → lands on /app straight away (no "check your email")
  const email = await signUp(page, "bot");

  // 3. Type only in core-input, click core-submit → the item appears
  await page.getByTestId("core-input").fill(item);
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("core-item").filter({ hasText: item })).toBeVisible();

  // logout is on every logged-in page
  for (const path of ["/app", "/plan", "/courses", "/panic", "/settings", "/buddies", "/onboarding"]) {
    await page.goto(path);
    await expect(page.getByTestId("logout"), path).toBeVisible();
  }

  // 4. Log out
  await page.getByTestId("logout").click();
  await expect(page.getByTestId("logout")).toHaveCount(0);

  // …then a different, clean browser: wrong password is refused…
  const other = await freshPage(browser);
  await logIn(other, email, "definitely-the-wrong-password");
  await expect(other.locator("form [role=alert]")).toContainText(/wrong email or password/i);
  await expect(other).toHaveURL(/\/login/);
  await expect(other.getByTestId("logout")).toHaveCount(0);

  // …and the right password works, with the item still there
  await logIn(other, email);
  await expect(other).toHaveURL(/\/app$/, { timeout: 15_000 });
  await expect(other.getByTestId("core-item").filter({ hasText: item })).toBeVisible({ timeout: 15_000 });
  await other.context().close();

  // 5. A second user can't see the first user's item
  const second = await freshPage(browser);
  await signUp(second, "second");
  await expect(second.getByTestId("core-item").filter({ hasText: item })).toHaveCount(0);
  await second.context().close();

  // 6. Nobody can read data without logging in: the app redirects, and the database returns nothing
  const anonymous = await freshPage(browser);
  await anonymous.goto("/app");
  await expect(anonymous).toHaveURL(/\/login/);
  const { url, key } = supabaseEnv();
  for (const table of ["planner_state", "profiles", "weekly_stats", "friendships", "invite_codes"]) {
    const res = await anonymous.request.get(`${url}/rest/v1/${table}?select=*`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    const body = await res.json();
    expect(Array.isArray(body) ? body : [], `anonymous read of ${table}`).toEqual([]);
  }
  await anonymous.context().close();

  expect(errors).toEqual([]);
});

test("a full session: sample semester, check a block, plan, export, grade calculator, panic, buddies, focus", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "tour");
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("today-list")).toBeVisible();
  await expect(page.getByTestId("points-count")).toHaveText("0");
  await page.locator('[data-testid^="block-checkbox-"]').first().check();
  await expect(page.getByTestId("points-count")).not.toHaveText("0");

  await page.getByRole("link", { name: "Plan", exact: true }).filter({ visible: true }).first().click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-ics-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("syllabuddy.ics");
  expect(readFileSync((await download.path())!, "utf8")).toContain("BEGIN:VEVENT");

  await page.getByRole("link", { name: "Courses", exact: true }).filter({ visible: true }).first().click();
  await page.locator('[data-testid^="course-folder-"]').first().click();
  const calculator = page.getByTestId("grade-calculator");
  await page.getByTestId("course-deadlines").getByLabel("Score (/10)").first().fill("6");
  await calculator.getByLabel(/Target grade/).fill("8");
  await expect(calculator).toContainText("you need an average of");

  await page.goto("/app");
  await page.getByTestId("panic-button").click();
  await page.getByTestId("panic-button").click();
  await expect(page.getByTestId("panic-result")).toContainText(/Do fully|Minimum viable|Nothing is due/);

  await page.goto("/app");
  await page.getByRole("link", { name: "See the leaderboard" }).click();
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  await page.getByRole("link", { name: /^(Study buddies|Buddies)$/ }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/buddies$/);

  await page.goto("/app");
  await page.getByRole("link", { name: /Start a focus session/ }).first().click();
  await page.getByTestId("focus-start-button").click();
  await expect(page.getByRole("timer")).toHaveText(/^2[45]:\d\d$/);

  // Everything was saved to the account: reload and it's still there
  await page.goto("/app");
  await page.reload();
  await expect(page.getByTestId("points-count")).not.toHaveText("0");
  expect(errors).toEqual([]);
});

test("My courses: add course folders, then deadlines in a table, with the grade calculator inside", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "courses");
  await page.getByRole("link", { name: "Courses", exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("heading", { name: "My courses", level: 1 })).toBeVisible();

  // Add two courses: each becomes a folder
  await page.getByTestId("new-course-name").fill("Behavioral Economics");
  await page.getByTestId("create-course-button").click();
  await page.getByTestId("add-course-button").click();
  await page.getByTestId("new-course-name").fill("Public Economics");
  await page.getByTestId("create-course-button").click();
  await expect(page.locator('[data-testid^="course-folder-"]')).toHaveCount(2);
  await expectNoAxeViolations(page, "/courses folders");

  // Open a folder and add deadlines
  await page.getByRole("link", { name: /^Behavioral Economics/ }).click();
  await expect(page.getByRole("heading", { name: "Behavioral Economics", level: 1 })).toBeVisible();
  const due = new Date();
  due.setDate(due.getDate() + 20);
  const iso = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  await page.getByTestId("course-deadline-title").fill("Midterm exam");
  await page.getByLabel("Type", { exact: true }).selectOption("midterm");
  await page.getByLabel("Due date", { exact: true }).fill(iso);
  await page.getByLabel("Weight %", { exact: true }).fill("40");
  await page.getByTestId("course-deadline-add").click();
  await page.getByTestId("course-deadline-title").fill("Reading reflection");
  await page.getByTestId("course-deadline-add").click();
  const table = page.getByTestId("course-deadlines");
  await expect(table.locator('[data-testid^="course-row-"]')).toHaveCount(2);
  await expect(table).toContainText("Midterm");
  await expect(table.getByRole("link", { name: "Exam prep plan" })).toBeVisible();

  // Score + target → grade calculator in the folder
  await table.getByLabel("Score (/10)").first().fill("7");
  await page.getByTestId("grade-calculator").getByLabel(/Target grade/).fill("6");
  await expect(page.getByTestId("grade-calculator")).toContainText("you need an average of");
  await expectNoAxeViolations(page, "/courses/[id]");
  await expectNoSidewaysScroll(page);

  // The deadlines are in the plan
  await page.getByRole("link", { name: "Today" }).filter({ visible: true }).first().click();
  await expect(page.getByTestId("core-item")).toHaveCount(2);

  // Old "add courses" link lands on My courses
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/courses$/);
  expect(errors).toEqual([]);
});

test("every page: no errors, fits the screen, passes WCAG 2.1 AA in light and dark", async ({ page }) => {
  const errors = watchForErrors(page);
  for (const path of ["/", "/signup", "/login"]) {
    await page.goto(path);
    await expectNoSidewaysScroll(page);
    await expectNoAxeViolations(page, path);
  }
  await signUp(page, "a11y");
  await expectNoAxeViolations(page, "/app (empty)");
  await page.getByTestId("demo-button").click();
  await page.locator('[data-testid^="block-checkbox-"]').first().check();
  const focusHref = await page.getByRole("link", { name: /Start a focus session/ }).first().getAttribute("href");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of ["/app", "/plan", "/courses", "/panic", "/settings", "/buddies", "/onboarding", focusHref!]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await expectNoSidewaysScroll(page);
      await expectNoAxeViolations(page, `${path} (${scheme})`);
    }
  }
  expect(errors).toEqual([]);

  const missing = await page.goto("/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page took a day off" })).toBeVisible();
});

test("keyboard only: sign up and add a deadline", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await signUp(page, "keyboard");
  await page.getByTestId("core-input").focus();
  await page.keyboard.type("Essay draft");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("core-item").filter({ hasText: "Essay draft" })).toBeVisible();
});

test("a save that fails (network hiccup) is retried and nothing is lost", async ({ page }) => {
  await signUp(page, "retry");
  let blocked = 0;
  await page.route("**/rest/v1/planner_state*", async (route) => {
    if (route.request().method() === "POST" && blocked < 2) {
      blocked++;
      return route.abort("failed");
    }
    return route.continue();
  });
  await page.getByTestId("core-input").fill("Retry check essay");
  await page.getByTestId("core-submit").click();
  await expect(page.getByText("isn't saved yet")).toBeVisible();
  await expect(page.getByTestId("core-item").filter({ hasText: "Retry check essay" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("isn't saved yet")).toHaveCount(0);
  await page.unrouteAll();
  await page.reload();
  await expect(page.getByTestId("core-item").filter({ hasText: "Retry check essay" })).toBeVisible({ timeout: 15_000 });
});

test("daily briefing: greeting, summary, timeline, coming up — and / opens it for logged-in users", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "briefing");
  await page.getByTestId("demo-button").click();

  const briefing = page.getByTestId("daily-briefing");
  await expect(briefing).toBeVisible();
  await expect(briefing.getByRole("heading", { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)$/);
  await expect(briefing).toContainText(/study blocks? today|No study blocks today/);
  await expect(briefing).toContainText("Coming up · next 7 days");
  await expect(briefing.getByTestId("today-list")).toBeVisible();
  await expect(briefing.getByTestId("mascot-message")).toBeVisible();
  await expect(page.getByTestId("core-input")).toBeVisible(); // the main feature stays on /app

  // A first name personalises the greeting
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).first().click();
  await page.getByLabel("First name or nickname").fill("Paula");
  await page.getByRole("link", { name: "Today" }).filter({ visible: true }).first().click();
  await expect(page.getByTestId("daily-briefing").getByRole("heading", { level: 1 })).toHaveText(/, Paula$/);

  // Returning users who open / go straight to their briefing; the landing page stays reachable
  await page.goto("/");
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/about");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("daily study plan");
  await expect(page.getByRole("link", { name: "Open my plan" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("exam prep plan and session detail: what to study each day, from the syllabus schedule", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "examprep");
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("today-list")).toBeVisible();

  // Courses → the Statistics midterm's prep plan
  await page.getByRole("link", { name: "Courses", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("link", { name: /^Statistics/ }).click();
  await page.locator('[data-testid^="exam-prep-link-"]').first().click();
  const prep = page.getByTestId("exam-prep");
  await expect(prep).toBeVisible();
  await expect(prep).toContainText("Exam card");
  await expect(prep).toContainText("Day 1");
  await expect(prep).toContainText(/Email your professor any questions by/);
  await expectNoSidewaysScroll(page);
  await expectNoAxeViolations(page, "/exam");

  // Log a mock mistake: the repair day now targets that topic
  await page.getByLabel("Topic", { exact: true }).selectOption({ index: 2 });
  const topic = (await page.getByLabel("Topic", { exact: true }).locator("option:checked").textContent())!.replace(/^\d+\.\s*/, "");
  await page.getByLabel("Points lost").fill("8");
  await page.getByRole("button", { name: "Log it" }).click();
  await expect(prep.getByText(/8 pts/)).toBeVisible();
  await expect(prep.locator("li", { hasText: "Repair" }).first()).toContainText(topic);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const download = await downloadPromise;
  expect(readFileSync((await download.path())!, "utf8")).toContain("Day 1:");

  // Paste a syllabus's session list: it's read into topics you check, then organised
  const content = page.getByTestId("study-content");
  await content.getByRole("button", { name: "Paste my own content" }).click();
  await content
    .getByLabel("What you need to study")
    .fill(
      "PROGRAM\nSESSION 1 (LIVE IN-PERSON)\nSession 1\nBayes theorem\nPractice / Teamwork\nReading: Chapter 1 from Wasserman,\nAll of Statistics\n" +
        "SESSION 2 (LIVE IN-PERSON)\nSession 2\nLinear regression\nPractice\nReading: Chapter 2\n" +
        "SESSION 3 (LIVE IN-PERSON)\nMIDTERM EXAM\nSESSION 4 (LIVE IN-PERSON)\nSession 4\nTime series\nPractice\n",
    );
  await content.getByRole("button", { name: "Read it" }).click();
  const review = page.getByTestId("content-review");
  await expect(review.getByLabel("Topic 1", { exact: true })).toHaveValue("Bayes theorem");
  await expect(review.getByRole("checkbox", { name: "Include Time series" })).not.toBeChecked(); // after the midterm
  await expectNoAxeViolations(page, "/exam content review");
  await review.getByRole("button", { name: "Organise 2 topics into study days" }).click();
  await expect(content).toContainText("2 topics, organised into the days below.");
  await expect(prep).toContainText("Bayes theorem");

  // "I'll organise it myself": write your own plan for a day; it's kept
  await prep.getByRole("radio", { name: /I'll organise it myself/ }).check();
  await prep.getByLabel("Your plan for day 1", { exact: true }).fill("Redo problem set 1");
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("planner_state") &&
      r.request().method() === "POST" &&
      r.ok() &&
      (r.request().postData() ?? "").includes("Redo problem set 1"),
  );
  await prep.getByLabel("Your plan for day 2", { exact: true }).click(); // leaving the box saves it
  await saved;
  await page.reload();
  await expect(page.getByTestId("exam-prep").getByLabel("Your plan for day 1", { exact: true })).toHaveValue("Redo problem set 1");
  await page.getByTestId("exam-prep").getByRole("radio", { name: /Organise my study for me/ }).check();

  // Today: click a block → the detail panel; Esc closes it and focus goes back
  await page.goto("/app");
  const opener = page.locator('[data-testid^="block-open-"]').first();
  await opener.click();
  const detail = page.getByTestId("session-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("Checklist");
  await expectNoAxeViolations(page, "/app session detail");
  await page.keyboard.press("Escape");
  await expect(detail).toBeHidden();
  await expect(opener).toBeFocused();

  // Ticking every task marks the block done (and it's saved)
  await opener.click();
  const tasks = detail.getByRole("checkbox");
  for (let i = 0, n = await tasks.count(); i < n; i++) await tasks.nth(i).check();
  await expect(detail).toContainText("block marked as done");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("points-count")).not.toHaveText("0");
  expect(errors).toEqual([]);
});

test("Blackboard calendar: classes on Plan and Today, deadlines added with a click, courses matched", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "calendar");
  await page.getByTestId("demo-button").click();
  await expect(page.getByTestId("today-list")).toBeVisible();

  // A Blackboard-style calendar: Statistics classes every week from today, plus a hand-in.
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const today = new Date();
  const later = new Date(today);
  later.setDate(today.getDate() + 3);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:stats@test",
    "SUMMARY:STATISTICS  (Ses. 1) Live in-person ",
    `DTSTART:${local(today)}T100000`,
    `DTEND:${local(today)}T112000`,
    "RRULE:FREQ=WEEKLY;COUNT=8",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:handin@test",
    "SUMMARY:H5: Hypothesis hand-in",
    `DTSTART:${local(later)}T235900`,
    `DTEND:${local(later)}T235900`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  await page.getByRole("link", { name: "Plan", exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId("calendar-file-input").setInputFiles({
    name: "blackboard.ics",
    mimeType: "text/calendar",
    buffer: Buffer.from(ics),
  });
  await expect(page.getByText("Blackboard calendar connected")).toBeVisible();
  // Classes show in the week view
  await expect(page.getByText("10:00–11:20 · Class").first()).toBeVisible();
  // The hand-in is offered with a course picker; adding it puts it in the plan
  const deadlines = page.getByTestId("calendar-deadlines");
  await expect(deadlines).toContainText("H5: Hypothesis hand-in");
  await deadlines.getByLabel("Course for H5: Hypothesis hand-in").selectOption({ label: "Statistics" });
  await deadlines.getByRole("button", { name: "Add" }).click();
  await expect(deadlines).toContainText("Added “H5: Hypothesis hand-in” to your plan.");
  await expectNoAxeViolations(page, "/plan with calendar");

  // Today lists today's class
  await page.getByRole("link", { name: "Today" }).filter({ visible: true }).first().click();
  await expect(page.getByText("Your classes today")).toBeVisible();
  await expect(page.getByTestId("core-item").filter({ hasText: "H5: Hypothesis hand-in" })).toBeVisible();

  // Settings: one row per subject, matched to the sample Statistics course
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).first().click();
  await expect(page.getByTestId("calendar-card").getByRole("rowheader")).toHaveCount(1);
  await expect(page.getByLabel("Syllabuddy course for STATISTICS")).not.toHaveValue("");
  expect(errors).toEqual([]);
});

test("V2-7: import with your AI assistant, Blackboard sessions as dates, quick add", async ({ page }) => {
  const errors = watchForErrors(page);
  await signUp(page, "aiimport");
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const inDays = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d;
  };

  // A) Copy the prompt, paste the sample answer, review
  await page.getByRole("link", { name: "Courses", exact: true }).filter({ visible: true }).first().click();
  await page.getByTestId("assistant-import-button").click();
  const box = page.getByTestId("assistant-import");
  await expect(box.getByLabel("Prompt for your AI assistant")).toHaveValue(/DELIVERABLE: <title> \| <type>/);
  await box.getByTestId("assistant-answer").fill("COURSE: Broken\nDELIVERABLE: Essay | essay | next Friday | 10%");
  await box.getByTestId("read-answer").click();
  await expect(box.getByRole("alert")).toContainText('Line 2: the date "next Friday" should look like 2026-11-15');
  await box.getByTestId("paste-sample").click();
  await box.getByTestId("read-answer").click();
  const review = page.getByTestId("assistant-review");
  await expect(review.getByLabel("Course name")).toHaveValue("Behavioral Economics");
  await expect(review.getByText("The syllabus says session 16 — pick its date.")).toBeVisible();
  // Without Blackboard, a "Session N" deadline needs its date
  await review.getByTestId("assistant-save").click();
  await expect(review.getByRole("alert")).toContainText("pick its date");
  for (const t of ["Reading reflection", "Final project", "Final exam"]) await review.getByLabel(`Import ${t}`).uncheck();
  await review.locator('input[type="date"]').first().fill(iso(inDays(20)));
  await expect(review.getByText("4 session topics — saved for exam prep")).toBeVisible();
  await expectNoAxeViolations(page, "/courses assistant review");
  await review.getByTestId("assistant-save").click();
  await expect(page.getByText("Imported 1 course with 1 deadline.")).toBeVisible();

  // B) Connect Blackboard: the folder's deadline form offers "Session N · date"
  const first = inDays(1);
  const local = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:beh@test",
    "SUMMARY:BEHAVIORAL ECONOMICS Live in-person ",
    `DTSTART:${local(first)}T100000`,
    `DTEND:${local(first)}T112000`,
    "RRULE:FREQ=WEEKLY;COUNT=12",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  await page.getByRole("link", { name: "Plan", exact: true }).filter({ visible: true }).first().click();
  await page
    .getByTestId("calendar-file-input")
    .setInputFiles({ name: "bb.ics", mimeType: "text/calendar", buffer: Buffer.from(ics) });
  await expect(page.getByText("Blackboard calendar connected")).toBeVisible();
  await page.getByRole("link", { name: "Courses", exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("link", { name: /^Behavioral Economics/ }).click();
  await page.getByRole("radio", { name: "Blackboard session" }).check();
  await page.getByLabel("Session", { exact: true }).selectOption("3");
  await page.getByTestId("course-deadline-title").fill("Quiz 1");
  await page.getByTestId("course-deadline-add").click();
  await expect(page.getByTestId("course-deadlines")).toContainText("Quiz 1");

  // …and an import of "Session N" deadlines takes the date from Blackboard
  await page.getByTestId("assistant-import-button").click();
  await page.getByTestId("paste-sample").click();
  await page.getByTestId("read-answer").click();
  await expect(page.getByTestId("assistant-review").getByText(/^Date from Blackboard: Session 9 ·/)).toBeVisible();

  // C) Quick add on Today fills the form
  await page.getByRole("link", { name: "Today" }).filter({ visible: true }).first().click();
  await page.getByText("More options (quick add, date, course, weight) — optional").click();
  await page.getByTestId("quick-add-input").fill("Behavioral essay 30%");
  await page.getByTestId("quick-add-fill").click();
  await expect(page.getByTestId("core-input")).toHaveValue("Essay");
  await expect(page.getByLabel("Weight (% of grade)")).toHaveValue("30");
  await page.getByTestId("core-submit").click();
  await expect(page.getByTestId("core-item").filter({ hasText: "Essay" })).toBeVisible();
  expect(errors).toEqual([]);
});
