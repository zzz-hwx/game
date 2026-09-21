import test from 'node:test'
import assert from 'node:assert/strict'
import { BOARD_SIZE, GomokuGame, chooseComputerMove } from '../src/games/gomoku/engine.ts'
import type { Player } from '../src/games/gomoku/engine.ts'

type Point = { row: number; col: number }

function snapshot(game: GomokuGame) {
  return {
    board: [...game.board],
    history: game.history.map(move => ({ ...move })),
    currentPlayer: game.currentPlayer,
    winner: game.winner,
    draw: game.draw,
    winningLine: [...game.winningLine],
  }
}

function playStones(stones: Point[], player: Player = 1): GomokuGame {
  const game = new GomokuGame()
  // Spaced fillers cannot form five and never occupy one of the requested stones.
  const fillers = [10, 12, 14].flatMap(row =>
    Array.from({ length: 8 }, (_, i) => ({ row, col: i * 2 })),
  ).filter(point => !stones.some(stone => stone.row === point.row && stone.col === point.col))
  let fillerIndex = 0
  for (const { row, col } of stones) {
    if (game.currentPlayer !== player) {
      const filler = fillers[fillerIndex++]
      assert.equal(game.place(filler.row, filler.col), true)
    }
    assert.equal(game.place(row, col), true)
  }
  return game
}

function drawGame(): GomokuGame {
  const game = new GomokuGame()
  const black: Point[] = []
  const white: Point[] = []
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      // Horizontal runs have length one; vertical and diagonal runs at most two.
      const player = (row + 2 * col) % 4 < 2 ? 1 : 2
      ;(player === 1 ? black : white).push({ row, col })
    }
  }
  assert.equal(black.length, 113)
  assert.equal(white.length, 112)
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    const point = (i % 2 === 0 ? black : white)[Math.floor(i / 2)]
    assert.equal(game.place(point.row, point.col), true)
    assert.equal(game.winner, 0)
    assert.equal(game.draw, i === BOARD_SIZE * BOARD_SIZE - 1)
  }
  return game
}

function pureChoice(game: GomokuGame): Point | null {
  const before = snapshot(game)
  const board = game.board
  const history = game.history
  const line = game.winningLine
  const choice = chooseComputerMove(game)
  assert.deepEqual(chooseComputerMove(game), choice, 'AI must be deterministic')
  assert.deepEqual(snapshot(game), before, 'AI must preserve every public field')
  assert.equal(game.board, board)
  assert.equal(game.history, history)
  assert.equal(game.winningLine, line)
  if (choice !== null) {
    assert.ok(Number.isInteger(choice.row) && choice.row >= 0 && choice.row < BOARD_SIZE)
    assert.ok(Number.isInteger(choice.col) && choice.col >= 0 && choice.col < BOARD_SIZE)
    assert.equal(game.board[choice.row * BOARD_SIZE + choice.col], 0)
  }
  return choice
}

const directions = [
  { name: 'horizontal', row: 0, col: 0, dr: 0, dc: 1 },
  { name: 'vertical', row: 0, col: 14, dr: 1, dc: 0 },
  { name: 'diagonal', row: 0, col: 0, dr: 1, dc: 1 },
  { name: 'anti-diagonal', row: 0, col: 14, dr: 1, dc: -1 },
]

function pointsOnLine(direction: typeof directions[number], count: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    row: direction.row + direction.dr * i,
    col: direction.col + direction.dc * i,
  }))
}

test('gomoku: initializes independent empty 15x15 games and alternates turns', () => {
  const game = new GomokuGame()
  const other = new GomokuGame()
  assert.equal(BOARD_SIZE, 15)
  assert.deepEqual(snapshot(game), {
    board: Array(225).fill(0), history: [], currentPlayer: 1,
    winner: 0, draw: false, winningLine: [],
  })
  assert.equal(game.place(0, 0), true)
  assert.equal(game.currentPlayer, 2)
  assert.equal(game.place(14, 14), true)
  assert.equal(game.currentPlayer, 1)
  assert.equal(game.board[0], 1)
  assert.equal(game.board[224], 2)
  assert.deepEqual(game.history, [
    { row: 0, col: 0, player: 1 }, { row: 14, col: 14, player: 2 },
  ])
  assert.deepEqual(snapshot(other), snapshot(new GomokuGame()))
})

