import test from 'node:test';
import assert from 'node:assert/strict';
import { Game2048, canMove, slide } from '../src/games/2048/engine.ts';
import type { Direction } from '../src/games/2048/engine.ts';

const directions: Direction[] = ['left', 'right', 'up', 'down'];
const unchanged = { changed: false, gained: 0, merged: [], spawned: null, motions: [] };
const lastRandom = 1 - Number.EPSILON;
const deadBoard = [
  2, 4, 2, 4,
  4, 2, 4, 2,
  2, 4, 2, 4,
  4, 2, 4, 2,
];

function board(...rows: number[][]): number[] {
  const cells = rows.flat();
  return [...cells, ...Array<number>(16 - cells.length).fill(0)];
}

function randomSequence(...values: number[]) {
  let calls = 0;
  return {
    random: () => {
      assert.ok(calls < values.length, 'Unexpected random call');
      return values[calls++];
    },
    get calls() { return calls; },
  };
}

function snapshot(game: Game2048) {
  return {
    board: [...game.board], score: game.score, moves: game.moves, continued: game.continued,
    previous: game.previous ? { ...game.previous, board: [...game.previous.board] } : null,
    state: game.state, maxTile: game.maxTile,
  };
}

function withHistory() {
  const random = randomSequence(0, 0, 0, 0, 0, 0);
  const game = new Game2048(random.random);
  assert.equal(game.move('left').changed, true);
  assert.ok(game.previous);
  return { game, random };
}

function saved(overrides: Record<string, unknown> = {}) {
  return { version: 1, board: board([2, 4]), score: 24, moves: 3, continued: false, best: 128, ...overrides };
}

function assertRejected(raw: string | null, best: number): void {
  const { game, random } = withHistory();
  const before = snapshot(game);
  const originalBoard = game.board;
  const previous = game.previous;
  assert.equal(game.restore(raw), best, `Best score for ${raw}`);
  assert.deepEqual(snapshot(game), before, `Rejected save changed the game: ${raw}`);
  assert.strictEqual(game.board, originalBoard);
  assert.strictEqual(game.previous, previous);
  assert.equal(random.calls, 6);
}

function assertMotions(input: number[], direction: Direction, result: ReturnType<typeof slide>): void {
  const occupied = input.flatMap((value, index) => value ? [index] : []);
  assert.deepEqual(result.motions.map(({ from }) => from).sort((a, b) => a - b), occupied);
  const destinations = new Map<number, number[]>();
  for (const { from, to, value } of result.motions) {
    assert.ok(Number.isInteger(to) && to >= 0 && to < 16);
    assert.equal(value, input[from]);
    if (direction === 'left' || direction === 'right') {
      assert.equal(Math.floor(from / 4), Math.floor(to / 4));
    } else {
      assert.equal(from % 4, to % 4);
    }
    assert.ok(direction === 'left' || direction === 'up' ? to <= from : to >= from);
    destinations.set(to, [...(destinations.get(to) ?? []), value]);
  }
  const reconstructed = Array<number>(16).fill(0);
  const merged: number[] = [];
  let gained = 0;
  for (const [to, values] of destinations) {
    assert.ok(values.length === 1 || values.length === 2, 'A tile may merge only once');
    reconstructed[to] = values.reduce((sum, value) => sum + value, 0);
    if (values.length === 2) {
      assert.equal(values[0], values[1], 'Only equal tiles may merge');
      merged.push(to);
      gained += reconstructed[to];
    }
  }
  assert.deepEqual(reconstructed, result.board);
  assert.deepEqual([...result.merged].sort((a, b) => a - b), merged.sort((a, b) => a - b));
  assert.equal(result.gained, gained);
  assert.equal(result.board.reduce((sum, value) => sum + value, 0), input.reduce((sum, value) => sum + value, 0));
}

