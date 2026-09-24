import test from 'node:test'
import assert from 'node:assert/strict'
import {
  COLS, ROWS, EFFECT_DURATION_MS, FOOD_EDGE_UNLOCK_SCORE, FOOD_LIFETIME_MS, FOOD_SAFE_MARGIN,
  INITIAL_LIVES, MIN_SNAKE_LENGTH, OBSTACLES, SHRINK_CELLS, advanceTime, createGame, getMoveDelay,
  levels, parsePreferences, queueTurn, resumeGame, spawnFood, startGame, tick,
} from '../src/games/snake/engine.ts'
import type { Collision, Direction, Food, FoodKind, GameStatus, Level, Point, SnakeState } from '../src/games/snake/engine.ts'

function runningGame() {
  const game = createGame()
  startGame(game)
  return game
}

function foodAt(point: Point, kind: FoodKind = 'apple', remainingMs = FOOD_LIFETIME_MS): Food {
  return { ...point, kind, remainingMs }
}

function samePoint(a: Point, b: Point) {
  return a.x === b.x && a.y === b.y
}

function allCells(): Point[] {
  return Array.from({ length: COLS * ROWS }, (_, index) => ({ x: index % COLS, y: Math.floor(index / COLS) }))
}

// Select a position deterministically while keeping the independent food-kind draw on apple.
function positionRandom(value: number) {
  let calls = 0
  return () => calls++ % 2 === 0 ? value : 0
}

function assertFoodIsFree(game: Pick<SnakeState, 'snake' | 'obstacles'>, food: Food | null): asserts food is Food {
  assert.ok(food)
  assert.ok(food.x >= 0 && food.x < COLS && food.y >= 0 && food.y < ROWS)
  assert.equal([...game.snake, ...game.obstacles].some(point => samePoint(point, food)), false)
  assert.ok(['apple', 'golden', 'speed', 'slow', 'shrink'].includes(food.kind))
  assert.equal(food.remainingMs, FOOD_LIFETIME_MS)
}

function isCentral(point: Point) {
  return point.x >= FOOD_SAFE_MARGIN && point.x < COLS - FOOD_SAFE_MARGIN
    && point.y >= FOOD_SAFE_MARGIN && point.y < ROWS - FOOD_SAFE_MARGIN
}

test('snake: original board, speeds, reset position and food are preserved', () => {
  const game = createGame()
  assert.equal(COLS, 28)
  assert.equal(ROWS, 22)
  assert.deepEqual(Object.values(levels).map(level => level.delay), [190, 130, 80])
  assert.equal(INITIAL_LIVES, 3)
  assert.equal(FOOD_LIFETIME_MS, 10_000)
  assert.equal(EFFECT_DURATION_MS, 6_000)
  assert.equal(MIN_SNAKE_LENGTH, 3)
  assert.equal(SHRINK_CELLS, 3)
  assert.equal(game.status, 'ready')
  assert.deepEqual(game.snake, [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }])
  assert.deepEqual(game.food, { x: 18, y: 11, kind: 'apple', remainingMs: 10_000 })
  assert.equal(game.direction, 'right')
  assert.equal(game.turns.length, 0)
  assert.equal(game.score, 0)
  assert.equal(game.lives, 3)
  assert.equal(game.effect, null)
  assert.equal(game.collision, null)
  game.score = 70
  game.turns.push('up')
  game.snake.pop()
  startGame(game)
  assert.deepEqual(game, { ...createGame(), status: 'running' })
})

test('snake: the sixteen fixed obstacles and mutable state are independent between games', () => {
  const expected = [6, 15].flatMap(y => [6, 7, 8, 9, 18, 19, 20, 21].map(x => ({ x, y })))
  const game = createGame()
  const other = createGame()
  const before = structuredClone(other)
  assert.equal(OBSTACLES.length, 16)
  assert.deepEqual(OBSTACLES, expected)
  assert.deepEqual(game.obstacles, expected)
  assertFoodIsFree(game, game.food)
  assert.equal(game.snake.some(part => game.obstacles.some(obstacle => samePoint(part, obstacle))), false)
  assert.notEqual(game.obstacles, other.obstacles)
  assert.notEqual(game.obstacles[0], OBSTACLES[0])
  game.obstacles[0]!.x = 0
  game.obstacles.pop()
  game.snake[0]!.x = 0
  game.food!.remainingMs = 1
  game.turns.push('up')
  assert.deepEqual(other, before)
  assert.deepEqual(OBSTACLES, expected)
})

