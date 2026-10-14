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
  // Work in minor units (pence/cents/kobo) so £52.50 × 3 never drifts.
  return Math.round(unitPrice(currency, option) * 100 * count) / 100;
}

/** Compact display for the page: ₦60,000, $40, £52.50 (decimals only when needed). */
export function formatMoney(currency, amount) {
  const { symbol, locale } = CURRENCIES[currency];
  const decimals = Number.isInteger(amount) ? 0 : 2;
  return symbol + new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount);
}

/** Exact display for payment instructions: £30.00 GBP, $70.00 USD, ₦100,000.00 NGN. */
export function formatExact(currency, amount) {
  const { symbol, locale, code } = CURRENCIES[currency];
  const decimals = currency === 'ngn' && Number.isInteger(amount) ? 0 : 2;
  return `${symbol}${new Intl.NumberFormat(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(amount)} ${code}`;
}

/** Plain number string for copying into a payment app: "52.50". */
export function plainAmount(amount) {
  return amount.toFixed(2);
}

export function currencyForCountry(countryValue) {
  return REGISTRATION.countries.find((c) => c.value === countryValue)?.currency || null;
}
