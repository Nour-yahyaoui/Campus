#!/usr/bin/env node
/**
 * Visual check for the light and dark themes at phone, tablet and desktop
 * widths. It exists because the themes are pure CSS: a script that opens the
 * real pages at real viewports is the only way to be sure nothing stayed pale
 * on a dark background.
 *
 *   npm i -D playwright            # once
 *   npx playwright install chromium
 *   node scripts/theme-check.mjs http://localhost:3000
 *
 * Writes PNGs to `theme-check/` and fails with a non-zero exit code if a page
 * renders the same background in both themes — the one symptom that means the
 * dark theme is not being applied at all.
 */

import { mkdir, writeFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://localhost:3000";
const routes = process.argv.slice(3);
const pages = routes.length > 0 ? routes : ["/", "/clubs", "/events", "/login", "/admin"];

const viewports = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 834, height: 1112 },
  { name: "desktop", width: 1440, height: 900 },
];

const { chromium } = await import("playwright");
const browser = await chromium.launch();
const output = new URL("../theme-check/", import.meta.url);
await mkdir(output, { recursive: true });

const failures = [];
const report = [];

for (const viewport of viewports) {
  for (const page of pages) {
    const backgrounds = {};
    for (const scheme of ["light", "dark"]) {
      const tab = await browser.newPage({ viewport, colorScheme: scheme });
      await tab.emulateMedia({ colorScheme: scheme });
      await tab.goto(new URL(page, base).href, { waitUntil: "networkidle" });
      // The theme starts in the system state, which the emulation drives.
      await tab.waitForTimeout(250);
      backgrounds[scheme] = await tab.evaluate(() => {
        const body = getComputedStyle(document.body);
        const header = document.querySelector(".site-header");
        return {
          body: body.backgroundColor,
          text: body.color,
          header: header ? getComputedStyle(header).backgroundColor : null,
        };
      });
      const file = new URL(`${scheme}-${viewport.name}${page.replace(/\//g, "-") || "-home"}.png`, output);
      await tab.screenshot({ path: file, fullPage: true });
      await tab.close();
    }
    const same = backgrounds.light.body === backgrounds.dark.body;
    if (same) failures.push(`${viewport.name} ${page}: background identical in both themes (${backgrounds.light.body})`);
    report.push({ viewport: viewport.name, page, ...backgrounds });
  }
}

await writeFile(new URL("report.json", output), JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
await browser.close();

if (failures.length > 0) {
  console.error("\nTheme check failed:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\n${report.length} page/viewport combinations rendered in both themes -> ${output.pathname}`);