test('gomoku: rejects out-of-bounds, non-integer and occupied moves without mutation', () => {
  const game = new GomokuGame()
  assert.equal(game.place(7, 7), true)
  const before = snapshot(game)
  const board = game.board
  const history = game.history
  const invalid: [number, number][] = [
    [-1, 0], [0, -1], [15, 0], [0, 15], [100, 100],
    [0.5, 0], [0, 1.5], [NaN, 0], [0, NaN],
    [Infinity, 0], [0, Infinity], [-Infinity, 0], [0, -Infinity], [7, 7],
  ]
  for (const [row, col] of invalid) {
    assert.equal(game.place(row, col), false)
    assert.deepEqual(snapshot(game), before)
    assert.equal(game.board, board)
    assert.equal(game.history, history)
  }
})

for (const direction of directions) {
  for (const player of [1, 2] as const) {
    test(`gomoku: player ${player} wins ${direction.name} at the boundary`, () => {
      const stones = pointsOnLine(direction, 5)
      const game = playStones(stones, player)
      assert.equal(game.winner, player)
      assert.equal(game.currentPlayer, player === 1 ? 2 : 1)
      assert.equal(game.draw, false)
      assert.deepEqual(game.winningLine, stones.map(({ row, col }) => row * BOARD_SIZE + col))
      assert.deepEqual(game.history.at(-1), { ...stones[4], player })
      const before = snapshot(game)
      assert.equal(game.place(8, 8), false)
      assert.equal(game.place(-1, NaN), false)
      assert.deepEqual(snapshot(game), before)
    })
  }

  test(`gomoku: joining a gap creates a legal seven-stone ${direction.name} win`, () => {
    const stones = pointsOnLine(direction, 7)
    const game = playStones([0, 1, 2, 4, 5, 6].map(i => stones[i]))
    assert.equal(game.winner, 0)
    assert.deepEqual(game.winningLine, [])
    assert.equal(game.place(8, 8), true)
    assert.equal(game.place(stones[3].row, stones[3].col), true)
    assert.equal(game.winner, 1)
    assert.deepEqual(game.winningLine, stones.map(({ row, col }) => row * BOARD_SIZE + col))
  })

  for (const player of [1, 2] as const) {
    test(`gomoku AI: player ${player} immediately wins ${direction.name}`, () => {
      const stones = pointsOnLine(direction, 5)
      const game = playStones(stones.slice(0, 4), player)
      assert.equal(game.place(8, 14), true)
      assert.equal(game.currentPlayer, player)
      const choice = pureChoice(game)
      assert.deepEqual(choice, stones[4])
      assert.ok(choice)
      assert.equal(game.place(choice.row, choice.col), true)
      assert.equal(game.winner, player)
    })

    test(`gomoku AI: blocks player ${player}'s ${direction.name} four`, () => {
      const stones = pointsOnLine(direction, 5)
      const game = playStones(stones.slice(0, 4), player)
      assert.equal(game.currentPlayer, player === 1 ? 2 : 1)
      const choice = pureChoice(game)
      assert.deepEqual(choice, stones[4])
      assert.ok(choice)
      assert.equal(game.place(choice.row, choice.col), true)
      assert.equal(game.winner, 0)
    })
  }
}

test('gomoku: recognizes a line ending at the bottom-right corner', () => {
  const stones = Array.from({ length: 5 }, (_, i) => ({ row: 10 + i, col: 10 + i }))
  const game = playStones(stones)
  assert.equal(game.winner, 1)
  assert.deepEqual(game.winningLine, [160, 176, 192, 208, 224])
})

