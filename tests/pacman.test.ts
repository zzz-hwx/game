import test from 'node:test'
import assert from 'node:assert/strict'
import { MAZE, PacmanGame, POWER_TICKS, TICK_MS } from '../src/games/pacman/engine.ts'
import type { Direction, GameStatus, Ghost } from '../src/games/pacman/engine.ts'

function cell(x: number, y: number) {
  return y * MAZE[0].length + x
}

function placePlayer(game: PacmanGame, x: number, y: number, direction: Direction) {
  game.player = cell(x, y)
  game.direction = direction
  game.queuedDirection = direction
}

function ghostAt(x: number, y: number, direction: Direction = 'left', cooldown = 0): Ghost {
  return { cell: cell(x, y), home: cell(8, 9), direction, cooldown }
}

function runningGame() {
  const game = new PacmanGame()
  game.start()
  game.ghosts = []
  // Keep one distant pellet so movement and collision fixtures do not win accidentally.
  game.pellets = new Set([cell(1, 17)])
  game.powerPellets = new Set()
  game.totalPellets = 1
  game.invulnerableTicks = 0
  return game
}

test('pacman: maze rows have equal width and walls match the map', () => {
  const game = new PacmanGame()
  assert.equal(game.width, 19)
  assert.equal(game.height, 21)
  for (const row of MAZE) {
    assert.equal(row.length, game.width)
    assert.match(row, /^[#.o P123]+$/)
  }
  assert.equal(game.tiles.length, game.width * game.height)
  assert.equal(game.tiles.filter(tile => tile === 'P').length, 1)
  assert.equal(game.spawn, cell(9, 13))
  game.tiles.forEach((tile, index) => {
    assert.equal(game.walls.has(index), tile === '#')
  })
})

test('pacman: every pellet and legal ghost home is reachable from the player spawn', () => {
  const game = new PacmanGame()
  const reachable = new Set([game.spawn])
  const queue = [game.spawn]
  // Traverse the map independently of engine.neighbor to check the maze itself.
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % game.width
    const y = Math.floor(queue[i] / game.width)
    for (const [dx, dy] of [[0, -1], [-1, 0], [0, 1], [1, 0]]) {
      let nx = x + dx
      const ny = y + dy
      if (ny < 0 || ny >= game.height) continue
      if (nx < 0 || nx >= game.width) {
        if (ny !== 9) continue
        nx = (nx + game.width) % game.width
      }
      const next = cell(nx, ny)
      if (MAZE[ny][nx] === '#' || reachable.has(next)) continue
      reachable.add(next)
      queue.push(next)
    }
  }
  for (const pellet of [...game.pellets, ...game.powerPellets]) {
    assert.ok(reachable.has(pellet), `unreachable pellet at ${pellet % game.width},${Math.floor(pellet / game.width)}`)
  }
  assert.equal(game.ghosts.length, 3)
  assert.equal(new Set(game.ghosts.map(ghost => ghost.home)).size, 3)
  game.ghosts.forEach((ghost, index) => {
    assert.equal(game.tiles[ghost.home], String(index + 1))
    assert.equal(ghost.cell, ghost.home)
    assert.notEqual(ghost.cell, game.spawn)
    assert.ok(!game.walls.has(ghost.cell))
    assert.ok(reachable.has(ghost.home), `unreachable ghost home ${ghost.home}`)
  })
})

test('pacman: initial state includes all pellets, three lives and protected actors', () => {
  const game = new PacmanGame()
  assert.equal(game.status, 'ready')
  assert.equal(game.player, game.spawn)
  assert.equal(game.direction, 'left')
  assert.equal(game.queuedDirection, 'left')
  assert.equal(game.score, 0)
  assert.equal(game.level, 1)
  assert.equal(game.lives, 3)
  assert.equal(game.ticks, 0)
  assert.equal(game.powerTicks, 0)
  assert.equal(game.combo, 0)
  assert.equal(game.invulnerableTicks, 14)
  assert.equal(TICK_MS, 150)
  assert.equal(game.interval, TICK_MS)
  assert.equal(POWER_TICKS, 40)
  assert.deepEqual(game.pellets, new Set(game.tiles.flatMap((tile, index) => tile === '.' ? [index] : [])))
  assert.deepEqual(game.powerPellets, new Set([cell(1, 1), cell(17, 1), cell(1, 19), cell(17, 19)]))
  assert.equal(game.totalPellets, game.pellets.size + game.powerPellets.size)
  assert.equal(game.remaining, game.totalPellets)
  assert.ok(game.totalPellets > 0)
  assert.deepEqual(game.ghosts, [
    { cell: cell(8, 9), home: cell(8, 9), direction: 'up', cooldown: 5 },
    { cell: cell(9, 9), home: cell(9, 9), direction: 'up', cooldown: 10 },
    { cell: cell(10, 9), home: cell(10, 9), direction: 'up', cooldown: 15 },
  ])
})

test('pacman: start and pause preserve the run and resume without resetting timers', () => {
  const game = runningGame()
  placePlayer(game, 1, 1, 'up')
  game.score = 90
  game.powerTicks = 10
  game.invulnerableTicks = 7
  game.ghosts = [ghostAt(8, 9, 'up', 8)]
  game.tick()
  assert.equal(game.ticks, 1)
  assert.equal(game.powerTicks, 9)
  assert.equal(game.invulnerableTicks, 6)
  assert.equal(game.ghosts[0].cooldown, 7)
  game.pause()
  assert.equal(game.status, 'paused')
  const paused = structuredClone(game)
  game.tick()
  game.pause()
  assert.deepEqual(structuredClone(game), paused)
  game.start()
  assert.deepEqual(structuredClone(game), { ...paused, status: 'playing' })
  game.start()
  game.tick()
  assert.equal(game.ticks, 2)
  assert.equal(game.powerTicks, 8)
  assert.equal(game.invulnerableTicks, 5)
  assert.equal(game.ghosts[0].cooldown, 6)
  assert.equal(game.score, 90)
})

test('pacman: non-playing states freeze ticks and only resumable states can start', () => {
  const statuses: GameStatus[] = ['ready', 'paused', 'life-lost', 'won', 'over']
  for (const status of statuses) {
    const game = new PacmanGame()
    game.status = status
    game.powerTicks = 12
    game.combo = 2
    const before = structuredClone(game)
    game.tick()
    game.pause()
    assert.deepEqual(structuredClone(game), before, status)
    game.start()
    assert.deepEqual(structuredClone(game), {
      ...before, status: ['ready', 'paused', 'life-lost'].includes(status) ? 'playing' : status,
    })
  }
})

test('pacman: steering is accepted while ready or playing but ignored in other states', () => {
  const statuses: GameStatus[] = ['ready', 'playing', 'paused', 'life-lost', 'won', 'over']
  for (const status of statuses) {
    const game = new PacmanGame()
    game.status = status
    game.steer('up')
    assert.equal(game.queuedDirection, status === 'ready' || status === 'playing' ? 'up' : 'left')
    assert.equal(game.direction, 'left')
  }
})

test('pacman: movement advances one tile and walls stop movement without costing a life', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'left')
  game.tick()
  assert.equal(game.player, cell(1, 1))
  game.tick()
  assert.equal(game.player, cell(1, 1))
  game.steer('up')
  game.tick()
  assert.equal(game.player, cell(1, 1))
  assert.equal(game.direction, 'left')
  assert.equal(game.queuedDirection, 'up')
  assert.equal(game.lives, 3)
  assert.equal(game.status, 'playing')
  game.steer('right')
  game.tick()
  assert.equal(game.player, cell(2, 1))
  assert.equal(game.direction, 'right')
})