const directionalCases: { direction: Direction; expected: number[]; merged: number[] }[] = [
  { direction: 'left', expected: board([4, 4, 0, 0], [8, 0, 0, 0], [2, 8, 0, 0], [2, 8, 0, 0]), merged: [0, 4, 9, 13] },
  { direction: 'right', expected: board([0, 0, 4, 4], [0, 0, 0, 8], [0, 0, 2, 8], [0, 0, 2, 8]), merged: [2, 7, 11, 15] },
  { direction: 'up', expected: board([4, 8, 2, 8], [2, 0, 8, 4]), merged: [0, 1, 6, 3] },
  { direction: 'down', expected: board([0, 0, 0, 0], [0, 0, 0, 0], [2, 0, 2, 4], [4, 8, 8, 8]), merged: [12, 13, 14, 15] },
];

for (const { direction, expected, merged } of directionalCases) {
  test(`slide ${direction}: all four lines move and merge independently`, () => {
    const input = board([2, 0, 2, 4], [0, 4, 0, 4], [2, 4, 4, 0], [2, 0, 4, 4]);
    Object.freeze(input);
    const result = slide(input, direction);
    assert.deepEqual(result.board, expected);
    assert.equal(result.changed, true);
    assert.equal(result.gained, 28);
    assert.deepEqual(result.merged, merged);
    assertMotions(input, direction, result);
  });
}

const lineCases = [
  { input: [2, 2, 2, 2], expected: [4, 4, 0, 0], gained: 8, merged: [0, 1] },
  { input: [2, 2, 4, 0], expected: [4, 4, 0, 0], gained: 4, merged: [0] },
  { input: [4, 4, 8, 8], expected: [8, 16, 0, 0], gained: 24, merged: [0, 1] },
  { input: [2, 2, 2, 0], expected: [4, 2, 0, 0], gained: 4, merged: [0] },
  { input: [2, 4, 4, 0], expected: [2, 8, 0, 0], gained: 8, merged: [1] },
  { input: [0, 2, 0, 2], expected: [4, 0, 0, 0], gained: 4, merged: [0] },
  { input: [4, 0, 4, 8], expected: [8, 8, 0, 0], gained: 8, merged: [0] },
  { input: [0, 2, 0, 4], expected: [2, 4, 0, 0], gained: 0, merged: [] },
  { input: [2, 4, 2, 4], expected: [2, 4, 2, 4], gained: 0, merged: [] },
];
const firstLine: Record<Direction, number[]> = {
  left: [0, 1, 2, 3], right: [3, 2, 1, 0], up: [0, 4, 8, 12], down: [12, 8, 4, 0],
};

for (const fixture of lineCases) {
  test(`slide [${fixture.input}]: correct merge order in every direction and lane`, () => {
    for (const direction of directions) {
      for (let lane = 0; lane < 4; lane++) {
        const offset = direction === 'left' || direction === 'right' ? lane * 4 : lane;
        const indices = firstLine[direction].map(index => index + offset);
        const input = board();
        const expected = board();
        indices.forEach((index, position) => {
          input[index] = fixture.input[position];
          expected[index] = fixture.expected[position];
        });
        Object.freeze(input);
        const result = slide(input, direction);
        assert.deepEqual(result.board, expected, `${direction}, lane ${lane}`);
        assert.equal(result.changed, fixture.input.some((value, index) => value !== fixture.expected[index]));
        assert.equal(result.gained, fixture.gained);
        assert.deepEqual(result.merged, fixture.merged.map(position => indices[position]));
        assertMotions(input, direction, result);
      }
    }
  });
}

test('slide: empty boards return fresh unchanged boards without motions', () => {
  const input = board();
  Object.freeze(input);
  for (const direction of directions) {
    const result = slide(input, direction);
    assert.deepEqual(result, { board: board(), changed: false, gained: 0, merged: [], motions: [] });
    assert.notStrictEqual(result.board, input);
  }
});

