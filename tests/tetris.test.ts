import test from 'node:test';
import assert from 'node:assert/strict';
import { Tetris, SHAPES, COLS, ROWS } from '../src/games/tetris/engine.ts';
import type { Matrix, Piece, PieceType } from '../src/games/tetris/engine.ts';

function running(): Tetris { const game = new Tetris(() => 0.5); game.start(); return game; }
function piece(type: PieceType, x: number, y: number, matrix: Matrix = SHAPES[type]): Piece {
  return { type, x, y, matrix: matrix.map(row => [...row]) };
}

test('initial board and seven-bag queue', () => {
  const game = new Tetris();
  assert.equal(game.board.length, ROWS);
  assert.ok(game.board.every(row => row.length === COLS && row.every(cell => cell === null)));
  assert.equal(game.state, 'ready');
  assert.equal(new Set([game.active.type, ...game.queue.slice(0, 6)]).size, 7);
  assert.ok(game.queue.length >= 7);
});

test('ready and paused states reject all game actions', () => {
  const game = new Tetris();
  const before = JSON.stringify(game.active);
  assert.equal(game.move(-1), false);
  assert.equal(game.hardDrop(), false);
  game.start(); game.pause();
  for (const operation of [() => game.move(1), () => game.rotate(), () => game.step(true), () => game.hold(), () => game.hardDrop()]) assert.equal(operation(), false);
  assert.equal(JSON.stringify(game.active), before);
  game.start(); assert.equal(game.state, 'running');
});

test('movement respects walls and occupied cells', () => {
  const game = running();
  game.active = piece('O', 0, 0);
  assert.equal(game.move(-1), false);
  game.board[0]![2] = 'I';
  assert.equal(game.move(1), false);
  game.board[0]![2] = null;
  assert.equal(game.move(1), true);
  game.active.x = 8;
  assert.equal(game.move(1), false);
});

test('four rotations return to the original shape', () => {
  for (const type of Object.keys(SHAPES) as PieceType[]) {
    const game = running();
    game.active = piece(type, 3, 5);
    for (let i = 0; i < 4; i++) assert.equal(game.rotate(), true);
    assert.deepEqual(game.active.matrix, SHAPES[type]);
  }
});

test('wall and floor kicks keep rotated blocks valid', () => {
  const game = running();
  game.active = piece('I', 3, 18);
  assert.equal(game.rotate(), true);
  assert.equal(game.collides(), false);
  game.active.x = -2;
  assert.equal(game.collides(), false);
  assert.equal(game.rotate(), true);
  assert.equal(game.collides(), false);
});

test('ghost position matches hard-drop landing and awards points', () => {
  const game = running();
  game.active = piece('O', 4, 0);
  assert.equal(game.ghostY(), 18);
  game.hardDrop();
  assert.equal(game.score, 36);
  assert.equal(game.board[19]![4], 'O');
  assert.equal(game.board[18]![5], 'O');
  assert.equal(game.canHold, true);
});

test('soft drop scores one point; gravity does not', () => {
  const game = running();
  game.step(); assert.equal(game.score, 0);
  game.step(true); assert.equal(game.score, 1);
  assert.equal(game.active.y, 2);
});

test('clears one through four lines with expected scoring', () => {
  for (let count = 1; count <= 4; count++) {
    const game = running();
    for (let y = ROWS - count; y < ROWS; y++) game.board[y] = Array.from({ length: COLS }, (_, x) => x === 4 ? null : 'J');
    game.active = piece('I', 4, 16, [[1], [1], [1], [1]]);
    game.hardDrop();
    assert.equal(game.lastClear, count);
    assert.equal(game.lines, count);
    assert.equal(game.score, [0, 100, 300, 500, 800][count]);
    assert.equal(game.board.length, ROWS);
    assert.ok(game.board.every(row => row.some(cell => !cell)));
  }
});

test('level advances every ten lines, using prior level for scoring', () => {
  const game = running();
  game.lines = 9;
  const oldInterval = game.interval;
  game.board[19] = Array.from({ length: COLS }, (_, x) => x >= 3 && x <= 6 ? null : 'T');
  game.active = piece('I', 3, 18);
  game.hardDrop();
  assert.equal(game.lines, 10);
  assert.equal(game.level, 2);
  assert.equal(game.score, 100);
  assert.ok(game.interval < oldInterval);
});

test('hold can be used once per piece, then swaps with a fresh orientation', () => {
  const game = running();
  const initial = game.active.type;
  assert.equal(game.hold(), true);
  assert.equal(game.held, initial);
  assert.equal(game.hold(), false);
  game.hardDrop();
  const next = game.active.type;
  assert.equal(game.hold(), true);
  assert.equal(game.active.type, initial);
  assert.equal(game.held, next);
  assert.deepEqual(game.active.matrix, SHAPES[initial]);
});

test('blocked spawn ends the game', () => {
  const game = running();
  game.board[0]!.fill('I'); game.board[1]!.fill('I');
  game.spawn('O');
  assert.equal(game.state, 'over');
  assert.equal(game.hardDrop(), false);
});

test('locking above the board ends the game', () => {
  const game = running();
  game.active = piece('O', 3, -1);
  game.board[1]![3] = 'J';
  game.step();
  assert.equal(game.state, 'over');
});

test('reset clears the game but keeps it ready for an explicit start', () => {
  const game = running(); game.hardDrop(); game.hold();
  game.reset();
  assert.equal(game.score, 0); assert.equal(game.lines, 0); assert.equal(game.level, 1);
  assert.equal(game.held, null); assert.equal(game.state, 'ready');
  assert.ok(game.board.every(row => row.every(cell => !cell)));
});

test('random play preserves board boundaries and cell types', () => {
  const game = running();
  for (let i = 0; i < 500; i++) {
    if (game.state === 'over') { game.reset(); game.start(); }
    game.move(i % 2 ? -1 : 1);
    game.rotate();
    if (i % 4 === 0) game.hold();
    game.hardDrop();
    assert.equal(game.board.length, ROWS);
    assert.ok(game.board.every(row => row.length === COLS && row.every(cell => cell === null || cell in SHAPES)));
    if (game.state === 'running') assert.equal(game.collides(), false);
  }
});
