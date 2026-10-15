import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startSite, startMockBackend, loadPlaywright, injectBackend } from './harness.mjs';

const SHOTS = process.env.SHOTS_DIR || '/tmp/fm-e2e-shots';
fs.mkdirSync(SHOTS, { recursive: true });
const { chromium } = await loadPlaywright();
const site = await startSite();
const mock = await startMockBackend();
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' }).catch(() => chromium.launch());

const results = [];
async function t(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); } catch (e) { results.push(['FAIL', name, e]); console.log('FAIL', name, '\n   ', e.message.split('\n').slice(0, 6).join('\n    ')); }
}
const reset = () => { mock.ctl.mode = 'ok'; mock.ctl.tamper = null; mock.ctl.calls.length = 0; };
const dump = async () => (await fetch(`${mock.base}/dump`)).json();

async function newPage({ width = 1280, height = 900, connected = true, permissions = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, permissions: permissions ? ['clipboard-read', 'clipboard-write'] : [], acceptDownloads: false });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await injectBackend(page, connected ? mock.url : '');
  // Block any real external navigation (Revolut / WhatsApp) so tests never leave the site.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.goto(`${site.url}/index.html`);
  await page.waitForSelector('#register-form');
  return page;
}

const COUNTRY = { ngn: 'NG', gbp: 'GB', usd: 'US' };
async function fillAndSubmit(page, { option, currency, name = 'Ada Obi', email = 'ada@example.com', phone = '+234 801 234 5678', children = '1', submit = true }) {
  await page.click(`.opt:has(input[value="${option}"])`);
  await page.click(`.currency label:has(input[value="${currency}"])`);
  await page.fill('#f-name', name);
  await page.fill('#f-email', email);
  await page.fill('#f-phone', phone);
  await page.selectOption('#f-country', COUNTRY[currency]);
  await page.selectOption('#f-children', children);
  if (!(await page.isChecked('input[name="band"][value="junior"]'))) await page.check('input[name="band"][value="junior"]');
  if (!(await page.isChecked('#f-guardian'))) await page.check('#f-guardian');
  if (submit) await page.click('#submit-btn');
}
const modalOpen = (page) => page.waitForSelector('#pay-dialog[open] [data-testid="pay-ref"]', { timeout: 8000 });
const text = (page, sel) => page.locator(sel).first().innerText();

const MATRIX = [
  ['business', 'ngn', '₦60,000 NGN', 'Young Entrepreneurs Lab', 60000],
  ['weekend', 'ngn', '₦100,000 NGN', 'Both workshops', 100000],
  ['business', 'gbp', '£30.00 GBP', 'Young Entrepreneurs Lab', 30],
  ['weekend', 'gbp', '£52.50 GBP', 'Both workshops', 52.5],
  ['ai', 'usd', '$40.00 USD', 'AI Creators Lab', 40],
  ['weekend', 'usd', '$70.00 USD', 'Both workshops', 70],
];