test('slide: repeated calls are pure and results never alias inputs or each other', () => {
  for (const direction of directions) {
    for (const input of [board([0, 2, 2, 4]), [...deadBoard]]) {
      const before = [...input];
      Object.freeze(input);
      const first = slide(input, direction);
      const second = slide(input, direction);
      assert.deepEqual(first, second);
      assert.notStrictEqual(first.board, input);
      assert.notStrictEqual(first.board, second.board);
      first.board.fill(128);
      first.merged.push(15);
      first.motions[0].value = 128;
      assert.deepEqual(input, before);
      assert.deepEqual(second, slide(input, direction));
    }
  }
});

test('slide: motions include both merge sources, moving tiles, and stationary tiles', () => {
  const input = board([2, 0, 2, 4], [8, 0, 0, 0]);
  const result = slide(input, 'left');
  assert.deepEqual(result.motions, [
    { from: 0, to: 0, value: 2 }, { from: 2, to: 0, value: 2 },
    { from: 3, to: 1, value: 4 }, { from: 4, to: 4, value: 8 },
  ]);
  assertMotions(input, 'left', result);
  const stationary = slide(result.board, 'up');
  assert.equal(stationary.changed, false);
  assert.equal(stationary.motions.length, 3);
  assert.ok(stationary.motions.every(({ from, to }) => from === to));
});

test('canMove: any empty cell permits play, but diagonal and wrapped row matches do not', () => {
  assert.equal(canMove(board()), true);
  assert.equal(canMove(deadBoard), false);
  assert.equal(deadBoard[3], deadBoard[4], 'Fixture includes a match across a row boundary');
  for (let index = 0; index < 16; index++) {
    const input = [...deadBoard];
    input[index] = 0;
    assert.equal(canMove(input), true);
  }
});

test('canMove: every horizontal and vertical adjacency can unlock a full board', () => {
  for (let index = 0; index < 16; index++) {
    const neighbors = [index % 4 < 3 ? index + 1 : -1, index < 12 ? index + 4 : -1];
    for (const neighbor of neighbors.filter(value => value >= 0)) {
      const input = [...deadBoard];
      input[index] = input[neighbor];
      Object.freeze(input);
      assert.equal(canMove(input), true, `${index}/${neighbor}`);
      const game = new Game2048(() => 0);
      game.board = input;
      assert.equal(game.state, 'playing');
    }
  }
});

test('constructor: automatically spawns two distinct tiles and resets all counters', () => {
  const random = randomSequence(0, 0, lastRandom, 0.9);
  const game = new Game2048(random.random);
  const expected = board([2]);
  expected[15] = 4;
  assert.deepEqual(snapshot(game), {
    board: expected, score: 0, moves: 0, continued: false, previous: null, state: 'playing', maxTile: 4,
  });
  assert.equal(random.calls, 4);
  assert.equal(game.undo(), false);
});

test('constructor: defaults to Math.random when no generator is supplied', (t) => {
  const random = t.mock.method(Math, 'random', () => 0);
  const game = new Game2048();
  assert.deepEqual(game.board, board([2, 2]));
  assert.equal(random.mock.callCount(), 4);
});

for (const sample of [0, 0.9 - Number.EPSILON, 0.9, lastRandom]) {
  test(`spawn: random ${sample} respects the exact 90% value boundary`, () => {
    const value = sample < 0.9 ? 2 : 4;
    const random = randomSequence(0, sample, lastRandom, sample, 0.5, sample);
    const game = new Game2048(random.random);
    const initial = board([value]);
    initial[15] = value;
    assert.deepEqual(game.board, initial);
    game.board = board([2, 4]);
    const result = game.move('right');
    const expected = board([0, 0, 2, 4]);
    expected[9] = value;
    assert.equal(result.spawned, 9);
    assert.deepEqual(game.board, expected);
    assert.equal(random.calls, 6);
  });
}

test('spawn: a uniform deterministic sample produces 90 twos and 10 fours', () => {
  const counts = { 2: 0, 4: 0 };
  for (let index = 0; index < 100; index++) {
    const sample = (index + 0.5) / 100;
    const game = new Game2048(randomSequence(0, sample, 0, sample).random);
    for (const value of game.board.filter(value => value !== 0)) {
      assert.ok(value === 2 || value === 4);
      counts[value]++;
    }
  }
  assert.deepEqual(counts, { 2: 180, 4: 20 });
});

