/**
 * FutureMakers Academy: registration and payment-confirmation backend.
 *
 * A Google Apps Script web app bound to the Google Sheet that holds the
 * registrations. See backend/README.md for setup.
 *
 * Security model
 *  - No secrets live in the website. The web app runs as the sheet owner;
 *    the website can only call the four actions below.
 *  - There is NO action that reads the list of registrations. The public
 *    can only look up one registration if they know its reference AND email.
 *  - Amounts are recomputed here from PRICES. A tampered browser cannot
 *    change what is owed.
 *  - Nothing in this file can set a registration to "Paid" from the web.
 *    "Paid" is only ever set by you, in the sheet (menu or dropdown).
 */

/* ------------------------------------------------------------------ */
/* Configuration. Keep PRICES identical to js/config.js (a test checks). */
/* ------------------------------------------------------------------ */

var PRICES = {
  usd: { business: 40, ai: 40, weekend: 70 },
  gbp: { business: 30, ai: 30, weekend: 52.5 },
  ngn: { business: 60000, ai: 60000, weekend: 100000 }
};
var PRICE_IS_PER_CHILD = true;
var MAX_CHILDREN = 6;

var REGISTRATIONS_SHEET = 'Registrations';
var CONFIRMATIONS_SHEET = 'Confirmations';
var TIME_ZONE = 'Africa/Lagos';
var LAGOS_UTC_OFFSET = '+01:00';
var MAX_REGISTRATIONS_PER_EMAIL_PER_DAY = 5;

var STATUS_PENDING = 'Pending';
var STATUS_SUBMITTED = 'Payment submitted — awaiting verification';
var STATUS_PAID = 'Paid';
var STATUSES = [STATUS_PENDING, STATUS_SUBMITTED, STATUS_PAID];

var PACKAGES = {
  business: {
    name: 'Young Entrepreneurs Lab',
    workshops: 'Young Entrepreneurs Lab — Sat 24 Oct 2026, 5:00 PM Nigerian time (75 min)'
  },
  ai: {
    name: 'AI Creators Lab',
    workshops: 'AI Creators Lab — Sun 25 Oct 2026, 5:00 PM Nigerian time (75 min)'
  },
  weekend: {
    name: 'Both Workshops (Full Weekend Pass)',
    workshops:
      'Young Entrepreneurs Lab — Sat 24 Oct 2026, 5:00 PM Nigerian time (75 min) + ' +
      'AI Creators Lab — Sun 25 Oct 2026, 5:00 PM Nigerian time (75 min)'
  }
};

var COUNTRIES = { NG: 'Nigeria', US: 'United States', GB: 'United Kingdom', OTHER: 'Another country' };
var PAYMENT_METHODS = ['OPay', 'Moniepoint', 'Revolut', 'Other'];
var AGE_BANDS = { junior: 'Juniors (6\u20139)', senior: 'Seniors (10\u201314)' };

var HEADERS = [
  'Registration reference',
  'Registration date',
  'Parent/guardian name',
  'Email',
  'Contact number',
  'Country',
  'Package',
  'Workshop(s)',
  'Children',
  'Age bands',
  'Currency',
  'Amount per child',
  'Amount owed',
  'Payment method',
  'Payment status',
  'Payment verification date',
  'Verified by',
  'Confirmation submitted at',
  'Amount paid (reported)',
  'Method used (reported)',
  'Transaction reference (reported)',
  'Confirmation channel opened',
  'Notes (admin)'
];
var NUMERIC_HEADERS = ['Children', 'Amount per child', 'Amount owed', 'Amount paid (reported)'];

var CONFIRMATION_HEADERS = [
  'Submitted at', 'Registration reference', 'Parent/guardian name', 'Email',
  'Payment method', 'Amount paid (reported)', 'Transaction reference', 'Channel'
];

var REFERENCE_RE = /^FM-[A-Z0-9]{6}$/;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var PHONE_RE = /^[+0-9()\-\s.]{6,25}$/;