test('snake: restarting from any status restores every field, including lives, obstacles and timers', () => {
  const statuses: GameStatus[] = ['ready', 'running', 'paused', 'recovering', 'over', 'won']
  for (const status of statuses) {
    const game = runningGame()
    game.status = status
    game.snake = [{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }]
    game.obstacles = [{ x: 0, y: 0 }]
    game.food = status === 'won' ? null : foodAt({ x: 2, y: 2 }, 'golden', 1)
    game.direction = 'up'
    game.turns = ['left', 'down']
    game.score = 145
    game.lives = 0
    game.effect = { kind: 'slow', remainingMs: 1 }
    game.collision = 'body'
    startGame(game)
    assert.deepEqual(game, { ...createGame(), status: 'running' }, status)
  }
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
  assert.deepEqual(game.food, foodAt({ x: 3, y: 3 }))
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

test('snake: ready, paused, recovering, over and won states neither move, queue turns nor count time', () => {
  const statuses: GameStatus[] = ['ready', 'paused', 'recovering', 'over', 'won']
  for (const status of statuses) {
    const game = createGame()
    game.status = status
    game.turns = ['up']
    game.food = foodAt({ x: 18, y: 11 }, 'slow', 1)
    game.effect = { kind: 'speed', remainingMs: 1 }
    const before = structuredClone(game)
    assert.equal(queueTurn(game, 'left'), false)
    assert.equal(tick(game), 'idle')
    advanceTime(game, 20_000, () => assert.fail('inactive timers must not spawn food'))
    assert.deepEqual(game, before, status)
  }
})

test('snake: resuming a paused game preserves its score, snake, queue and unspent timers', () => {
  const game = runningGame()
  game.score = 75
  game.effect = { kind: 'slow', remainingMs: 2_000 }
  game.food!.remainingMs = 3_000
  assert.equal(queueTurn(game, 'up'), true)
  const before = structuredClone(game)
  game.status = 'paused'
  advanceTime(game, 50_000)
  resumeGame(game)
  assert.deepEqual(game, before)
  advanceTime(game, 500)
  assert.equal(game.effect!.remainingMs, 1_500)
  assert.equal(game.food!.remainingMs, 2_500)
  assert.equal(tick(game), 'moved')
  assert.deepEqual(game.snake[0], { x: 8, y: 10 })
})

test('snake: resumeGame cannot start, restart or change a running or terminal game', () => {
  const statuses: GameStatus[] = ['ready', 'running', 'over', 'won']
  for (const status of statuses) {
    const game = createGame()
    game.status = status
    if (status === 'over') {
      game.lives = 0
      game.collision = 'wall'
    }
    if (status === 'won') game.food = null
    const before = structuredClone(game)
    resumeGame(game)
    assert.deepEqual(game, before, status)
  }
})

test('snake: all four walls cost a life, and the last life ends without moving the snake', () => {
  const edges: { head: Point; direction: Direction }[] = [
    { head: { x: 0, y: 4 }, direction: 'left' },
    { head: { x: COLS - 1, y: 4 }, direction: 'right' },
    { head: { x: 4, y: 0 }, direction: 'up' },
    { head: { x: 4, y: ROWS - 1 }, direction: 'down' },
  ]
  for (const { head, direction } of edges) {
    for (const lives of [3, 2, 1]) {
      const game = runningGame()
      game.snake = [head]
      game.direction = direction
      game.lives = lives
      assert.equal(tick(game), lives === 1 ? 'over' : 'life-lost')
      assert.equal(game.status, lives === 1 ? 'over' : 'recovering')
      assert.equal(game.lives, lives - 1)
      assert.equal(game.collision, 'wall')
      assert.deepEqual(game.snake, lives === 1 ? [head] : createGame().snake)
      assert.equal(game.score, 0)
    }
  }
})

test('snake: colliding with a non-departing body segment ends the run on the last life', () => {
  const game = runningGame()
  game.lives = 1
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 2 }]
  const before = structuredClone(game.snake)
  assert.equal(tick(game), 'over')
  assert.equal(game.status, 'over')
  assert.equal(game.lives, 0)
  assert.equal(game.collision, 'body')
  assert.equal(game.snake.length, 5)
  assert.deepEqual(game.snake, before)
})