for (const [option, currency, shown, pkg, owed] of MATRIX) {
  await t(`matrix ${option}/${currency}: modal + sheet record`, async () => {
    reset();
    const page = await newPage();
    const before = (await dump()).registrations.length;
    await fillAndSubmit(page, { option, currency, email: `m-${option}-${currency}@example.com` });
    await modalOpen(page);
    assert.equal(await text(page, '[data-testid="pay-amount"]'), shown);
    assert.ok((await text(page, '[data-testid="pay-package"]')).includes(pkg));
    assert.equal(await text(page, '[data-testid="pay-currency"]'), currency.toUpperCase());
    const ref = await text(page, '[data-testid="pay-ref"]');
    assert.match(ref, /^FM-[A-Z0-9]{6}$/);
    const body = await text(page, '#pay-dialog');
    if (currency === 'ngn') {
      for (const s of ['7047167280', 'ONYEMA UZODINMA', '5295905851', 'KENELUMCHUKWU OKONJO', 'OPay', 'Moniepoint']) assert.ok(body.includes(s), s);
      assert.equal(await page.locator('#revolut-link').count(), 0);
      assert.ok(!body.includes('revolut'));
      assert.ok(body.includes('Transfer the exact amount shown to either account. After making your payment, submit your payment confirmation using the instructions provided below. Your registration will remain pending until payment has been verified.'));
    } else {
      assert.equal(await page.locator('#revolut-link').count(), 1);
      for (const s of ['Account number', 'ONYEMA', 'KENELUMCHUKWU', 'Moniepoint', 'OPay', '5295905851']) assert.ok(!body.includes(s), `intl modal leaks ${s}`);
      assert.ok(body.includes('Open Revolut to complete your payment using the exact amount shown above. Your registration will remain pending until payment has been verified.'));
    }
    assert.ok(body.includes('Confirm Your Payment'));
    const rows = (await dump()).registrations;
    assert.equal(rows.length, before + 1);
    const row = rows.find((r) => r['Registration reference'] === ref);
    assert.ok(row, 'row for reference exists');
    assert.equal(row['Currency'], currency.toUpperCase());
    assert.equal(row['Amount owed'], owed);
    assert.equal(row['Payment status'], 'Pending');
    assert.equal(row['Email'], `m-${option}-${currency}@example.com`);
    assert.equal(row['Contact number'], '+234 801 234 5678');
    assert.equal(row['Package'].startsWith(option === 'weekend' ? 'Both' : option === 'ai' ? 'AI' : 'Young'), true);
    await page.screenshot({ path: path.join(SHOTS, `desktop-${option}-${currency}.png`) });
    assert.deepEqual(page.errors, []);
    await page.context().close();
  });
}

await t('mobile 375px: no horizontal overflow, content reachable (all currencies)', async () => {
  for (const currency of ['ngn', 'gbp', 'usd']) {
    reset();
    const page = await newPage({ width: 375, height: 700 });
    await fillAndSubmit(page, { option: 'weekend', currency, email: `mob-${currency}@example.com` });
    await modalOpen(page);
    const m = await page.evaluate(() => {
      const d = document.querySelector('#pay-dialog');
      const r = d.getBoundingClientRect();
      const kids = [...d.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > r.right + 1 && getComputedStyle(e).position !== 'fixed');
      return { dlg: d.scrollWidth - d.clientWidth, doc: document.documentElement.scrollWidth - window.innerWidth, left: r.left, right: window.innerWidth - r.right, overflowing: kids.map((e) => e.className || e.tagName).slice(0, 5) };
    });
    assert.ok(m.dlg <= 1, `dialog h-scroll ${JSON.stringify(m)}`);
    assert.ok(m.doc <= 1, `doc h-scroll ${JSON.stringify(m)}`);
    assert.deepEqual(m.overflowing, []);
    await page.evaluate(() => document.querySelector('#pay-dialog').scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `mobile-top-${currency}.png`) });
    await page.evaluate(() => { const d = document.querySelector('#pay-dialog'); d.scrollTo(0, d.scrollHeight); });
    await page.screenshot({ path: path.join(SHOTS, `mobile-bottom-${currency}.png`) });
    const btnH = await page.evaluate(() => [...document.querySelectorAll('#pay-dialog button, #pay-dialog a.btn')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect().height));
    assert.ok(btnH.every((h) => h >= 40), `tap targets ${btnH}`);
    await page.context().close();
  }
});

await t('copy buttons copy the right text and show visible "Copied" feedback', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'weekend', currency: 'ngn', email: 'copy@example.com' });
  await modalOpen(page);
  const ref = await text(page, '[data-testid="pay-ref"]');
  const cases = [['reference', ref], ['amount', '100000.00'], ['opay-number', '7047167280'], ['opay-name', 'ONYEMA UZODINMA'], ['moniepoint-number', '5295905851'], ['moniepoint-name', 'KENELUMCHUKWU OKONJO']];
  for (const [key, expected] of cases) {
    await page.click(`[data-copy="${key}"]`);
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expected, key);
    assert.match(await text(page, `[data-copy="${key}"]`), /Copied/);
  }
  await page.click('[data-copy="all"]');
  const all = await page.evaluate(() => navigator.clipboard.readText());
  for (const s of [ref, '₦100,000 NGN', '7047167280', '5295905851', 'ONYEMA UZODINMA', 'keneokonjo44@gmail.com']) assert.ok(all.includes(s), s);
  await page.waitForTimeout(2500);
  assert.match(await text(page, '[data-copy="reference"]'), /^Copy$/);
  await page.context().close();
  // international buttons
  const p2 = await newPage();
  await fillAndSubmit(p2, { option: 'weekend', currency: 'gbp', email: 'copy2@example.com' });
  await modalOpen(p2);
  await p2.click('[data-copy="amount"]');
  assert.equal(await p2.evaluate(() => navigator.clipboard.readText()), '52.50');
  await p2.click('[data-copy="reference"]');
  assert.match(await p2.evaluate(() => navigator.clipboard.readText()), /^FM-/);
  await p2.context().close();
});