/* ------------------------------------------------------------------ */
/* Web app entry points                                               */
/* ------------------------------------------------------------------ */

function doGet() {
  return json_({ ok: true, service: 'FutureMakers registration' });
}

function doPost(e) {
  var result;
  try {
    var raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 20000) throw fail_('bad_request', 'Request missing or too large.');
    var body;
    try { body = JSON.parse(raw); } catch (err) { throw fail_('bad_request', 'Request was not valid JSON.'); }
    if (!body || typeof body !== 'object') throw fail_('bad_request', 'Request was not valid.');
    result = route_(body);
  } catch (err) {
    if (err && err.isFailure) {
      result = { ok: false, error: err.code, message: err.message };
    } else {
      console.error(err && err.stack ? err.stack : String(err));
      result = { ok: false, error: 'server_error', message: 'Something went wrong on our side. Nothing was lost; please try again.' };
    }
  }
  return json_(result);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(code, message) {
  return { isFailure: true, code: code, message: message };
}

function route_(body) {
  // Validation runs before the lock is taken; each action locks only around its sheet work.
  switch (body.action) {
    case 'register': return register_(body);
    case 'confirm': return confirm_(body);
    case 'evidence_intent': return evidenceIntent_(body);
    case 'status': return lookupStatus_(body);
    default: throw fail_('bad_request', 'Unknown action.');
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    throw fail_('busy', 'We are busy right now. Please try again in a moment.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

function amountFor_(currency, option, children) {
  var prices = PRICES[currency];
  if (!prices || typeof prices[option] !== 'number') throw fail_('invalid_package', 'That package or currency is not available.');
  var unit = prices[option];
  var count = PRICE_IS_PER_CHILD ? children : 1;
  return { unit: unit, total: Math.round(unit * 100 * count) / 100 };
}

function paymentMethodFor_(currency) {
  return currency === 'ngn' ? 'Bank transfer (OPay/Moniepoint)' : 'Revolut.me';
}

/* ------------------------------------------------------------------ */
/* Sheet helpers                                                      */
/* ------------------------------------------------------------------ */

/**
 * Opens a sheet and reads it ONCE. `data` is the whole sheet as a 2D array
 * (row 0 = headers); `cols` maps header name -> 1-based column, so you can
 * reorder or add columns safely. With headerOnly, only row 1 is read (used for
 * the append-only Confirmations log, which can grow large).
 */
function openSheet_(name, headers, headerOnly, skipColumnCheck) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  var data;
  var lastRow;
  if (headerOnly) {
    lastRow = sheet.getLastRow();
    data = lastRow ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues() : [['']];
  } else {
    data = sheet.getDataRange().getValues();
    lastRow = data.length;
  }
  var empty = data.length === 1 && data[0].every(function (c) { return c === ''; });
  if (empty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    data = [headers.slice()];
    lastRow = 1;
  }
  var cols = {};
  for (var i = 0; i < data[0].length; i++) cols[String(data[0][i])] = i + 1;
  if (!skipColumnCheck) requireColumns_(cols, headers);
  return { sheet: sheet, data: data, cols: cols, lastRow: lastRow };
}

/** Map of header name -> 1-based column, read from row 1 (used by the admin tools). */
function columns_(sheet) {
  var width = sheet.getLastColumn();
  var row = width ? sheet.getRange(1, 1, 1, width).getValues()[0] : [];
  var map = {};
  for (var i = 0; i < row.length; i++) map[String(row[i])] = i + 1;
  return map;
}

function requireColumns_(map, headers) {
  for (var i = 0; i < headers.length; i++) {
    if (!map[headers[i]]) throw new Error('Sheet is missing the column "' + headers[i] + '". Run FutureMakers > Set up sheets.');
  }
}

/** Index into s.data of the row with this reference, or -1. */
function findIndex_(s, reference) {
  var col = s.cols['Registration reference'] - 1;
  for (var i = 1; i < s.data.length; i++) {
    if (String(s.data[i][col]) === reference) return i;
  }
  return -1;
}

function rowObject_(s, index) {
  var out = {};
  Object.keys(s.cols).forEach(function (h) { out[h] = s.data[index][s.cols[h] - 1]; });
  return out;
}

function setCell_(sheet, cols, row, header, value) {
  sheet.getRange(row, cols[header]).setValue(value);
}

function nowText_() {
  return Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd HH:mm:ss');
}

function timeOf_(value) {
  if (value instanceof Date) return value.getTime();
  var t = Date.parse(String(value).replace(' ', 'T') + LAGOS_UTC_OFFSET);
  return isNaN(t) ? 0 : t;
}

function sameEmail_(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function summary_(rec, extra) {
  var out = {
    ok: true,
    reference: rec['Registration reference'],
    status: rec['Payment status'],
    package: rec['Package'],
    currency: String(rec['Currency']).toLowerCase(),
    children: Number(rec['Children']),
    amountPerChild: Number(rec['Amount per child']),
    amountOwed: Number(rec['Amount owed'])
  };
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return out;
}

/**
 * Writes one new row in two calls (formats, then values). Text columns are
 * stored as plain text so nothing is ever treated as a formula.
 */
function appendRecord_(s, values) {
  var width = s.data[0].length;
  var row = s.lastRow + 1;
  var line = [];
  var formats = [];
  for (var c = 0; c < width; c++) { line.push(''); formats.push('@'); }
  Object.keys(values).forEach(function (h) {
    if (!s.cols[h]) return;
    line[s.cols[h] - 1] = values[h];
    formats[s.cols[h] - 1] = NUMERIC_HEADERS.indexOf(h) >= 0 ? '0.##' : '@';
  });
  var range = s.sheet.getRange(row, 1, 1, width);
  range.setNumberFormats([formats]);
  range.setValues([line]);
}

/** Updates several cells of an already-read row with ONE write. */
function updateRow_(s, index, changes) {
  var line = s.data[index].slice();
  Object.keys(changes).forEach(function (h) { line[s.cols[h] - 1] = changes[h]; });
  s.sheet.getRange(index + 1, 1, 1, line.length).setValues([line]);
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

function cleanText_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function register_(b) {
  // Honeypot: real visitors never fill this in.
  if (cleanText_(b.website, 100)) throw fail_('rejected', 'Registration could not be accepted.');

  var reference = cleanText_(b.reference, 20).toUpperCase();
  if (!REFERENCE_RE.test(reference)) throw fail_('invalid_reference', 'Invalid registration reference.');
  var name = cleanText_(b.parentName, 100);
  if (name.length < 2) throw fail_('invalid_name', 'Please enter your name.');
  var email = cleanText_(b.email, 254);
  if (!EMAIL_RE.test(email)) throw fail_('invalid_email', 'Please enter a valid email address.');
  var phone = cleanText_(b.phone, 25);
  if (phone && !PHONE_RE.test(phone)) throw fail_('invalid_phone', 'That contact number does not look right.');
  var country = String(b.country || '');
  if (!COUNTRIES[country]) throw fail_('invalid_country', 'Please choose your country.');
  var option = String(b.option || '');
  var currency = String(b.currency || '').toLowerCase();
  if (!PACKAGES[option] || !PRICES[currency]) throw fail_('invalid_package', 'That package or currency is not available.');
  var children = Math.floor(Number(b.children));
  if (!(children >= 1 && children <= MAX_CHILDREN)) throw fail_('invalid_children', 'Please choose how many children.');
  var bands = (Array.isArray(b.ageBands) ? b.ageBands : []).filter(function (x, i, arr) { return AGE_BANDS[x] && arr.indexOf(x) === i; });
  if (!bands.length) throw fail_('invalid_age_bands', 'Please choose at least one age band.');
  if (b.guardianConfirmed !== true) throw fail_('guardian_required', 'Please confirm you are a parent or guardian.');

  var amounts = amountFor_(currency, option, children);

  // Only the sheet work (one read, one write) happens while holding the lock.
  return withLock_(function () {
    var s = openSheet_(REGISTRATIONS_SHEET, HEADERS);

    // Retries of the same registration (same reference + email) are safe: return what is stored.
    var existing = findIndex_(s, reference);
    if (existing > 0) {
      var rec = rowObject_(s, existing);
      if (sameEmail_(rec['Email'], email)) return summary_(rec, { duplicate: true });
      throw fail_('reference_conflict', 'That reference is already in use.');
    }

    // Per-email rate limit, from the data already read.
    var emailCol = s.cols['Email'] - 1;
    var dateCol = s.cols['Registration date'] - 1;
    var cutoff = Date.now() - 24 * 60 * 60 * 1000;
    var recent = 0;
    for (var i = 1; i < s.data.length; i++) {
      if (sameEmail_(s.data[i][emailCol], email) && timeOf_(s.data[i][dateCol]) >= cutoff) recent++;
    }
    if (recent >= MAX_REGISTRATIONS_PER_EMAIL_PER_DAY) {
      throw fail_('rate_limited', 'Too many registrations from this email today. Please email us for help.');
    }

    var values = {};
    values['Registration reference'] = reference;
    values['Registration date'] = nowText_();
    values['Parent/guardian name'] = name;
    values['Email'] = email;
    values['Contact number'] = phone;
    values['Country'] = COUNTRIES[country];
    values['Package'] = PACKAGES[option].name;
    values['Workshop(s)'] = PACKAGES[option].workshops;
    values['Children'] = children;
    values['Age bands'] = bands.map(function (x) { return AGE_BANDS[x]; }).join(', ');
    values['Currency'] = currency.toUpperCase();
    values['Amount per child'] = amounts.unit;
    values['Amount owed'] = amounts.total;
    values['Payment method'] = paymentMethodFor_(currency);
    values['Payment status'] = STATUS_PENDING;

    appendRecord_(s, values);
    SpreadsheetApp.flush();
    return summary_(values, { duplicate: false });
  });
}

/** Finds the registration for reference + email in an already-read sheet. */
function findOwned_(s, b) {
  var reference = cleanText_(b.reference, 20).toUpperCase();
  var email = cleanText_(b.email, 254);
  var notFound = fail_('not_found', 'We could not find that registration. Check the reference and email.');
  if (!REFERENCE_RE.test(reference) || !EMAIL_RE.test(email)) throw notFound;
  var index = findIndex_(s, reference);
  if (index < 1) throw notFound;
  var rec = rowObject_(s, index);
  if (!sameEmail_(rec['Email'], email)) throw notFound;
  return { index: index, rec: rec, reference: reference, email: email };
}

function lookupStatus_(b) {
  var s = openSheet_(REGISTRATIONS_SHEET, HEADERS);
  var hit = findOwned_(s, b);
  return summary_(hit.rec, { verifiedAt: String(hit.rec['Payment verification date'] || '') });
}

function confirm_(b) {
  var method = String(b.method || '');
  if (PAYMENT_METHODS.indexOf(method) < 0) throw fail_('invalid_method', 'Please choose how you paid.');
  var paid = Number(b.amountPaid);
  if (!(paid > 0 && paid <= 100000000)) throw fail_('invalid_amount', 'Please enter the amount you paid.');
  paid = Math.round(paid * 100) / 100;
  var txn = cleanText_(b.transactionRef, 80);

  return withLock_(function () {
    var s = openSheet_(REGISTRATIONS_SHEET, HEADERS);
    var hit = findOwned_(s, b);
    var name = cleanText_(b.parentName, 100) || String(hit.rec['Parent/guardian name']);
    var stamp = nowText_();

    var alreadyPaid = String(hit.rec['Payment status']) === STATUS_PAID;
    // A payment confirmation can move Pending -> Submitted. It can never set Paid, and never downgrades Paid.
    var changes = {
      'Confirmation submitted at': stamp,
      'Amount paid (reported)': paid,
      'Method used (reported)': method,
      'Transaction reference (reported)': txn
    };
    if (!alreadyPaid) changes['Payment status'] = STATUS_SUBMITTED;
    updateRow_(s, hit.index, changes);

    var log = openSheet_(CONFIRMATIONS_SHEET, CONFIRMATION_HEADERS, true, true);
    appendRecord_(log, {
      'Submitted at': stamp,
      'Registration reference': hit.reference,
      'Parent/guardian name': name,
      'Email': hit.email,
      'Payment method': method,
      'Amount paid (reported)': paid,
      'Transaction reference': txn,
      'Channel': 'Website form'
    });
    SpreadsheetApp.flush();

    var fresh = rowObject_(s, hit.index);
    Object.keys(changes).forEach(function (h) { fresh[h] = changes[h]; });
    return summary_(fresh, { alreadyPaid: alreadyPaid });
  });
}

/**
 * Records that the parent opened the email or WhatsApp link. This is only a
 * note for you. It does NOT change the payment status: opening a link is not
 * proof that anything was sent.
 */
function evidenceIntent_(b) {
  var channel = String(b.channel || '');
  if (channel !== 'email' && channel !== 'whatsapp') throw fail_('bad_request', 'Unknown channel.');
  return withLock_(function () {
    var s = openSheet_(REGISTRATIONS_SHEET, HEADERS);
    var hit = findOwned_(s, b);
    var prior = String(hit.rec['Confirmation channel opened'] || '');
    var entry = channel + ' @ ' + nowText_();
    setCell_(s.sheet, s.cols, hit.index + 1, 'Confirmation channel opened', prior ? prior + '; ' + entry : entry);
    return { ok: true, status: hit.rec['Payment status'] };
  });
}

/* ------------------------------------------------------------------ */
/* Admin tools (run from the sheet, as the sheet owner)               */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FutureMakers')
    .addItem('Mark selected as PAID (after checking funds)', 'menuMarkPaid')
    .addItem('Mark selected as Payment submitted', 'menuMarkSubmitted')
    .addItem('Mark selected as Pending', 'menuMarkPending')
    .addSeparator()
    .addItem('Set up sheets (first time)', 'setup')
    .addToUi();
}

/**
 * Pure-ish core of the admin menu: sets the status on the given rows of the
 * Registrations sheet and keeps the verification date/verifier in step.
 * Returns the number of rows changed.
 */
function setStatusForRows(sheet, rows, status, who) {
  if (STATUSES.indexOf(status) < 0) throw new Error('Unknown status: ' + status);
  var cols = columns_(sheet);
  requireColumns_(cols, HEADERS);
  var changed = 0;
  rows.forEach(function (row) {
    if (row < 2 || row > sheet.getLastRow()) return;
    setCell_(sheet, cols, row, 'Payment status', status);
    stampVerification_(sheet, cols, row, status, who);
    changed++;
  });
  return changed;
}

function stampVerification_(sheet, cols, row, status, who) {
  if (status === STATUS_PAID) {
    setCell_(sheet, cols, row, 'Payment verification date', nowText_());
    setCell_(sheet, cols, row, 'Verified by', who || '');
  } else {
    setCell_(sheet, cols, row, 'Payment verification date', '');
    setCell_(sheet, cols, row, 'Verified by', '');
  }
}

function selectedRows_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  if (sheet.getName() !== REGISTRATIONS_SHEET) {
    SpreadsheetApp.getUi().alert('Select rows on the "' + REGISTRATIONS_SHEET + '" sheet first.');
    return null;
  }
  var ranges = sheet.getActiveRangeList ? sheet.getActiveRangeList().getRanges() : [sheet.getActiveRange()];
  var rows = [];
  ranges.forEach(function (r) {
    for (var i = 0; i < r.getNumRows(); i++) rows.push(r.getRow() + i);
  });
  rows = rows.filter(function (r, i) { return r >= 2 && rows.indexOf(r) === i; });
  if (!rows.length) {
    SpreadsheetApp.getUi().alert('Select one or more registration rows (not the header row).');
    return null;
  }
  return { sheet: sheet, rows: rows };
}

function menuChange_(status, needConfirm) {
  var sel = selectedRows_();
  if (!sel) return;
  var ui = SpreadsheetApp.getUi();
  if (needConfirm) {
    var answer = ui.alert(
      'Mark ' + sel.rows.length + ' registration(s) as PAID?',
      'Only do this after you have seen the money arrive in your OPay, Moniepoint or Revolut account for the exact amount owed.',
      ui.ButtonSet.YES_NO
    );
    if (answer !== ui.Button.YES) return;
  }
  var who = '';
  try { who = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(); } catch (e) { who = ''; }
  var n = setStatusForRows(sel.sheet, sel.rows, status, who);
  ui.alert(n + ' registration(s) set to "' + status + '".');
}

function menuMarkPaid() { menuChange_(STATUS_PAID, true); }
function menuMarkSubmitted() { menuChange_(STATUS_SUBMITTED, false); }
function menuMarkPending() { menuChange_(STATUS_PENDING, false); }

/**
 * Optional convenience: if you type or pick a status straight in the sheet,
 * the verification date is stamped for you. (Installable-trigger-free: this
 * is Apps Script's built-in simple trigger.)
 */
function onEdit(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    if (sheet.getName() !== REGISTRATIONS_SHEET) return;
    var cols = columns_(sheet);
    if (!cols['Payment status'] || e.range.getColumn() !== cols['Payment status']) return;
    var row = e.range.getRow();
    if (row < 2) return;
    var status = String(e.range.getValue());
    if (STATUSES.indexOf(status) < 0) return;
    var who = '';
    try { who = Session.getActiveUser().getEmail(); } catch (err) { who = ''; }
    stampVerification_(sheet, cols, row, status, who);
  } catch (err) {
    console.error(String(err));
  }
}

/** Creates the sheets, headers, status dropdown and colours. Safe to run again. */
function setup() {
  var reg = openSheet_(REGISTRATIONS_SHEET, HEADERS, true, true).sheet;
  openSheet_(CONFIRMATIONS_SHEET, CONFIRMATION_HEADERS, true, true);
  var cols = columns_(reg);
  var missing = HEADERS.filter(function (h) { return !cols[h]; });
  if (missing.length) {
    var start = reg.getLastColumn();
    reg.getRange(1, start + 1, 1, missing.length).setValues([missing]);
    cols = columns_(reg);
  }
  try {
    reg.setFrozenRows(1);
    reg.getRange(1, 1, 1, reg.getLastColumn()).setFontWeight('bold').setBackground('#FFD83D');
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUSES, true).setAllowInvalid(false).build();
    reg.getRange(2, cols['Payment status'], 2000, 1).setDataValidation(rule);
    var statusRange = reg.getRange(2, cols['Payment status'], 2000, 1);
    var rules = [
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_PAID).setBackground('#B7E1CD').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_SUBMITTED).setBackground('#FFF2CC').setRanges([statusRange]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo(STATUS_PENDING).setBackground('#F4CCCC').setRanges([statusRange]).build()
    ];
    reg.setConditionalFormatRules(rules);
    openSheet_(CONFIRMATIONS_SHEET, CONFIRMATION_HEADERS, true, true).sheet.setFrozenRows(1);
  } catch (err) {
    console.error('Cosmetic setup skipped: ' + err);
  }
  return { ok: true };
}
