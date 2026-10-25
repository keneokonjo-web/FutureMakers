import { CONTACT } from './config.js';
import { PAIRS, newGame, flip, resolveMismatch, stars } from './game-logic.js';

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- navigation (same behaviour as the home page) ---------- */
function initNav() {
  const header = $('#site-header');
  const btn = $('.menu-btn', header);
  const setOpen = (open) => {
    header.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', () => setOpen(btn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('nav-open')) { setOpen(false); btn.focus(); }
  });
}

function initFooter() {
  const contact = $('#foot-contact');
  if (CONTACT.email) {
    const a = document.createElement('a');
    a.href = `mailto:${CONTACT.email}`;
    a.textContent = CONTACT.email;
    contact.append(a);
  }
}

/* ---------- Maker Match ---------- */
const BEST_KEY = 'fm_match_best_v1';
const readBest = () => { try { const v = Number(localStorage.getItem(BEST_KEY)); return v > 0 ? v : 0; } catch { return 0; } };
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* storage blocked: fine */ } };

function initGame() {
  const board = $('#match-board');
  const movesEl = $('#match-moves');
  const bestEl = $('#match-best');
  const msg = $('#match-msg');
  const live = $('#match-live');
  const result = $('#match-result');
  let state = newGame();
  let timer = 0;

  const say = (text) => { live.textContent = ''; window.setTimeout(() => { live.textContent = text; }, 20); };

  function cardButton(card, i) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mcard';
    b.dataset.index = String(i);
    b.dataset.pair = card.id;
    b.innerHTML = `<span class="mcard-back" aria-hidden="true">?</span>
      <span class="mcard-front" aria-hidden="true">
        <svg viewBox="${card.vb}" focusable="false"><use href="assets/svg/sprite.svg#${card.symbol}"/></svg>
        <span class="mcard-label">${card.label}</span>
      </span>`;
    return b;
  }

  function paint() {
    [...board.children].forEach((b, i) => {
      const card = state.deck[i];
      const open = state.flipped.includes(i) || state.matched.has(card.id);
      b.classList.toggle('is-open', open);
      b.classList.toggle('is-matched', state.matched.has(card.id));
      b.setAttribute('aria-pressed', String(open));
      b.setAttribute('aria-label', open ? `${card.label}${state.matched.has(card.id) ? ', matched' : ''}` : `Card ${i + 1}, face down`);
    });
    movesEl.textContent = String(state.moves);
    const best = readBest();
    bestEl.textContent = best ? String(best) : '–';
  }

  function start() {
    window.clearTimeout(timer);
    state = newGame();
    board.replaceChildren(...state.deck.map(cardButton));
    result.hidden = true;
    msg.textContent = 'Turn over two cards and find the matching pairs.';
    paint();
  }

  board.addEventListener('click', (e) => {
    const btn = e.target.closest('.mcard');
    if (!btn) return;
    const { state: next, event } = flip(state, Number(btn.dataset.index));
    if (event === 'ignored') return;
    state = next;
    paint();
    if (event === 'mismatch') {
      msg.textContent = 'Not a match. Remember where they are!';
      say('Not a match');
      timer = window.setTimeout(() => { state = resolveMismatch(state); paint(); msg.textContent = 'Try again.'; }, reduceMotion() ? 900 : 1000);
    } else if (event === 'match') {
      const card = state.deck[Number(btn.dataset.index)];
      msg.textContent = `Match! ${card.label}.`;
      say(`Match: ${card.label}`);
    } else if (event === 'win') {
      const best = readBest();
      const isBest = !best || state.moves < best;
      if (isBest) writeBest(state.moves);
      paint();
      const s = stars(state.moves);
      msg.textContent = '';
      $('#match-stars').textContent = '★'.repeat(s) + '☆'.repeat(3 - s);
      $('#match-result-text').textContent = `You matched all ${PAIRS.length} pairs in ${state.moves} moves.${isBest ? ' That is your best score!' : ''}`;
      result.hidden = false;
      say(`You win! All pairs matched in ${state.moves} moves.`);
      $('#match-again').focus();
    }
  });

  $('#match-reset').addEventListener('click', start);
  $('#match-again').addEventListener('click', () => { start(); board.firstElementChild.focus(); });
  start();
}

initNav();
initFooter();
initGame();
