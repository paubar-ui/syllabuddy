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
  const calculator = page.getByTestId("grade-calculator");
  await calculator.locator("xpath=ancestor::section[1]").getByLabel("Score (/10)").first().fill("6");
  await calculator.getByLabel(/Target grade/).fill("8");
  await expect(calculator).toContainText("you need an average of");

  await page.goto("/app");
  await page.getByTestId("panic-button").click();
  await page.getByTestId("panic-button").click();
  await expect(page.getByTestId("panic-result")).toContainText(/Do fully|Minimum viable|Nothing is due/);

  await page.goto("/app");
  await page.getByRole("link", { name: "See the leaderboard" }).click();
  await expect(page.getByTestId("leaderboard")).toBeVisible();
  await page.getByRole("link", { name: "Settings" }).filter({ visible: true }).first().click();
  await expect(page.getByRole("link", { name: "Open study buddies" })).toBeVisible();

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

test("onboarding with a pasted syllabus works without an AI key", async ({ page }) => {
  await signUp(page, "onboarding");
  await page.goto("/onboarding");
  await expect(page.getByRole("link", { name: "Skip for now" })).toBeVisible();
  await page.getByTestId("syllabus-input").fill("Course: Statistics\nMidterm exam – 40% – 12/11/2030\nFinal exam 60% 20/01/2031");
  await page.getByTestId("extract-button").click();
  await expect(page.getByTestId("review-table").getByLabel("Title")).toHaveCount(2);
  await page.locator('[data-testid^="effort-slider-"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.getByTestId("save-courses-button").click();
  await page.getByTestId("generate-plan-button").click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByTestId("core-item")).toHaveCount(2);
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
