export const BOARD_SIZE = 15

export type Player = 1 | 2
export type Cell = 0 | Player

export interface Move {
  row: number
  col: number
  player: Player
}

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 0], [1, 1], [1, -1],
]

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE
}

function otherPlayer(player: Player): Player {
  return player === 1 ? 2 : 1
}

// The center can be an existing stone or a hypothetical move; never write to board.
function inspectLine(
  board: readonly Cell[], row: number, col: number, player: Player,
  dr: number, dc: number,
): { indices: number[]; openEnds: number } {
  const before: number[] = []
  const after: number[] = []
  let openEnds = 0

  for (const sign of [-1, 1]) {
    let r = row + dr * sign
    let c = col + dc * sign
    const indices = sign === -1 ? before : after
    while (inBounds(r, c) && board[r * BOARD_SIZE + c] === player) {
      indices.push(r * BOARD_SIZE + c)
      r += dr * sign
      c += dc * sign
    }
    if (inBounds(r, c) && board[r * BOARD_SIZE + c] === 0) openEnds++
  }

  return {
    indices: [...before.reverse(), row * BOARD_SIZE + col, ...after],
    openEnds,
  }
}

export class GomokuGame {
  board: Cell[] = Array<Cell>(BOARD_SIZE * BOARD_SIZE).fill(0)
  history: Move[] = []
  currentPlayer: Player = 1
  winner: Cell = 0
  draw = false
  winningLine: number[] = []

  place(row: number, col: number): boolean {
    if (this.winner !== 0 || this.draw || !Number.isInteger(row)
      || !Number.isInteger(col) || !inBounds(row, col)) return false

    const index = row * BOARD_SIZE + col
    if (this.board[index] !== 0) return false

    const player = this.currentPlayer
    this.board[index] = player
    this.history.push({ row, col, player })

    for (const [dr, dc] of DIRECTIONS) {
      const { indices } = inspectLine(this.board, row, col, player, dr, dc)
      if (indices.length >= 5) {
        this.winner = player
        this.winningLine = indices
        break
      }
    }
    this.draw = this.winner === 0 && this.board.every(cell => cell !== 0)
    this.currentPlayer = otherPlayer(player)
    return true
  }

  undo(steps = 1): boolean {
    if (!Number.isInteger(steps) || steps <= 0 || this.history.length === 0) return false

    const removed = this.history.splice(Math.max(0, this.history.length - steps))
    for (const { row, col } of removed) this.board[row * BOARD_SIZE + col] = 0
    this.currentPlayer = removed[0].player
    this.winner = 0
    this.draw = false
    this.winningLine = []
    return true
  }

  reset(): void {
    this.board = Array<Cell>(BOARD_SIZE * BOARD_SIZE).fill(0)
    this.history = []
    this.currentPlayer = 1
    this.winner = 0
    this.draw = false
    this.winningLine = []
  }
}

function hasNeighbor(board: readonly Cell[], row: number, col: number): boolean {
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const r = row + dr
      const c = col + dc
      if (inBounds(r, c) && board[r * BOARD_SIZE + c] !== 0) return true
    }
  }
  return false
}

function evaluateMove(
  board: readonly Cell[], row: number, col: number, player: Player,
): { wins: boolean; score: number } {
  let score = 0
  for (const [dr, dc] of DIRECTIONS) {
    const { indices, openEnds } = inspectLine(board, row, col, player, dr, dc)
    const length = indices.length
    if (length >= 5) return { wins: true, score: 1_000_000 }
    if (openEnds === 0) continue
    // Favor open fours, then open threes, while still valuing one-ended threats.
    const base = length === 4 ? 10_000 : length === 3 ? 1_000 : length === 2 ? 100 : 10
    score += base * (openEnds === 2 ? 10 : 1)
  }
  return { wins: false, score }
}

export function chooseComputerMove(game: GomokuGame): { row: number; col: number } | null {
  if (game.winner !== 0 || game.draw) return null

  const center = Math.floor(BOARD_SIZE / 2)
  if (game.board.every(cell => cell === 0)) return { row: center, col: center }

  let best: { row: number; col: number } | null = null
  let bestPriority = -1
  let bestScore = -Infinity
  let bestDistance = Infinity

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (game.board[row * BOARD_SIZE + col] !== 0 || !hasNeighbor(game.board, row, col)) continue

      const attack = evaluateMove(game.board, row, col, game.currentPlayer)
      const defense = evaluateMove(game.board, row, col, otherPlayer(game.currentPlayer))
      const priority = attack.wins ? 2 : defense.wins ? 1 : 0
      const score = attack.score + defense.score * 0.9
      const distance = (row - center) ** 2 + (col - center) ** 2
      // Row-major traversal breaks remaining ties deterministically.
      if (priority > bestPriority
        || (priority === bestPriority && (score > bestScore
          || (score === bestScore && distance < bestDistance)))) {
        best = { row, col }
        bestPriority = priority
        bestScore = score
        bestDistance = distance
      }
    }
  }

  return best
}
