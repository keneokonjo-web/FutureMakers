// Test harness: static site server + a mock "Apps Script" HTTP endpoint that runs the REAL Code.gs
// against in-memory fake Google services (see tests/helpers/fake-gas.mjs).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { makeBackend } from '../helpers/fake-gas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

export function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

export async function startSite() {
  const server = http.createServer(async (req, res) => {
    try {
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.join(root, rel);
      const body = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('nf'); }
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}`, close: () => server.close() };
}

export async function startMockBackend() {
  const be = makeBackend();
  const ctl = { mode: 'ok', calls: [], tamper: null };
  const server = http.createServer((req, res) => {
    const cors = { 'Access-Control-Allow-Origin': '*' };
    if (req.method === 'OPTIONS') { res.writeHead(403, cors); res.end(); return; } // Apps Script cannot answer preflight
    if (req.method === 'GET' && req.url.startsWith('/dump')) {
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ registrations: be.rows(), confirmations: be.rows('Confirmations') }));
      return;
    }
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      ctl.calls.push({ type: req.headers['content-type'], body: data });
      if (ctl.mode === 'down') { res.writeHead(503, cors); res.end('Service Unavailable'); return; }
      if (ctl.mode === 'html') { res.writeHead(200, { ...cors, 'Content-Type': 'text/html' }); res.end('<html>Sign in</html>'); return; }
      if (ctl.mode === 'hang') return;
      let out = be.call(data);
      if (ctl.tamper && out.ok && out.amountOwed) out = { ...out, ...ctl.tamper };
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
  });
  const port = await listen(server);
  return { url: `http://127.0.0.1:${port}/exec`, base: `http://127.0.0.1:${port}`, ctl, be, close: () => server.close() };
}

export async function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) {
    try { return require(p); } catch { /* next */ }
  }
  throw new Error('playwright not found');
}

/** Serves the real js/config.js with the backend URL filled in (production code has no test hooks). */
export async function injectBackend(page, backendUrl) {
  await page.route('**/js/config.js', async (route) => {
    const src = await fs.readFile(path.join(root, 'js/config.js'), 'utf8');
    const patched = src.replace(/url: '', \/\/ TODO\(confirm\): Apps Script web app URL/, `url: '${backendUrl}',`);
    if (patched === src) throw new Error('config.js backend url line not found');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: patched });
  });
}
