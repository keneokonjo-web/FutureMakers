// Static checks: every local file reference and in-page anchor in each page must resolve,
// every sprite symbol used must exist, ids are unique per page, and no placeholder secrets may be committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
const sprite = fs.readFileSync(path.join(root, 'assets/svg/sprite.svg'), 'utf8');
const symbols = new Set([...sprite.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
const pages = ['index.html', 'why-us.html'];
const errors = [];
const idsByPage = {};

const exists = (p, from) => fs.existsSync(path.join(root, from, p.split('#')[0].split('?')[0]));
for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#:][^"]*?)"/g)) {
    const ref = m[1];
    if (/^(https?:|mailto:|tel:)/.test(ref) || ref.startsWith('#')) continue;
    if (!exists(ref, '.')) errors.push(`${page}: missing file ${ref}`);
  }
  const all = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  idsByPage[page] = new Set(all);
  all.filter((x, i) => all.indexOf(x) !== i).forEach((d) => errors.push(`${page}: duplicate id ${d}`));
  for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!idsByPage[page].has(m[1])) errors.push(`${page}: anchor #${m[1]} has no target`);
  // cross-page anchors such as index.html#pricing must exist on the target page
  for (const m of html.matchAll(/href="([\w-]+\.html)#([^"]+)"/g)) {
    if (pages.includes(m[1])) {
      const target = fs.readFileSync(path.join(root, m[1]), 'utf8');
      if (!new RegExp(`\\sid="${m[2]}"`).test(target)) errors.push(`${page}: ${m[1]}#${m[2]} has no target`);
    }
  }
  for (const m of html.matchAll(/sprite\.svg#([\w-]+)/g)) if (!symbols.has(m[1])) errors.push(`${page}: sprite symbol #${m[1]} missing`);
}
for (const m of css.matchAll(/url\("?([^")]+)"?\)/g)) {
  if (!exists(m[1], 'css')) errors.push(`styles.css: missing file ${m[1]}`);
}
// symbols used by the game
const game = fs.readFileSync(path.join(root, 'js/game-logic.js'), 'utf8');
for (const m of game.matchAll(/symbol: '([\w-]+)'/g)) if (!symbols.has(m[1])) errors.push(`game-logic.js: sprite symbol #${m[1]} missing`);
if (/(sk_live|sk_test|secret_key|api[_-]?key)/i.test(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'))) {
  errors.push('js/config.js: looks like it contains a secret; only public checkout links belong here');
}

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`validate: OK (${pages.length} pages, ${symbols.size} sprite symbols)`);