for (const collision of ['wall', 'body', 'obstacle'] as const satisfies readonly Collision[]) {
  test(`snake: ${collision} collisions recover twice, preserve score, then exhaust the third life`, () => {
    const game = runningGame()
    game.score = 75
    game.food!.remainingMs = 4_321
    const foodBefore = structuredClone(game.food)
    const obstaclesBefore = structuredClone(game.obstacles)
    for (let attempt = 1; attempt <= 3; attempt++) {
      game.snake = collision === 'wall'
        ? [{ x: 0, y: 4 }, { x: 0, y: 3 }, { x: 0, y: 2 }, { x: 0, y: 1 }]
        : collision === 'body'
          ? [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }, { x: 4, y: 2 }]
          : [{ x: 5, y: 6 }, { x: 5, y: 7 }, { x: 5, y: 8 }, { x: 5, y: 9 }]
      game.direction = collision === 'wall' ? 'down' : 'up'
      assert.equal(queueTurn(game, collision === 'wall' ? 'left' : 'right'), true)
      assert.equal(queueTurn(game, collision === 'wall' ? 'up' : 'down'), true)
      game.effect = { kind: 'speed', remainingMs: 2_345 }
      const snakeBefore = structuredClone(game.snake)
      assert.equal(tick(game, () => 0), attempt < 3 ? 'life-lost' : 'over')
      assert.equal(game.lives, 3 - attempt)
      assert.equal(game.collision, collision)
      assert.equal(game.status, attempt < 3 ? 'recovering' : 'over')
      assert.equal(game.score, 75)
      assert.equal(game.effect, null)
      assert.deepEqual(game.turns, [])
      assert.deepEqual(game.food, foodBefore)
      assert.deepEqual(game.obstacles, obstaclesBefore)
      if (attempt < 3) {
        assert.deepEqual(game.snake, createGame().snake)
        assert.equal(game.direction, 'right')
      } else {
        assert.deepEqual(game.snake, snakeBefore)
      }
      const stopped = structuredClone(game)
      assert.equal(tick(game), 'idle')
      assert.equal(queueTurn(game, 'up'), false)
      advanceTime(game, 20_000)
      assert.deepEqual(game, stopped)
      resumeGame(game)
      if (attempt < 3) {
        assert.deepEqual(game, { ...stopped, status: 'running', collision: null })
        assert.equal(tick(game), 'moved')
        assert.deepEqual(game.snake[0], { x: 9, y: 11 })
      } else {
        assert.deepEqual(game, stopped)
      }
    }
  })
}

test('snake: recovery relocates food that overlaps the reset snake and restores its full TTL', () => {
  const game = runningGame()
  game.snake = [{ x: 0, y: 4 }, { x: 1, y: 4 }, { x: 2, y: 4 }]
  game.direction = 'left'
  game.food = foodAt({ x: 8, y: 11 }, 'golden', 1)
  assert.equal(tick(game, () => 0), 'life-lost')
  assert.deepEqual(game.snake, createGame().snake)
  assert.deepEqual(game.food, foodAt({ x: 3, y: 3 }))
  assertFoodIsFree(game, game.food)
})

test('snake: entering the departing tail is legal, but not when eating growing food', () => {
  const game = runningGame()
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }]
  const before = structuredClone(game)
  assert.equal(tick(game), 'moved')
  assert.deepEqual(game.snake[0], { x: 3, y: 2 })
  assert.equal(game.snake.length, 4)
  for (const kind of ['apple', 'golden', 'speed', 'slow'] as const) {
    const eatingGame = structuredClone(before)
    eatingGame.lives = 1
    eatingGame.food = foodAt({ x: 3, y: 2 }, kind)
    assert.equal(tick(eatingGame), 'over', kind)
    assert.equal(eatingGame.collision, 'body')
    assert.equal(eatingGame.score, 0)
    assert.equal(eatingGame.effect, null)
    assert.deepEqual(eatingGame.snake, before.snake)
  }
})

