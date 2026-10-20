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
  await page.goto(base);
  await page.getByTestId("demo-button").click();
  await page.waitForURL(/\/today$/);
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

await shoot({ width: 1280, height: 800 }, [
  ["landing", "/"],
  ["today", "/today"],
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

await shoot({ width: 390, height: 844 }, [["mobile-today", "/today"]]);

await browser.close();