await t('copy failure is reported honestly (no false "Copied")', async () => {
  reset();
  const page = await newPage({ permissions: false });
  await fillAndSubmit(page, { option: 'business', currency: 'gbp', email: 'cf@example.com' });
  await modalOpen(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
    document.execCommand = () => false;
  });
  await page.click('[data-copy="reference"]');
  await page.waitForSelector('#copy-hint-reference:not(:empty)');
  assert.match(await text(page, '#copy-hint-reference'), /Could not copy automatically/);
  assert.doesNotMatch(await text(page, '[data-copy="reference"]'), /Copied/);
  const sel = await page.evaluate(() => String(window.getSelection()));
  assert.match(sel, /^FM-/);
  await page.context().close();
});

await t('Revolut link, email and WhatsApp buttons: exact targets, populated reference; clicks never mark Paid', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'weekend', currency: 'usd', email: 'links@example.com', name: 'Ada Obi' });
  await modalOpen(page);
  const ref = await text(page, '[data-testid="pay-ref"]');
  const rev = page.locator('#revolut-link');
  assert.equal(await rev.getAttribute('href'), 'https://revolut.me/keneokonjo');
  assert.equal(await rev.getAttribute('target'), '_blank');
  assert.match(await rev.getAttribute('rel'), /noopener/);
  assert.match(await rev.getAttribute('rel'), /noreferrer/);
  assert.equal((await rev.innerText()).trim(), 'Pay with Revolut');
  const mail = new URL(await page.locator('#email-confirm').getAttribute('href'));
  assert.equal(mail.protocol, 'mailto:');
  assert.equal(decodeURIComponent(mail.pathname), 'keneokonjo44@gmail.com');
  assert.equal(mail.searchParams.get('subject'), `FutureMakers Academy Payment Confirmation — ${ref}`);
  assert.ok(mail.searchParams.get('body').includes(ref));
  assert.ok(mail.searchParams.get('body').includes('$70.00 USD'));
  assert.equal((await text(page, '#email-confirm')).trim(), 'Email Payment Confirmation');
  const wa = new URL(await page.locator('#wa-confirm').getAttribute('href'));
  assert.equal(wa.origin + wa.pathname, 'https://wa.me/2347047167280');
  assert.equal(wa.searchParams.get('text'), `Hello, I have made my payment for FutureMakers Academy. My registration reference is ${ref}. I will send my payment receipt screenshot here.`);
  assert.equal((await text(page, '#wa-confirm')).trim(), 'Send Screenshot on WhatsApp');
  assert.equal(await page.locator('#wa-confirm').getAttribute('target'), '_blank');
  assert.match(await text(page, '#pay-dialog'), /Send a screenshot of your payment receipt to \+234 7047167280 on WhatsApp/);
  // Clicking logs intent but must not change status. Intercept navigation so the test stays on-site.
  await page.evaluate(() => document.querySelectorAll('#email-confirm,#wa-confirm').forEach((a) => a.addEventListener('click', (e) => e.preventDefault())));
  await page.click('#email-confirm');
  await page.click('#wa-confirm');
  await page.waitForTimeout(500);
  const row = (await dump()).registrations.find((r) => r['Registration reference'] === ref);
  assert.equal(row['Payment status'], 'Pending');
  assert.match(row['Confirmation channel opened'], /email @.*whatsapp @/);
  assert.notEqual(row['Payment status'], 'Paid');
  await page.context().close();
});

