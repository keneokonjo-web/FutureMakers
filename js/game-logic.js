/**
 * Pure logic for "Maker Match" (no DOM) so it can be unit tested in Node.
 */
export const PAIRS = [
  { id: 'idea', label: 'Big idea', symbol: 'bulb', vb: '0 0 64 84' },
  { id: 'shop', label: 'Little shop', symbol: 'storefront', vb: '0 0 120 112' },
  { id: 'draw', label: 'Sketch it', symbol: 'pencil', vb: '0 0 28 112' },
  { id: 'price', label: 'Set a price', symbol: 'tag', vb: '0 0 92 62' },
  { id: 'coin', label: 'Earn a coin', symbol: 'coin', vb: '0 0 56 56' },
  { id: 'bot', label: 'AI helper', symbol: 'tiny-bot', vb: '0 0 64 72' },
];

/** Fisher–Yates with an injectable random source (so tests are deterministic). */
export function shuffle(list, random = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(random = Math.random, pairs = PAIRS) {
  const cards = pairs.flatMap((p) => [{ ...p, key: `${p.id}-a` }, { ...p, key: `${p.id}-b` }]);
  return shuffle(cards, random);
}

export function newGame(random = Math.random) {
  return { deck: buildDeck(random), flipped: [], matched: new Set(), moves: 0, locked: false };
}

/**
 * Flip card `index`. Returns { state, event } where event is one of
 * 'ignored' | 'flip' | 'match' | 'mismatch' | 'win'. On 'mismatch' the two
 * cards stay face-up and the state is locked until `resolveMismatch`.
 */
export function flip(state, index) {
  const card = state.deck[index];
  if (!card || state.locked || state.flipped.includes(index) || state.matched.has(card.id)) {
    return { state, event: 'ignored' };
  }
  const flipped = [...state.flipped, index];
  if (flipped.length === 1) return { state: { ...state, flipped }, event: 'flip' };

  const [first, second] = flipped.map((i) => state.deck[i]);
  const moves = state.moves + 1;
  if (first.id === second.id) {
    const matched = new Set(state.matched).add(first.id);
    const done = matched.size === new Set(state.deck.map((c) => c.id)).size;
    return { state: { ...state, flipped: [], matched, moves, locked: false }, event: done ? 'win' : 'match' };
  }
  return { state: { ...state, flipped, moves, locked: true }, event: 'mismatch' };
}

export function resolveMismatch(state) {
  return { ...state, flipped: [], locked: false };
}

/** 3 stars for a near-perfect game, 2 for a good one, 1 for finishing. */
export function stars(moves, pairs = PAIRS.length) {
  if (moves <= pairs + 3) return 3;
  if (moves <= pairs * 2 + 2) return 2;
  return 1;
}