test('snake: shrink allows the departing tail but still collides with a remaining body segment', () => {
  const game = runningGame()
  game.snake = [{ x: 2, y: 2 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 3, y: 2 }]
  game.food = foodAt({ x: 3, y: 2 }, 'shrink')
  const bodyGame = structuredClone(game)
  bodyGame.snake.push({ x: 4, y: 2 })
  assert.equal(tick(game, () => 0), 'ate')
  assert.deepEqual(game.snake, [{ x: 3, y: 2 }, { x: 2, y: 2 }, { x: 2, y: 3 }])
  assert.equal(game.score, 25)
  assert.equal(tick(bodyGame), 'life-lost')
  assert.equal(bodyGame.collision, 'body')
  assert.equal(bodyGame.score, 0)
})

const foodCases: { kind: FoodKind; points: number; length: number }[] = [
  { kind: 'apple', points: 10, length: 5 },
  { kind: 'golden', points: 30, length: 5 },
  { kind: 'speed', points: 20, length: 5 },
  { kind: 'slow', points: 15, length: 5 },
  { kind: 'shrink', points: 25, length: 3 },
]
for (const { kind, points, length } of foodCases) {
  test(`snake: ${kind} awards ${points} points and applies its length and effect rules`, () => {
    const game = runningGame()
    const bodyBefore = structuredClone(game.snake)
    game.score = 7
    game.food = foodAt({ x: 9, y: 11 }, kind)
    assert.equal(tick(game, () => 0), 'ate')
    assert.equal(game.score, 7 + points)
    assert.deepEqual(game.snake, [{ x: 9, y: 11 }, ...bodyBefore].slice(0, length))
    assert.deepEqual(game.effect, kind === 'speed' || kind === 'slow'
      ? { kind, remainingMs: 6_000 } : null)
    assert.equal(game.lives, 3)
    assert.equal(game.status, 'running')
    assertFoodIsFree(game, game.food)
  })
}

test('snake: shrink removes exactly three cells without ever going below three', () => {
  for (const length of [3, 4, 5, 6, 7, 10]) {
    const game = runningGame()
    game.snake = Array.from({ length }, (_, index) => ({ x: 17 - index, y: 11 }))
    game.food = foodAt({ x: 18, y: 11 }, 'shrink')
    const expected = [{ x: 18, y: 11 }, ...game.snake].slice(0, Math.max(3, length - 3))
    assert.equal(tick(game, () => 0), 'ate')
    assert.deepEqual(game.snake, expected, `initial length ${length}`)
    assert.equal(game.score, 25)
  }
})

for (const previous of ['speed', 'slow'] as const) {
  for (const next of ['speed', 'slow'] as const) {
    test(`snake: ${next} replaces ${previous} without stacking and refreshes the six-second effect`, () => {
      const game = runningGame()
      game.effect = { kind: previous, remainingMs: 123 }
      game.food = foodAt({ x: 9, y: 11 }, next)
      assert.equal(tick(game, () => 0), 'ate')
      assert.deepEqual(game.effect, { kind: next, remainingMs: 6_000 })
      assert.equal(getMoveDelay(game, 'normal'), next === 'speed' ? 91 : 182)
      advanceTime(game, 5_999)
      assert.deepEqual(game.effect, { kind: next, remainingMs: 1 })
      advanceTime(game, 1)
      assert.equal(game.effect, null)
      assert.equal(getMoveDelay(game, 'normal'), 130)
    })
  }
}

test('snake: apple, golden and shrink do not clear or refresh an existing speed effect', () => {
  for (const effectKind of ['speed', 'slow'] as const) {
    for (const kind of ['apple', 'golden', 'shrink'] as const) {
      const game = runningGame()
      game.effect = { kind: effectKind, remainingMs: 1_234 }
      game.food = foodAt({ x: 9, y: 11 }, kind)
      assert.equal(tick(game, () => 0), 'ate')
      assert.deepEqual(game.effect, { kind: effectKind, remainingMs: 1_234 })
    }
  }
})

test('snake: movement delay uses the current difficulty and the single active multiplier', () => {
  const game = runningGame()
  const expected: [Level, number, number, number][] = [
    ['easy', 190, 133, 266], ['normal', 130, 91, 182], ['hard', 80, 56, 112],
  ]
  for (const [level, normal] of expected) assert.equal(getMoveDelay(game, level), normal)
  game.effect = { kind: 'speed', remainingMs: 1 }
  for (const [level, , speed] of expected) assert.equal(getMoveDelay(game, level), speed)
  game.effect = { kind: 'slow', remainingMs: 1 }
  for (const [level, , , slow] of expected) assert.equal(getMoveDelay(game, level), slow)
  advanceTime(game, 1)
  for (const [level, normal] of expected) assert.equal(getMoveDelay(game, level), normal)
})