test('gomoku: gaps, opposing stones and wrapped flat indices are not consecutive lines', () => {
  const patterns: Point[][] = [
    [1, 2, 4, 5, 6].map(col => ({ row: 7, col })),
    [{ row: 0, col: 13 }, { row: 0, col: 14 }, { row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }],
    [{ row: 0, col: 13 }, { row: 1, col: 14 }, { row: 3, col: 0 }, { row: 4, col: 1 }, { row: 5, col: 2 }],
    [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 14 }, { row: 2, col: 13 }, { row: 3, col: 12 }],
  ]
  for (const stones of patterns) {
    const game = playStones(stones)
    assert.equal(game.winner, 0)
    assert.equal(game.draw, false)
    assert.deepEqual(game.winningLine, [])
  }
  const game = new GomokuGame()
  for (const [row, col] of [[7, 1], [7, 3], [7, 2], [14, 0], [7, 4], [14, 2], [7, 5], [14, 4], [7, 6]]) {
    assert.equal(game.place(row, col), true)
  }
  assert.equal(game.winner, 0)
  assert.deepEqual(game.winningLine, [])
})

test('gomoku: a full board without five is a draw and rejects further moves', () => {
  const game = drawGame()
  assert.equal(game.history.length, 225)
  assert.equal(game.currentPlayer, 2)
  assert.ok(game.board.every(cell => cell !== 0))
  assert.deepEqual(game.winningLine, [])
  const before = snapshot(game)
  assert.equal(game.place(0, 0), false)
  assert.equal(game.place(15, 15), false)
  assert.deepEqual(snapshot(game), before)
})

test('gomoku: a winning final vacancy is a win, not a draw', () => {
  const game = new GomokuGame()
  game.board = [...drawGame().board]
  for (let col = 10; col < BOARD_SIZE; col++) game.board[14 * BOARD_SIZE + col] = 1
  game.board[14 * BOARD_SIZE + 12] = 0
  assert.equal(game.place(14, 12), true)
  assert.equal(game.winner, 1)
  assert.equal(game.draw, false)
  assert.equal(game.currentPlayer, 2)
  assert.ok(game.board.every(cell => cell !== 0))
  assert.deepEqual(game.winningLine, [219, 220, 221, 222, 223, 224])
})

test('gomoku: undo removes requested moves and restores the earliest undone turn', () => {
  const game = new GomokuGame()
  assert.equal(game.undo(), false)
  assert.equal(game.place(7, 7), true)
  const afterOne = snapshot(game)
  assert.equal(game.place(7, 8), true)
  assert.equal(game.place(8, 7), true)
  const afterThree = snapshot(game)
  assert.equal(game.place(8, 8), true)
  assert.equal(game.undo(), true)
  assert.deepEqual(snapshot(game), afterThree)
  assert.equal(game.undo(2), true)
  assert.deepEqual(snapshot(game), afterOne)
  assert.equal(game.place(0, 0), true)
  assert.equal(game.board[0], 2)
  assert.equal(game.undo(999), true)
  assert.deepEqual(snapshot(game), snapshot(new GomokuGame()))
  assert.equal(game.undo(), false)
})

test('gomoku: invalid undo counts do not change state', () => {
  const game = playStones([{ row: 7, col: 7 }, { row: 7, col: 8 }])
  const before = snapshot(game)
  for (const steps of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    assert.equal(game.undo(steps), false)
    assert.deepEqual(snapshot(game), before)
  }
})

for (const player of [1, 2] as const) {
  test(`gomoku: undo reopens player ${player}'s win and allows replay`, () => {
    const stones = pointsOnLine(directions[0], 5)
    const game = playStones(stones, player)
    const won = snapshot(game)
    assert.equal(game.undo(), true)
    assert.equal(game.winner, 0)
    assert.equal(game.draw, false)
    assert.deepEqual(game.winningLine, [])
    assert.equal(game.currentPlayer, player)
    assert.equal(game.board[4], 0)
    assert.equal(game.place(0, 4), true)
    assert.deepEqual(snapshot(game), won)
    assert.equal(game.undo(2), true)
    assert.equal(game.currentPlayer, player === 1 ? 2 : 1)
    assert.equal(game.winner, 0)
    assert.deepEqual(game.winningLine, [])
    assert.equal(game.place(9, 9), true)
  })
}

