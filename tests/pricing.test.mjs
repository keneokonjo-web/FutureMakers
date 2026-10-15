import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICES, PRICE_IS_PER_CHILD, REGISTRATION, PAYMENTS, BACKEND } from '../js/config.js';
import { unitPrice, separateTotal, weekendSaving, total, formatMoney, formatExact, plainAmount, clampChildren, currencyForCountry } from '../js/pricing.js';
import { newReference, REF_RE, validateRegistration, callBackend, ApiError } from '../js/registration.js';

test('brief prices are configured exactly', () => {
  assert.deepEqual(PRICES.usd, { business: 40, ai: 40, weekend: 70 });
  assert.deepEqual(PRICES.gbp, { business: 30, ai: 30, weekend: 52.5 });
  assert.deepEqual(PRICES.ngn, { business: 60000, ai: 60000, weekend: 100000 });
});
test('bundle savings', () => {
  assert.equal(weekendSaving('usd'), 10);
  assert.equal(weekendSaving('gbp'), 7.5);
  assert.equal(weekendSaving('ngn'), 20000);
  assert.equal(separateTotal('gbp'), 60);
});
test('totals follow children count, exact to the penny', () => {
  assert.equal(total('usd', 'weekend', 3), PRICE_IS_PER_CHILD ? 210 : 70);
  assert.equal(total('gbp', 'weekend', 3), PRICE_IS_PER_CHILD ? 157.5 : 52.5);
});
test('children count is clamped', () => {
  assert.equal(clampChildren(0), 1);
  assert.equal(clampChildren('abc'), 1);
  assert.equal(clampChildren(99), REGISTRATION.maxChildren);
});
test('money formatting: page style and exact payment style', () => {
  assert.equal(formatMoney('usd', 70), '$70');
  assert.equal(formatMoney('gbp', 52.5), '£52.50');
  assert.equal(formatMoney('gbp', 30), '£30');
  assert.equal(formatMoney('ngn', 100000), '₦100,000');
  assert.equal(formatExact('gbp', 30), '£30.00 GBP');
  assert.equal(formatExact('gbp', 52.5), '£52.50 GBP');
  assert.equal(formatExact('usd', 40), '$40.00 USD');
  assert.equal(formatExact('usd', 70), '$70.00 USD');
  assert.equal(formatExact('ngn', 60000), '₦60,000 NGN');
  assert.equal(plainAmount(52.5), '52.50');
});
test('country maps to a default price list', () => {
  assert.equal(currencyForCountry('NG'), 'ngn');
  assert.equal(currencyForCountry('GB'), 'gbp');
  assert.equal(currencyForCountry('US'), 'usd');
  assert.equal(currencyForCountry(''), null);
  assert.throws(() => unitPrice('usd', 'nope'));
});
test('payment details are exactly as supplied', () => {
  const [opay, moni] = PAYMENTS.ngn.methods;
  assert.deepEqual([opay.accountNumber, opay.accountName], ['7047167280', 'ONYEMA UZODINMA']);
  assert.deepEqual([moni.accountNumber, moni.accountName], ['5295905851', 'KENELUMCHUKWU OKONJO']);
  assert.equal(PAYMENTS.international.revolutUrl, 'https://revolut.me/keneokonjo');
  assert.equal(PAYMENTS.confirm.email, 'keneokonjo44@gmail.com');
  assert.equal(PAYMENTS.confirm.whatsappE164, '2347047167280');
  assert.equal(typeof BACKEND.url, 'string');
});
test('references: format, alphabet, uniqueness', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i += 1) {
    const r = newReference();
    assert.match(r, REF_RE);
    assert.doesNotMatch(r.slice(3), /[01OIL]/);
    seen.add(r);
  }
  assert.ok(seen.size > 1990);
});
test('validateRegistration rejects anything that does not match the price list', () => {
  const ok = { reference: 'FM-ABC234', option: 'weekend', currency: 'gbp', children: 1, amountOwed: 52.5 };
  assert.equal(validateRegistration(ok), '');
  for (const bad of [null, { ...ok, amountOwed: 60 }, { ...ok, currency: 'eur' }, { ...ok, option: 'x' }, { ...ok, reference: 'nope' }, { ...ok, children: 0 }]) {
    assert.notEqual(validateRegistration(bad), '');
  }
});
test('callBackend: not connected, network failure, server error, success', async () => {
  await assert.rejects(callBackend({}, { url: '' }), (e) => e instanceof ApiError && e.code === 'not_connected');
  await assert.rejects(callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: async () => { throw new TypeError('fail'); } }), (e) => e.code === 'network' && e.retryable);
  await assert.rejects(callBackend({}, { url: 'http://x', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: false, error: 'invalid_package', message: 'no' }) }) }), (e) => e.code === 'invalid_package');
  await assert.rejects(callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('html'); } }) }), (e) => e.code === 'bad_response');
  const good = await callBackend({}, { url: 'http://x', fetchImpl: async () => ({ ok: true, json: async () => ({ ok: true, reference: 'FM-ABC234' }) }) });
  assert.equal(good.reference, 'FM-ABC234');
});

test('callBackend retries exactly once for transient failures, never for server answers', async () => {
  const ok = { ok: true, json: async () => ({ ok: true, reference: 'FM-ABC234' }) };
  const html404 = { ok: false, status: 404, json: async () => { throw new Error('html'); } };
  const run = (responses) => {
    let calls = 0;
    const fetchImpl = async () => { const r = responses[Math.min(calls, responses.length - 1)]; calls += 1; if (r instanceof Error) throw r; return r; };
    return { fetchImpl, calls: () => calls };
  };
  let t = run([new TypeError('x'), ok]);
  assert.equal((await callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: t.fetchImpl })).ok, true);
  assert.equal(t.calls(), 2);
  t = run([html404, ok]);
  assert.equal((await callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: t.fetchImpl })).ok, true);
  assert.equal(t.calls(), 2);
  t = run([html404, html404, ok]);
  await assert.rejects(callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: t.fetchImpl }), (e) => e instanceof ApiError);
  assert.equal(t.calls(), 2, 'one retry only');
  const rejected = { ok: true, json: async () => ({ ok: false, error: 'invalid_package', message: 'no' }) };
  t = run([rejected, ok]);
  await assert.rejects(callBackend({}, { url: 'http://x', retryDelayMs: 0, fetchImpl: t.fetchImpl }), (e) => e.code === 'invalid_package');
  assert.equal(t.calls(), 1, 'a real server answer is never retried');
  t = run([ok]);
  await assert.rejects(callBackend({}, { url: '', fetchImpl: t.fetchImpl }), (e) => e.code === 'not_connected');
  assert.equal(t.calls(), 0);
});
