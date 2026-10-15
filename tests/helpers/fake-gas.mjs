// Runs the REAL backend/apps-script/Code.gs in a Node vm with in-memory fakes of the
// Google services it uses (SpreadsheetApp, LockService, ContentService, Utilities, Session).
// This is as close as the sandbox can get to Google Sheets: the logic is real, the storage is fake.
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CODE_PATH = path.resolve(here, '../../backend/apps-script/Code.gs');

class FakeSheet {
  constructor(name) { this.name = name; this.grid = []; this.formats = []; this.calls = 0; }
  getName() { return this.name; }
  getLastRow() { return this.grid.length; }
  getDataRange() {
    const w = this.getLastColumn();
    const rows = this.grid.length || 1;
    return { getValues: () => Array.from({ length: rows }, (_, i) => Array.from({ length: w || 1 }, (_, j) => (this.grid[i] || [])[j] ?? '')) };
  }
  getLastColumn() { return this.grid.reduce((m, r) => Math.max(m, r.length), 0); }
  getRange(row, col, nr = 1, nc = 1) {
    const sheet = this;
    const cell = (r, c) => (sheet.grid[r - 1] || [])[c - 1] ?? '';
    return {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(row + i, col + j))),
      getValue: () => cell(row, col),
      setValues: (vals) => {
        vals.forEach((rv, i) => rv.forEach((v, j) => {
          const r = row + i - 1;
          sheet.grid[r] = sheet.grid[r] || [];
          sheet.grid[r][col + j - 1] = v;
        }));
        return this;
      },
      setValue: (v) => {
        const r = row - 1;
        sheet.grid[r] = sheet.grid[r] || [];
        sheet.grid[r][col - 1] = v;
      },
      setNumberFormats: (f) => { sheet.formats.push({ row, col, f }); },
      getRow: () => row, getColumn: () => col, getNumRows: () => nr, getSheet: () => sheet,
      setFontWeight() { return this; }, setBackground() { return this; }, setDataValidation() { return this; },
    };
  }
  insertRowsGuard() {}
  setFrozenRows() {}
  setConditionalFormatRules() {}
  getActiveRange() { return null; }
}

export function makeBackend({ now = () => new Date(), failLock = false, user = 'owner@example.com' } = {}) {
  const sheets = new Map();
  const chain = () => new Proxy(function () {}, { get: () => chain(), apply: () => chain() });
  const ss = {
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.set(n, s); return s; },
    getActiveSheet: () => [...sheets.values()][0],
  };
  const state = { locks: 0, alerts: [], failLock };
  const sandbox = {
    console,
    JSON, Math, Date, Object, Array, String, Number, RegExp, Error, isNaN, parseInt, parseFloat,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush() {},
      newDataValidation: chain, newConditionalFormatRule: chain,
      getUi: () => ({ alert: (...a) => { state.alerts.push(a); return 'YES'; }, ButtonSet: { YES_NO: 1 }, Button: { YES: 'YES' }, createMenu: chain }),
    },
    LockService: { getScriptLock: () => ({
      waitLock() { if (state.failLock) throw new Error('lock timeout'); state.locks += 1; },
      releaseLock() { state.locks -= 1; },
    }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; }, getContent() { return text; } }),
    },
    Utilities: {
      formatDate: (d, tz, fmt) => {
        const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
          timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
        }).formatToParts(d).map((x) => [x.type, x.value]));
        if (fmt !== 'yyyy-MM-dd HH:mm:ss') throw new Error('unsupported fake format');
        return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
      },
    },
    Session: { getActiveUser: () => ({ getEmail: () => user }), getEffectiveUser: () => ({ getEmail: () => user }) },
  };
  // Allow tests to control "now" for rate limits.
  sandbox.Date = class extends Date { constructor(...a) { super(...(a.length ? a : [now().getTime()])); } static now() { return now().getTime(); } };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(CODE_PATH, 'utf8'), ctx, { filename: 'Code.gs' });
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).getContent());
  const rows = (name = 'Registrations') => {
    const s = sheets.get(name); if (!s) return [];
    const [head, ...rest] = s.grid;
    return rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
  };
  return { ctx, call, rows, sheets, state, get: (n) => vm.runInContext(n, ctx) };
}

export function validBody(over = {}) {
  return {
    action: 'register', reference: 'FM-ABC234', parentName: 'Ada Obi', email: 'ada@example.com', phone: '+234 801 234 5678',
    country: 'NG', option: 'weekend', currency: 'ngn', children: 1, ageBands: ['junior'], guardianConfirmed: true, website: '', ...over,
  };
}
