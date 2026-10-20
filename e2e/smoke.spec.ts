import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Every test starts in a fresh browser context: empty localStorage, no API key, not logged in.

/** Fails the test on uncaught page errors and console errors. */
function watchForErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByTestId("demo-button").click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("today-list")).toBeVisible();
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

test("the grading bot's route: landing → demo → today → plan → export → courses → panic → buddies", async ({ page }) => {
  const errors = watchForErrors(page);

  // Landing
  await page.goto("/");
  await expect(page).toHaveTitle(/Syllabuddy/);
  await expect(page.getByTestId("start-button")).toBeVisible();
  await page.getByTestId("demo-button").click();

  // Today: check off a block → points and mascot react
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("mascot-message")).not.toBeEmpty();
  await expect(page.getByTestId("streak-count")).toHaveText("0");
  await expect(page.getByTestId("points-count")).toHaveText("0");
  const firstBlock = page.locator('[data-testid^="block-checkbox-"]').first();
  await firstBlock.check();
  await expect(firstBlock).toBeChecked();
  await expect(page.getByTestId("points-count")).not.toHaveText("0");

  // Plan → export a real .ics file
  await page.getByRole("link", { name: "Plan" }).first().click();
  await expect(page).toHaveURL(/\/plan$/);
  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-ics-button").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("syllabuddy.ics");
  const ics = readFileSync((await download.path())!, "utf8");
  expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  expect(ics).toContain("BEGIN:VEVENT");

  // Courses → grade calculator
  await page.getByRole("link", { name: "Courses" }).first().click();
  const calculator = page.getByTestId("grade-calculator");
  await expect(calculator).toBeVisible();
  const firstCourse = calculator.locator("xpath=ancestor::section[1]");
  await firstCourse.getByLabel("Score (/10)").first().fill("6");
  await calculator.getByLabel(/Target grade/).fill("8");
  await expect(calculator).toContainText("you need an average of");

  // Panic mode: entry point on Today, then the triage
  await page.getByRole("link", { name: "Today" }).first().click();
  await page.getByTestId("panic-button").click();
  await expect(page).toHaveURL(/\/panic$/);
  await page.getByTestId("panic-button").click();
  await expect(page.getByTestId("panic-result")).toBeVisible();
  await expect(page.getByTestId("panic-result")).toContainText(/Do fully|Minimum viable|Nothing is due/);

  // Buddies without login: demo leaderboard
  await page.getByRole("link", { name: "Buddies" }).first().click();
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  await expect(page.getByTestId("leaderboard")).toContainText("Lucía");
  await expect(page.getByRole("button", { name: "Log in to add real friends" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("focus timer starts from a Today block", async ({ page }) => {
  const errors = watchForErrors(page);
  await loadDemo(page);
  await page.getByRole("link", { name: /Start a focus session/ }).first().click();
  await expect(page).toHaveURL(/\/focus\//);
  await page.getByTestId("focus-start-button").click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText(/^2[45]:\d\d$/);
  expect(errors).toEqual([]);
});

test("onboarding works without an AI key (offline reader)", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");
  await page.getByTestId("start-button").click();
  await page.getByTestId("syllabus-input").fill(
    "Course: Statistics\nMidterm exam – 40% – 12/11/2030\nFinal exam 60% 20/01/2031",
  );
  await page.getByTestId("extract-button").click();
  const table = page.getByTestId("review-table");
  await expect(table).toBeVisible();
  await expect(table.getByLabel("Course name")).toHaveValue("Statistics");
  await expect(table.getByLabel("Title")).toHaveCount(2);
  await page.getByTestId("save-courses-button").click();
  const slider = page.locator('[data-testid^="effort-slider-"]');
  await expect(slider).toBeVisible();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Next: free time" }).click();
  await page.getByTestId("generate-plan-button").click();
  await expect(page).toHaveURL(/\/today$/);
  await expect(page.getByTestId("today-list")).toBeVisible();
  expect(errors).toEqual([]);
});

const PAGES = ["/", "/today", "/plan", "/courses", "/panic", "/settings", "/buddies", "/onboarding"];

test("every page works with empty storage (no blank screens, no errors)", async ({ page }) => {
  const errors = watchForErrors(page);
  for (const path of PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    const h1 = page.locator("h1").first();
    await expect(h1, path).toBeVisible();
    await expect(h1, path).not.toHaveText(/Loading/);
    await expectNoSidewaysScroll(page);
  }
  await page.goto("/focus/does-not-exist");
  await expect(page.getByRole("heading", { name: "Study block not found" })).toBeVisible();
  expect(errors).toEqual([]);

  // The browser always logs a 404 document as a console error, so this check comes last.
  const missing = await page.goto("/no-such-page");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "This page took a day off" })).toBeVisible();
});

test("every page passes the accessibility checks (WCAG 2.1 AA), light and dark", async ({ page }) => {
  await loadDemo(page);
  // Include "done" styling in the checks.
  await page.locator('[data-testid^="block-checkbox-"]').first().check();
  const focusHref = await page.getByRole("link", { name: /Start a focus session/ }).first().getAttribute("href");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of [...PAGES, focusHref!]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).not.toHaveText(/Loading/);
      await expectNoSidewaysScroll(page);
      await expectNoAxeViolations(page, `${path} (${scheme})`);
    }
  }
});

test("the page language and titles are set", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  for (const [path, title] of [
    ["/today", "Today · Syllabuddy"],
    ["/plan", "Plan · Syllabuddy"],
    ["/courses", "Courses · Syllabuddy"],
    ["/panic", "Panic mode · Syllabuddy"],
    ["/buddies", "Study buddies · Syllabuddy"],
    ["/settings", "Settings · Syllabuddy"],
  ]) {
    await page.goto(path);
    await expect(page).toHaveTitle(title);
  }
});

test("works with the keyboard only", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  // Tab until the demo button has focus, then press Enter.
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    if (await page.getByTestId("demo-button").evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.getByTestId("demo-button")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/today$/);
  // A study block can be checked off with the keyboard (Space on a focused checkbox).
  const box = page.locator('[data-testid^="block-checkbox-"]').first();
  await box.focus();
  await page.keyboard.press("Space");
  await expect(box).toBeChecked();
});