await t('confirmation form: sets "Payment submitted — awaiting verification", never Paid; survives reload', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'weekend', currency: 'ngn', email: 'conf@example.com' });
  await modalOpen(page);
  const ref = await text(page, '[data-testid="pay-ref"]');
  await page.click('#confirm-details summary');
  assert.equal(await page.inputValue('#c-ref'), ref);
  assert.equal(await page.inputValue('#c-amount'), '100000.00');
  await page.fill('#c-txn', 'OPAY-998877');
  await page.click('#confirm-submit');
  await page.waitForFunction(() => document.querySelector('#confirm-status')?.textContent.includes('Thank you'));
  assert.match(await text(page, '[data-testid="pay-status"]'), /Payment submitted — awaiting verification/);
  const dumped = await dump();
  const row = dumped.registrations.find((r) => r['Registration reference'] === ref);
  assert.equal(row['Payment status'], 'Payment submitted — awaiting verification');
  assert.equal(row['Transaction reference (reported)'], 'OPAY-998877');
  assert.equal(row['Method used (reported)'], 'OPay');
  assert.ok(dumped.confirmations.some((c) => c['Registration reference'] === ref));
  await page.click('#pay-dialog [data-close] >> nth=-1');
  assert.match(await text(page, '#resume-status'), /Payment submitted/);
  await page.reload();
  await page.waitForSelector('#resume-banner:not([hidden])');
  assert.equal(await text(page, '#resume-ref'), ref);
  await page.click('#resume-view');
  await modalOpen(page);
  assert.equal(await text(page, '[data-testid="pay-ref"]'), ref);
  assert.equal(await text(page, '[data-testid="pay-amount"]'), '₦100,000 NGN');
  await page.context().close();
});

await t('"Already paid?" standalone confirm, wrong email rejected without recording', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'ai', currency: 'usd', email: 'solo@example.com' });
  await modalOpen(page);
  const ref = await text(page, '[data-testid="pay-ref"]');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pay-dialog:not([open])', { state: 'attached' });
  await page.click('#already-paid');
  await page.waitForSelector('#pay-dialog[open] #confirm-form');
  await page.fill('#c-email', 'wrong@example.com');
  await page.fill('#c-amount', '40');
  await page.click('#confirm-submit');
  await page.waitForFunction(() => document.querySelector('#confirm-status')?.textContent.includes('could not'));
  assert.match(await text(page, '#confirm-status'), /Nothing has been recorded/);
  assert.equal((await dump()).registrations.find((r) => r['Registration reference'] === ref)['Payment status'], 'Pending');
  await page.fill('#c-email', 'solo@example.com');
  await page.selectOption('#c-method', 'Revolut');
  await page.click('#confirm-submit');
  await page.waitForFunction(() => document.querySelector('#confirm-status')?.textContent.includes('Thank you'));
  assert.equal((await dump()).registrations.find((r) => r['Registration reference'] === ref)['Payment status'], 'Payment submitted — awaiting verification');
  await page.context().close();
});

await t('registration failure: backend down shows error, no modal, no false success, retry reuses one reference', async () => {
  reset();
  const page = await newPage();
  const before = (await dump()).registrations.length;
  mock.ctl.mode = 'down';
  await fillAndSubmit(page, { option: 'weekend', currency: 'gbp', email: 'down@example.com' });
  await page.waitForSelector('#form-status.status-error');
  assert.match(await text(page, '#form-status'), /Nothing has been saved/);
  assert.equal(await page.locator('#pay-dialog[open]').count(), 0);
  assert.equal(await page.locator('#resume-banner:not([hidden])').count(), 0);
  assert.ok((await page.locator('#form-status a').getAttribute('href')).startsWith('mailto:keneokonjo44@gmail.com'));
  assert.equal(await page.inputValue('#f-name'), 'Ada Obi', 'answers are kept');
  assert.equal((await dump()).registrations.length, before);
  assert.equal(await page.isDisabled('#submit-btn'), false);
  mock.ctl.mode = 'html'; // Google sign-in page instead of JSON
  await page.click('#submit-btn');
  await page.waitForFunction(() => document.querySelector('#form-status')?.textContent.includes('Nothing has been saved'));
  mock.ctl.mode = 'ok';
  await page.click('#submit-btn');
  await modalOpen(page);
  await page.keyboard.press('Escape');
  await page.click('#submit-btn');
  await modalOpen(page);
  assert.equal((await dump()).registrations.length, before + 1, 'exactly one row after retries and re-submits');
  await page.context().close();
});