test('pacman: an early turn remains queued until the first legal intersection', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.steer('down')
  game.tick()
  assert.equal(game.player, cell(3, 1))
  assert.equal(game.direction, 'right')
  assert.equal(game.queuedDirection, 'down')
  game.tick()
  assert.equal(game.player, cell(4, 1))
  assert.equal(game.direction, 'right')
  game.tick()
  assert.equal(game.player, cell(4, 2))
  assert.equal(game.direction, 'down')
})

test('pacman: the row-nine tunnel wraps both ways and other boundaries do not wrap', () => {
  const game = runningGame()
  placePlayer(game, 0, 9, 'left')
  assert.equal(game.neighbor(game.player, 'left'), cell(18, 9))
  game.tick()
  assert.equal(game.player, cell(18, 9))
  game.steer('right')
  game.tick()
  assert.equal(game.player, cell(0, 9))
  assert.equal(game.neighbor(cell(0, 8), 'left'), null)
  assert.equal(game.neighbor(cell(18, 8), 'right'), null)
  assert.equal(game.neighbor(cell(1, 0), 'up'), null)
  assert.equal(game.neighbor(cell(1, 20), 'down'), null)
})

test('pacman: ordinary pellets award ten points only once, even when revisited', () => {
  const game = runningGame()
  const pellet = cell(3, 1)
  game.pellets.add(pellet)
  game.totalPellets = 2
  placePlayer(game, 2, 1, 'right')
  game.tick()
  assert.equal(game.score, 10)
  assert.equal(game.remaining, 1)
  assert.equal(game.totalPellets, 2)
  assert.ok(!game.pellets.has(pellet))
  game.steer('left')
  game.tick()
  game.steer('right')
  game.tick()
  assert.equal(game.player, pellet)
  assert.equal(game.score, 10)
  assert.equal(game.remaining, 1)
})

