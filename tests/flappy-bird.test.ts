import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BIRD_RADIUS, BIRD_X, FLAP_VELOCITY, FlappyBirdGame, GRAVITY, GROUND_Y, HEIGHT,
  PIPE_GAP, PIPE_SPACING, PIPE_SPEED, PIPE_WIDTH, WIDTH,
} from '../src/games/flappy-bird/engine.ts'
import type { Pipe } from '../src/games/flappy-bird/engine.ts'

const interval = 1 / 240
const center = GROUND_Y / 2
const constantRandom = () => 0.5

function close(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`)
}

function snapshot(game: FlappyBirdGame) {
  return structuredClone({
    status: game.status, score: game.score, elapsed: game.elapsed,
    distance: game.distance, bird: game.bird, pipes: game.pipes,
  })
}

function runningGame(random = constantRandom): FlappyBirdGame {
  const game = new FlappyBirdGame(random)
  game.flap()
  return game
}

function pipeAt(x: number, gapY = center): Pipe {
  return { id: 100, x, gapY, passed: false }
}

function seededRandom(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

function validPipes(game: FlappyBirdGame): void {
  assert.equal(game.pipes.length, 3)
  assert.equal(new Set(game.pipes.map(pipe => pipe.id)).size, 3)
  for (let index = 0; index < game.pipes.length; index++) {
    const pipe = game.pipes[index]
    assert.ok(pipe.gapY - PIPE_GAP / 2 >= 65)
    assert.ok(GROUND_Y - pipe.gapY - PIPE_GAP / 2 >= 65)
    if (index > 0) {
      close(pipe.x - game.pipes[index - 1].x, PIPE_SPACING)
      assert.ok(Math.abs(pipe.gapY - game.pipes[index - 1].gapY) <= 90 + 1e-8)
    }
  }
}

test('flappy-bird: exports the agreed dimensions and physics constants', () => {
  assert.deepEqual(
    [WIDTH, HEIGHT, GROUND_Y, BIRD_X, BIRD_RADIUS, PIPE_WIDTH, PIPE_GAP,
      PIPE_SPACING, PIPE_SPEED, GRAVITY, FLAP_VELOCITY],
    [420, 560, 508, 112, 13, 64, 158, 225, 145, 1150, -350],
  )
})

test('flappy-bird: starts ready with a centered bird and three valid unpassed pipes', () => {
  const game = new FlappyBirdGame()
  assert.equal(game.status, 'ready')
  assert.equal(game.score, 0)
  assert.equal(game.elapsed, 0)
  assert.equal(game.distance, 0)
  assert.deepEqual(game.bird, { y: center, vy: 0 })
  assert.deepEqual(game.pipes.map(pipe => pipe.x), [WIDTH + 55, WIDTH + 55 + PIPE_SPACING, WIDTH + 55 + 2 * PIPE_SPACING])
  assert.ok(game.pipes.every(pipe => !pipe.passed))
  validPipes(game)
})

test('flappy-bird: flap starts ready games without resetting their position or counters', () => {
  const game = new FlappyBirdGame(constantRandom)
  const pipes = structuredClone(game.pipes)
  game.flap()
  assert.equal(game.status, 'playing')
  assert.deepEqual(game.bird, { y: center, vy: FLAP_VELOCITY })
  assert.equal(game.elapsed, 0)
  assert.equal(game.distance, 0)
  assert.equal(game.score, 0)
  assert.deepEqual(game.pipes, pipes)
})

test('flappy-bird: gravity accelerates the bird and pipes scroll at constant speed', () => {
  const game = runningGame()
  const positions = game.pipes.map(pipe => pipe.x)
  game.step(0.05)
  close(game.bird.vy, FLAP_VELOCITY + GRAVITY * 0.05)
  close(game.bird.y, center + FLAP_VELOCITY * 0.05 + GRAVITY * 0.05 ** 2 / 2)
  close(game.elapsed, 0.05)
  close(game.distance, PIPE_SPEED * 0.05)
  game.pipes.forEach((pipe, index) => close(pipe.x, positions[index] - PIPE_SPEED * 0.05))
  for (let frame = 0; frame < 7; frame++) game.step(0.05)
  assert.equal(game.status, 'playing')
  assert.ok(game.bird.vy > 0)
  const y = game.bird.y
  game.step(0.05)
  assert.ok(game.bird.y > y)
})

test('flappy-bird: repeat flaps replace velocity rather than stacking impulses', () => {
  const game = runningGame()
  for (let frame = 0; frame < 8; frame++) game.step(0.05)
  assert.ok(game.bird.vy > 0)
  const before = snapshot(game)
  game.flap()
  assert.deepEqual(snapshot(game), { ...before, bird: { ...before.bird, vy: FLAP_VELOCITY } })
  game.flap()
  assert.equal(game.bird.vy, FLAP_VELOCITY)
  const y = game.bird.y
  game.step(0.05)
  assert.ok(game.bird.y < y)
  game.flap()
  assert.equal(game.bird.vy, FLAP_VELOCITY)
})

test('flappy-bird: ready, paused and over states freeze time, scrolling and physics', () => {
  for (const status of ['ready', 'paused', 'over'] as const) {
    const game = runningGame()
    game.status = status
    const before = snapshot(game)
    for (const dt of [interval, 0.05, 10]) game.step(dt)
    assert.deepEqual(snapshot(game), before)
    if (status !== 'ready') {
      game.flap()
      assert.deepEqual(snapshot(game), before)
    }
  }
})

test('flappy-bird: pause freezes all state and resume retains saved velocity', () => {
  const game = runningGame()
  game.step(0.05)
  const playing = snapshot(game)
  game.pause()
  assert.equal(game.status, 'paused')
  const paused = snapshot(game)
  game.step(1)
  game.flap()
  game.pause()
  assert.deepEqual(snapshot(game), paused)
  game.resume()
  assert.deepEqual(snapshot(game), playing)
  game.step(0.02)
  close(game.bird.y, playing.bird.y + playing.bird.vy * 0.02 + GRAVITY * 0.02 ** 2 / 2)
  close(game.bird.vy, playing.bird.vy + GRAVITY * 0.02)
  close(game.elapsed, playing.elapsed + 0.02)
})

test('flappy-bird: pause and resume ignore states outside their transitions', () => {
  for (const status of ['ready', 'playing', 'paused', 'over'] as const) {
    const game = runningGame()
    game.status = status
    const before = snapshot(game)
    if (status !== 'playing') game.pause()
    if (status !== 'paused') game.resume()
    assert.deepEqual(snapshot(game), before)
  }
})

test('flappy-bird: touching or crossing the ceiling and ground ends play', () => {
  for (const y of [BIRD_RADIUS, BIRD_RADIUS - 1, GROUND_Y - BIRD_RADIUS, GROUND_Y - BIRD_RADIUS + 1]) {
    const game = runningGame()
    game.bird = { y, vy: y < center ? 100 : -100 }
    game.step(interval)
    assert.equal(game.status, 'over')
    assert.equal(game.score, 0)
  }
  for (const ground of [false, true]) {
    const game = runningGame()
    game.bird = { y: ground ? GROUND_Y - BIRD_RADIUS - 1 : BIRD_RADIUS + 1, vy: ground ? 500 : -500 }
    game.step(0.05)
    assert.equal(game.status, 'over')
    assert.ok(game.elapsed <= interval + 1e-8)
    assert.ok(ground ? game.bird.y + BIRD_RADIUS >= GROUND_Y : game.bird.y - BIRD_RADIUS <= 0)
    const dead = snapshot(game)
    game.step(0.05)
    game.flap()
    game.pause()
    game.resume()
    assert.deepEqual(snapshot(game), dead)
  }
})

test('flappy-bird: upper and lower pipe bodies collide including gap face contact', () => {
  const top = center - PIPE_GAP / 2
  const bottom = center + PIPE_GAP / 2
  for (const y of [top - 10, top + BIRD_RADIUS, bottom - BIRD_RADIUS, bottom + 10]) {
    const game = runningGame()
    game.pipes = [pipeAt(BIRD_X - PIPE_WIDTH / 2)]
    game.bird = { y, vy: 0 }
    game.step(interval)
    assert.equal(game.status, 'over')
  }
})

test('flappy-bird: both horizontal pipe faces count exact contact as collision', () => {
  for (const x of [BIRD_X + BIRD_RADIUS, BIRD_X - BIRD_RADIUS - PIPE_WIDTH]) {
    const game = runningGame()
    game.pipes = [pipeAt(x)]
    game.bird = { y: center - PIPE_GAP / 2 - 20, vy: 0 }
    game.step(interval)
    assert.equal(game.status, 'over')
  }
})

test('flappy-bird: safe gap passages survive and score after the whole bird clears', () => {
  const game = runningGame()
  const pipe = pipeAt(BIRD_X + BIRD_RADIUS + 2)
  game.pipes = [pipe]
  for (let frame = 0; frame < 20; frame++) {
    game.bird = { y: center, vy: 0 }
    game.step(0.05)
    assert.equal(game.status, 'playing')
    assert.equal(game.score, pipe.x + PIPE_WIDTH < BIRD_X - BIRD_RADIUS ? 1 : 0)
  }
  assert.equal(game.score, 1)
  assert.equal(pipe.passed, true)
})

test('flappy-bird: pipe collision width has no protruding decorative lip', () => {
  for (const x of [BIRD_X + BIRD_RADIUS + 1, BIRD_X - BIRD_RADIUS - PIPE_WIDTH - 1]) {
    const game = runningGame()
    game.pipes = [pipeAt(x)]
    game.bird = { y: center - PIPE_GAP / 2 + 1, vy: 0 }
    game.step(0.001)
    assert.equal(game.status, 'playing')
  }
})

test('flappy-bird: all four circle corners distinguish safe grazing, overlap and tangency', () => {
  for (const horizontal of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      for (const [dx, dy, expected] of [[10, 10, 'playing'], [8, 8, 'over'], [5, 12, 'over']] as const) {
        const game = runningGame()
        const x = horizontal > 0 ? BIRD_X + dx : BIRD_X - dx - PIPE_WIDTH
        const gapY = center + vertical * (PIPE_GAP / 2 - dy)
        game.pipes = [pipeAt(x, gapY)]
        game.bird = { y: center, vy: 0 }
        game.step(0.001)
        assert.equal(game.status, expected, `corner ${horizontal}, ${vertical}, offset ${dx}, ${dy}`)
      }
    }
  }
})

test('flappy-bird: substeps catch a pipe corner hit even when the frame endpoint is safe', () => {
  const game = runningGame()
  // The trailing corner moves away while a falling bird clips it mid-frame.
  const pipe = pipeAt(BIRD_X - 10 - PIPE_WIDTH, center)
  game.pipes = [pipe]
  game.bird = { y: center + PIPE_GAP / 2 - 9, vy: 500 }
  assert.ok(Math.hypot(10, 9) > BIRD_RADIUS)
  assert.ok(10 + PIPE_SPEED * 0.05 > BIRD_RADIUS)
  game.step(0.05)
  assert.equal(game.status, 'over')
  assert.ok(game.elapsed < 0.05)
  assert.equal(game.score, 0)
  assert.equal(pipe.passed, false)
})

test('flappy-bird: scoring is strict at the left bird edge and awarded only once', () => {
  const game = runningGame()
  const pipe = pipeAt(BIRD_X - BIRD_RADIUS - PIPE_WIDTH + PIPE_SPEED * interval)
  game.pipes = [pipe]
  game.bird.vy = 0
  game.step(interval)
  assert.equal(pipe.x + PIPE_WIDTH, BIRD_X - BIRD_RADIUS)
  assert.equal(game.score, 0)
  assert.equal(pipe.passed, false)
  game.step(interval)
  assert.equal(game.score, 1)
  assert.equal(pipe.passed, true)
  for (let frame = 0; frame < 5; frame++) game.step(0.05)
  assert.equal(game.score, 1)
})

test('flappy-bird: passed pipes never award additional points', () => {
  const game = runningGame()
  const pipe = pipeAt(BIRD_X - BIRD_RADIUS - PIPE_WIDTH - 1)
  pipe.passed = true
  game.pipes = [pipe]
  game.score = 7
  game.step(0.05)
  assert.equal(game.status, 'playing')
  assert.equal(game.score, 7)
})

test('flappy-bird: fatal frames never score, even for passes before a later fatal substep', () => {
  for (const death of ['ceiling', 'ground', 'pipe'] as const) {
    const game = runningGame()
    const passed = pipeAt(BIRD_X - BIRD_RADIUS - PIPE_WIDTH + 0.1)
    game.pipes = [passed]
    game.score = 4
    if (death === 'ceiling') game.bird = { y: BIRD_RADIUS + 10, vy: -500 }
    if (death === 'ground') game.bird = { y: GROUND_Y - BIRD_RADIUS - 10, vy: 500 }
    if (death !== 'pipe') passed.gapY = game.bird.y
    if (death === 'pipe') {
      game.bird = { y: center, vy: 0 }
      game.pipes.push({ id: 101, x: BIRD_X + BIRD_RADIUS + 4, gapY: center + 100, passed: false })
    }
    game.step(0.05)
    assert.equal(game.status, 'over')
    assert.ok(game.elapsed > interval)
    assert.ok(passed.x + PIPE_WIDTH < BIRD_X - BIRD_RADIUS)
    assert.equal(game.score, 4)
    assert.equal(passed.passed, false)
  }
})

test('flappy-bird: offscreen pipes are recycled with fresh IDs and valid spaced gaps', () => {
  let calls = 0
  const game = runningGame(() => calls++ % 2)
  assert.equal(calls, 3)
  const seen = new Set(game.pipes.map(pipe => pipe.id))
  for (let cycle = 0; cycle < 100; cycle++) {
    const old = game.pipes[0]
    const last = game.pipes[2]
    const shift = old.x + PIPE_WIDTH - 0.1
    for (const pipe of game.pipes) pipe.x -= shift
    old.passed = true
    const lastX = last.x
    game.bird = { y: center, vy: 0 }
    game.step(interval)
    assert.equal(game.status, 'playing')
    assert.ok(!game.pipes.includes(old))
    const added = game.pipes[2]
    assert.ok(!seen.has(added.id))
    seen.add(added.id)
    assert.equal(added.passed, false)
    close(added.x, lastX - PIPE_SPEED * interval + PIPE_SPACING)
    validPipes(game)
    assert.equal(game.score, 0)
  }
  assert.equal(calls, 103)
})

test('flappy-bird: an exactly on-screen pipe is retained until its right edge leaves', () => {
  const game = runningGame()
  const pipe = game.pipes[0]
  pipe.x = -PIPE_WIDTH + PIPE_SPEED * interval
  pipe.passed = true
  game.step(interval)
  close(pipe.x + PIPE_WIDTH, 0)
  assert.ok(game.pipes.includes(pipe))
  game.step(interval)
  assert.ok(!game.pipes.includes(pipe))
  assert.equal(game.pipes.length, 3)
})

test('flappy-bird: first gap spans the legal range and every adjacent change stays within ninety', () => {
  for (const value of [0, 1]) {
    const game = new FlappyBirdGame(() => value)
    close(game.pipes[0].gapY, value === 0 ? 65 + PIPE_GAP / 2 : GROUND_Y - 65 - PIPE_GAP / 2)
    validPipes(game)
  }
  let index = 0
  const game = new FlappyBirdGame(() => index++ % 2)
  validPipes(game)
  close(game.pipes[1].gapY - game.pipes[0].gapY, 90)
})

test('flappy-bird: restart resets all public state from every status and regenerates pipes', () => {
  for (const status of ['ready', 'playing', 'paused', 'over'] as const) {
    let calls = 0
    const game = new FlappyBirdGame(() => { calls++; return 0.5 })
    game.status = status
    game.score = 19
    game.elapsed = 24
    game.distance = 3480
    game.bird = { y: 70, vy: -123 }
    game.pipes[0].passed = true
    game.pipes[0].x = -10
    const oldPipes = game.pipes
    game.restart()
    assert.deepEqual(snapshot(game), snapshot(new FlappyBirdGame(constantRandom)))
    assert.notEqual(game.pipes, oldPipes)
    assert.equal(calls, 6)
    game.flap()
    game.step(interval)
    assert.equal(game.status, 'playing')
  }
})

test('flappy-bird: invalid dt leaves every status untouched', () => {
  for (const status of ['ready', 'playing', 'paused', 'over'] as const) {
    const game = runningGame()
    game.status = status
    const before = snapshot(game)
    for (const dt of [0, -0.01, NaN, Infinity, -Infinity]) game.step(dt)
    assert.deepEqual(snapshot(game), before)
  }
})

test('flappy-bird: large finite frames clamp to fifty milliseconds and twelve substeps', () => {
  const clamped = runningGame()
  const frame = runningGame()
  const substeps = runningGame()
  clamped.step(Number.MAX_VALUE)
  frame.step(0.05)
  for (let index = 0; index < 12; index++) substeps.step(interval)
  assert.deepEqual(snapshot(clamped), snapshot(frame))
  assert.deepEqual(snapshot(frame), snapshot(substeps))
  close(clamped.elapsed, 0.05)
})

test('flappy-bird: equal seeds reproduce generations, actions and restarts', () => {
  const first = runningGame(seededRandom(12345))
  const second = runningGame(seededRandom(12345))
  const different = runningGame(seededRandom(54321))
  assert.notDeepEqual(first.pipes.map(pipe => pipe.gapY), different.pipes.map(pipe => pipe.gapY))
  for (let frame = 0; frame < 120; frame++) {
    for (const game of [first, second]) {
      if (frame % 30 === 0) {
        const shift = game.pipes[0].x + PIPE_WIDTH + 1
        for (const pipe of game.pipes) pipe.x -= shift
        game.pipes[0].passed = true
      }
      const upcoming = game.pipes.find(pipe => pipe.x + PIPE_WIDTH >= BIRD_X - BIRD_RADIUS)
      game.bird = { y: upcoming?.gapY ?? center, vy: 0 }
      if (frame % 11 === 0) game.flap()
      game.step(1 / 60)
    }
    assert.deepEqual(snapshot(first), snapshot(second))
    assert.equal(first.status, 'playing')
  }
  first.restart()
  second.restart()
  assert.deepEqual(snapshot(first), snapshot(second))
})

test('flappy-bird: physics and scrolling are approximately frame-rate independent', () => {
  const games = [30, 60, 144].map(fps => {
    const game = runningGame()
    for (let frame = 0; frame < fps * 2; frame++) {
      if (frame % (fps / 2) === 0) game.flap()
      game.step(1 / fps)
    }
    assert.equal(game.status, 'playing')
    close(game.elapsed, 2)
    close(game.distance, PIPE_SPEED * 2)
    return game
  })
  for (const game of games.slice(1)) {
    close(game.bird.y, games[0].bird.y, 0.02)
    close(game.bird.vy, games[0].bird.vy, 0.02)
    game.pipes.forEach((pipe, index) => close(pipe.x, games[0].pipes[index].x, 0.02))
    assert.equal(game.score, games[0].score)
  }
})