await t('timeout is handled (hung backend)', async () => {
  reset();
  const page = await newPage();
  await page.route('**/js/config.js', async (route) => {
    const src = fs.readFileSync(new URL('../../js/config.js', import.meta.url), 'utf8').replace(/(export const BACKEND = \{\s*url: )'[^']*'/, `$1'${mock.url}'`).replace('timeoutMs: 30000', 'timeoutMs: 800');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: src });
  });
  await page.reload();
  mock.ctl.mode = 'hang';
  await fillAndSubmit(page, { option: 'business', currency: 'usd', email: 'hang@example.com' });
  await page.waitForSelector('#form-status.status-error', { timeout: 6000 });
  assert.match(await text(page, '#form-status'), /could not reach|Nothing has been saved/i);
  mock.ctl.mode = 'ok';
  await page.context().close();
});

await t('backend not configured: honest "not switched on" message, nothing pretended', async () => {
  reset();
  const page = await newPage({ connected: false });
  await fillAndSubmit(page, { option: 'weekend', currency: 'usd', email: 'nc@example.com' });
  await page.waitForSelector('#form-status.status-error');
  assert.match(await text(page, '#form-status'), /not switched on yet/);
  assert.equal(await page.locator('#pay-dialog[open]').count(), 0);
  assert.equal(mock.ctl.calls.length, 0);
  await page.context().close();
});

await t('tampered / inconsistent server answer: modal refuses to show payment details', async () => {
  reset();
  const page = await newPage();
  mock.ctl.tamper = { amountOwed: 1 };
  await fillAndSubmit(page, { option: 'weekend', currency: 'usd', email: 'tamper@example.com' });
  await page.waitForSelector('#form-status.status-error');
  assert.match(await text(page, '#form-status'), /could not show the payment details/);
  assert.equal(await page.locator('#pay-dialog[open]').count(), 0);
  await page.context().close();
});

await t('modal given missing/invalid data shows an error state, no payment details', async () => {
  reset();
  const page = await newPage();
  for (const bad of [null, {}, { reference: 'FM-ABC234', option: 'weekend', currency: 'usd', children: 1, amountOwed: 5 }, { reference: 'x', option: 'ai', currency: 'gbp', children: 1, amountOwed: 30 }, { reference: 'FM-ABC234', option: 'ai', currency: 'eur', children: 1, amountOwed: 30 }]) {
    await page.evaluate(async (b) => { const m = await import('/js/payment-modal.js'); m.openPayment(b); }, bad);
    await page.waitForSelector('#pay-dialog[open]');
    const body = await text(page, '#pay-dialog');
    assert.match(body, /could not show your payment details/);
    assert.ok(!/7047167280|revolut\.me/.test(body));
    await page.keyboard.press('Escape');
    await page.waitForSelector('#pay-dialog:not([open])', { state: 'attached' });
  }
  await page.context().close();
});

await t('modal a11y + UX: labelled dialog, focus moves in and returns, Esc/Close work, backdrop does not close', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'weekend', currency: 'ngn', email: 'a11y@example.com' });
  await modalOpen(page);
  const info = await page.evaluate(() => ({ labelled: document.querySelector('#pay-dialog').getAttribute('aria-labelledby'), focus: document.activeElement.id, title: document.querySelector('#pay-title').textContent }));
  assert.equal(info.labelled, 'pay-title');
  assert.equal(info.focus, 'pay-title');
  assert.equal(await page.getAttribute('.pay-close', 'aria-label'), 'Close payment window');
  assert.ok(await page.locator('[data-copy] >> nth=0').getAttribute('aria-label'));
  await page.mouse.click(2, 2); // backdrop
  assert.equal(await page.locator('#pay-dialog[open]').count(), 1);
  await page.click('.pay-close');
  await page.waitForSelector('#pay-dialog:not([open])', { state: 'attached' });
  assert.equal(await page.evaluate(() => document.activeElement.id), 'submit-btn');
  assert.match(await text(page, '#form-status'), /Your registration reference is FM-/);
  await page.context().close();
});

