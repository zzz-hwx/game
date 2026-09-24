export const COLS = 28
export const ROWS = 22
export const CELL = 25
export const FOOD_EDGE_UNLOCK_SCORE = 100
export const FOOD_SAFE_MARGIN = 3

export const levels = {
  easy: { delay: 190, caption: '慢慢来，快乐不需要赶路' },
  normal: { delay: 130, caption: '不紧不慢，刚刚好' },
  hard: { delay: 80, caption: '全神贯注，挑战你的反应力' },
} as const

export type Level = keyof typeof levels
export type Direction = 'up' | 'down' | 'left' | 'right'
export type GameStatus = 'ready' | 'running' | 'paused' | 'over' | 'won'
export interface Point { x: number; y: number }
export interface SnakeState {
  snake: Point[]
  food: Point | null
  direction: Direction
  turns: Direction[]
  score: number
  status: GameStatus
}
export type TickResult = 'idle' | 'moved' | 'ate' | 'over' | 'won'

export const directions: Readonly<Record<Direction, Readonly<Point>>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export function createGame(): SnakeState {
  return {
    snake: [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }],
    food: { x: 18, y: 11 },
    direction: 'right',
    turns: [],
    score: 0,
    status: 'ready',
  }
}

export function startGame(game: SnakeState): void {
  Object.assign(game, createGame(), { status: 'running' })
}

export function queueTurn(game: SnakeState, name: Direction): boolean {
  if (game.status !== 'running' || game.turns.length >= 2) return false
  const current = directions[game.turns[game.turns.length - 1] ?? game.direction]
  const next = directions[name]
  if ((next.x === -current.x && next.y === -current.y)
    || (next.x === current.x && next.y === current.y)) return false
  game.turns.push(name)
  return true
}

export function spawnFood(snake: readonly Point[], score: number, random: () => number = Math.random): Point | null {
  const occupied = new Set(snake.map(part => part.y * COLS + part.x))
  const margin = score < FOOD_EDGE_UNLOCK_SCORE ? FOOD_SAFE_MARGIN : 0
  const available: Point[] = []
  for (let y = margin; y < ROWS - margin; y++) {
    for (let x = margin; x < COLS - margin; x++) {
      if (!occupied.has(y * COLS + x)) available.push({ x, y })
    }
  }
  if (!available.length) return null
  return available[Math.floor(random() * available.length)] ?? null
}

/** Advance one tick. The departing tail is safe unless this move eats food. */
export function tick(game: SnakeState, random: () => number = Math.random): TickResult {
  if (game.status !== 'running') return 'idle'
  const previousHead = game.snake[0]
  if (!previousHead) return 'idle'
  game.direction = game.turns.shift() ?? game.direction
  const movement = directions[game.direction]
  const head = { x: previousHead.x + movement.x, y: previousHead.y + movement.y }
  const eating = game.food !== null && head.x === game.food.x && head.y === game.food.y
  const body = eating ? game.snake : game.snake.slice(0, -1)
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS
    || body.some(part => part.x === head.x && part.y === head.y)) {
    game.status = 'over'
    return 'over'
  }
  game.snake.unshift(head)
  if (!eating) {
    game.snake.pop()
    return 'moved'
  }
  game.score += 10
  game.food = spawnFood(game.snake, game.score, random)
  if (!game.food) {
    game.status = 'won'
    return 'won'
  }
  return 'ate'
}

export interface Preferences { best: number; level: Level; sound: boolean }

export function parsePreferences(raw: string | null): Preferences {
  const defaults: Preferences = { best: 0, level: 'normal', sound: false }
  try {
    const saved: unknown = JSON.parse(raw ?? 'null')
    if (!saved || typeof saved !== 'object') return defaults
    const value = saved as Record<string, unknown>
    return {
      best: typeof value.best === 'number' && Number.isSafeInteger(value.best) && value.best >= 0 ? value.best : 0,
      level: value.level === 'easy' || value.level === 'normal' || value.level === 'hard' ? value.level : 'normal',
      sound: value.sound === true,
    }
  } catch {
    return defaults
  }
}