test('pacman: power pellets award fifty once, refresh power, reset combos and reverse ghosts', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'left')
  game.powerPellets.add(cell(1, 1))
  game.totalPellets = 2
  game.powerTicks = 5
  game.combo = 3
  game.ghosts = [ghostAt(6, 3, 'right', 10), ghostAt(8, 9, 'up', 10)]
  game.tick()
  assert.equal(game.score, 50)
  assert.equal(game.powerTicks, POWER_TICKS)
  assert.equal(game.combo, 0)
  assert.equal(game.powerPellets.size, 0)
  assert.equal(game.remaining, 1)
  assert.deepEqual(game.ghosts.map(ghost => ghost.direction), ['left', 'down'])
  game.steer('right')
  game.tick()
  game.steer('left')
  game.tick()
  assert.equal(game.score, 50)
  assert.equal(game.powerTicks, POWER_TICKS - 2)
})

test('pacman: power expires after exactly forty playing ticks and never goes negative', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'left')
  game.powerPellets.add(cell(1, 1))
  game.tick()
  assert.equal(game.powerTicks, POWER_TICKS)
  game.steer('up')
  for (let elapsed = 1; elapsed <= POWER_TICKS; elapsed++) {
    game.tick()
    assert.equal(game.powerTicks, POWER_TICKS - elapsed)
  }
  game.tick()
  assert.equal(game.powerTicks, 0)
  assert.equal(game.player, cell(1, 1))
})

for (const powered of [false, true]) {
  test(`pacman: ghosts move every ${powered ? 'three powered' : 'two ordinary'} ticks`, () => {
    const game = runningGame()
    placePlayer(game, 1, 1, 'up')
    game.powerTicks = powered ? POWER_TICKS : 0
    const ghost = ghostAt(5, 1, 'right')
    game.ghosts = [ghost]
    const period = powered ? 3 : 2
    for (let elapsed = 1; elapsed <= period * 2; elapsed++) {
      game.tick()
      assert.equal(ghost.cell, cell(5 + Math.floor(elapsed / period), 1))
    }
  })
}

test('pacman: blue ghost combos award 200, 400, 800 and capped 1600 points', () => {
  const game = runningGame()
  game.powerTicks = POWER_TICKS
  let expectedScore = 0
  for (const [index, points] of [200, 400, 800, 1600, 1600].entries()) {
    placePlayer(game, 2, 1, 'right')
    const ghost = ghostAt(3, 1)
    game.ghosts = [ghost]
    game.tick()
    expectedScore += points
    assert.equal(game.score, expectedScore)
    assert.equal(game.combo, index + 1)
    assert.equal(ghost.cell, ghost.home)
    assert.equal(ghost.cooldown, 24)
    assert.equal(game.lives, 3)
    assert.equal(game.status, 'playing')
  }
})

test('pacman: multiple active blue ghosts on one tile each count, but cooling ghosts do not', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.powerTicks = 10
  const cooling = ghostAt(3, 1, 'left', 5)
  game.ghosts = [ghostAt(3, 1), ghostAt(3, 1), cooling]
  game.tick()
  assert.equal(game.score, 600)
  assert.equal(game.combo, 2)
  assert.equal(cooling.cell, cell(3, 1))
  assert.equal(cooling.cooldown, 4)
})

