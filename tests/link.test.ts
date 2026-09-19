import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, findMove, findPath, shuffleBoard } from '../src/games/link/engine.ts';
import type { Board, Cell, Move, Point, ReadonlyBoard } from '../src/games/link/engine.ts';

const point = (row: number, col: number): Point => ({ row, col });
const freezeBoard = (board: ReadonlyBoard): ReadonlyBoard =>
  Object.freeze(board.map((row) => Object.freeze(row.slice())));
const multiset = (board: ReadonlyBoard): number[] =>
  board.flat().filter((type): type is number => type !== null).sort((a, b) => a - b);

function assertPath(
  board: ReadonlyBoard,
  start: Readonly<Point>,
  end: Readonly<Point>,
  path: Point[] | null,
  maxTurns = 2,
): asserts path is Point[] {
  assert.ok(Array.isArray(path), 'Expected a path');
  assert.ok(path.length >= 2 && path.length <= maxTurns + 2, 'Wrong number of bends');
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), end);
  assert.notDeepEqual(start, end);
  assert.notEqual(board[start.row][start.col], null);
  assert.equal(board[start.row][start.col], board[end.row][end.col]);
  let previousDirection: [number, number] | undefined;

  for (let index = 1; index < path.length; index += 1) {
    const from: Point = path[index - 1];
    const to: Point = path[index];
    for (const cell of [from, to]) {
      assert.ok(Number.isInteger(cell.row) && Number.isInteger(cell.col));
      assert.ok(cell.row >= -1 && cell.row <= board.length);
      assert.ok(cell.col >= -1 && cell.col <= board[0].length);
    }
    const dr = Math.sign(to.row - from.row);
    const dc = Math.sign(to.col - from.col);
    assert.ok((dr === 0) !== (dc === 0), 'Segments must be nonempty and axis-aligned');
    if (previousDirection) {
      assert.ok(previousDirection[0] * dr + previousDirection[1] * dc === 0,
        'Only right-angle bends belong in the result');
    }
    previousDirection = [dr, dc];
    let row = from.row;
    let col = from.col;
    while (row !== to.row || col !== to.col) {
      row += dr;
      col += dc;
      if (index === path.length - 1 && row === end.row && col === end.col) continue;
      if (row >= 0 && row < board.length && col >= 0 && col < board[0].length) {
        assert.equal(board[row][col], null, `Occupied intermediate at ${row},${col}`);
      }
    }
  }
}

function assertMove(board: ReadonlyBoard, move: Move | null): asserts move is Move {
  assert.ok(move, 'Expected a legal move');
  assertPath(board, move.start, move.end, move.path);
}

