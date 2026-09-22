import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryGame, MISMATCH_DELAY } from '../src/games/memory/engine.ts';
import type { Difficulty } from '../src/games/memory/engine.ts';

const noShuffle = () => 1 - Number.EPSILON;
const difficulties: { difficulty: Difficulty; pairs: number }[] = [
  { difficulty: 'normal', pairs: 8 },
  { difficulty: 'easy', pairs: 6 },
  { difficulty: 'hard', pairs: 12 },
];

function snapshot(game: MemoryGame) {
  return {
    difficulty: game.difficulty,
    cards: game.cards.map(card => ({ ...card })),
    selected: [...game.selected],
    status: game.status,
    moves: game.moves,
    matchedPairs: game.matchedPairs,
    elapsedMs: game.elapsedMs,
    mismatchMs: game.mismatchMs,
    totalPairs: game.totalPairs,
  };
}

function assertDeck(game: MemoryGame, pairs: number): void {
  assert.equal(game.cards.length, pairs * 2);
  assert.equal(game.totalPairs, pairs);
  assert.equal(new Set(game.cards).size, pairs * 2, 'cards must not share mutable objects');
  const counts = new Map<number, number>();
  for (const card of game.cards) counts.set(card.fruit, (counts.get(card.fruit) ?? 0) + 1);
  assert.equal(counts.size, pairs);
  for (let fruit = 0; fruit < pairs; fruit++) assert.equal(counts.get(fruit), 2);
}

for (const { difficulty, pairs } of difficulties) {
  test(`memory: ${difficulty} starts ready with ${pairs} distinct pairs`, () => {
    const game = new MemoryGame(difficulty, noShuffle);
    assertDeck(game, pairs);
    assert.deepEqual(game.cards.map(card => card.fruit),
      Array.from({ length: pairs * 2 }, (_, index) => Math.floor(index / 2)));
    assert.ok(game.cards.every(card => !card.faceUp && !card.matched));
    assert.equal(game.status, 'ready');
    assert.equal(game.difficulty, difficulty);
    assert.equal(game.moves, 0);
    assert.equal(game.matchedPairs, 0);
    assert.equal(game.elapsedMs, 0);
    assert.equal(game.mismatchMs, 0);
    assert.deepEqual(game.selected, []);
  });

  test(`memory: ${difficulty} shuffle actually swaps cards without losing pairs`, () => {
    let randomCalls = 0;
    const original = new MemoryGame(difficulty, noShuffle).cards.map(card => card.fruit);
    const game = new MemoryGame(difficulty, () => { randomCalls++; return 0; });
    assert.equal(randomCalls, pairs * 2 - 1);
    assertDeck(game, pairs);
    const shuffled = game.cards.map(card => card.fruit);
    assert.notDeepEqual(shuffled, original);
    // Always swapping with index zero rotates the original deck one position left.
    assert.deepEqual(shuffled, [...original.slice(1), original[0]]);
    assert.ok(game.cards.every(card => !card.faceUp && !card.matched));
  });
}

test('memory: default difficulty is normal and ready does not count time or pause', () => {
  const game = new MemoryGame();
  assert.equal(game.difficulty, 'normal');
  assertDeck(game, 8);
  const before = snapshot(game);
  game.tick(10_000);
  game.pause();
  game.resume();
  assert.deepEqual(snapshot(game), before);
});

test('memory: invalid indices and repeated clicks cannot start or advance a turn', () => {
  const game = new MemoryGame('normal', noShuffle);
  const invalid = [-1, game.cards.length, game.cards.length + 1, 0.5, NaN, Infinity, -Infinity];
  for (const started of [false, true]) {
    if (started) {
      assert.equal(game.flip(0), true);
      assert.equal(game.status, 'playing');
      assert.equal(game.moves, 0);
      assert.deepEqual(game.selected, [0]);
      game.tick(1250);
      assert.equal(game.elapsedMs, 1250);
    }
    const before = snapshot(game);
    for (const index of invalid) {
      assert.equal(game.flip(index), false, `invalid index ${index}`);
      assert.deepEqual(snapshot(game), before);
    }
    if (started) {
      for (let repeat = 0; repeat < 3; repeat++) assert.equal(game.flip(0), false);
      assert.deepEqual(snapshot(game), before);
    }
  }
});

