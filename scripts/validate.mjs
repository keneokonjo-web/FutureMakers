// Static checks: every local file reference and in-page anchor in index.html must resolve,
// every sprite symbol used must exist, and no placeholder secrets may be committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const sprite = fs.readFileSync(path.join(root, 'assets/svg/sprite.svg'), 'utf8');
const errors = [];

const exists = (p, from) => fs.existsSync(path.join(root, from, p.split('#')[0]));
for (const m of html.matchAll(/(?:src|href)="([^"#:][^"]*?)"/g)) {
  const ref = m[1];
  if (/^(https?:|mailto:|tel:)/.test(ref) || ref.startsWith('#')) continue;
  if (!exists(ref, '.')) errors.push(`index.html: missing file ${ref}`);
}
for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) {
  if (!exists(m[1], 'css')) errors.push(`styles.css: missing file ${m[1]}`);
}
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(m[1])) errors.push(`index.html: anchor #${m[1]} has no target`);
const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/sprite\.svg#([\w-]+)/g)) if (!symbols.has(m[1])) errors.push(`index.html: sprite symbol #${m[1]} missing`);
for (const m of html.matchAll(/id="([^"]+)"/g)) { /* duplicate id check below */ }
const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
all.filter((x, i) => all.indexOf(x) !== i).forEach((d) => errors.push(`index.html: duplicate id ${d}`));
if (/(sk_live|sk_test|secret_key|api[_-]?key)/i.test(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'))) {
  errors.push('js/config.js: looks like it contains a secret; only public checkout links belong here');
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validate: OK (${ids.size} ids, ${symbols.size} sprite symbols)`);