test('pacman: eating a power pellet protects against a ghost on that same tile immediately', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'left')
  game.powerPellets.add(cell(1, 1))
  game.ghosts = [ghostAt(1, 1)]
  game.tick()
  assert.equal(game.score, 250)
  assert.equal(game.powerTicks, POWER_TICKS)
  assert.equal(game.combo, 1)
  assert.equal(game.lives, 3)
  assert.equal(game.ghosts[0].cooldown, 24)
})

test('pacman: power expiring at tick start makes a same-tick collision lethal', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.powerTicks = 1
  game.ghosts = [ghostAt(3, 1)]
  game.tick()
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
  assert.equal(game.score, 0)
  assert.equal(game.powerTicks, 0)
})

test('pacman: entering a ghost tile collides before the ghost movement phase', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.ghosts = [ghostAt(3, 1)]
  game.tick()
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
  assert.equal(game.player, game.spawn)
})

test('pacman: opposite moves cannot let the player and a ghost swap positions unharmed', () => {
  const game = runningGame()
  placePlayer(game, 3, 1, 'right')
  const ghost = ghostAt(4, 1, 'left')
  game.ghosts = [ghost]
  game.ticks = 1
  assert.equal(game.neighbor(ghost.cell, ghost.direction), game.player)
  game.tick()
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
  assert.equal(ghost.cell, cell(4, 1))
})

test('pacman: a ghost moving onto the player collides after ghost movement', () => {
  const game = runningGame()
  placePlayer(game, 1, 1, 'up')
  const ghost = ghostAt(2, 1, 'left')
  game.ghosts = [ghost]
  game.ticks = 1
  game.tick()
  assert.equal(ghost.cell, cell(1, 1))
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
})

test('pacman: blue ghosts are also eaten in the post-movement collision phase', () => {
  const game = runningGame()
  placePlayer(game, 1, 1, 'up')
  const ghost = ghostAt(2, 1, 'left')
  game.ghosts = [ghost]
  game.ticks = 2
  game.powerTicks = 10
  game.tick()
  assert.equal(game.score, 200)
  assert.equal(game.combo, 1)
  assert.equal(ghost.cell, ghost.home)
  assert.equal(ghost.cooldown, 24)
  assert.equal(game.status, 'playing')
  assert.equal(game.lives, 3)
})

test('pacman: ghost cooldown blocks movement and collisions until its tick countdown reaches zero', () => {
  const game = runningGame()
  placePlayer(game, 1, 1, 'up')
  const ghost = ghostAt(1, 1, 'right', 2)
  game.ghosts = [ghost]
  game.ticks = 1
  game.tick()
  assert.equal(ghost.cooldown, 1)
  assert.equal(ghost.cell, cell(1, 1))
  assert.equal(game.lives, 3)
  assert.equal(game.status, 'playing')
  game.tick()
  assert.equal(ghost.cooldown, 0)
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
})

test('pacman: losing a life resets actors but preserves score, level and consumed pellets', () => {
  const game = runningGame()
  const fresh = new PacmanGame()
  const eaten = cell(3, 1)
  game.score = 120
  game.level = 3
  game.combo = 2
  game.pellets.add(eaten)
  game.powerPellets.add(cell(1, 19))
  game.totalPellets = 3
  placePlayer(game, 2, 1, 'right')
  game.ghosts = [ghostAt(3, 1), ghostAt(3, 1)]
  game.tick()
  assert.equal(game.status, 'life-lost')
  assert.equal(game.lives, 2)
  assert.equal(game.score, 130)
  assert.equal(game.level, 3)
  assert.deepEqual(game.pellets, new Set([cell(1, 17)]))
  assert.deepEqual(game.powerPellets, new Set([cell(1, 19)]))
  assert.equal(game.totalPellets, 3)
  assert.equal(game.remaining, 2)
  assert.equal(game.player, game.spawn)
  assert.equal(game.direction, 'left')
  assert.equal(game.queuedDirection, 'left')
  assert.equal(game.ticks, 0)
  assert.equal(game.powerTicks, 0)
  assert.equal(game.combo, 0)
  assert.equal(game.invulnerableTicks, 14)
  assert.deepEqual(game.ghosts, fresh.ghosts)
  const before = structuredClone(game)
  game.tick()
  assert.deepEqual(structuredClone(game), before)
  game.start()
  assert.deepEqual(structuredClone(game), { ...before, status: 'playing' })
})

