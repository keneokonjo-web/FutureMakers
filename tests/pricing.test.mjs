import test from 'node:test';
import assert from 'node:assert/strict';
import { PRICES, PRICE_IS_PER_CHILD, PAYMENT_URLS, paymentUrlFor, REGISTRATION } from '../js/config.js';
import { unitPrice, separateTotal, weekendSaving, total, formatMoney, clampChildren, currencyForCountry } from '../js/pricing.js';

test('brief prices are configured exactly', () => {
  assert.deepEqual(PRICES.usd, { business: 40, ai: 40, weekend: 70 });
  assert.deepEqual(PRICES.ngn, { business: 60000, ai: 60000, weekend: 100000 });
});
test('bundle savings: $10 and ₦20,000', () => {
  assert.equal(weekendSaving('usd'), 10);
  assert.equal(weekendSaving('ngn'), 20000);
  assert.equal(separateTotal('usd'), 80);
  assert.equal(separateTotal('ngn'), 120000);
});
test('totals follow children count when priced per child', () => {
  const kids = 3;
  assert.equal(total('usd', 'weekend', kids), PRICE_IS_PER_CHILD ? 210 : 70);
});
test('children count is clamped', () => {
  assert.equal(clampChildren(0), 1);
  assert.equal(clampChildren('abc'), 1);
  assert.equal(clampChildren(99), REGISTRATION.maxChildren);
});
test('money formatting', () => {
  assert.equal(formatMoney('usd', 70), '$70');
  assert.equal(formatMoney('ngn', 100000), '₦100,000');
});
test('country maps to price list', () => {
  assert.equal(currencyForCountry('NG'), 'ngn');
  assert.equal(currencyForCountry('GB'), 'usd');
  assert.equal(currencyForCountry(''), null);
});
test('payment URL keys follow one naming scheme', () => {
  assert.deepEqual(Object.keys(PAYMENT_URLS).sort(), [
    'AI_PAYMENT_URL_NGN', 'AI_PAYMENT_URL_USD', 'BUSINESS_PAYMENT_URL_NGN',
    'BUSINESS_PAYMENT_URL_USD', 'WEEKEND_PAYMENT_URL_NGN', 'WEEKEND_PAYMENT_URL_USD',
  ]);
  assert.equal(typeof paymentUrlFor('usd', 'ai'), 'string');
  assert.throws(() => unitPrice('usd', 'nope'));
});
