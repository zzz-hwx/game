import test from 'node:test'
import assert from 'node:assert/strict'
import { chord, createGame, levels, neighbors, reveal, toggleFlag } from '../src/games/minesweeper/engine.ts'
import type { Game, Level } from '../src/games/minesweeper/engine.ts'

const difficulties: { level: Level; rows: number; cols: number; mines: number }[] = [
  { level: 'easy', rows: 9, cols: 9, mines: 10 },
  { level: 'normal', rows: 16, cols: 16, mines: 40 },
  { level: 'hard', rows: 16, cols: 30, mines: 99 },
]
const fixtureMines = [0, 8, 18, 26, 72, 74, 76, 78, 79, 80]

function expectedNeighbors(game: Game, index: number): number[] {
  const row = Math.floor(index / game.cols)
  const col = index % game.cols
  return game.cells.flatMap((_, next) => {
    const rowDistance = Math.abs(Math.floor(next / game.cols) - row)
    const colDistance = Math.abs(next % game.cols - col)
    return next !== index && rowDistance <= 1 && colDistance <= 1 ? [next] : []
  })
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function fixtureGame(revealed: number[] = [], mines = fixtureMines): Game {
  const game = createGame()
  game.status = 'playing'
  game.mines = mines.length
  for (const index of mines) game.cells[index].mine = true
  game.cells.forEach((cell, index) => {
    cell.adjacent = expectedNeighbors(game, index).filter(next => game.cells[next].mine).length
    cell.revealed = revealed.includes(index)
  })
  game.revealedCount = game.cells.filter(cell => cell.revealed && !cell.mine).length
  return game
}

function unexpectedRandom(): never {
  assert.fail('Mines must only be planted on the first valid reveal')
}

function assertRevealedCount(game: Game): void {
  assert.equal(game.revealedCount, game.cells.filter(cell => cell.revealed && !cell.mine).length)
}

function assertFrozen(game: Game): void {
  const before = structuredClone(game)
  for (let index = 0; index < game.cells.length; index++) {
    assert.equal(reveal(game, index, unexpectedRandom), false)
    assert.equal(toggleFlag(game, index), false)
    assert.equal(chord(game, index), false)
  }
  assert.deepEqual(game, before)
}

test('minesweeper: the default game uses easy difficulty', () => {
  assert.deepEqual(createGame(), createGame('easy'))
  assert.deepEqual(Object.keys(levels).sort(), ['easy', 'hard', 'normal'])
})

for (const { level, rows, cols, mines } of difficulties) {
  test(`minesweeper: ${level} starts with the exact dimensions and no planted mines`, () => {
    const game = createGame(level)
    assert.deepEqual(
      { rows: levels[level].rows, cols: levels[level].cols, mines: levels[level].mines },
      { rows, cols, mines },
    )
    assert.equal(game.level, level)
    assert.equal(game.rows, rows)
    assert.equal(game.cols, cols)
    assert.equal(game.mines, mines)
    assert.equal(game.status, 'ready')
    assert.equal(game.revealedCount, 0)
    assert.equal(game.cells.length, rows * cols)
    for (const cell of game.cells) {
      assert.deepEqual(cell, { mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false })
    }
  })

  test(`minesweeper: ${level} neighbors respect every corner, edge and interior boundary`, () => {
    const game = createGame(level)
    const before = structuredClone(game)
    for (let index = 0; index < game.cells.length; index++) {
      const actual = neighbors(game, index)
      assert.deepEqual([...actual].sort((a, b) => a - b), expectedNeighbors(game, index), `cell ${index}`)
      assert.equal(new Set(actual).size, actual.length)
      assert.equal(actual.includes(index), false)
    }
    assert.deepEqual(game, before)
  })

  const middleRow = Math.floor(rows / 2)
  const middleCol = Math.floor(cols / 2)
  const firstClicks: [string, number][] = [
    ['top-left corner', 0],
    ['top-right corner', cols - 1],
    ['bottom-left corner', (rows - 1) * cols],
    ['bottom-right corner', rows * cols - 1],
    ['top edge', middleCol],
    ['bottom edge', (rows - 1) * cols + middleCol],
    ['left edge', middleRow * cols],
    ['right edge', middleRow * cols + cols - 1],
    ['center', middleRow * cols + middleCol],
  ]

  for (const [position, first] of firstClicks) {
    test(`minesweeper: ${level} first reveal protects the ${position} and all its neighbors`, () => {
      const randoms = [() => 0, () => 0.999999999, seededRandom(20260917 + first)]
      for (const [sample, random] of randoms.entries()) {
        const game = createGame(level)
        const cells = game.cells
        const firstCell = cells[first]
        let randomCalls = 0
        assert.equal(reveal(game, first, () => {
          randomCalls += 1
          return random()
        }), true)
        assert.equal(randomCalls, mines)
        assert.equal(game.cells, cells)
        assert.equal(game.cells[first], firstCell)
        assert.equal(firstCell.revealed, true)
        assert.equal(firstCell.adjacent, 0)
        assert.ok(game.status === 'playing' || game.status === 'won')
        assert.equal(game.cells.filter(cell => cell.mine).length, mines)
        for (const index of [first, ...expectedNeighbors(game, first)]) {
          assert.equal(game.cells[index].mine, false, `sample ${sample}, protected cell ${index}`)
          assert.equal(game.cells[index].revealed, true)
        }
        game.cells.forEach((cell, index) => {
          const adjacent = expectedNeighbors(game, index).filter(next => game.cells[next].mine).length
          assert.equal(cell.adjacent, adjacent, `sample ${sample}, adjacent count at ${index}`)
          assert.equal(cell.exploded, false)
          if (cell.mine) assert.equal(cell.revealed, false)
        })
        assertRevealedCount(game)
        const before = structuredClone(game)
        assert.equal(reveal(game, first, unexpectedRandom), false)
        assert.deepEqual(game, before)
      }
    })
  }

  test(`minesweeper: revealing every safe ${level} cell wins, flags all mines and freezes operations`, () => {
    const game = createGame(level)
    assert.equal(reveal(game, 0, seededRandom(12345)), true)
    const mineIndices = game.cells.flatMap((cell, index) => cell.mine ? [index] : [])
    const adjacentCounts = game.cells.map(cell => cell.adjacent)
    game.cells.forEach((cell, index) => {
      if (!cell.mine && !cell.revealed) assert.equal(reveal(game, index, unexpectedRandom), true)
    })
    assert.equal(game.status, 'won')
    assert.equal(game.revealedCount, rows * cols - mines)
    assert.deepEqual(game.cells.flatMap((cell, index) => cell.mine ? [index] : []), mineIndices)
    assert.deepEqual(game.cells.map(cell => cell.adjacent), adjacentCounts)
    for (const cell of game.cells) {
      assert.equal(cell.revealed, !cell.mine)
      assert.equal(cell.flagged, cell.mine)
      assert.equal(cell.exploded, false)
    }
    assertRevealedCount(game)
    assertFrozen(game)
  })
}

test('minesweeper: cells and separate games do not share mutable state', () => {
  const game = createGame()
  const other = createGame()
  assert.equal(new Set(game.cells).size, game.cells.length)
  assert.equal(toggleFlag(game, 0), true)
  assert.equal(game.cells[0].flagged, true)
  assert.equal(game.cells[1].flagged, false)
  assert.deepEqual(other, createGame())
})

test('minesweeper: invalid indices never modify ready or playing games', () => {
  for (const game of [createGame(), fixtureGame()]) {
    const before = structuredClone(game)
    for (const index of [-1, game.cells.length, game.cells.length + 1, 0.5, NaN, Infinity]) {
      assert.equal(reveal(game, index, unexpectedRandom), false)
      assert.equal(toggleFlag(game, index), false)
      assert.equal(chord(game, index), false)
    }
    assert.deepEqual(game, before)
  }
})

test('minesweeper: flags toggle without starting, planting mines or revealing a cell', () => {
  const game = createGame()
  const before = structuredClone(game)
  const expected = structuredClone(game)
  expected.cells[40].flagged = true
  assert.equal(toggleFlag(game, 40), true)
  assert.deepEqual(game, expected)
  assert.equal(reveal(game, 40, unexpectedRandom), false)
  assert.deepEqual(game, expected)
  assert.equal(toggleFlag(game, 40), true)
  assert.deepEqual(game, before)
  assert.equal(reveal(game, 40, seededRandom(321)), true)
  assert.notEqual(game.status, 'ready')
  assert.equal(game.cells[40].revealed, true)
})

test('minesweeper: a flag placed before the first reveal survives protected-area expansion', () => {
  const game = createGame()
  assert.equal(toggleFlag(game, 1), true)
  assert.equal(reveal(game, 0, seededRandom(456)), true)
  assert.equal(game.cells[1].mine, false)
  assert.equal(game.cells[1].flagged, true)
  assert.equal(game.cells[1].revealed, false)
  assert.equal(game.status, 'playing')
  assert.equal(game.cells.filter(cell => cell.mine).length, game.mines)
  assertRevealedCount(game)
})

test('minesweeper: revealing a number uncovers only that cell and rejects repeated reveals and flags', () => {
  const game = fixtureGame()
  assert.equal(game.cells[10].adjacent, 2)
  assert.equal(reveal(game, 10, unexpectedRandom), true)
  assert.equal(game.status, 'playing')
  assert.equal(game.revealedCount, 1)
  assert.deepEqual(game.cells.flatMap((cell, index) => cell.revealed ? [index] : []), [10])
  const before = structuredClone(game)
  assert.equal(reveal(game, 10, unexpectedRandom), false)
  assert.equal(toggleFlag(game, 10), false)
  assert.deepEqual(game, before)
})

test('minesweeper: blank expansion reveals connected blanks and boundary numbers but preserves flags', () => {
  const game = fixtureGame([], [0, 9, 10, 11, 12, 13, 14, 15, 16, 17])
  assert.equal(toggleFlag(game, 40), true)
  assert.equal(toggleFlag(game, 9), true)
  assert.equal(reveal(game, 80, unexpectedRandom), true)
  game.cells.forEach((cell, index) => {
    assert.equal(cell.revealed, index >= 18 && index !== 40, `cell ${index}`)
    assert.equal(cell.flagged, index === 40 || index === 9)
    assert.equal(cell.exploded, false)
  })
  assert.equal(game.cells[18].adjacent, 2)
  assert.equal(game.cells[19].adjacent, 3)
  assert.equal(game.revealedCount, 62)
  assert.equal(game.status, 'playing')
  const before = structuredClone(game)
  assert.equal(reveal(game, 40, unexpectedRandom), false)
  assert.deepEqual(game, before)
  assert.equal(toggleFlag(game, 40), true)
  assert.equal(reveal(game, 40, unexpectedRandom), true)
  assert.equal(game.revealedCount, 63)
  assert.equal(game.status, 'playing')
  assert.equal(game.cells[9].flagged, true)
  assertRevealedCount(game)
})

test('minesweeper: a flagged final safe cell prevents victory until it is unflagged and revealed', () => {
  const game = fixtureGame()
  game.cells.forEach((cell, index) => {
    if (!cell.mine && index !== 40) {
      cell.revealed = true
      game.revealedCount += 1
    }
  })
  assert.equal(toggleFlag(game, 40), true)
  assert.equal(reveal(game, 40, unexpectedRandom), false)
  assert.equal(game.status, 'playing')
  assert.equal(game.revealedCount, 70)
  assert.equal(toggleFlag(game, 40), true)
  assert.equal(reveal(game, 40, unexpectedRandom), true)
  assert.equal(game.status, 'won')
  assert.equal(game.revealedCount, 71)
  assert.equal(game.cells.filter(cell => cell.mine && cell.flagged).length, 10)
  assertRevealedCount(game)
  assertFrozen(game)
})

test('minesweeper: hitting a mine exposes all mines, explodes only the hit cell and freezes operations', () => {
  const game = fixtureGame()
  assert.equal(toggleFlag(game, 8), true)
  assert.equal(toggleFlag(game, 40), true)
  assert.equal(reveal(game, 10, unexpectedRandom), true)
  assert.equal(reveal(game, 0, unexpectedRandom), true)
  assert.equal(game.status, 'lost')
  assert.equal(game.revealedCount, 1)
  game.cells.forEach((cell, index) => {
    assert.equal(cell.revealed, cell.mine || index === 10)
    assert.equal(cell.exploded, index === 0)
    assert.equal(cell.flagged, index === 8 || index === 40)
  })
  assertRevealedCount(game)
  assertFrozen(game)
})

test('minesweeper: chord rejects ready games, hidden cells and revealed blanks', () => {
  const cases: [Game, number][] = [
    [createGame(), 10],
    [fixtureGame(), 10],
    [fixtureGame(), 40],
    [fixtureGame([40]), 40],
  ]
  for (const [game, index] of cases) {
    const before = structuredClone(game)
    assert.equal(chord(game, index), false)
    assert.deepEqual(game, before)
  }
})

test('minesweeper: chord requires exactly the displayed number of adjacent flags', () => {
  for (const flags of [[], [0], [0, 18, 1]]) {
    const game = fixtureGame([10])
    assert.equal(game.cells[10].adjacent, 2)
    for (const index of flags) assert.equal(toggleFlag(game, index), true)
    const before = structuredClone(game)
    assert.equal(chord(game, 10), false)
    assert.deepEqual(game, before)
  }
})

test('minesweeper: correctly flagged chord expands safe neighbors without recounting revealed cells', () => {
  const game = fixtureGame([10, 1])
  for (const index of [0, 18, 40]) assert.equal(toggleFlag(game, index), true)
  assert.equal(chord(game, 10), true)
  for (const index of expectedNeighbors(game, 10)) {
    assert.equal(game.cells[index].revealed, !game.cells[index].mine)
    assert.equal(game.cells[index].flagged, game.cells[index].mine)
  }
  assert.equal(game.status, 'playing')
  assert.ok(game.revealedCount > 2)
  assert.equal(game.cells[40].flagged, true)
  assert.equal(game.cells[40].revealed, false)
  assert.ok(game.cells.filter(cell => cell.mine).every(cell => !cell.revealed && !cell.exploded))
  assertRevealedCount(game)
  const before = structuredClone(game)
  assert.equal(chord(game, 10), false)
  assert.deepEqual(game, before)
})

test('minesweeper: incorrectly placed matching flags make chord lose and stop further expansion', () => {
  const game = fixtureGame([10])
  for (const index of [1, 18]) assert.equal(toggleFlag(game, index), true)
  assert.equal(chord(game, 10), true)
  assert.equal(game.status, 'lost')
  assert.equal(game.revealedCount, 1)
  game.cells.forEach((cell, index) => {
    assert.equal(cell.revealed, cell.mine || index === 10)
    assert.equal(cell.exploded, index === 0)
    assert.equal(cell.flagged, index === 1 || index === 18)
  })
  assertRevealedCount(game)
  assertFrozen(game)
})

test('minesweeper: chord revealing the final safe neighbors wins and automatically flags remaining mines', () => {
  const game = fixtureGame()
  const targets = expectedNeighbors(game, 10).filter(index => !game.cells[index].mine)
  game.cells.forEach((cell, index) => {
    if (!cell.mine && !targets.includes(index)) {
      cell.revealed = true
      game.revealedCount += 1
    }
  })
  assert.equal(game.revealedCount, game.cells.length - game.mines - targets.length)
  assert.equal(toggleFlag(game, 0), true)
  assert.equal(toggleFlag(game, 18), true)
  assert.equal(chord(game, 10), true)
  assert.equal(game.status, 'won')
  assert.equal(game.revealedCount, 71)
  for (const cell of game.cells) {
    assert.equal(cell.revealed, !cell.mine)
    assert.equal(cell.flagged, cell.mine)
    assert.equal(cell.exploded, false)
  }
  assertRevealedCount(game)
  assertFrozen(game)
})