test('gomoku: undo clears a draw and restores the last mover', () => {
  const game = drawGame()
  const drawn = snapshot(game)
  const last = game.history.at(-1)
  assert.ok(last)
  assert.equal(game.undo(), true)
  assert.equal(game.draw, false)
  assert.equal(game.winner, 0)
  assert.deepEqual(game.winningLine, [])
  assert.equal(game.currentPlayer, last.player)
  assert.equal(game.history.length, 224)
  assert.equal(game.board[last.row * BOARD_SIZE + last.col], 0)
  assert.deepEqual(pureChoice(game), { row: last.row, col: last.col })
  assert.equal(game.place(last.row, last.col), true)
  assert.deepEqual(snapshot(game), drawn)
})

test('gomoku: reset clears ongoing, won and drawn games', () => {
  const games = [
    playStones([{ row: 7, col: 7 }]),
    playStones(pointsOnLine(directions[0], 5)),
    drawGame(),
  ]
  for (const game of games) {
    game.reset()
    assert.deepEqual(snapshot(game), snapshot(new GomokuGame()))
    assert.equal(game.undo(), false)
    assert.equal(game.place(7, 7), true)
    assert.equal(game.board[112], 1)
    game.reset()
    game.reset()
    assert.deepEqual(snapshot(game), snapshot(new GomokuGame()))
  }
})

test('gomoku AI: starts in the center and handles terminal or full boards', () => {
  assert.deepEqual(pureChoice(new GomokuGame()), { row: 7, col: 7 })
  assert.equal(pureChoice(playStones(pointsOnLine(directions[0], 5))), null)
  assert.equal(pureChoice(drawGame()), null)
  const full = drawGame()
  full.draw = false
  assert.equal(pureChoice(full), null)
})

test('gomoku AI: takes its own immediate win before blocking an opponent win', () => {
  const game = new GomokuGame()
  for (let col = 0; col < 4; col++) {
    assert.equal(game.place(2, col), true)
    assert.equal(game.place(5, col), true)
  }
  assert.deepEqual(pureChoice(game), { row: 2, col: 4 })
  assert.equal(game.place(2, 4), true)
  assert.equal(game.winner, 1)
})

for (const player of [1, 2] as const) {
  test(`gomoku AI: finds and blocks player ${player}'s split four`, () => {
    const stones = [4, 5, 7, 8].map(col => ({ row: 7, col }))
    const game = playStones(stones, player)
    assert.deepEqual(pureChoice(game), { row: 7, col: 6 })
    assert.equal(game.place(0, 0), true)
    assert.equal(game.currentPlayer, player)
    assert.deepEqual(pureChoice(game), { row: 7, col: 6 })
    assert.equal(game.place(7, 6), true)
    assert.equal(game.winner, player)
  })
}

test('gomoku AI: ordinary choices are nearby, legal, deterministic and playable', () => {
  for (const start of [{ row: 0, col: 0 }, { row: 7, col: 7 }, { row: 14, col: 14 }]) {
    const game = playStones([start])
    const choice = pureChoice(game)
    assert.ok(choice)
    assert.ok(Math.abs(choice.row - start.row) <= 2 && Math.abs(choice.col - start.col) <= 2)
    assert.equal(game.place(choice.row, choice.col), true)
  }
  const game = new GomokuGame()
  for (let i = 0; i < 40 && game.winner === 0 && !game.draw; i++) {
    const choice = pureChoice(game)
    assert.ok(choice)
    assert.equal(game.place(choice.row, choice.col), true)
  }
})

test('gomoku AI: accepts deeply frozen state without even temporary writes', () => {
  const game = playStones([4, 5, 7, 8].map(col => ({ row: 7, col })))
  for (const move of game.history) Object.freeze(move)
  Object.freeze(game.board)
  Object.freeze(game.history)
  Object.freeze(game.winningLine)
  Object.freeze(game)
  assert.deepEqual(pureChoice(game), { row: 7, col: 6 })
})