await t('validation + honeypot + gating still work', async () => {
  reset();
  const page = await newPage();
  await page.click('#submit-btn');
  assert.match(await text(page, '#form-status'), /Please check the form/);
  assert.equal(mock.ctl.calls.length, 0);
  await fillAndSubmit(page, { option: 'weekend', currency: 'usd', submit: false });
  await page.fill('#f-phone', 'abc');
  await page.click('#submit-btn');
  assert.match(await text(page, '#e-phone'), /does not look right/);
  await page.fill('#f-phone', '');
  await page.selectOption('#f-country', 'NG'); // choosing Nigeria switches the price list to naira
  assert.equal(await page.isChecked('.currency input[value="ngn"]'), true);
  await page.click('.currency label:has(input[value="usd"])'); // user forces a mismatch
  await page.click('#submit-btn');
  assert.match(await text(page, '#e-country'), /price list/);
  assert.equal(mock.ctl.calls.length, 0);
  await page.fill('#f-website', 'http://spam.example'); // honeypot filled by a bot -> backend rejects
  await page.click('.currency label:has(input[value="ngn"])');
  await page.click('#submit-btn');
  await page.waitForSelector('#form-status.status-error');
  assert.equal(await page.locator('#pay-dialog[open]').count(), 0);
  await page.context().close();
});

await t('page content: GBP toggle, prices, session time 5:00 PM, FAQ how-to-pay', async () => {
  const page = await newPage();
  assert.equal(await page.locator('.currency input').count(), 3);
  await page.click('.currency label:has(input[value="gbp"])');
  assert.match(await text(page, '#sum-total'), /£52\.50/);
  assert.match(await text(page, '.buy-time >> nth=0'), /5:00 PM/);
  assert.ok((await page.locator('#faq-list').innerText()).includes('How do I pay?'));
  assert.equal(await page.locator('#faq-list details').count(), 13);
  await page.context().close();
});

await t('"I\u2019ve made my payment" opens the receipt step with name, reference, amount; Back works; confirm from there', async () => {
  reset();
  const page = await newPage();
  await fillAndSubmit(page, { option: 'weekend', currency: 'gbp', email: 'receipt@example.com', name: 'Ada Obi' });
  await modalOpen(page);
  const ref = await text(page, '[data-testid="pay-ref"]');
  await page.click('[data-testid="made-payment"]');
  await page.waitForSelector('[data-testid="rc-ref"]');
  assert.equal(await text(page, '[data-testid="rc-ref"]'), ref);
  assert.equal(await text(page, '[data-testid="rc-name"]'), 'Ada Obi');
  assert.equal(await text(page, '[data-testid="rc-amount"]'), '£52.50 GBP');
  assert.match(await text(page, '#pay-title'), /Send your receipt/);
  const mail = new URL(await page.locator('#email-confirm').getAttribute('href'));
  assert.ok(mail.searchParams.get('body').includes('Ada Obi'));
  assert.ok(mail.searchParams.get('subject').endsWith(ref));
  assert.ok((await page.locator('#wa-confirm').getAttribute('href')).includes('wa.me/2347047167280'));
  await page.click('[data-copy="message"]');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  for (const s of ['Ada Obi', ref, '£52.50 GBP']) assert.ok(copied.includes(s), s);
  await page.click('#back-to-pay');
  await page.waitForSelector('[data-testid="pay-amount"]');
  await page.click('[data-testid="made-payment"]');
  await page.waitForSelector('#confirm-form');
  assert.equal(await page.inputValue('#c-name'), 'Ada Obi');
  await page.click('#confirm-submit');
  await page.waitForFunction(() => document.querySelector('#confirm-status')?.textContent.includes('Thank you'));
  assert.equal((await dump()).registrations.find((r) => r['Registration reference'] === ref)['Payment status'], 'Payment submitted \u2014 awaiting verification');
  await page.setViewportSize({ width: 375, height: 700 });
  const over = await page.evaluate(() => { const d = document.querySelector('#pay-dialog'); return d.scrollWidth - d.clientWidth; });
  assert.ok(over <= 1);
  await page.screenshot({ path: path.join(SHOTS, 'receipt-step-mobile.png') });
  await page.context().close();
});

await browser.close(); site.close(); mock.close();
const failed = results.filter((r) => r[0] === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