test('snake: advanceTime independently expires effects at six seconds without moving or consuming turns', () => {
  const game = runningGame()
  game.effect = { kind: 'speed', remainingMs: 6_000 }
  assert.equal(queueTurn(game, 'up'), true)
  const before = structuredClone(game)
  const noSpawn = () => assert.fail('food must not respawn before its TTL')
  advanceTime(game, 0, noSpawn)
  assert.deepEqual(game, before)
  advanceTime(game, 5_999, noSpawn)
  assert.deepEqual(game, {
    ...before, effect: { kind: 'speed', remainingMs: 1 }, food: { ...before.food!, remainingMs: 4_001 },
  })
  advanceTime(game, 1, noSpawn)
  assert.deepEqual(game, { ...before, effect: null, food: { ...before.food!, remainingMs: 4_000 } })
})

test('snake: moving ticks alone do not spend food or effect TTL', () => {
  const game = runningGame()
  game.food!.remainingMs = 123
  game.effect = { kind: 'slow', remainingMs: 45 }
  for (let index = 0; index < 3; index++) assert.equal(tick(game), 'moved')
  assert.equal(game.food!.remainingMs, 123)
  assert.deepEqual(game.effect, { kind: 'slow', remainingMs: 45 })
})

test('snake: food expires at ten seconds and prefers a different free cell with a fresh kind and TTL', () => {
  const game = runningGame()
  game.food = foodAt({ x: 3, y: 3 })
  const before = structuredClone(game)
  advanceTime(game, 9_999, () => assert.fail('food expired too early'))
  assert.deepEqual(game, { ...before, food: foodAt({ x: 3, y: 3 }, 'apple', 1) })
  let calls = 0
  advanceTime(game, 1, () => calls++ === 0 ? 0 : 0.45)
  assert.equal(calls, 2)
  assert.deepEqual(game, { ...before, food: foodAt({ x: 4, y: 3 }, 'golden') })
  assertFoodIsFree(game, game.food)
})

test('snake: elapsed time beyond both TTLs clears the effect and refreshes expired food without moving', () => {
  const game = runningGame()
  game.effect = { kind: 'slow', remainingMs: 6_000 }
  const before = structuredClone(game)
  advanceTime(game, 10_001, () => 0)
  assert.deepEqual(game, { ...before, effect: null, food: foodAt({ x: 3, y: 3 }) })
})

test('snake: an absent food does not prevent the independent effect timer from expiring', () => {
  const game = runningGame()
  game.food = null
  game.effect = { kind: 'speed', remainingMs: 1 }
  const before = structuredClone(game)
  advanceTime(game, 1, () => assert.fail('no food is waiting to respawn'))
  assert.deepEqual(game, { ...before, effect: null })
})

test('snake: below 100 points food uniformly picks central free cells with a three-cell wall buffer', () => {
  assert.equal(FOOD_EDGE_UNLOCK_SCORE, 100)
  assert.equal(FOOD_SAFE_MARGIN, 3)
  const snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 12, y: 11 }]
  const obstacles = createGame().obstacles
  const available: Point[] = []
  for (let y = 3; y < ROWS - 3; y++) {
    for (let x = 3; x < COLS - 3; x++) {
      if (![...snake, ...obstacles].some(part => part.x === x && part.y === y)) available.push({ x, y })
    }
  }
  for (const score of [0, 10, 90, 99]) {
    const game = { snake, obstacles, score }
    for (const [index, point] of available.entries()) {
      assert.deepEqual(spawnFood(game, positionRandom((index + 0.5) / available.length)), foodAt(point))
    }
    assert.deepEqual(spawnFood(game, positionRandom(0)), foodAt(available[0]!))
    assert.deepEqual(spawnFood(game, positionRandom(0.999999)), foodAt(available.at(-1)!))
  }
})

test('snake: at 100 points and above food can reach every cell, including all walls and corners', () => {
  for (const score of [100, 110, 1000]) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        assert.deepEqual(
          spawnFood({ snake: [], obstacles: [], score }, positionRandom((y * COLS + x + 0.5) / (COLS * ROWS))),
          foodAt({ x, y }),
        )
      }
    }
  }
})