test('memory: a successful second flip counts one move and immediately retains both faces', () => {
  const game = new MemoryGame('normal', noShuffle);
  assert.equal(game.flip(0), true);
  assert.equal(game.matchedPairs, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.flip(1), true);
  assert.equal(game.moves, 1);
  assert.equal(game.matchedPairs, 1);
  assert.deepEqual(game.selected, []);
  assert.equal(game.mismatchMs, 0);
  assert.ok(game.cards.slice(0, 2).every(card => card.matched && card.faceUp));
  const matched = snapshot(game);
  assert.equal(game.flip(0), false);
  assert.equal(game.flip(1), false);
  assert.deepEqual(snapshot(game), matched);
  game.tick(5000);
  assert.ok(game.cards.slice(0, 2).every(card => card.matched && card.faceUp));
  assert.equal(game.flip(2), true, 'a match must not lock the next turn');
  assert.equal(game.flip(3), true);
  assert.equal(game.matchedPairs, 2);
  assert.equal(game.moves, 2);
});

test('memory: mismatches stay visible for exactly 900ms and block third/repeated flips', () => {
  assert.equal(MISMATCH_DELAY, 900);
  const game = new MemoryGame('normal', noShuffle);
  game.flip(0);
  game.flip(2);
  assert.equal(game.moves, 1);
  assert.equal(game.matchedPairs, 0);
  assert.equal(game.mismatchMs, 900);
  assert.deepEqual(game.selected, [0, 2]);
  const waiting = snapshot(game);
  for (const index of [0, 2, 1, 3]) assert.equal(game.flip(index), false);
  assert.deepEqual(snapshot(game), waiting);
  game.tick(899);
  assert.equal(game.mismatchMs, 1);
  assert.equal(game.elapsedMs, 899);
  assert.equal(game.cards[0].faceUp, true);
  assert.equal(game.cards[2].faceUp, true);
  assert.equal(game.flip(1), false);
  game.tick(1);
  assert.equal(game.mismatchMs, 0);
  assert.equal(game.elapsedMs, 900);
  assert.deepEqual(game.selected, []);
  assert.ok(game.cards.every(card => !card.faceUp && !card.matched));
  assert.equal(game.moves, 1);
  assert.equal(game.flip(0), true);
  assert.equal(game.flip(1), true);
  assert.equal(game.moves, 2);
  assert.equal(game.matchedPairs, 1);
});

test('memory: a tick past the mismatch deadline only conceals unmatched selections', () => {
  const game = new MemoryGame('normal', noShuffle);
  for (const index of [0, 1, 2, 4]) game.flip(index);
  game.tick(2500);
  assert.equal(game.elapsedMs, 2500);
  assert.equal(game.mismatchMs, 0);
  assert.deepEqual(game.selected, []);
  assert.ok(game.cards.slice(0, 2).every(card => card.faceUp && card.matched));
  assert.ok(game.cards.slice(2).every(card => !card.faceUp && !card.matched));
  assert.equal(game.matchedPairs, 1);
  assert.equal(game.moves, 2);
});

