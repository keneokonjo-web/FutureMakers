// Regenerates the social-share image and icon PNGs. Needs Playwright (dev only):
//   node tools/make-images.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const shoot = async (file, out, w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.goto('file://' + path.join(root, file));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(root, out) });
  await page.close();
};
await shoot('tools/og-source.html', 'assets/og/og-image.png', 1200, 630);
await shoot('assets/favicon.svg', 'assets/favicon-32.png', 32, 36);
await shoot('assets/favicon.svg', 'assets/apple-touch-icon.png', 180, 202);
await browser.close();
