import test from 'node:test';
import assert from 'node:assert/strict';
import { PAIRS, shuffle, buildDeck, newGame, flip, resolveMismatch, stars } from '../js/game-logic.js';

const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('deck has exactly two of every pair', () => {
  const deck = buildDeck(seeded(7));
  assert.equal(deck.length, PAIRS.length * 2);
  for (const p of PAIRS) assert.equal(deck.filter((c) => c.id === p.id).length, 2);
  assert.equal(new Set(deck.map((c) => c.key)).size, deck.length);
});
test('shuffle keeps every item and does not mutate the input', () => {
  const input = [1, 2, 3, 4, 5, 6];
  const out = shuffle(input, seeded(3));
  assert.deepEqual([...out].sort(), input);
  assert.deepEqual(input, [1, 2, 3, 4, 5, 6]);
});
function indexOfPair(deck, id, nth) { return deck.map((c, i) => [c, i]).filter(([c]) => c.id === id)[nth][1]; }

test('matching, mismatching, locking and winning', () => {
  let state = newGame(seeded(11));
  const a0 = indexOfPair(state.deck, 'idea', 0);
  const a1 = indexOfPair(state.deck, 'idea', 1);
  const b0 = indexOfPair(state.deck, 'shop', 0);
  let r = flip(state, a0); state = r.state; assert.equal(r.event, 'flip');
  r = flip(state, a0); assert.equal(r.event, 'ignored', 'same card twice is ignored');
  r = flip(state, b0); state = r.state; assert.equal(r.event, 'mismatch'); assert.equal(state.moves, 1); assert.equal(state.locked, true);
  r = flip(state, a1); assert.equal(r.event, 'ignored', 'locked while a mismatch is showing');
  state = resolveMismatch(state); assert.deepEqual(state.flipped, []);
  r = flip(state, a0); state = r.state; r = flip(state, a1); state = r.state;
  assert.equal(r.event, 'match'); assert.ok(state.matched.has('idea')); assert.equal(state.moves, 2);
  assert.equal(flip(state, a0).event, 'ignored', 'matched cards cannot be flipped');
  let event;
  for (const p of PAIRS.filter((x) => x.id !== 'idea')) {
    state = state.flipped.length ? resolveMismatch(state) : state;
    state = flip(state, indexOfPair(state.deck, p.id, 0)).state;
    ({ state, event } = flip(state, indexOfPair(state.deck, p.id, 1)));
  }
  assert.equal(event, 'win');
  assert.equal(state.matched.size, PAIRS.length);
});
test('perfect game takes the minimum number of moves and earns 3 stars', () => {
  let state = newGame(seeded(5));
  for (const p of PAIRS) { state = flip(state, indexOfPair(state.deck, p.id, 0)).state; state = flip(state, indexOfPair(state.deck, p.id, 1)).state; }
  assert.equal(state.moves, PAIRS.length);
  assert.equal(stars(state.moves), 3);
  assert.equal(stars(PAIRS.length * 2 + 2), 2);
  assert.equal(stars(50), 1);
});