for (const selections of [1, 2]) {
  test(`memory: pause freezes ${selections} selected cards and resumes the remaining turn`, () => {
    const game = new MemoryGame('normal', noShuffle);
    game.flip(0);
    if (selections === 2) game.flip(2);
    game.tick(350);
    const playing = snapshot(game);
    game.pause();
    assert.equal(game.status, 'paused');
    const paused = snapshot(game);
    game.pause();
    game.tick(20_000);
    for (const index of [0, 1, 2, 3]) assert.equal(game.flip(index), false);
    assert.deepEqual(snapshot(game), paused);
    game.resume();
    game.resume();
    assert.deepEqual(snapshot(game), playing);
    if (selections === 2) {
      assert.equal(game.mismatchMs, 550);
      game.tick(549);
      assert.equal(game.cards[0].faceUp, true);
      assert.equal(game.cards[2].faceUp, true);
      assert.equal(game.flip(1), false);
      game.tick(1);
      assert.deepEqual(game.selected, []);
      assert.equal(game.cards[0].faceUp, false);
      assert.equal(game.cards[2].faceUp, false);
      assert.equal(game.elapsedMs, 900);
    } else {
      game.tick(1000);
      assert.deepEqual(game.selected, [0]);
      assert.equal(game.elapsedMs, 1350);
      assert.equal(game.flip(1), true);
      assert.equal(game.matchedPairs, 1);
    }
  });
}

for (const { difficulty, pairs } of difficulties) {
  test(`memory: completing ${difficulty} wins, freezes time and rejects further play`, () => {
    const game = new MemoryGame(difficulty, noShuffle);
    for (let pair = 0; pair < pairs; pair++) {
      assert.equal(game.flip(pair * 2), true);
      game.tick(250);
      assert.equal(game.status, 'playing');
      assert.equal(game.flip(pair * 2 + 1), true);
      assert.equal(game.matchedPairs, pair + 1);
      assert.equal(game.moves, pair + 1);
      assert.equal(game.status, pair === pairs - 1 ? 'won' : 'playing');
    }
    assert.ok(game.cards.every(card => card.faceUp && card.matched));
    assert.deepEqual(game.selected, []);
    assert.equal(game.mismatchMs, 0);
    assert.equal(game.elapsedMs, pairs * 250);
    const won = snapshot(game);
    for (let index = 0; index < game.cards.length; index++) assert.equal(game.flip(index), false);
    game.tick(60_000);
    game.pause();
    game.resume();
    assert.deepEqual(snapshot(game), won);
    game.reset(undefined, noShuffle);
    assert.deepEqual(snapshot(game), snapshot(new MemoryGame(difficulty, noShuffle)));
  });
}

for (const state of ['single', 'waiting', 'paused waiting'] as const) {
  test(`memory: reset from ${state} clears selections, matches, counters and pending delay`, () => {
    const game = new MemoryGame('hard', noShuffle);
    game.flip(0);
    game.flip(1);
    game.tick(1200);
    game.flip(2);
    if (state !== 'single') game.flip(4);
    game.tick(300);
    if (state === 'paused waiting') game.pause();
    const oldCards = [...game.cards];
    game.reset(undefined, noShuffle);
    const fresh = snapshot(new MemoryGame('hard', noShuffle));
    assert.deepEqual(snapshot(game), fresh);
    assert.ok(game.cards.every(card => !oldCards.includes(card)));
    game.tick(10_000);
    game.resume();
    assert.deepEqual(snapshot(game), fresh);
    assert.equal(game.flip(2), true);
    game.tick(2000);
    assert.deepEqual(game.selected, [2], 'an old mismatch cannot conceal a new selection');
    assert.equal(game.cards[2].faceUp, true);
    assert.equal(game.flip(3), true);
    assert.equal(game.moves, 1);
    assert.equal(game.matchedPairs, 1);
  });
}

test('memory: changing difficulty via reset replaces every dynamic field and deck', () => {
  const game = new MemoryGame('normal', noShuffle);
  for (const { difficulty, pairs } of difficulties) {
    for (const index of [0, 1, 2, 4]) game.flip(index);
    game.tick(400);
    game.pause();
    game.reset(difficulty, noShuffle);
    assertDeck(game, pairs);
    assert.deepEqual(snapshot(game), snapshot(new MemoryGame(difficulty, noShuffle)));
  }
});