test('snake: unlocked spawning still excludes every snake and obstacle cell without mutating its input', () => {
  const game = runningGame()
  game.score = 100
  const before = structuredClone(game)
  const available = allCells().filter(point => ![...game.snake, ...game.obstacles].some(part => samePoint(part, point)))
  for (const [index, point] of available.entries()) {
    const food = spawnFood(game, positionRandom((index + 0.5) / available.length))
    assert.deepEqual(food, foodAt(point))
    assertFoodIsFree(game, food)
  }
  assert.deepEqual(game, before)
})

test('snake: spawnFood supports all five kinds with a fresh ten-second TTL', () => {
  const cases: [number, FoodKind][] = [[0, 'apple'], [0.45, 'golden'], [0.65, 'speed'], [0.75, 'slow'], [0.999999, 'shrink']]
  for (const [draw, kind] of cases) {
    let calls = 0
    const game = createGame()
    const food = spawnFood(game, () => calls++ === 0 ? 0 : draw)
    assert.equal(calls, 2)
    assert.deepEqual(food, foodAt({ x: 3, y: 3 }, kind))
    assertFoodIsFree(game, food)
  }
})

test('snake: food uses the score after eating and restarting restores central spawning', () => {
  for (const score of [80, 90, 100]) {
    const game = runningGame()
    game.score = score
    game.snake = Array.from({ length: 4 + score / 10 }, (_, index) => ({ x: 17 - index, y: 11 }))
    assert.equal(tick(game, () => 0), 'ate')
    assert.equal(game.score, score + 10)
    assert.deepEqual(game.food, foodAt(score < 90 ? { x: 3, y: 3 } : { x: 0, y: 0 }))
    startGame(game)
    assert.equal(game.score, 0)
    for (let i = 0; i < 9; i++) assert.equal(tick(game), 'moved')
    assert.equal(tick(game, () => 0), 'ate')
    assert.deepEqual(game.food, foodAt({ x: 3, y: 3 }))
  }
})

test('snake: every food kind unlocks edge spawning at exactly 100 points, not at 99', () => {
  for (const { kind, points } of foodCases) {
    for (const total of [99, 100]) {
      const game = runningGame()
      game.score = total - points
      game.food = foodAt({ x: 9, y: 11 }, kind)
      assert.equal(tick(game, () => 0), 'ate')
      assert.equal(game.score, total)
      assert.deepEqual(game.food, foodAt(total === 99 ? { x: 3, y: 3 } : { x: 0, y: 0 }))
    }
  }
})

test('snake: a full central area falls back to free edge cells even below 100 points', () => {
  const game = runningGame()
  game.snake = allCells().filter(point => isCentral(point) && !game.obstacles.some(part => samePoint(part, point)))
  const before = structuredClone(game)
  assert.deepEqual(spawnFood(game, positionRandom(0)), foodAt({ x: 0, y: 0 }))
  assert.deepEqual(spawnFood(game, positionRandom(0.999999)), foodAt({ x: COLS - 1, y: ROWS - 1 }))
  assert.deepEqual(game, before)
  game.food = foodAt({ x: 0, y: 0 }, 'apple', 1)
  advanceTime(game, 1, () => 0)
  assert.deepEqual(game.food, foodAt({ x: 1, y: 0 }))
  assert.equal(game.status, 'running')
})

test('snake: eating the last central free cell does not incorrectly win while edge cells remain', () => {
  const game = runningGame()
  const target = { x: 3, y: 3 }
  const head = { x: 4, y: 3 }
  // Synthetic occupancy isolates the central-to-full-board spawning fallback.
  game.snake = [head, ...allCells().filter(point => isCentral(point)
    && !samePoint(point, target) && !samePoint(point, head)
    && !game.obstacles.some(part => samePoint(part, point)))]
  game.direction = 'left'
  game.food = foodAt(target)
  assert.equal(tick(game, () => 0), 'ate')
  assert.equal(game.score, 10)
  assert.equal(game.status, 'running')
  assert.deepEqual(game.food, foodAt({ x: 0, y: 0 }))
  assertFoodIsFree(game, game.food)
})

test('snake: spawnFood avoids the previous cell when alternatives exist in either score range', () => {
  for (const score of [99, 100]) {
    const game = { snake: [], obstacles: [], score }
    const previous = score < 100 ? { x: 3, y: 3 } : { x: 0, y: 0 }
    const before = { ...previous }
    assert.deepEqual(spawnFood(game, () => 0, previous), foodAt({ x: previous.x + 1, y: previous.y }))
    assert.deepEqual(previous, before)
  }
})

