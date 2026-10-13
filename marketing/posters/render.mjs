// Re-renders the posters from src/*.html to PNG (2160x2700) and PDF.
//   node marketing/posters/render.mjs   (needs a static server on :8080, i.e. `npm start`, and Playwright)
import { chromium } from 'playwright';
const names = { business: 'futuremakers-saturday-business-workshop', ai: 'futuremakers-sunday-ai-workshop' };
const browser = await chromium.launch();
for (const [src, out] of Object.entries(names)) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:8080/marketing/posters/src/${src}.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `marketing/posters/${out}.png` });
  await page.pdf({ path: `marketing/posters/${out}.pdf`, width: '1080px', height: '1350px', printBackground: true });
  await page.close();
}
await browser.close();
