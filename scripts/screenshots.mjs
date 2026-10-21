// Takes the README screenshots from the demo semester.
// Usage: node scripts/screenshots.mjs [base URL]   (default: the live site)
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "https://syllabuddy-five.vercel.app";
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();

async function shoot(viewport, shots) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2, colorScheme: "light" });
  // A throwaway account filled with the sample semester.
  await page.goto(`${base}/signup`);
  await page.getByTestId("signup-email").fill(`screenshots-${Date.now()}@example.com`);
  await page.getByTestId("signup-password").fill(`Shots-${Math.random().toString(36).slice(2)}`);
  await page.getByTestId("signup-submit").click();
  await page.waitForURL(/\/app$/);
  await page.getByTestId("demo-button").click();
  await page.getByTestId("today-list").waitFor();
  // Tick one block so points and progress show something.
  await page.locator('[data-testid^="block-checkbox-"]').first().check();
  // Let the plan finish saving before the next full page load.
  await page.waitForTimeout(3000);
  for (const [name, path, prepare] of shots) {
    await page.goto(base + path);
    await page.locator("h1").first().waitFor();
    if (prepare) await prepare(page);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`saved ${out}/${name}.png`);
  }
  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  await page.goto(base);
  await page.locator("h1").waitFor();
  await page.screenshot({ path: `${out}/landing.png` });
  console.log(`saved ${out}/landing.png`);
  await page.close();
}

await shoot({ width: 1280, height: 800 }, [
  ["today", "/app"],
  ["plan", "/plan", (page) => page.getByRole("heading", { name: /^Week of/ }).evaluate((el) => el.scrollIntoView())],
  [
    "courses",
    "/courses",
    async (page) => {
      // A course folder: deadlines table and grade calculator.
      await page.locator('[data-testid^="course-folder-"]').first().click();
      await page.getByTestId("course-deadlines").getByLabel("Score (/10)").first().fill("6");
      await page.getByTestId("grade-calculator").getByLabel(/Target grade/).fill("7");
      await page.getByTestId("course-deadlines").scrollIntoViewIfNeeded();
    },
  ],
  [
    "exam",
    "/courses",
    async (page) => {
      await page.getByRole("link", { name: /^Statistics/ }).click();
      await page.locator('[data-testid^="exam-prep-link-"]').first().click();
      await page.getByTestId("exam-prep").waitFor();
      await page.getByRole("heading", { name: "Day by day" }).scrollIntoViewIfNeeded();
    },
  ],
  ["panic", "/panic"],
]);

await shoot({ width: 390, height: 844 }, [["mobile-today", "/app"]]);

await browser.close();
