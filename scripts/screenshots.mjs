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
  ["plan", "/plan"],
  [
    "courses",
    "/courses",
    async (page) => {
      const calculator = page.getByTestId("grade-calculator");
      await calculator.locator("xpath=ancestor::section[1]").getByLabel("Score (/10)").first().fill("6");
      await calculator.scrollIntoViewIfNeeded();
    },
  ],
  ["panic", "/panic"],
  ["buddies", "/buddies"],
]);

await shoot({ width: 390, height: 844 }, [["mobile-today", "/app"]]);

await browser.close();