function assertPreserved(before: ReadonlyBoard, after: Board): void {
  assert.notStrictEqual(after, before);
  assert.equal(after.length, before.length);
  for (let row = 0; row < before.length; row += 1) {
    assert.notStrictEqual(after[row], before[row]);
    assert.equal(after[row].length, before[row].length);
    for (let col = 0; col < before[row].length; col += 1) {
      assert.equal(after[row][col] === null, before[row][col] === null, 'Holes must not move');
    }
  }
  assert.deepEqual(multiset(after), multiset(before));
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function referencePathExists(board: ReadonlyBoard, start: Point, end: Point): boolean {
  const candidates: Point[][] = [];
  for (let row = -1; row <= board.length; row += 1) {
    candidates.push([start, point(row, start.col), point(row, end.col), end]);
  }
  for (let col = -1; col <= board[0].length; col += 1) {
    candidates.push([start, point(start.row, col), point(end.row, col), end]);
  }
  return candidates.some((candidate) => {
    const walk = [start];
    for (let index = 1; index < candidate.length; index += 1) {
      let { row, col } = candidate[index - 1];
      const to = candidate[index];
      const dr = Math.sign(to.row - row);
      const dc = Math.sign(to.col - col);
      while (row !== to.row || col !== to.col) {
        row += dr;
        col += dc;
        walk.push(point(row, col));
      }
    }
    return walk.slice(1, -1).every(({ row, col }) => row < 0 || row >= board.length
      || col < 0 || col >= board[0].length || board[row][col] === null);
  });
}

test('straight horizontal, vertical, and adjacent paths contain endpoints only', () => {
  const cases: [Board, Point, Point][] = [
    [[[0, null, null, 0]], point(0, 0), point(0, 3)],
    [[[4], [null], [4]], point(0, 0), point(2, 0)],
    [[[2, 2]], point(0, 0), point(0, 1)],
    [[[-3], [-3]], point(1, 0), point(0, 0)],
  ];
  for (const [board, start, end] of cases) {
    const path = findPath(board, start, end);
    assert.deepEqual(path, [start, end]);
    assertPath(board, start, end, path);
  }
});

test('one-bend paths use the clear corner rather than an occupied corner', () => {
  const board = [[1, null], [9, 1]];
  const start = point(0, 0);
  const end = point(1, 1);
  assert.deepEqual(findPath(board, start, end), [start, point(0, 1), end]);
  assertPath(board, start, end, findPath(board, start, end));
  assertPath(board, end, start, findPath(board, end, start));
});

test('two-bend paths include bends but omit intermediate straight-line cells', () => {
  const board = [[1, null, 9], [9, null, 9], [9, null, 1]];
  const start = point(0, 0);
  const end = point(2, 2);
  const path = findPath(board, start, end);
  assert.deepEqual(path, [start, point(0, 1), point(2, 1), end]);
  assertPath(board, start, end, path);
});

test('paths can use each of the four single-cell padded boundaries', () => {
  const cases: { board: Board; start: Point; end: Point; axis: keyof Point; boundary: number }[] = [
    { board: [[1, 2, 1], [3, 4, 5]], start: point(0, 0), end: point(0, 2), axis: 'row', boundary: -1 },
    { board: [[3, 4, 5], [1, 2, 1]], start: point(1, 0), end: point(1, 2), axis: 'row', boundary: 2 },
    { board: [[1, 3], [2, 4], [1, 5]], start: point(0, 0), end: point(2, 0), axis: 'col', boundary: -1 },
    { board: [[3, 1], [4, 2], [5, 1]], start: point(0, 1), end: point(2, 1), axis: 'col', boundary: 2 },
  ];
  for (const { board, start, end, axis, boundary } of cases) {
    const path = findPath(board, start, end);
    assertPath(board, start, end, path);
    assert.equal(path.length, 4);
    assert.equal(path[1][axis], boundary);
    assert.equal(path[2][axis], boundary);
  }
});

test('mismatched, identical, empty, and out-of-board selections are rejected', () => {
  const board = [[0, 1, null], [null, 0, 1]];
  const cases: [Point | null | undefined, Point | null | undefined][] = [
    [point(0, 0), point(0, 1)],
    [point(0, 0), point(0, 0)],
    [point(0, 2), point(1, 0)],
    [point(0, 2), point(0, 0)],
    [point(0, 0), point(0, 2)],
    [point(-1, 0), point(0, 0)],
    [point(0, 0), point(2, 0)],
    [point(0, 0), point(0, 3)],
    [point(0.5, 0), point(1, 1)],
    [null, point(0, 0)],
    [point(0, 0), undefined],
  ];
  for (const [start, end] of cases) {
    assert.equal(findPath(board, start, end), null);
  }
  assert.equal(findPath([], point(0, 0), point(0, 1)), null);
  assert.equal(findPath([[]], point(0, 0), point(0, 1)), null);
});

test('an open corridor requiring three bends is rejected', () => {
  const board = [
    [9, 9, 9, 9, 9],
    [9, 1, null, 9, 9],
    [9, 9, null, null, 9],
    [9, 9, 9, 1, 9],
    [9, 9, 9, 9, 9],
  ];
  const start = point(1, 1);
  const end = point(3, 3);
  assertPath(board, start, end, [start, point(1, 2), point(2, 2), point(2, 3), end], 3);
  assert.equal(findPath(board, start, end), null);
});

test('occupied cells cannot be crossed, even when the boundary is available', () => {
  const board = [[1, 2], [2, 1]];
  assert.equal(findPath(board, point(0, 0), point(1, 1)), null);
  assert.equal(findPath(board, point(0, 1), point(1, 0)), null);
});

test('path search agrees with independent bend enumeration for every 3x3 occupancy', () => {
  for (let first = 0; first < 9; first += 1) {
    for (let second = first + 1; second < 9; second += 1) {
      const start = point(Math.floor(first / 3), first % 3);
      const end = point(Math.floor(second / 3), second % 3);
      const others = Array.from({ length: 9 }, (_, index) => index)
        .filter((index) => index !== first && index !== second);
      for (let mask = 0; mask < 128; mask += 1) {
        const board: Board = Array.from({ length: 3 }, () => Array<Cell>(3).fill(null));
        board[start.row][start.col] = 1;
        board[end.row][end.col] = 1;
        others.forEach((cell, bit) => {
          if (mask & (1 << bit)) board[Math.floor(cell / 3)][cell % 3] = 2;
        });
        const path = findPath(board, start, end);
        assert.equal(path !== null, referencePathExists(board, start, end),
          `Disagreement for endpoints ${first}/${second}, mask ${mask}`);
        if (path) assertPath(board, start, end, path);
        assert.equal(findPath(board, end, start) !== null, path !== null);
      }
    }
  }
});

test('findMove skips blocked pairs and returns a complete legal move', () => {
  const board = [[1, 2, null], [2, 1, null], [3, 3, null]];
  const move = findMove(board);
  assertMove(board, move);
  assert.equal(board[move.start.row][move.start.col], 3);
  assert.deepEqual(move.path, findPath(board, move.start, move.end));
  assertMove([[0, null, 0]], findMove([[0, null, 0]]));
});

test('findMove returns null for deadlocks, singletons, and empty boards', () => {
  for (const board of [[], [[]], [[null, null]], [[1]], [[1, 2]], [[1, 2], [2, 1]]]) {
    assert.equal(findMove(board), null);
  }
});

test('createBoard produces paired types, requested dimensions, and a legal move', (t) => {
  t.mock.method(Math, 'random', seededRandom(12345));
  for (const [rows, cols, typeCount] of [[1, 2, 10], [2, 1, 1], [3, 4, 4], [6, 8, 7], [1, 10, 3], [10, 1, 2], [4, 6, 6], [6, 8, 10], [8, 8, 12]]) {
    for (let iteration = 0; iteration < 12; iteration += 1) {
      const board = createBoard(rows, cols, typeCount);
      assert.equal(board.length, rows);
      assert.ok(board.every((row) => row.length === cols));
      assert.equal(new Set(board).size, rows, 'Rows must not alias each other');
      const counts = new Map<number, number>();
      for (const type of board.flat()) {
        assert.ok(type !== null && Number.isInteger(type) && type >= 0 && type < typeCount);
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
      assert.equal(board.flat().length, rows * cols);
      assert.ok([...counts.values()].every((count) => count % 2 === 0));
      assertMove(board, findMove(board));
    }
  }
});

test('createBoard randomizes placement rather than returning its ordered seed', (t) => {
  t.mock.method(Math, 'random', seededRandom(1));
  const first = createBoard(4, 4, 8);
  const second = createBoard(4, 4, 8);
  assert.notDeepEqual(first, second);
  assert.deepEqual(multiset(first), multiset(second));
});

test('createBoard rejects dimensions or type counts that cannot produce paired boards', () => {
  const cases: [number, number, number][] = [[3, 3, 2], [0, 2, 2], [2, 0, 2], [-2, 2, 2], [1.5, 4, 2],
    [2, 2.5, 2], [2, 2, 0], [2, 2, -1], [2, 2, 1.5], [2, 2, NaN], [Infinity, 2, 2]];
  for (const args of cases) {
    assert.throws(() => createBoard(...args), RangeError);
  }
});

test('shuffle preserves all holes and multiplicities after pairs have been removed', (t) => {
  t.mock.method(Math, 'random', seededRandom(98));
  const board = createBoard(6, 8, 8);
  for (let removed = 0; removed < 6; removed += 1) {
    const move = findMove(board);
    assertMove(board, move);
    const { start, end } = move;
    board[start.row][start.col] = null;
    board[end.row][end.col] = null;
  }
  const input = freezeBoard(board);
  for (let iteration = 0; iteration < 30; iteration += 1) {
    const shuffled = shuffleBoard(input);
    assertPreserved(input, shuffled);
    assertMove(shuffled, findMove(shuffled));
  }
});

test('failed random shuffles fall back to count-preserving, accessible matching cells', (t) => {
  let randomCalls = 0;
  t.mock.method(Math, 'random', () => {
    randomCalls += 1;
    return 1 - Number.EPSILON;
  });
  for (const board of [
    [[0, 1], [1, 0]],
    [[7, 8, 9], [1, 2, null], [2, 1, null]],
    [[null, null, 7], [1, 2, null], [2, 1, null]],
  ]) {
    const input = freezeBoard(board);
    assert.equal(findMove(input), null, 'Fixture must begin deadlocked');
    const callsBefore = randomCalls;
    const shuffled = shuffleBoard(input);
    assertPreserved(input, shuffled);
    assert.deepEqual(input, board);
    assertMove(shuffled, findMove(shuffled));
    assert.equal(randomCalls - callsBefore, 24 * (multiset(input).length - 1), 'All 24 random retries must fail first');
    const cells = shuffled.flatMap((row, rowIndex) => row.flatMap((type, col) =>
      type === null ? [] : [point(rowIndex, col)]));
    assertPath(shuffled, cells[0], cells[1], findPath(shuffled, cells[0], cells[1]));
  }
});

test('shuffle returns a fresh board even when no occupied pair remains', () => {
  for (const board of [[], [[]], [[null, null]], [[null, 7]], [[1, null, 2], [3, null, 4]]]) {
    const input = freezeBoard(board);
    const shuffled = shuffleBoard(input);
    assertPreserved(input, shuffled);
    assert.equal(findMove(shuffled), null);
    assert.deepEqual(input, board);
  }
});

test('path, move, and shuffle operations never mutate their inputs or alias output rows', () => {
  const original = [[0, null, 0], [1, 1, null]];
  const board = freezeBoard(original);
  const start = Object.freeze(point(0, 0));
  const end = Object.freeze(point(0, 2));
  const path = findPath(board, start, end);
  assertPath(board, start, end, path);
  assert.notStrictEqual(path[0], start);
  assert.notStrictEqual(path.at(-1), end);
  path[0].row = 99;
  assert.deepEqual(start, point(0, 0));
  const move = findMove(board);
  assertMove(board, move);
  move.start.row = 99;
  const shuffled = shuffleBoard(board);
  assertPreserved(board, shuffled);
  shuffled[0][0] = 99;
  assert.deepEqual(board, original);
});

test('all three difficulty boards can be cleared with automatic deadlock recovery', (t) => {
  t.mock.method(Math, 'random', seededRandom(2026));
  for (const [rows, cols, types] of [[4, 6, 6], [6, 8, 10], [8, 8, 12]]) {
    for (let game = 0; game < 10; game += 1) {
      let board = createBoard(rows, cols, types);
      for (let pairs = rows * cols / 2; pairs > 0; pairs -= 1) {
        let move = findMove(board);
        if (!move) {
          const before = freezeBoard(board);
          board = shuffleBoard(before);
          assertPreserved(before, board);
          move = findMove(board);
        }
        assertMove(board, move);
        board[move.start.row][move.start.col] = null;
        board[move.end.row][move.end.col] = null;
        assert.equal(multiset(board).length, (pairs - 1) * 2);
      }
      assert.ok(board.flat().every((cell) => cell === null));
      assert.equal(findMove(board), null);
    }
  }
});
