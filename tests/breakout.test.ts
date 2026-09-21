import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BALL_RADIUS, BreakoutGame, HEIGHT, MAX_LEVELS, PADDLE_HEIGHT, PADDLE_WIDTH, PADDLE_Y, WIDTH,
} from '../src/games/breakout/engine.ts'
import type { Brick } from '../src/games/breakout/engine.ts'

const interval = 1 / 240
const plane = PADDLE_Y - BALL_RADIUS

function close(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`)
}

function speed(game: BreakoutGame): number {
  return Math.hypot(game.ball.vx, game.ball.vy)
}

function runningGame(): BreakoutGame {
  const game = new BreakoutGame()
  game.start()
  return game
}

function brickGame(hp = 2): { game: BreakoutGame; brick: Brick } {
  const game = runningGame()
  const brick: Brick = { id: 0, x: 200, y: 160, width: 47, height: 20, hp, maxHp: hp, row: 0 }
  game.bricks = [brick, { ...brick, id: 1, x: 400, y: 62, hp: 1, maxHp: 1 }]
  return { game, brick }
}

function hitTop(game: BreakoutGame, brick: Brick, velocity = 300): void {
  Object.assign(game.ball, { x: brick.x + brick.width / 2, y: brick.y - BALL_RADIUS - 0.5, vx: 0, vy: velocity })
  game.step(interval)
}

function dropBall(game: BreakoutGame): void {
  Object.assign(game.ball, { x: 10, y: HEIGHT + BALL_RADIUS - 0.1, vx: 0, vy: 480 })
  game.step(0.05, 1)
}

test('breakout: exports the agreed board and paddle dimensions', () => {
  assert.deepEqual(
    [WIDTH, HEIGHT, BALL_RADIUS, PADDLE_WIDTH, PADDLE_HEIGHT, PADDLE_Y, MAX_LEVELS],
    [480, 560, 7, 96, 12, 514, 3],
  )
})

test('breakout: starts ready with three lives, a docked ball and forty single-layer bricks', () => {
  const game = new BreakoutGame()
  assert.equal(game.status, 'ready')
  assert.equal(game.score, 0)
  assert.equal(game.lives, 3)
  assert.equal(game.level, 1)
  assert.equal(game.paddleX, WIDTH / 2)
  assert.deepEqual(game.ball, { x: WIDTH / 2, y: plane, vx: 0, vy: 0 })
  assert.equal(game.total, 40)
  assert.equal(game.remaining, 40)
  assert.ok(game.bricks.every(brick => brick.hp === 1 && brick.maxHp === 1))
})

test('breakout: levels have five, six and seven eight-column rows and stronger upper rows', () => {
  const game = new BreakoutGame()
  for (let level = 1; level <= MAX_LEVELS; level++) {
    assert.equal(game.level, level)
    assert.equal(game.total, (level + 4) * 8)
    assert.equal(new Set(game.bricks.map(brick => brick.id)).size, game.total)
    for (let row = 0; row < level + 4; row++) {
      const bricks = game.bricks.filter(brick => brick.row === row)
      assert.equal(bricks.length, 8)
      assert.equal(bricks[0].x, 24)
      assert.equal(bricks[7].x + bricks[7].width, 456)
      for (let column = 0; column < bricks.length; column++) {
        const brick = bricks[column]
        assert.equal(brick.y, 62 + row * 28)
        assert.equal(brick.height, 20)
        assert.equal(brick.hp, level > 1 && row < level ? 2 : 1)
        assert.equal(brick.maxHp, brick.hp)
        if (column > 0) assert.equal(brick.x - bricks[column - 1].x - bricks[column - 1].width, 8)
      }
    }
    game.start()
    close(speed(game), 300 + (level - 1) * 40)
    assert.ok(game.ball.vy < 0)
    game.status = 'won'
    game.nextLevel()
  }
})

test('breakout: remaining counts live bricks while total retains destroyed bricks', () => {
  const game = new BreakoutGame()
  game.bricks[0].hp = 0
  game.bricks[1].hp = 0
  assert.equal(game.remaining, 38)
  assert.equal(game.total, 40)
})

test('breakout: waiting paddle uses center coordinates, clamps to walls and carries the ball', () => {
  for (const status of ['ready', 'life-lost'] as const) {
    const game = new BreakoutGame()
    game.status = status
    for (const [input, expected] of [[-100, 48], [1000, 432], [173, 173]]) {
      game.movePaddle(input)
      assert.equal(game.paddleX, expected)
      assert.deepEqual(game.ball, { x: expected, y: plane, vx: 0, vy: 0 })
    }
    const before = structuredClone(game)
    for (const input of [NaN, Infinity, -Infinity]) game.movePaddle(input)
    assert.deepEqual(structuredClone(game), before)
  }
})

test('breakout: moving a playing paddle does not teleport the ball', () => {
  const game = runningGame()
  const before = { ...game.ball }
  game.movePaddle(-100)
  assert.equal(game.paddleX, PADDLE_WIDTH / 2)
  assert.deepEqual(game.ball, before)
  game.movePaddle(WIDTH + 100)
  assert.equal(game.paddleX, WIDTH - PADDLE_WIDTH / 2)
  assert.deepEqual(game.ball, before)
})

test('breakout: keyboard paddle speed is 420 in ready, playing and life-lost states', () => {
  for (const status of ['ready', 'playing', 'life-lost'] as const) {
    const game = new BreakoutGame()
    game.status = status
    if (status === 'playing') Object.assign(game.ball, { y: 350, vx: 0, vy: -300 })
    game.step(0.02, 1)
    close(game.paddleX, WIDTH / 2 + 8.4)
    game.step(0.02, -1)
    close(game.paddleX, WIDTH / 2)
    if (status === 'playing') close(game.ball.y, 338)
    else assert.deepEqual(game.ball, { x: game.paddleX, y: plane, vx: 0, vy: 0 })
    game.movePaddle(PADDLE_WIDTH / 2)
    game.step(0.05, -1)
    assert.equal(game.paddleX, PADDLE_WIDTH / 2)
    game.movePaddle(WIDTH - PADDLE_WIDTH / 2)
    game.step(0.05, 1)
    assert.equal(game.paddleX, WIDTH - PADDLE_WIDTH / 2)
  }
})

test('breakout: start serves only ready and life-lost games, and does not reset a running ball', () => {
  for (const status of ['ready', 'life-lost'] as const) {
    const game = new BreakoutGame()
    game.status = status
    game.movePaddle(150)
    game.start()
    assert.equal(game.status, 'playing')
    assert.equal(game.ball.x, 150)
    close(speed(game), 300)
    assert.ok(game.ball.vy < 0)
    game.step(0.01)
    const before = structuredClone(game)
    game.start()
    assert.deepEqual(structuredClone(game), before)
  }
  for (const status of ['won', 'over'] as const) {
    const game = new BreakoutGame()
    game.status = status
    const before = structuredClone(game)
    game.start()
    assert.deepEqual(structuredClone(game), before)
  }
})

test('breakout: paused, won and over games freeze all pointer and keyboard movement', () => {
  for (const status of ['paused', 'won', 'over'] as const) {
    const game = runningGame()
    game.status = status
    const before = structuredClone(game)
    game.movePaddle(100)
    game.step(0.05, 1)
    game.step(0.05, -1)
    game.pause()
    assert.deepEqual(structuredClone(game), before)
  }
})

test('breakout: pause resumes the exact saved position and velocity', () => {
  const game = runningGame()
  Object.assign(game.ball, { x: 220, y: 350, vx: 123, vy: -234 })
  const ball = { ...game.ball }
  game.pause()
  assert.equal(game.status, 'paused')
  game.step(1, 1)
  game.start()
  assert.equal(game.status, 'playing')
  assert.deepEqual(game.ball, ball)
  game.step(0.02)
  close(game.ball.x, ball.x + ball.vx * 0.02)
  close(game.ball.y, ball.y + ball.vy * 0.02)
  assert.equal(game.ball.vx, ball.vx)
  assert.equal(game.ball.vy, ball.vy)
})

test('breakout: pause is a no-op outside playing', () => {
  for (const status of ['ready', 'life-lost', 'paused', 'won', 'over'] as const) {
    const game = new BreakoutGame()
    game.status = status
    const before = structuredClone(game)
    game.pause()
    assert.deepEqual(structuredClone(game), before)
  }
})

test('breakout: invalid time is ignored and frame time is clamped to fifty milliseconds', () => {
  for (const status of ['ready', 'playing', 'life-lost'] as const) {
    const game = new BreakoutGame()
    game.status = status
    if (status === 'playing') Object.assign(game.ball, { x: 240, y: 350, vx: 100, vy: 200 })
    const before = structuredClone(game)
    for (const dt of [0, -1, NaN, Infinity, -Infinity]) game.step(dt, 1)
    assert.deepEqual(structuredClone(game), before)
    game.step(10, 1)
    close(game.paddleX, 261)
    if (status === 'playing') {
      close(game.ball.x, 245)
      close(game.ball.y, 360)
    } else {
      close(game.ball.x, 261)
      assert.equal(game.ball.y, plane)
    }
  }
})

test('breakout: a fifty-millisecond frame matches twelve 1/240-second substeps', () => {
  const frame = runningGame()
  const substeps = runningGame()
  for (const game of [frame, substeps]) Object.assign(game.ball, { x: BALL_RADIUS + 1, y: 350, vx: -480, vy: 0 })
  frame.step(0.05, 1)
  for (let index = 0; index < 12; index++) substeps.step(interval, 1)
  assert.deepEqual(frame, substeps)
})

test('breakout: left, right and top walls reflect approaching balls without changing speed', () => {
  const cases = [
    { x: BALL_RADIUS + 0.5, y: 350, vx: -300, vy: 0, expectedX: 300, expectedY: 0 },
    { x: WIDTH - BALL_RADIUS - 0.5, y: 350, vx: 300, vy: 0, expectedX: -300, expectedY: 0 },
    { x: 240, y: BALL_RADIUS + 0.5, vx: 0, vy: -300, expectedX: 0, expectedY: 300 },
  ]
  for (const { expectedX, expectedY, ...ball } of cases) {
    const game = runningGame()
    Object.assign(game.ball, ball)
    game.step(interval)
    assert.equal(game.ball.vx, expectedX)
    assert.equal(game.ball.vy, expectedY)
    assert.ok(game.ball.x >= BALL_RADIUS && game.ball.x <= WIDTH - BALL_RADIUS)
    assert.ok(game.ball.y >= BALL_RADIUS)
    assert.equal(game.score, 0)
    close(speed(game), 300)
  }
})

test('breakout: wall overlap is separated without reversing an outgoing ball', () => {
  const game = runningGame()
  Object.assign(game.ball, { x: BALL_RADIUS - 1, y: 350, vx: 100, vy: 0 })
  game.step(interval)
  assert.equal(game.ball.x, BALL_RADIUS)
  assert.equal(game.ball.vx, 100)
  Object.assign(game.ball, { x: 240, y: BALL_RADIUS - 1, vx: 0, vy: 100 })
  game.step(interval)
  assert.equal(game.ball.y, BALL_RADIUS)
  assert.equal(game.ball.vy, 100)
})

test('breakout: each brick face reflects its normal and awards exactly one ten-point hit', () => {
  for (const face of ['top', 'bottom', 'left', 'right'] as const) {
    const { game, brick } = brickGame()
    const ball = { x: brick.x + brick.width / 2, y: brick.y + brick.height / 2, vx: 0, vy: 0 }
    if (face === 'top') Object.assign(ball, { y: brick.y - BALL_RADIUS - 0.5, vy: 300 })
    if (face === 'bottom') Object.assign(ball, { y: brick.y + brick.height + BALL_RADIUS + 0.5, vy: -300 })
    if (face === 'left') Object.assign(ball, { x: brick.x - BALL_RADIUS - 0.5, vx: 300 })
    if (face === 'right') Object.assign(ball, { x: brick.x + brick.width + BALL_RADIUS + 0.5, vx: -300 })
    Object.assign(game.ball, ball)
    game.step(interval)
    close(game.ball.vx, -ball.vx * 305 / 300)
    close(game.ball.vy, -ball.vy * 305 / 300)
    assert.equal(brick.hp, 1)
    assert.equal(brick.maxHp, 2)
    assert.equal(game.score, 10)
    assert.equal(game.remaining, 2)
  }
})

test('breakout: expanded rectangular corner regions outside the circle do not cause false hits', () => {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const { game, brick } = brickGame()
      const cornerX = brick.x + (sx > 0 ? brick.width : 0)
      const cornerY = brick.y + (sy > 0 ? brick.height : 0)
      Object.assign(game.ball, { x: cornerX + sx * 6, y: cornerY + sy * 6, vx: -sx * 60, vy: -sy * 60 })
      game.step(interval)
      assert.equal(brick.hp, 2)
      assert.equal(game.score, 0)
      assert.equal(game.ball.vx, -sx * 60)
      assert.equal(game.ball.vy, -sy * 60)
    }
  }
})

test('breakout: all four true circle-corner contacts reflect and separate along the corner normal', () => {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const { game, brick } = brickGame()
      const cornerX = brick.x + (sx > 0 ? brick.width : 0)
      const cornerY = brick.y + (sy > 0 ? brick.height : 0)
      Object.assign(game.ball, { x: cornerX + sx * 6, y: cornerY + sy * 6, vx: -sx * 240, vy: -sy * 240 })
      game.step(interval * 2)
      assert.equal(brick.hp, 1)
      assert.equal(game.score, 10)
      assert.equal(Math.sign(game.ball.vx), sx)
      assert.equal(Math.sign(game.ball.vy), sy)
      assert.ok(Math.hypot(game.ball.x - cornerX, game.ball.y - cornerY) >= BALL_RADIUS)
      game.step(interval)
      assert.equal(brick.hp, 1)
      assert.equal(game.score, 10)
    }
  }
})

test('breakout: oblique corner impacts use vector reflection rather than axis reversal', () => {
  const { game, brick } = brickGame()
  Object.assign(game.ball, { x: brick.x - 4.14 - 300 * interval, y: brick.y - 5.52, vx: 300, vy: 0 })
  game.step(interval)
  close(game.ball.vx, 84 * 305 / 300)
  close(game.ball.vy, -288 * 305 / 300)
  assert.equal(brick.hp, 1)
  assert.equal(game.score, 10)
})

test('breakout: a two-layer brick takes separate incoming hits and dead bricks stop colliding', () => {
  const { game, brick } = brickGame()
  hitTop(game, brick)
  assert.equal(brick.hp, 1)
  assert.equal(game.remaining, 2)
  assert.equal(game.score, 10)
  game.step(0.02)
  assert.equal(brick.hp, 1)
  assert.equal(game.score, 10)
  hitTop(game, brick)
  assert.equal(brick.hp, 0)
  assert.equal(brick.maxHp, 2)
  assert.equal(game.remaining, 1)
  assert.equal(game.total, 2)
  assert.equal(game.score, 20)
  Object.assign(game.ball, { x: brick.x + brick.width / 2, y: brick.y - BALL_RADIUS - 0.5, vx: 0, vy: 300 })
  game.step(0.05)
  assert.ok(game.ball.y > brick.y)
  assert.equal(game.ball.vy, 300)
  assert.equal(game.score, 20)
  assert.equal(brick.hp, 0)
})

test('breakout: separating brick overlaps do not reverse velocity or remove another layer', () => {
  const { game, brick } = brickGame()
  Object.assign(game.ball, { x: brick.x - BALL_RADIUS + 1, y: brick.y + 10, vx: -300, vy: 0 })
  game.step(0.001)
  assert.equal(game.ball.vx, -300)
  assert.ok(game.ball.x <= brick.x - BALL_RADIUS)
  assert.equal(brick.hp, 2)
  assert.equal(game.score, 0)
})

test('breakout: a ball centered inside a brick separates without a zero-length normal', () => {
  const { game, brick } = brickGame()
  Object.assign(game.ball, { x: brick.x + brick.width / 2, y: brick.y + 0.1, vx: 0, vy: 300 })
  game.step(0.001)
  assert.ok(Number.isFinite(game.ball.x) && Number.isFinite(game.ball.y))
  assert.ok(game.ball.y <= brick.y - BALL_RADIUS)
  assert.ok(game.ball.vy < 0)
  assert.equal(brick.hp, 1)
})

test('breakout: high-speed vertical and horizontal shots cannot tunnel through bricks', () => {
  for (const velocity of [480, 1200]) {
    for (const horizontal of [false, true]) {
      const { game, brick } = brickGame()
      Object.assign(game.ball, horizontal
        ? { x: brick.x - BALL_RADIUS - 3, y: brick.y + 10, vx: velocity, vy: 0 }
        : { x: brick.x + brick.width / 2, y: brick.y - BALL_RADIUS - 3, vx: 0, vy: velocity })
      game.step(0.05)
      assert.equal(brick.hp, 1)
      assert.equal(game.score, 10)
      if (horizontal) {
        assert.ok(game.ball.vx < 0)
        assert.ok(game.ball.x < brick.x)
      } else {
        assert.ok(game.ball.vy < 0)
        assert.ok(game.ball.y < brick.y)
      }
      close(speed(game), 480)
    }
  }
})

test('breakout: brick hits accelerate gradually but never beyond 480', () => {
  const { game, brick } = brickGame(100)
  let velocity = 300
  for (let hit = 1; hit <= 40; hit++) {
    hitTop(game, brick, velocity)
    close(speed(game), Math.min(480, 300 + hit * 5))
    velocity = speed(game)
  }
  assert.equal(brick.hp, 60)
  assert.equal(game.score, 400)
})

test('breakout: center and edge paddle hits launch upward at no more than sixty degrees', () => {
  for (const offset of [-1, -0.85, 0, 0.85, 1]) {
    const game = runningGame()
    Object.assign(game.ball, { x: game.paddleX + offset * PADDLE_WIDTH / 2, y: plane - 1, vx: 0, vy: 400 })
    game.step(0.01)
    assert.ok(game.ball.vy < 0)
    assert.ok(game.ball.y < plane)
    close(speed(game), 400)
    const angle = Math.atan2(Math.abs(game.ball.vx), -game.ball.vy)
    assert.ok(angle <= Math.PI / 3 + 1e-10)
    assert.ok(-game.ball.vy >= speed(game) * 0.5 - 1e-8)
    if (offset === 0) assert.ok(Math.abs(game.ball.vx) > 0 && Math.abs(game.ball.vx) < 40)
    else assert.equal(Math.sign(game.ball.vx), Math.sign(offset))
    const velocity = { vx: game.ball.vx, vy: game.ball.vy }
    game.step(0.005)
    assert.equal(game.ball.vx, velocity.vx)
    assert.equal(game.ball.vy, velocity.vy)
    assert.equal(game.score, 0)
  }
})

test('breakout: paddle range is evaluated at the top-plane crossing, not the frame endpoint', () => {
  const miss = runningGame()
  Object.assign(miss.ball, { x: miss.paddleX + PADDLE_WIDTH / 2 + 1, y: plane - 0.1, vx: -480, vy: 120 })
  miss.step(interval)
  assert.ok(miss.ball.x < miss.paddleX + PADDLE_WIDTH / 2)
  assert.equal(miss.ball.vy, 120)
  const hit = runningGame()
  Object.assign(hit.ball, { x: hit.paddleX + PADDLE_WIDTH / 2 - 0.6, y: plane - 0.1, vx: 480, vy: 120 })
  hit.step(interval)
  assert.ok(hit.ball.x > hit.paddleX + PADDLE_WIDTH / 2)
  assert.ok(hit.ball.vy < 0)
})

test('breakout: high-speed paddle crossings bounce instead of passing through', () => {
  const game = runningGame()
  Object.assign(game.ball, { x: game.paddleX, y: plane - 1, vx: 0, vy: 480 })
  game.step(0.05)
  assert.ok(game.ball.vy < 0)
  assert.ok(game.ball.y < plane)
  assert.equal(game.lives, 3)
})

test('breakout: the paddle never rescues downward balls already below its top plane', () => {
  for (const y of [plane + 0.1, PADDLE_Y + 1, PADDLE_Y + PADDLE_HEIGHT + BALL_RADIUS]) {
    const game = runningGame()
    Object.assign(game.ball, { x: game.paddleX, y, vx: 0, vy: 300 })
    game.movePaddle(game.ball.x)
    game.step(0.02)
    assert.equal(game.ball.vy, 300)
    assert.ok(game.ball.y > y)
  }
})

test('breakout: upward balls below the paddle are not reflected from its underside', () => {
  const game = runningGame()
  Object.assign(game.ball, { x: game.paddleX, y: PADDLE_Y + PADDLE_HEIGHT + 1, vx: 0, vy: -300 })
  game.step(0.05)
  game.step(0.03)
  assert.equal(game.ball.vy, -300)
  assert.ok(game.ball.y < plane)
  assert.equal(game.lives, 3)
})

test('breakout: a ball missing the paddle remains downward and loses a life', () => {
  const game = runningGame()
  Object.assign(game.ball, { x: game.paddleX + PADDLE_WIDTH / 2 + BALL_RADIUS + 1, y: plane - 1, vx: 0, vy: 480 })
  for (let frame = 0; frame < 4; frame++) game.step(0.05)
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
})

test('breakout: losing a life retains score and brick damage and docks the ball only once', () => {
  const { game, brick } = brickGame()
  hitTop(game, brick)
  const bricks = game.bricks
  const savedBricks = structuredClone(bricks)
  game.movePaddle(180)
  dropBall(game)
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
  assert.equal(game.level, 1)
  assert.equal(game.score, 10)
  assert.equal(game.bricks, bricks)
  assert.deepEqual(game.bricks, savedBricks)
  assert.deepEqual(game.ball, { x: game.paddleX, y: plane, vx: 0, vy: 0 })
  const paddleX = game.paddleX
  game.step(0.05, -1)
  close(game.paddleX, paddleX - 21)
  assert.equal(game.ball.x, game.paddleX)
  assert.equal(game.lives, 2)
  game.start()
  assert.equal(game.status, 'playing')
  close(speed(game), 300)
  assert.equal(game.score, 10)
  assert.deepEqual(game.bricks, savedBricks)
})

test('breakout: the final lost life ends the game and cannot be served or deducted twice', () => {
  const game = runningGame()
  game.score = 70
  game.bricks[0].hp = 0
  const bricks = structuredClone(game.bricks)
  for (let lives = 2; lives >= 0; lives--) {
    dropBall(game)
    assert.equal(game.lives, lives)
    assert.equal(game.status, lives > 0 ? 'life-lost' : 'over')
    assert.equal(game.score, 70)
    assert.deepEqual(game.bricks, bricks)
    if (lives > 0) game.start()
  }
  const before = structuredClone(game)
  game.start()
  game.step(10, 1)
  game.nextLevel()
  assert.deepEqual(structuredClone(game), before)
})

test('breakout: restart fully resets every state, level, score, life, brick and ball', () => {
  for (const status of ['ready', 'playing', 'paused', 'life-lost', 'won', 'over'] as const) {
    const game = new BreakoutGame()
    game.status = status
    game.score = 1230
    game.level = 3
    game.lives = 1
    game.paddleX = 100
    Object.assign(game.ball, { x: 20, y: 350, vx: -200, vy: 250 })
    game.bricks[0].hp = 0
    const oldBricks = game.bricks
    game.restart()
    assert.deepEqual(game, new BreakoutGame())
    assert.notEqual(game.bricks, oldBricks)
  }
})

test('breakout: nextLevel is protected outside won and after the final level', () => {
  for (const status of ['ready', 'playing', 'paused', 'life-lost', 'over'] as const) {
    const game = new BreakoutGame()
    game.status = status
    game.score = 50
    game.lives = 2
    const before = structuredClone(game)
    game.nextLevel()
    assert.deepEqual(structuredClone(game), before)
  }
  const game = new BreakoutGame()
  game.status = 'won'
  game.level = MAX_LEVELS
  const before = structuredClone(game)
  game.nextLevel()
  assert.deepEqual(structuredClone(game), before)
})

test('breakout: all three real boards clear with hit points plus one bonus, preserving lives and score between levels', () => {
  const game = new BreakoutGame()
  game.lives = 2
  let expectedScore = 0
  for (let level = 1; level <= MAX_LEVELS; level++) {
    assert.equal(game.status, 'ready')
    assert.equal(game.level, level)
    assert.equal(game.lives, 2)
    assert.equal(game.score, expectedScore)
    assert.equal(game.paddleX, WIDTH / 2)
    assert.deepEqual(game.ball, { x: WIDTH / 2, y: plane, vx: 0, vy: 0 })
    const hitPoints = game.bricks.reduce((sum, brick) => sum + brick.hp, 0)
    const bricks = game.bricks
    const total = game.total
    game.start()
    close(speed(game), 300 + (level - 1) * 40)
    game.movePaddle(100)
    for (const brick of game.bricks) {
      const hits = brick.hp
      for (let hit = 0; hit < hits; hit++) hitTop(game, brick)
      assert.equal(brick.hp, 0)
    }
    expectedScore += hitPoints * 10 + 100
    assert.equal(game.score, expectedScore)
    assert.equal(game.status, 'won')
    assert.equal(game.remaining, 0)
    assert.equal(game.total, total)
    assert.equal(game.bricks, bricks)
    assert.equal(game.lives, 2)
    const won = structuredClone(game)
    game.step(0.05, 1)
    game.start()
    assert.deepEqual(structuredClone(game), won)
    game.nextLevel()
    if (level < MAX_LEVELS) {
      assert.notEqual(game.bricks, bricks)
      const ready = structuredClone(game)
      game.nextLevel()
      assert.deepEqual(structuredClone(game), ready)
    } else {
      assert.deepEqual(structuredClone(game), won)
    }
  }
  assert.equal(game.level, MAX_LEVELS)
  assert.equal(game.status, 'won')
  assert.equal(game.score, 2140)
})