test('spawn: selects only empty cells at the first, middle, and last random positions', () => {
  for (const [sample, spawned] of [[0, 0], [0.5, 9], [lastRandom, 15]]) {
    const random = randomSequence(0, 0, 0, 0, sample, 0);
    const game = new Game2048(random.random);
    game.board = board([2, 4]);
    const result = game.move('right');
    const expected = board([0, 0, 2, 4]);
    expected[spawned] = 2;
    assert.equal(result.spawned, spawned);
    assert.deepEqual(game.board, expected);
    assert.equal(random.calls, 6);
  }
});

test('move: merges once, accumulates score, counts one step, and spawns exactly one tile', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0.9);
  const game = new Game2048(random.random);
  const input = board([2, 2, 4]);
  Object.freeze(input);
  game.board = input;
  game.score = 12;
  game.moves = 5;
  const result = game.move('left');
  assert.deepEqual(result, {
    changed: true, gained: 4, merged: [0], spawned: 2,
    motions: [{ from: 0, to: 0, value: 2 }, { from: 1, to: 0, value: 2 }, { from: 2, to: 1, value: 4 }],
  });
  assert.deepEqual(game.board, board([4, 4, 4]));
  assert.equal(game.score, 16);
  assert.equal(game.moves, 6);
  assert.deepEqual(game.previous, { board: input, score: 12, moves: 5, continued: false });
  assert.notStrictEqual(game.previous!.board, input);
  assert.deepEqual(input, board([2, 2, 4]));
  assert.equal(random.calls, 6);
});

test('move: all directions count non-merging slides without awarding score', () => {
  const destinations: Record<Direction, number[]> = { left: [4, 8], right: [7, 11], up: [1, 2], down: [13, 14] };
  for (const direction of directions) {
    const random = randomSequence(0, 0, 0, 0, 0, 0);
    const game = new Game2048(random.random);
    game.board = board();
    game.board[5] = 2;
    game.board[10] = 4;
    game.score = 20;
    const input = [...game.board];
    const [first, second] = destinations[direction];
    const expected = board([2]);
    expected[first] = 2;
    expected[second] = 4;
    const result = game.move(direction);
    assert.deepEqual(result, {
      changed: true, gained: 0, merged: [], spawned: 0,
      motions: [{ from: 5, to: first, value: 2 }, { from: 10, to: second, value: 4 }],
    });
    assert.deepEqual(game.board, expected);
    assert.equal(game.score, 20);
    assert.equal(game.moves, 1);
    assert.deepEqual(game.previous!.board, input);
    assert.equal(random.calls, 6);
  }
});

test('move: an unchanged move has no score, step, spawn, motion, or undo side effect', () => {
  const random = randomSequence(0, 0, 0, 0);
  const game = new Game2048(random.random);
  game.board = board([2, 4]);
  const before = snapshot(game);
  assert.deepEqual(game.move('left'), unchanged);
  assert.deepEqual(snapshot(game), before);
  assert.equal(random.calls, 4);
});

test('undo: unchanged moves cannot overwrite the previous valid move', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0);
  const game = new Game2048(random.random);
  game.board = board([0, 2, 0, 4]);
  game.score = 12;
  game.moves = 3;
  const before = snapshot(game);
  assert.equal(game.move('left').changed, true);
  const previous = game.previous;
  const after = snapshot(game);
  for (const direction of ['left', 'up'] as Direction[]) {
    assert.deepEqual(game.move(direction), unchanged);
    assert.strictEqual(game.previous, previous);
    assert.deepEqual(snapshot(game), after);
  }
  assert.equal(game.undo(), true);
  assert.deepEqual(snapshot(game), before);
  assert.equal(game.undo(), false);
  assert.equal(random.calls, 6);
});

