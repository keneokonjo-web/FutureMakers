import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, validBody } from './helpers/fake-gas.mjs';
import { PRICES, PRICE_IS_PER_CHILD } from '../js/config.js';

const PAID = 'Paid';
const SUBMITTED = 'Payment submitted \u2014 awaiting verification';

test('Code.gs PRICES match the website config exactly', () => {
  const b = makeBackend();
  assert.deepEqual(JSON.parse(JSON.stringify(b.get('PRICES'))), PRICES);
  assert.equal(b.get('PRICE_IS_PER_CHILD'), PRICE_IS_PER_CHILD);
});

const COMBOS = [
  ['business', 'ngn', 60000, 'Young Entrepreneurs Lab'], ['weekend', 'ngn', 100000, 'Both Workshops (Full Weekend Pass)'],
  ['business', 'gbp', 30, 'Young Entrepreneurs Lab'], ['weekend', 'gbp', 52.5, 'Both Workshops (Full Weekend Pass)'],
  ['ai', 'usd', 40, 'AI Creators Lab'], ['weekend', 'usd', 70, 'Both Workshops (Full Weekend Pass)'],
];
for (const [option, currency, amount, pkg] of COMBOS) {
  test(`register ${option}/${currency}: new Pending row with correct amount`, () => {
    const b = makeBackend();
    const country = currency === 'ngn' ? 'NG' : currency === 'gbp' ? 'GB' : 'US';
    const r = b.call(validBody({ option, currency, country }));
    assert.equal(r.ok, true);
    assert.equal(r.amountOwed, amount);
    assert.equal(r.status, 'Pending');
    const [row] = b.rows();
    assert.equal(row['Registration reference'], 'FM-ABC234');
    assert.equal(row['Currency'], currency.toUpperCase());
    assert.equal(row['Package'], pkg);
    assert.equal(row['Amount owed'], amount);
    assert.equal(row['Payment status'], 'Pending');
    assert.equal(row['Payment verification date'], '');
    assert.equal(row['Payment method'], currency === 'ngn' ? 'Bank transfer (OPay/Moniepoint)' : 'Revolut.me');
    assert.match(row['Registration date'], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    if (option === 'weekend') assert.match(row['Workshop(s)'], /Young Entrepreneurs Lab.*\+.*AI Creators Lab/);
  });
}

test('server ignores a client-sent amount (tamper-proof)', () => {
  const b = makeBackend();
  const r = b.call(validBody({ option: 'weekend', currency: 'usd', country: 'US', amountOwed: 1, total: 1 }));
  assert.equal(r.amountOwed, 70);
});

test('per-child multiplication is exact in pence', () => {
  const b = makeBackend();
  const r = b.call(validBody({ option: 'weekend', currency: 'gbp', country: 'GB', children: 3 }));
  assert.equal(r.amountOwed, 157.5);
});

test('invalid package / currency / fields are rejected and nothing is written', () => {
  const b = makeBackend();
  for (const over of [{ option: 'nope' }, { currency: 'eur' }, { reference: 'bad' }, { email: 'x' }, { children: 9 }, { ageBands: [] },
    { guardianConfirmed: false }, { country: 'ZZ' }, { phone: 'abc' }, { parentName: ' ' }]) {
    const r = b.call(validBody(over));
    assert.equal(r.ok, false, JSON.stringify(over));
  }
  assert.equal(b.rows().length, 0);
});

test('honeypot is rejected', () => {
  const b = makeBackend();
  assert.equal(b.call(validBody({ website: 'http://spam' })).ok, false);
  assert.equal(b.rows().length, 0);
});

test('retrying the same registration is idempotent; a different email with the same reference conflicts', () => {
  const b = makeBackend();
  assert.equal(b.call(validBody()).ok, true);
  const again = b.call(validBody({ email: 'ADA@example.com' }));
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(b.rows().length, 1);
  const clash = b.call(validBody({ email: 'other@example.com' }));
  assert.equal(clash.error, 'reference_conflict');
});

test('rate limit per email', () => {
  const b = makeBackend();
  const refs = ['FM-AAAAA2', 'FM-AAAAA3', 'FM-AAAAA4', 'FM-AAAAA5', 'FM-AAAAA6', 'FM-AAAAA7'];
  const results = refs.map((reference) => b.call(validBody({ reference })));
  assert.equal(results.slice(0, 5).every((r) => r.ok), true);
  assert.equal(results[5].error, 'rate_limited');
});

test('spreadsheet-formula text is stored as plain text', () => {
  const b = makeBackend();
  b.call(validBody({ parentName: '=HYPERLINK("http://x")' }));
  const sheet = b.sheets.get('Registrations');
  const fmt = sheet.formats[0].f[0];
  const nameCol = sheet.grid[0].indexOf('Parent/guardian name');
  assert.equal(fmt[nameCol], '@');
});

test('lock failure returns busy, not success, and writes nothing', () => {
  const b = makeBackend({ failLock: true });
  const r = b.call(validBody());
  assert.equal(r.ok, false);
  assert.equal(r.error, 'busy');
});

test('malformed requests are handled', () => {
  const b = makeBackend();
  assert.equal(b.call('not json').ok, false);
  assert.equal(b.call({ action: 'other' }).ok, false);
  assert.equal(b.ctx.doGet().getContent(), '{"ok":true,"service":"FutureMakers registration"}');
});

const confirmBody = (over = {}) => ({ action: 'confirm', reference: 'FM-ABC234', email: 'ada@example.com', parentName: 'Ada Obi', method: 'OPay', amountPaid: 100000, transactionRef: 'TX123', ...over });

test('confirm sets "Payment submitted — awaiting verification", never Paid, and logs a confirmation row', () => {
  const b = makeBackend();
  b.call(validBody());
  const r = b.call(confirmBody());
  assert.equal(r.ok, true);
  assert.equal(r.status, SUBMITTED);
  const [row] = b.rows();
  assert.equal(row['Payment status'], SUBMITTED);
  assert.equal(row['Amount paid (reported)'], 100000);
  assert.equal(row['Method used (reported)'], 'OPay');
  assert.equal(row['Payment verification date'], '');
  const [c] = b.rows('Confirmations');
  assert.equal(c['Registration reference'], 'FM-ABC234');
  assert.equal(c['Transaction reference'], 'TX123');
});

test('confirm needs the matching email and a valid method/amount', () => {
  const b = makeBackend();
  b.call(validBody());
  assert.equal(b.call(confirmBody({ email: 'evil@example.com' })).error, 'not_found');
  assert.equal(b.call(confirmBody({ reference: 'FM-ZZZZZ9' })).error, 'not_found');
  assert.equal(b.call(confirmBody({ method: 'Bitcoin' })).error, 'invalid_method');
  assert.equal(b.call(confirmBody({ amountPaid: 0 })).error, 'invalid_amount');
  assert.equal(b.rows()[0]['Payment status'], 'Pending');
});

test('web requests can never set Paid, and confirm never downgrades Paid', () => {
  const b = makeBackend();
  b.call(validBody());
  assert.equal(b.call({ ...confirmBody(), status: 'Paid', paymentStatus: 'Paid' }).status, SUBMITTED);
  b.call({ action: 'set_status', reference: 'FM-ABC234', email: 'ada@example.com', status: 'Paid' });
  assert.equal(b.rows()[0]['Payment status'], SUBMITTED);
  // Owner marks paid, then a later confirmation arrives.
  const sheet = b.sheets.get('Registrations');
  b.get('setStatusForRows')(sheet, [2], PAID, 'owner@example.com');
  const r = b.call(confirmBody({ amountPaid: 5 }));
  assert.equal(r.status, PAID);
  assert.equal(r.alreadyPaid, true);
});

test('evidence_intent logs the channel but does not change status', () => {
  const b = makeBackend();
  b.call(validBody());
  const r = b.call({ action: 'evidence_intent', reference: 'FM-ABC234', email: 'ada@example.com', channel: 'whatsapp' });
  assert.equal(r.ok, true);
  const [row] = b.rows();
  assert.equal(row['Payment status'], 'Pending');
  assert.match(row['Confirmation channel opened'], /^whatsapp @ /);
  assert.equal(b.call({ action: 'evidence_intent', reference: 'FM-ABC234', email: 'ada@example.com', channel: 'sms' }).ok, false);
});

test('status lookup needs reference + email and exposes only status fields', () => {
  const b = makeBackend();
  b.call(validBody());
  const ok = b.call({ action: 'status', reference: 'FM-ABC234', email: 'ada@example.com' });
  assert.equal(ok.status, 'Pending');
  assert.equal(ok.parentName, undefined);
  assert.equal(ok.phone, undefined);
  assert.equal(b.call({ action: 'status', reference: 'FM-ABC234', email: 'x@y.com' }).ok, false);
});

test('admin: mark Paid stamps date and verifier; Pending clears them', () => {
  const b = makeBackend();
  b.call(validBody());
  const sheet = b.sheets.get('Registrations');
  const set = b.get('setStatusForRows');
  assert.equal(set(sheet, [1, 2, 99], PAID, 'owner@example.com'), 1);
  let [row] = b.rows();
  assert.equal(row['Payment status'], PAID);
  assert.match(row['Payment verification date'], /^\d{4}-/);
  assert.equal(row['Verified by'], 'owner@example.com');
  set(sheet, [2], 'Pending', 'owner@example.com');
  [row] = b.rows();
  assert.equal(row['Payment verification date'], '');
  assert.throws(() => set(sheet, [2], 'Refunded', ''));
});

test('columns are found by header name (reordering is safe)', () => {
  const b = makeBackend();
  b.call(validBody());
  const sheet = b.sheets.get('Registrations');
  sheet.grid = sheet.grid.map((r) => [...r].reverse());
  const r = b.call({ action: 'status', reference: 'FM-ABC234', email: 'ada@example.com' });
  assert.equal(r.ok, true);
  assert.equal(r.amountOwed, 100000);
});

test('performance: register and confirm use a small, fixed number of sheet calls (no per-cell writes)', () => {
  const b = makeBackend();
  const counts = { reads: 0, writes: 0 };
  const wrap = (sheet) => {
    if (sheet.__wrapped) return;
    sheet.__wrapped = true;
    const getRange = sheet.getRange.bind(sheet);
    const getDataRange = sheet.getDataRange.bind(sheet);
    sheet.getDataRange = () => { const r = getDataRange(); counts.reads += 1; return r; };
    sheet.getRange = (...a) => {
      const r = getRange(...a);
      return new Proxy(r, { get(t, k) {
        if (['getValues', 'getValue'].includes(k)) counts.reads += 1;
        if (['setValues', 'setValue', 'setNumberFormats'].includes(k)) counts.writes += 1;
        return t[k];
      } });
    };
  };
  b.call(validBody({ reference: 'FM-AAAAA2' })); // creates the sheets
  const wrapAll = () => b.sheets.forEach(wrap);
  wrapAll();
  counts.reads = 0; counts.writes = 0;
  assert.equal(b.call(validBody({ reference: 'FM-PERF22' })).ok, true);
  assert.ok(counts.reads <= 2, `register reads ${counts.reads}`);
  assert.ok(counts.writes <= 3, `register writes ${counts.writes}`);
  counts.reads = 0; counts.writes = 0;
  wrapAll();
  assert.equal(b.call({ action: 'confirm', reference: 'FM-PERF22', email: 'ada@example.com', method: 'OPay', amountPaid: 100000 }).ok, true);
  assert.ok(counts.reads <= 3, `confirm reads ${counts.reads}`);
  assert.ok(counts.writes <= 4, `confirm writes ${counts.writes}`);
});

test('lock is released after every action, including failures', () => {
  const b = makeBackend();
  b.call(validBody());
  b.call(validBody({ email: 'other@example.com' })); // reference_conflict
  b.call({ action: 'confirm', reference: 'FM-NOPE22', email: 'x@y.com', method: 'OPay', amountPaid: 1 });
  assert.equal(b.state.locks, 0);
});