test('snake: food spawning only picks unoccupied cells, including the final cell', () => {
  const snake = allCells()
  const score = (COLS * ROWS - 4) * 10
  assert.equal(spawnFood({ snake, obstacles: [], score }, () => assert.fail('full board must not draw random values')), null)
  const last = snake.pop()!
  const game = { snake, obstacles: [], score: score - 10 }
  assert.deepEqual(spawnFood(game, positionRandom(0)), foodAt(last))
  assert.deepEqual(spawnFood(game, positionRandom(0.999999)), foodAt(last))
  assert.deepEqual(spawnFood(game, () => 0, last), foodAt(last))
})

test('snake: expiring food reuses the only free cell rather than falsely declaring victory', () => {
  const game = runningGame()
  const last = { x: 0, y: 0 }
  game.snake = allCells().filter(point => !samePoint(point, last)
    && !game.obstacles.some(part => samePoint(part, point)))
  game.food = foodAt(last, 'slow', 1)
  advanceTime(game, 1, () => 0)
  assert.equal(game.status, 'running')
  assert.deepEqual(game.food, foodAt(last))
  assertFoodIsFree(game, game.food)
})

test('snake: eating the final free cell wins with a full board and no food', () => {
  const game = runningGame()
  // A continuous serpentine body on a synthetic obstacle-free board leaves only (0, 0).
  game.obstacles = []
  game.snake = []
  for (let y = 0; y < ROWS; y++) {
    for (let index = 0; index < COLS; index++) {
      const x = y % 2 === 0 ? index : COLS - 1 - index
      if (x !== 0 || y !== 0) game.snake.push({ x, y })
    }
  }
  game.direction = 'left'
  game.food = foodAt({ x: 0, y: 0 })
  game.score = (game.snake.length - 4) * 10
  assert.equal(tick(game), 'won')
  assert.equal(game.status, 'won')
  assert.equal(game.snake.length, COLS * ROWS)
  assert.equal(game.score, (COLS * ROWS - 4) * 10)
  assert.equal(game.food, null)
  assert.equal(tick(game), 'idle')
})

test('snake: fixed obstacles are excluded from the walkable area required to win', () => {
  const game = runningGame()
  const last = { x: 0, y: 0 }
  // Synthetic occupancy leaves exactly one walkable cell; none of the sixteen obstacles is part of the snake.
  game.snake = allCells().filter(point => !samePoint(point, last)
    && !game.obstacles.some(part => samePoint(part, point)))
  game.direction = 'left'
  game.food = foodAt(last)
  assert.deepEqual(game.snake[0], { x: 1, y: 0 })
  assert.equal(game.snake.length, COLS * ROWS - 16 - 1)
  assert.deepEqual(spawnFood(game, () => 0), foodAt(last))
  assert.equal(tick(game, () => assert.fail('full walkable area must not draw random values')), 'won')
  assert.equal(game.status, 'won')
  assert.equal(game.snake.length, COLS * ROWS - 16)
  assert.equal(game.score, 10)
  assert.equal(game.food, null)
  assert.equal(game.lives, 3)
  for (const score of [0, 100]) assert.equal(spawnFood({ ...game, score }), null)
})

test('snake: timed food replacement only declares victory when all walkable cells are occupied', () => {
  const game = runningGame()
  game.snake = allCells().filter(point => !game.obstacles.some(part => samePoint(part, point)))
  // Force the no-space timer branch with a synthetic, completely occupied walkable area.
  game.food = foodAt({ x: 0, y: 0 }, 'apple', 1)
  const before = structuredClone(game)
  advanceTime(game, 1, () => assert.fail('full walkable area must not draw random values'))
  assert.deepEqual(game, { ...before, food: null, status: 'won' })
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
  assert.deepEqual(parsePreferences('{"best":1e309,"level":"normal","sound":1}'), defaults)
  assert.deepEqual(parsePreferences(JSON.stringify({ best: Number.MAX_SAFE_INTEGER, level: 'normal', sound: true })),
    { best: Number.MAX_SAFE_INTEGER, level: 'normal', sound: true })
  assert.deepEqual(parsePreferences('{"best":15,"level":"invalid","sound":true}'), { best: 15, level: 'normal', sound: true })
})