test('undo: restores only the latest move and copies its snapshot without spawning', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0, 0, 0);
  const game = new Game2048(random.random);
  assert.equal(game.move('left').changed, true);
  const afterFirst = snapshot(game);
  const firstPrevious = game.previous;
  assert.equal(game.move('right').changed, true);
  assert.notStrictEqual(game.previous, firstPrevious);
  const previous = game.previous!;
  assert.equal(game.undo(), true);
  assert.deepEqual(snapshot(game), { ...afterFirst, previous: null });
  assert.notStrictEqual(game.board, previous.board);
  previous.board.fill(128);
  assert.deepEqual(game.board, afterFirst.board);
  assert.equal(game.undo(), false);
  assert.equal(random.calls, 8);
});

test('state: merging to 2048 wins and blocks every direction until continued', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0);
  const game = new Game2048(random.random);
  game.board = board([1024, 1024]);
  assert.equal(game.state, 'playing');
  assert.equal(game.move('left').gained, 2048);
  assert.equal(game.maxTile, 2048);
  assert.equal(game.state, 'won');
  assert.equal(game.score, 2048);
  assert.equal(game.moves, 1);
  assert.deepEqual(game.board, board([2048, 2]));
  const before = snapshot(game);
  for (const direction of directions) assert.deepEqual(game.move(direction), unchanged);
  assert.deepEqual(snapshot(game), before);
  assert.equal(random.calls, 6);
  assert.equal(game.undo(), true);
  assert.deepEqual(game.board, board([1024, 1024]));
  assert.equal(game.score, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.continued, false);
  assert.equal(game.state, 'playing');
});

test('keepPlaying: resumes after winning and does not win again at 4096, even after undo', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0, 0, 0);
  const game = new Game2048(random.random);
  game.board = board([1024, 1024, 1024, 1024]);
  assert.equal(game.move('left').gained, 4096);
  assert.equal(game.state, 'won');
  const won = snapshot(game);
  game.keepPlaying();
  assert.deepEqual(snapshot(game), { ...won, continued: true, state: 'playing' });
  game.keepPlaying();
  assert.equal(game.move('left').gained, 4096);
  assert.equal(game.maxTile, 4096);
  assert.equal(game.score, 8192);
  assert.equal(game.moves, 2);
  assert.equal(game.state, 'playing');
  assert.equal(game.undo(), true);
  assert.deepEqual(game.board, won.board);
  assert.equal(game.continued, true);
  assert.equal(game.state, 'playing');
  assert.equal(random.calls, 8);
});

test('keepPlaying: is a no-op while playing or over, and winning takes precedence over deadlock', () => {
  const random = randomSequence(0, 0, 0, 0);
  const game = new Game2048(random.random);
  const initial = snapshot(game);
  game.keepPlaying();
  assert.deepEqual(snapshot(game), initial);
  game.board = [...deadBoard];
  assert.equal(game.state, 'over');
  const over = snapshot(game);
  game.keepPlaying();
  assert.deepEqual(snapshot(game), over);
  for (const direction of directions) assert.deepEqual(game.move(direction), unchanged);
  assert.deepEqual(snapshot(game), over);
  game.board[0] = 4096;
  assert.equal(game.state, 'won');
  game.keepPlaying();
  assert.equal(game.continued, true);
  assert.equal(game.state, 'over');
  for (const direction of directions) assert.deepEqual(game.move(direction), unchanged);
  assert.equal(random.calls, 4);
});

test('state: a final spawn can create a deadlock, which undo can reverse', () => {
  const random = randomSequence(0, 0, 0, 0, lastRandom, 0);
  const game = new Game2048(random.random);
  game.board = [4, 2, 4, 0, ...deadBoard.slice(4)];
  const before = snapshot(game);
  assert.equal(game.state, 'playing');
  assert.equal(game.move('right').spawned, 0);
  assert.deepEqual(game.board, deadBoard);
  assert.equal(game.state, 'over');
  assert.equal(game.moves, 1);
  assert.equal(game.score, 0);
  const over = snapshot(game);
  for (const direction of directions) assert.deepEqual(game.move(direction), unchanged);
  assert.deepEqual(snapshot(game), over);
  assert.equal(game.undo(), true);
  assert.deepEqual(snapshot(game), before);
  assert.equal(random.calls, 6);
});

