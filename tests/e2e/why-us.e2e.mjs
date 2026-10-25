import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startSite, loadPlaywright } from './harness.mjs';

const SHOTS = process.env.SHOTS_DIR || '/tmp/fm-e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await loadPlaywright();
const site = await startSite();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());
const results = [];
async function t(name, fn) {
  try { await fn(); results.push(1); console.log('PASS', name); } catch (e) { results.push(0); console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 5).join('\n    ')); }
}
async function open(width = 1280, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(`${site.url}/why-us.html`);
  await page.waitForSelector('#match-board .mcard');
  return page;
}
/** Reads the pair ids straight from the DOM so the test can play perfectly. */
const pairs = (page) => page.$$eval('.mcard', (els) => els.map((e) => e.dataset.pair));

await t('page renders, nav links work, no console errors', async () => {
  const page = await open();
  assert.match(await page.title(), /Why choose FutureMakers/);
  assert.equal(await page.locator('.reason').count(), 6);
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.getAttribute('.nav a[aria-current="page"]', 'href'), 'why-us.html');
  assert.equal(await page.getAttribute('.nav-cta', 'href'), 'index.html#pricing');
  assert.equal(await page.locator('.mcard').count(), 12);
  assert.deepEqual(page.errors, []);
  await page.screenshot({ path: path.join(SHOTS, 'why-top.png') });
  await page.screenshot({ path: path.join(SHOTS, 'why-full.png'), fullPage: true });
  await page.context().close();
});

await t('home page links to the new page and the new page links back', async () => {
  const page = await open();
  await page.click('.nav a[href="index.html#weekend"]');
  await page.waitForSelector('#register-form');
  assert.ok(page.url().includes('index.html'));
  assert.equal(await page.locator('#primary-nav a[href="why-us.html"]').count(), 1);
  assert.equal(await page.locator('.site-footer a[href="why-us.html"]').count(), 1);
  await page.click('#primary-nav a[href="why-us.html"]');
  await page.waitForSelector('#match-board .mcard');
  await page.context().close();
});

await t('game: perfect play wins in 6 moves with 3 stars, announces it, can restart', async () => {
  const page = await open();
  const ids = await pairs(page);
  for (const id of [...new Set(ids)]) {
    const idx = ids.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
    await page.locator('.mcard').nth(idx[0]).click();
    await page.locator('.mcard').nth(idx[1]).click();
  }
  await page.waitForSelector('#match-result:not([hidden])');
  assert.equal(await page.innerText('#match-moves'), '6');
  assert.match(await page.innerText('#match-result-text'), /6 moves/);
  assert.equal((await page.innerText('#match-stars')).trim(), '★★★');
  assert.equal(await page.locator('.mcard.is-matched').count(), 12);
  assert.equal(await page.innerText('#match-best'), '6');
  assert.match(await page.innerText('#match-live'), /You win/);
  await page.screenshot({ path: path.join(SHOTS, 'why-win.png') });
  await page.click('#match-again');
  assert.equal(await page.locator('.mcard.is-matched').count(), 0);
  assert.equal(await page.innerText('#match-moves'), '0');
  assert.equal(await page.isHidden('#match-result'), true);
  await page.context().close();
});

await t('game: mismatch flips back, locks input meanwhile, same card twice does not count', async () => {
  const page = await open();
  const ids = await pairs(page);
  const a = 0;
  const b = ids.findIndex((x, i) => i > 0 && x !== ids[0]);
  await page.locator('.mcard').nth(a).click();
  await page.locator('.mcard').nth(a).click(); // same card: ignored
  assert.equal(await page.innerText('#match-moves'), '0');
  await page.locator('.mcard').nth(b).click();
  assert.equal(await page.innerText('#match-moves'), '1');
  assert.equal(await page.locator('.mcard.is-open').count(), 2);
  const c = ids.findIndex((x, i) => i !== a && i !== b);
  await page.locator('.mcard').nth(c).click(); // locked
  assert.equal(await page.locator('.mcard.is-open').count(), 2);
  await page.waitForFunction(() => document.querySelectorAll('.mcard.is-open').length === 0, null, { timeout: 4000 });
  await page.context().close();
});

await t('game: keyboard playable with accessible names; new game reshuffles', async () => {
  const page = await open();
  await page.focus('.mcard >> nth=0');
  await page.keyboard.press('Enter');
  assert.equal(await page.getAttribute('.mcard >> nth=0', 'aria-pressed'), 'true');
  assert.match(await page.getAttribute('.mcard >> nth=0', 'aria-label'), /^(Big idea|Little shop|Sketch it|Set a price|Earn a coin|AI helper)/);
  assert.match(await page.getAttribute('.mcard >> nth=1', 'aria-label'), /face down/);
  const before = (await pairs(page)).join();
  let changed = false;
  for (let i = 0; i < 5 && !changed; i += 1) { await page.click('#match-reset'); changed = (await pairs(page)).join() !== before; }
  assert.ok(changed, 'deck order changes on new game');
  await page.context().close();
});

await t('mobile 375px: no horizontal scroll, cards big enough to tap', async () => {
  const page = await open(375, 740);
  const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, h: Math.min(...[...document.querySelectorAll('.mcard')].map((c) => c.getBoundingClientRect().height)), w: Math.min(...[...document.querySelectorAll('.mcard')].map((c) => c.getBoundingClientRect().width)) }));
  assert.ok(m.over <= 1, `h-scroll ${m.over}`);
  assert.ok(m.h >= 44 && m.w >= 44, `card size ${m.w}x${m.h}`);
  await page.locator('#play').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SHOTS, 'why-mobile-game.png') });
  await page.click('.menu-btn');
  await page.screenshot({ path: path.join(SHOTS, 'why-mobile-menu.png') });
  assert.equal(await page.getAttribute('.menu-btn', 'aria-expanded'), 'true');
  await page.context().close();
});

await browser.close(); site.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
