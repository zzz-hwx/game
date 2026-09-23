import test from 'node:test'
import assert from 'node:assert/strict'
import { MAZES, PacmanGame, POWER_TICKS, TICK_MS } from '../src/games/pacman/engine.ts'
import type { Direction, GameStatus, Ghost } from '../src/games/pacman/engine.ts'

const firstMap = MAZES[0].map
const vectors: [Direction, number, number][] = [['up', 0, -1], ['left', -1, 0], ['down', 0, 1], ['right', 1, 0]]

function cell(x: number, y: number) {
  return y * firstMap[0].length + x
}

function cellsWith(map: readonly string[], symbol: string) {
  return new Set([...map.join('')].flatMap((tile, index) => tile === symbol ? [index] : []))
}

// Deliberately independent of engine.neighbor: a broken engine must not validate its own maps.
function mapSteps(map: readonly string[], from: number): { direction: Direction; cell: number }[] {
  const width = map[0].length
  return vectors.flatMap(([direction, dx, dy]) => {
    let x = from % width + dx
    const y = Math.floor(from / width) + dy
    if (y < 0 || y >= map.length) return []
    if (x < 0 || x >= width) {
      if (y !== 9) return []
      x = (x + width) % width
    }
    return map[y][x] === '#' ? [] : [{ direction, cell: y * width + x }]
  })
}

function gameAtMaze(index: number) {
  const game = new PacmanGame()
  for (let i = 0; i < index; i++) {
    game.status = 'won'
    game.nextLevel()
  }
  return game
}