test('move: a full board with a legal pair merges before spawning into the freed cell', () => {
  const random = randomSequence(0, 0, 0, 0, lastRandom, 0);
  const game = new Game2048(random.random);
  game.board = [...deadBoard];
  game.board[0] = 4;
  assert.equal(game.state, 'playing');
  const result = game.move('left');
  assert.equal(result.changed, true);
  assert.equal(result.gained, 8);
  assert.deepEqual(result.merged, [0]);
  assert.equal(result.spawned, 3);
  assert.deepEqual(game.board, [8, 2, 4, 2, ...deadBoard.slice(4)]);
  assert.equal(game.board.filter(value => value > 0).length, 16);
  assert.equal(random.calls, 6);
});

test('restart: clears score, steps, continuation, and undo, then spawns a fresh pair', () => {
  const random = randomSequence(0, 0, 0, 0, 0, 0, 0, 0.9, lastRandom, 0);
  const game = new Game2048(random.random);
  game.board = board([1024, 1024]);
  game.move('left');
  game.keepPlaying();
  const oldBoard = game.board;
  const before = [...oldBoard];
  game.restart();
  const expected = board([4]);
  expected[15] = 2;
  assert.deepEqual(snapshot(game), {
    board: expected, score: 0, moves: 0, continued: false, previous: null, state: 'playing', maxTile: 4,
  });
  assert.notStrictEqual(game.board, oldBoard);
  assert.deepEqual(oldBoard, before);
  assert.equal(game.undo(), false);
  assert.equal(random.calls, 10);
});

test('serialize: emits the version-1 fields without undo or derived state and has no side effects', () => {
  const { game } = withHistory();
  const before = snapshot(game);
  assert.deepEqual(JSON.parse(game.serialize(128)), {
    version: 1, board: game.board, score: 4, moves: 1, continued: false, best: 128,
  });
  assert.deepEqual(snapshot(game), before);
});

const roundTrips = [
  { name: 'playing', board: board([2, 4]), continued: false, state: 'playing' },
  { name: 'won', board: board([2048, 2]), continued: false, state: 'won' },
  { name: 'continued', board: board([4096, 2]), continued: true, state: 'playing' },
  { name: 'over', board: [...deadBoard], continued: false, state: 'over' },
  { name: 'continued and over', board: [4096, ...deadBoard.slice(1)], continued: true, state: 'over' },
];
for (const fixture of roundTrips) {
  test(`restore: ${fixture.name} roundtrip restores state, keeps best, and discards all undo history`, () => {
    const source = withHistory().game;
    source.board = [...fixture.board];
    source.score = 64;
    source.moves = 8;
    source.continued = fixture.continued;
    const raw = source.serialize(128);
    const { game, random } = withHistory();
    assert.equal(game.restore(raw), 128);
    assert.deepEqual(snapshot(game), { ...snapshot(source), previous: null });
    assert.equal(game.state, fixture.state);
    assert.equal(game.serialize(128), raw);
    assert.equal(game.undo(), false);
    assert.equal(random.calls, 6);
    game.board[0] = 16;
    assert.deepEqual(source.board, fixture.board);
  });
}

test('restore: malformed JSON, missing data, and unsupported versions leave the live game untouched', () => {
  for (const raw of [null, '', ' ', '{', 'undefined', 'null', 'false', '42', '"save"', '[]', '{}']) {
    assertRejected(raw, 0);
  }
  for (const version of [undefined, null, 0, 2, -1, 1.5, '1', true, [], {}]) {
    assertRejected(JSON.stringify(saved({ version })), 0);
  }
});

test('restore: board shape and the minimum two occupied cells are validated while retaining best', () => {
  const invalidBoards = [undefined, null, {}, '2,4', [], Array(15).fill(2), Array(17).fill(2), board(), board([2])];
  for (const invalid of invalidBoards) assertRejected(JSON.stringify(saved({ board: invalid })), 128);
});

