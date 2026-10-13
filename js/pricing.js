/**
 * Pure pricing helpers (no DOM), so they can be unit tested in Node.
 */
import { CURRENCIES, PRICES, PRICE_IS_PER_CHILD, REGISTRATION } from './config.js';

export const OPTIONS = ['business', 'ai', 'weekend'];

export function unitPrice(currency, option) {
  const value = PRICES[currency]?.[option];
  if (typeof value !== 'number') throw new Error(`No price for ${currency}/${option}`);
  return value;
}

/** What it would cost to buy both workshops separately. */
export function separateTotal(currency) {
  return unitPrice(currency, 'business') + unitPrice(currency, 'ai');
}

/** The saving on the full weekend pass, computed from the two price lists. */
export function weekendSaving(currency) {
  return separateTotal(currency) - unitPrice(currency, 'weekend');
}

export function clampChildren(n) {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(value, REGISTRATION.maxChildren);
}

export function total(currency, option, children = 1) {
  const count = PRICE_IS_PER_CHILD ? clampChildren(children) : 1;
  return unitPrice(currency, option) * count;
}

export function formatMoney(currency, amount) {
  const { symbol, locale } = CURRENCIES[currency];
  return symbol + new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(amount);
}

export function currencyForCountry(countryValue) {
  return REGISTRATION.countries.find((c) => c.value === countryValue)?.currency || null;
}