test('pacman: respawn protection prevents damage until the countdown becomes zero', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.ghosts = [ghostAt(3, 1)]
  game.tick()
  assert.equal(game.invulnerableTicks, 14)
  game.start()
  placePlayer(game, 1, 1, 'up')
  const ghost = ghostAt(1, 1)
  game.ghosts = [ghost]
  for (let elapsed = 1; elapsed < 14; elapsed++) {
    ghost.cell = game.player
    game.tick()
    assert.equal(game.invulnerableTicks, 14 - elapsed)
    assert.equal(game.lives, 2)
    assert.equal(game.status, 'playing')
    assert.equal(game.score, 0)
  }
  ghost.cell = game.player
  game.tick()
  assert.equal(game.lives, 1)
  assert.equal(game.status, 'life-lost')
  assert.equal(game.invulnerableTicks, 14)
})

test('pacman: losing the last life ends the game and restart restores a fresh run', () => {
  const game = runningGame()
  placePlayer(game, 2, 1, 'right')
  game.score = 900
  game.level = 5
  game.lives = 1
  game.ghosts = [ghostAt(3, 1)]
  game.tick()
  assert.equal(game.status, 'over')
  assert.equal(game.lives, 0)
  assert.equal(game.score, 900)
  const before = structuredClone(game)
  game.start()
  game.tick()
  assert.deepEqual(structuredClone(game), before)
  game.restart()
  assert.deepEqual(game, new PacmanGame())
})

for (const powered of [false, true]) {
  test(`pacman: the final ${powered ? 'power pellet' : 'pellet'} wins and awards the 500-point bonus only once`, () => {
    const game = runningGame()
    placePlayer(game, 2, 1, 'left')
    game.score = 70
    game.pellets = new Set(powered ? [] : [cell(1, 1)])
    game.powerPellets = new Set(powered ? [cell(1, 1)] : [])
    game.tick()
    assert.equal(game.remaining, 0)
    assert.equal(game.status, 'won')
    assert.equal(game.score, 70 + (powered ? 50 : 10) + 500)
    assert.equal(game.lives, 3)
    const before = structuredClone(game)
    game.tick()
    game.tick()
    game.start()
    assert.deepEqual(structuredClone(game), before)
  })
}

test('pacman: the next level preserves score and lives, refills the maze and increases speed', () => {
  const game = runningGame()
  const fresh = new PacmanGame()
  placePlayer(game, 2, 1, 'right')
  game.score = 100
  game.lives = 2
  game.pellets = new Set([cell(3, 1)])
  game.powerTicks = 9
  game.combo = 2
  game.tick()
  assert.equal(game.status, 'won')
  assert.equal(game.score, 610)
  const previousInterval = game.interval
  game.nextLevel()
  assert.equal(game.status, 'playing')
  assert.equal(game.level, 2)
  assert.equal(game.score, 610)
  assert.equal(game.lives, 2)
  assert.equal(game.interval, previousInterval - 10)
  assert.deepEqual(game.pellets, fresh.pellets)
  assert.deepEqual(game.powerPellets, fresh.powerPellets)
  assert.equal(game.remaining, fresh.totalPellets)
  assert.equal(game.totalPellets, fresh.totalPellets)
  assert.equal(game.player, game.spawn)
  assert.equal(game.direction, 'left')
  assert.equal(game.queuedDirection, 'left')
  assert.equal(game.ticks, 0)
  assert.equal(game.powerTicks, 0)
  assert.equal(game.combo, 0)
  assert.equal(game.invulnerableTicks, 14)
  assert.deepEqual(game.ghosts, fresh.ghosts)
})

test('pacman: nextLevel is ignored unless won and speed never drops below 105 milliseconds', () => {
  const statuses: GameStatus[] = ['ready', 'playing', 'paused', 'life-lost', 'over']
  for (const status of statuses) {
    const game = new PacmanGame()
    game.status = status
    const before = structuredClone(game)
    game.nextLevel()
    assert.deepEqual(structuredClone(game), before)
  }
  const game = new PacmanGame()
  for (const [index, interval] of [150, 140, 130, 120, 110, 105, 105].entries()) {
    assert.equal(game.level, index + 1)
    assert.equal(game.interval, interval)
    game.status = 'won'
    game.nextLevel()
  }
  game.level = 100
  assert.equal(game.interval, 105)
})