test('restore: tiles must be zero or safe integer powers of two, never coerced values', () => {
  const invalidTiles = [-2, -1, 1, 3, 6, 2.5, 2 ** 32 + 1, 2 ** 53, '2', null, true, false, [], {}, NaN, Infinity, -Infinity];
  for (const value of invalidTiles) {
    assertRejected(JSON.stringify(saved({ board: [2, 4, value, ...Array(13).fill(0)] })), 128);
  }
  const overflow = JSON.stringify(saved()).replace('[2,4,', '[1e309,4,');
  assertRejected(overflow, 128);
});

for (const value of [2 ** 52 - 1, Number.MAX_SAFE_INTEGER]) {
  test(`restore: rejects large non-power-of-two tile ${value} even when Math.log2 rounds`, () => {
    assertRejected(JSON.stringify(saved({ board: board([2, value]) })), 128);
  });
}

for (const field of ['score', 'moves']) {
  test(`restore: validates every ${field} boundary without changing board or undo`, () => {
    for (const value of [undefined, null, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, '12', true, false, [], {}, NaN, Infinity, -Infinity]) {
      assertRejected(JSON.stringify(saved({ [field]: value })), 128);
    }
    const overflow = JSON.stringify(saved()).replace(`"${field}":${field === 'score' ? 24 : 3}`, `"${field}":1e309`);
    assertRejected(overflow, 128);
  });
}

test('restore: continued must be a boolean rather than a truthy or missing value', () => {
  for (const continued of [undefined, null, 0, 1, 'true', 'false', [], {}]) {
    assertRejected(JSON.stringify(saved({ continued })), 128);
  }
});

test('restore: accepts zero counters and the largest safe counters and power-of-two tile', () => {
  for (const value of [0, Number.MAX_SAFE_INTEGER]) {
    const random = randomSequence(0, 0, 0, 0);
    const game = new Game2048(random.random);
    const data = saved({ board: board([2, 2 ** 52]), score: value, moves: value, continued: true, best: value });
    assert.equal(game.restore(JSON.stringify(data)), value);
    assert.deepEqual(game.board, data.board);
    assert.equal(game.score, value);
    assert.equal(game.moves, value);
    assert.equal(game.maxTile, 2 ** 52);
    assert.equal(game.continued, true);
    assert.equal(game.state, 'playing');
    assert.equal(game.previous, null);
    assert.equal(random.calls, 4);
  }
});

test('restore: preserves a valid best and raises it to the restored score when necessary', () => {
  for (const best of [0, 12, 24, 128, Number.MAX_SAFE_INTEGER]) {
    const game = new Game2048(() => 0);
    assert.equal(game.restore(JSON.stringify(saved({ best }))), Math.max(best, 24));
    assert.equal(game.score, 24);
    assertRejected(JSON.stringify(saved({ best, board: [] })), best);
  }
});

test('restore: invalid best values do not reject an otherwise valid save or survive a bad save', () => {
  for (const best of [undefined, null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '128', true, false, [], {}, NaN, Infinity, -Infinity]) {
    const { game, random } = withHistory();
    assert.equal(game.restore(JSON.stringify(saved({ best }))), 24);
    assert.deepEqual(game.board, board([2, 4]));
    assert.equal(game.score, 24);
    assert.equal(game.moves, 3);
    assert.equal(game.continued, false);
    assert.equal(game.previous, null);
    assert.equal(random.calls, 6);
    assertRejected(JSON.stringify(saved({ best, board: [] })), 0);
  }
});

test('restore: ignores injected undo history and derives state from validated board data', () => {
  const { game } = withHistory();
  const raw = JSON.stringify(saved({
    previous: { board: board([1024, 1024]), score: 500, moves: 20, continued: true },
    state: 'over', maxTile: 4096,
  }));
  assert.equal(game.restore(raw), 128);
  assert.equal(game.previous, null);
  assert.equal(game.undo(), false);
  assert.equal(game.state, 'playing');
  assert.equal(game.maxTile, 4);
});