function assertLoadedMaze(game: PacmanGame, index: number) {
  const maze = MAZES[index]
  const tiles = [...maze.map.join('')]
  assert.equal(game.mazeIndex, index)
  assert.equal(game.maze, maze)
  assert.equal(game.width, 19)
  assert.equal(game.height, 21)
  assert.deepEqual(game.tiles, tiles)
  assert.deepEqual(game.walls, cellsWith(maze.map, '#'))
  assert.deepEqual(game.pellets, cellsWith(maze.map, '.'))
  assert.deepEqual(game.powerPellets, cellsWith(maze.map, 'o'))
  assert.equal(game.spawn, tiles.indexOf('P'))
  assert.equal(game.player, game.spawn)
  assert.equal(game.totalPellets, game.pellets.size + game.powerPellets.size)
  assert.equal(game.remaining, game.totalPellets)
  assert.deepEqual(game.ghosts, tiles.flatMap((tile, home) => /[123]/.test(tile)
    ? [{ cell: home, home, direction: 'up', cooldown: Number(tile) * 5 }] : []))
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

test('pacman: eight named, distinct wall layouts retain the original first maze', () => {
  assert.equal(MAZES.length, 8)
  assert.ok(MAZES.every(maze => maze.name.trim().length > 0))
  assert.equal(new Set(MAZES.map(maze => maze.name)).size, 8)
  assert.equal(new Set(MAZES.map(maze => maze.map.join('').replace(/[^#]/g, ' '))).size, 8)
  assert.deepEqual(firstMap, [
    '###################',
    '#o.......#.......o#',
    '#.##.###.#.###.##.#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.###.#.###.####',
    '#....#.......#....#',
    '#.##.#.## ##.#.##.#',
    '.......#123#.......',
    '#.##.#.#   #.#.##.#',
    '#....#.......#....#',
    '#.##.###.#.###.##.#',
    '#..#.....P.....#..#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '#.................#',
    '#.##.###.#.###.##.#',
    '#o.......#.......o#',
    '###################',
  ])
  assert.equal(new PacmanGame().spawn, cell(9, 13))
})

for (const [mazeIndex, maze] of MAZES.entries()) {
  test(`pacman: maze ${mazeIndex + 1} has valid dimensions, actors, boundaries and walls`, () => {
    const game = gameAtMaze(mazeIndex)
    assert.equal(maze.map.length, 21)
    for (const [y, row] of maze.map.entries()) {
      assert.equal(row.length, 19)
      assert.match(row, /^[#.o P123]+$/)
      if (y === 0 || y === 20) assert.equal(row, '#'.repeat(19))
      assert.equal(row[0] === '#', y !== 9, `left boundary at row ${y}`)
      assert.equal(row[18] === '#', y !== 9, `right boundary at row ${y}`)
    }
    for (const symbol of ['P', '1', '2', '3']) assert.equal(cellsWith(maze.map, symbol).size, 1, symbol)
    assert.equal(cellsWith(maze.map, 'o').size, 4)
    assert.ok(cellsWith(maze.map, '.').size > 0)
    assert.equal(maze.map[8].slice(8, 11), '# #')
    assert.equal(maze.map[9].slice(7, 12), '#123#')
    assert.equal(maze.map[10].slice(7, 12), '#   #')
    assertLoadedMaze(game, mazeIndex)
    assert.equal(game.tiles.length, game.width * game.height)
    game.tiles.forEach((tile, index) => assert.equal(game.walls.has(index), tile === '#'))
    assert.equal(game.neighbor(cell(0, 9), 'left'), cell(18, 9))
    assert.equal(game.neighbor(cell(18, 9), 'right'), cell(0, 9))
  })

  test(`pacman: every walkable tile, pellet and ghost home in maze ${mazeIndex + 1} is reachable`, () => {
    const game = gameAtMaze(mazeIndex)
    const reachable = new Set([game.spawn])
    const queue = [game.spawn]
    for (let i = 0; i < queue.length; i++) {
      for (const { cell: next } of mapSteps(maze.map, queue[i])) {
        if (reachable.has(next)) continue
        reachable.add(next)
        queue.push(next)
      }
    }
    for (const [index, tile] of [...maze.map.join('')].entries()) {
      if (tile !== '#') assert.ok(reachable.has(index), `unreachable tile at ${index % 19},${Math.floor(index / 19)}`)
    }
    for (const pellet of [...game.pellets, ...game.powerPellets]) assert.ok(reachable.has(pellet), `unreachable pellet ${pellet}`)
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

  test(`pacman: maze ${mazeIndex + 1} can be cleared by real movement with one completion bonus`, () => {
    const game = gameAtMaze(mazeIndex)
    const expectedScore = game.pellets.size * 10 + game.powerPellets.size * 50 + 500
    game.ghosts = []
    game.start()
    let moves = 0
    while (game.remaining > 0) {
      const queue = [{ cell: game.player, route: [] as { direction: Direction; cell: number }[] }]
      const seen = new Set([game.player])
      let route: typeof queue[number]['route'] | undefined
      for (const current of queue) {
        if (game.pellets.has(current.cell) || game.powerPellets.has(current.cell)) {
          route = current.route
          break
        }
        for (const step of mapSteps(maze.map, current.cell)) {
          if (seen.has(step.cell)) continue
          seen.add(step.cell)
          queue.push({ cell: step.cell, route: [...current.route, step] })
        }
      }
      assert.ok(route?.length, `no route to remaining pellets in maze ${mazeIndex + 1}`)
      for (const step of route) {
        const award = game.pellets.has(step.cell) ? 10 : game.powerPellets.has(step.cell) ? 50 : 0
        const beforeScore = game.score
        const beforeRemaining = game.remaining
        game.steer(step.direction)
        game.tick()
        assert.equal(game.player, step.cell)
        assert.equal(game.remaining, beforeRemaining - (award ? 1 : 0))
        assert.equal(game.score, beforeScore + award + (game.remaining === 0 ? 500 : 0))
        assert.equal(game.status, game.remaining === 0 ? 'won' : 'playing')
        assert.ok(++moves < game.tiles.length ** 2, 'replay must make bounded progress')
      }
    }
    assert.equal(game.status, 'won')
    assert.equal(game.score, expectedScore)
    assert.equal(game.lives, 3)
    assert.equal(game.pellets.size, 0)
    assert.equal(game.powerPellets.size, 0)
    const won = structuredClone(game)
    game.tick()
    game.tick()
    game.start()
    assert.deepEqual(structuredClone(game), won)
  })
}

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

test('pacman: the next level preserves score and lives, loads the next maze and increases speed', () => {
  const game = runningGame()
  const previousTiles = [...game.tiles]
  const previousWalls = new Set(game.walls)
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
  assertLoadedMaze(game, 1)
  assert.notDeepEqual(game.tiles, previousTiles)
  assert.notDeepEqual(game.walls, previousWalls)
  assert.equal(game.direction, 'left')
  assert.equal(game.queuedDirection, 'left')
  assert.equal(game.ticks, 0)
  assert.equal(game.powerTicks, 0)
  assert.equal(game.combo, 0)
  assert.equal(game.invulnerableTicks, 14)
})

test('pacman: all eight mazes cycle indefinitely without resetting score, lives or speed', () => {
  const game = new PacmanGame()
  game.score = 1230
  game.lives = 2
  for (let level = 1; level <= 17; level++) {
    assert.equal(game.level, level)
    assertLoadedMaze(game, (level - 1) % 8)
    assert.equal(game.score, 1230)
    assert.equal(game.lives, 2)
    assert.equal(game.interval, Math.max(105, 150 - (level - 1) * 10))
    assert.equal(game.status, level === 1 ? 'ready' : 'playing')
    assert.equal(game.ticks, 0)
    assert.equal(game.powerTicks, 0)
    assert.equal(game.combo, 0)
    assert.equal(game.direction, 'left')
    assert.equal(game.queuedDirection, 'left')
    assert.equal(game.invulnerableTicks, 14)
    game.pellets.clear()
    game.powerPellets.clear()
    game.ghosts = []
    game.powerTicks = 12
    game.combo = 3
    game.ticks = 57
    game.invulnerableTicks = 0
    game.direction = 'right'
    game.queuedDirection = 'up'
    game.status = 'won'
    game.nextLevel()
  }
})

for (let mazeIndex = 1; mazeIndex < 8; mazeIndex++) {
  test(`pacman: death in maze ${mazeIndex + 1} preserves its layout and collected pellets`, () => {
    const game = gameAtMaze(mazeIndex)
    const map = MAZES[mazeIndex].map
    const freshGhosts = structuredClone(game.ghosts)
    const originalTiles = [...game.tiles]
    const originalWalls = new Set(game.walls)
    const originalTotal = game.totalPellets
    const alreadyEaten = [...game.pellets][0]
    game.pellets.delete(alreadyEaten)
    game.powerPellets.delete([...game.powerPellets][0])
    const target = [...game.pellets][0]
    const from = mapSteps(map, target)[0].cell
    const step = mapSteps(map, from).find(step => step.cell === target)!
    const remainingPellets = new Set(game.pellets)
    remainingPellets.delete(target)
    const remainingPower = new Set(game.powerPellets)
    game.score = 120
    game.combo = 2
    game.player = from
    game.direction = step.direction
    game.queuedDirection = step.direction
    game.powerTicks = 0
    game.invulnerableTicks = 0
    game.ghosts = [
      { cell: target, home: freshGhosts[0].home, direction: 'left', cooldown: 0 },
      { cell: target, home: freshGhosts[1].home, direction: 'right', cooldown: 0 },
    ]
    game.tick()
    assert.equal(game.status, 'life-lost')
    assert.equal(game.level, mazeIndex + 1)
    assert.equal(game.mazeIndex, mazeIndex)
    assert.equal(game.maze, MAZES[mazeIndex])
    assert.deepEqual(game.tiles, originalTiles)
    assert.deepEqual(game.walls, originalWalls)
    assert.equal(game.spawn, map.join('').indexOf('P'))
    assert.equal(game.player, game.spawn)
    assert.equal(game.lives, 2)
    assert.equal(game.score, 130)
    assert.equal(game.interval, Math.max(105, TICK_MS - mazeIndex * 10))
    assert.deepEqual(game.pellets, remainingPellets)
    assert.deepEqual(game.powerPellets, remainingPower)
    assert.equal(game.totalPellets, originalTotal)
    assert.equal(game.remaining, originalTotal - 3)
    assert.equal(game.direction, 'left')
    assert.equal(game.queuedDirection, 'left')
    assert.equal(game.ticks, 0)
    assert.equal(game.powerTicks, 0)
    assert.equal(game.combo, 0)
    assert.equal(game.invulnerableTicks, 14)
    assert.deepEqual(game.ghosts, freshGhosts)
    const lost = structuredClone(game)
    game.tick()
    assert.deepEqual(structuredClone(game), lost)
    game.start()
    assert.deepEqual(structuredClone(game), { ...lost, status: 'playing' })
  })

  test(`pacman: restarting from maze ${mazeIndex + 1} restores the original maze and fresh run`, () => {
    const game = gameAtMaze(mazeIndex)
    game.score = 4000
    game.lives = 1
    game.pellets.clear()
    game.powerPellets.clear()
    game.ghosts = []
    game.powerTicks = 20
    game.combo = 3
    game.ticks = 200
    game.pause()
    game.restart()
    assertLoadedMaze(game, 0)
    assert.equal(game.status, 'ready')
    assert.equal(game.level, 1)
    assert.equal(game.interval, TICK_MS)
    assert.deepEqual(game, new PacmanGame())
  })
}

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
