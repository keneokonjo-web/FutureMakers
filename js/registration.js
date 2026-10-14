/**
 * Registration helpers: reference numbers, the backend client and the small
 * "pending registration" memory kept in this browser so a refresh or an
 * accidental close never loses a parent's reference.
 * No DOM here, so it can be unit tested in Node.
 */
import { BACKEND, PRICES } from './config.js';
import { total } from './pricing.js';

export const STATUS = {
  pending: 'Pending',
  submitted: 'Payment submitted — awaiting verification',
  paid: 'Paid',
};

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export const REF_RE = /^FM-[A-Z0-9]{6}$/;

export function newReference(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const limit = 256 - (256 % REF_ALPHABET.length); // avoid modulo bias
  let out = '';
  while (out.length < 6) {
    for (const b of randomBytes(12)) {
      if (b < limit && out.length < 6) out += REF_ALPHABET[b % REF_ALPHABET.length];
    }
  }
  return `FM-${out}`;
}

export class ApiError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

/** POSTs one action to the backend. Resolves only with a response the server marked ok. */
export async function callBackend(body, { fetchImpl = globalThis.fetch, url = BACKEND.url, timeoutMs = BACKEND.timeoutMs } = {}) {
  if (!url) throw new ApiError('not_connected', 'Online registration is not connected yet.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    // text/plain keeps this a "simple" request: no CORS preflight, which Apps Script cannot answer.
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'follow',
    });
  } catch (err) {
    throw new ApiError('network', err?.name === 'AbortError' ? 'The request timed out.' : 'Could not reach the registration service.', true);
  } finally {
    clearTimeout(timer);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('bad_response', 'The registration service sent an unexpected reply.', true);
  }
  if (!res.ok || !data || data.ok !== true) {
    throw new ApiError(data?.error || 'server_error', data?.message || 'The registration service reported a problem.', data?.error === 'busy' || data?.error === 'server_error');
  }
  return data;
}

/**
 * Checks the registration the backend returned against the site's own price
 * table. Anything that does not add up is rejected, so the payment window can
 * never show a wrong amount.
 */
export function validateRegistration(reg) {
  if (!reg || typeof reg !== 'object') return 'No registration data.';
  if (!REF_RE.test(String(reg.reference || ''))) return 'The registration reference is missing or invalid.';
  if (!PRICES[reg.currency]) return 'The currency is not recognised.';
  if (typeof PRICES[reg.currency]?.[reg.option] !== 'number') return 'The package is not recognised.';
  const kids = Number(reg.children);
  if (!Number.isInteger(kids) || kids < 1) return 'The number of children is invalid.';
  const expected = total(reg.currency, reg.option, kids);
  if (Number(reg.amountOwed) !== expected) return 'The amount does not match our price list.';
  return '';
}

/* ---- browser memory (all access guarded: storage can be blocked) ---- */
const KEY = 'fm_pending_v1';

export const pending = {
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      return raw && !validateRegistration(raw) ? raw : null;
    } catch {
      return null;
    }
  },
  save(reg) {
    try {
      localStorage.setItem(KEY, JSON.stringify(reg));
      return true;
    } catch {
      return false;
    }
  },
  clear() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  },
};
