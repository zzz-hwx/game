import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLS, ROWS, createGame, levels, parsePreferences, queueTurn, spawnFood, startGame, tick,
} from '../src/games/snake/engine.ts'
import type { Direction, GameStatus, Point } from '../src/games/snake/engine.ts'

function runningGame() {
  const game = createGame()
  startGame(game)
  return game
}

test('snake: original board, speeds, reset position and food are preserved', () => {
  const game = createGame()
  assert.equal(COLS, 28)
  assert.equal(ROWS, 22)
  assert.deepEqual(Object.values(levels).map(level => level.delay), [190, 130, 80])
  assert.equal(game.status, 'ready')
  assert.deepEqual(game.snake, [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }])
  assert.deepEqual(game.food, { x: 18, y: 11 })
  assert.equal(game.direction, 'right')
  assert.equal(game.turns.length, 0)
  assert.equal(game.score, 0)
  game.score = 70
  game.turns.push('up')
  game.snake.pop()
  startGame(game)
  assert.deepEqual(game, { ...createGame(), status: 'running' })
})

test('snake: ordinary moves keep length, and eating adds one cell and ten points', () => {
  const game = runningGame()
  assert.equal(tick(game), 'moved')
  assert.deepEqual(game.snake[0], { x: 9, y: 11 })
  assert.equal(game.snake.length, 4)
  for (let i = 0; i < 8; i++) assert.equal(tick(game), 'moved')
  assert.equal(tick(game, () => 0), 'ate')
  assert.deepEqual(game.snake[0], { x: 18, y: 11 })
  assert.equal(game.snake.length, 5)
  assert.equal(game.score, 10)
  assert.deepEqual(game.food, { x: 0, y: 0 })
})

test('snake: turns reject repeats and reversal against the last queued direction', () => {
  const game = runningGame()
  assert.equal(queueTurn(game, 'left'), false)
  assert.equal(queueTurn(game, 'right'), false)
  assert.equal(queueTurn(game, 'up'), true)
  assert.equal(queueTurn(game, 'down'), false)
  assert.equal(queueTurn(game, 'up'), false)
  assert.equal(queueTurn(game, 'left'), true)
  assert.equal(queueTurn(game, 'down'), false)
  assert.deepEqual(game.turns, ['up', 'left'])
  assert.equal(tick(game), 'moved')
  assert.equal(game.direction, 'up')
  assert.deepEqual(game.snake[0], { x: 8, y: 10 })
  assert.deepEqual(game.turns, ['left'])
  assert.equal(tick(game), 'moved')
  assert.equal(game.direction, 'left')
  assert.deepEqual(game.snake[0], { x: 7, y: 10 })
  assert.deepEqual(game.turns, [])
})

test('snake: ready, paused, over and won states do not move or queue turns', () => {
  const statuses: GameStatus[] = ['ready', 'paused', 'over', 'won']
  for (const status of statuses) {
    const game = createGame()
    game.status = status
    const before = structuredClone(game)
    assert.equal(queueTurn(game, 'up'), false)
    assert.equal(tick(game), 'idle')
    assert.deepEqual(game, before)
  }
})

test('snake: all four walls end a run without moving the snake', () => {
  const edges: { head: Point; direction: Direction }[] = [
    { head: { x: 0, y: 4 }, direction: 'left' },
    { head: { x: COLS - 1, y: 4 }, direction: 'right' },
    { head: { x: 4, y: 0 }, direction: 'up' },
    { head: { x: 4, y: ROWS - 1 }, direction: 'down' },
  ]
  for (const { head, direction } of edges) {
    const game = runningGame()
    game.snake = [head]
    game.direction = direction
    assert.equal(tick(game), 'over')
    assert.equal(game.status, 'over')
    assert.deepEqual(game.snake, [head])
    assert.equal(game.score, 0)
  }
})

test('snake: colliding with a non-departing body segment ends the run', () => {
  const game = runningGame()
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 2 }]
  assert.equal(tick(game), 'over')
  assert.equal(game.snake.length, 5)
})

test('snake: entering the departing tail is legal, but not when eating', () => {
  const game = runningGame()
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }]
  const eatingGame = structuredClone(game)
  eatingGame.food = { x: 3, y: 2 }
  assert.equal(tick(game), 'moved')
  assert.deepEqual(game.snake[0], { x: 3, y: 2 })
  assert.equal(game.snake.length, 4)
  assert.equal(tick(eatingGame), 'over')
  assert.equal(eatingGame.score, 0)
})

test('snake: food spawning only picks unoccupied cells, including the final cell', () => {
  const snake: Point[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) snake.push({ x, y })
  }
  assert.equal(spawnFood(snake), null)
  const last = snake.pop()
  assert.deepEqual(spawnFood(snake, () => 0), last)
  assert.deepEqual(spawnFood(snake, () => 0.999999), last)
  assert.deepEqual(spawnFood([], () => 0), { x: 0, y: 0 })
  assert.deepEqual(spawnFood([], () => 0.999999), { x: COLS - 1, y: ROWS - 1 })
})

test('snake: eating the final free cell wins with a full board and no food', () => {
  const game = runningGame()
  // A continuous serpentine body occupies everything except the next cell (0, 0).
  game.snake = []
  for (let y = 0; y < ROWS; y++) {
    for (let index = 0; index < COLS; index++) {
      const x = y % 2 === 0 ? index : COLS - 1 - index
      if (x !== 0 || y !== 0) game.snake.push({ x, y })
    }
  }
  game.direction = 'left'
  game.food = { x: 0, y: 0 }
  assert.equal(tick(game), 'won')
  assert.equal(game.status, 'won')
  assert.equal(game.snake.length, COLS * ROWS)
  assert.equal(game.score, 10)
  assert.equal(game.food, null)
  assert.equal(tick(game), 'idle')
})

test('snake: preferences retain valid original values and reject malformed storage', () => {
  const defaults = { best: 0, level: 'normal', sound: false }
  for (const raw of [null, '', '{', 'null', 'false', '123', '[]']) {
    assert.deepEqual(parsePreferences(raw), defaults)
  }
  assert.deepEqual(parsePreferences('{"best":120,"level":"hard","sound":true}'), { best: 120, level: 'hard', sound: true })
  for (const best of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '10', null]) {
    assert.deepEqual(parsePreferences(JSON.stringify({ best, level: '__proto__', sound: 'true' })), defaults)
  }
  assert.deepEqual(parsePreferences('{"best":20,"level":"easy","sound":false}'), { best: 20, level: 'easy', sound: false })
})
