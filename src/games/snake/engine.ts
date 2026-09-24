export const COLS = 28
export const ROWS = 22
export const CELL = 25
export const FOOD_EDGE_UNLOCK_SCORE = 100
export const FOOD_SAFE_MARGIN = 3
export const INITIAL_LIVES = 3
export const FOOD_LIFETIME_MS = 10_000
export const EFFECT_DURATION_MS = 6_000
export const MIN_SNAKE_LENGTH = 3
export const SHRINK_CELLS = 3
export const OBSTACLES: readonly Readonly<Point>[] = [6, 15].flatMap(y =>
  [6, 7, 8, 9, 18, 19, 20, 21].map(x => ({ x, y })),
)
export const foodTypes = {
  apple: { label: '红果', points: 10, color: '#cc7b5e', symbol: '●', description: '长大 1 格' },
  golden: { label: '金果', points: 30, color: '#a37a24', symbol: '◆', description: '长大 1 格' },
  speed: { label: '疾速果', points: 20, color: '#b66c34', symbol: '»', description: '加速 6 秒 · 长大 1 格' },
  slow: { label: '冰霜果', points: 15, color: '#447f99', symbol: 'Ⅱ', description: '减速 6 秒 · 长大 1 格' },
  shrink: { label: '轻盈果', points: 25, color: '#8564a2', symbol: '−', description: '缩短 3 格 · 最短 3 格' },
} as const
const foodDistribution: readonly FoodKind[] = ['apple', 'apple', 'apple', 'apple', 'golden', 'golden', 'speed', 'slow', 'shrink', 'shrink']

export const levels = {
  easy: { delay: 190, caption: '慢慢来，快乐不需要赶路' },
  normal: { delay: 130, caption: '不紧不慢，刚刚好' },
  hard: { delay: 80, caption: '全神贯注，挑战你的反应力' },
} as const

export type Level = keyof typeof levels
export type Direction = 'up' | 'down' | 'left' | 'right'
export type GameStatus = 'ready' | 'running' | 'paused' | 'recovering' | 'over' | 'won'
export interface Point { x: number; y: number }
export type FoodKind = keyof typeof foodTypes
export interface Food extends Point { kind: FoodKind; remainingMs: number }
export interface SpeedEffect { kind: 'speed' | 'slow'; remainingMs: number }
export type Collision = 'wall' | 'body' | 'obstacle'
export interface SnakeState {
  snake: Point[]
  obstacles: Point[]
  food: Food | null
  direction: Direction
  turns: Direction[]
  score: number
  lives: number
  effect: SpeedEffect | null
  collision: Collision | null
  status: GameStatus
}
export type TickResult = 'idle' | 'moved' | 'ate' | 'life-lost' | 'over' | 'won'

export const directions: Readonly<Record<Direction, Readonly<Point>>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

function initialSnake(): Point[] {
  return [{ x: 8, y: 11 }, { x: 7, y: 11 }, { x: 6, y: 11 }, { x: 5, y: 11 }]
}

export function createGame(): SnakeState {
  return {
    snake: initialSnake(),
    obstacles: OBSTACLES.map(point => ({ ...point })),
    food: { x: 18, y: 11, kind: 'apple', remainingMs: FOOD_LIFETIME_MS },
    direction: 'right',
    turns: [],
    score: 0,
    lives: INITIAL_LIVES,
    effect: null,
    collision: null,
    status: 'ready',
  }
}

export function startGame(game: SnakeState): void {
  Object.assign(game, createGame(), { status: 'running' })
}

export function resumeGame(game: SnakeState): void {
  if (game.status !== 'paused' && game.status !== 'recovering') return
  game.status = 'running'
  game.collision = null
}

export function getMoveDelay(game: SnakeState, level: Level): number {
  const multiplier = game.effect?.kind === 'speed' ? 0.7 : game.effect?.kind === 'slow' ? 1.4 : 1
  return Math.round(levels[level].delay * multiplier)
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

export function spawnFood(
  game: Pick<SnakeState, 'snake' | 'obstacles' | 'score'>,
  random: () => number = Math.random,
  previous?: Point,
): Food | null {
  const occupied = new Set([...game.snake, ...game.obstacles].map(part => part.y * COLS + part.x))
  const available: Point[] = []
  const central: Point[] = []
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (occupied.has(y * COLS + x)) continue
      const point = { x, y }
      available.push(point)
      if (x >= FOOD_SAFE_MARGIN && x < COLS - FOOD_SAFE_MARGIN
        && y >= FOOD_SAFE_MARGIN && y < ROWS - FOOD_SAFE_MARGIN) central.push(point)
    }
  }
  const candidates = game.score < FOOD_EDGE_UNLOCK_SCORE && central.length ? central : available
  if (!candidates.length) return null
  const alternatives = previous ? candidates.filter(point => !samePoint(point, previous)) : candidates
  const cells = alternatives.length ? alternatives : candidates
  const position = cells[Math.floor(random() * cells.length)]!
  const kind = foodDistribution[Math.floor(random() * foodDistribution.length)]!
  return { ...position, kind, remainingMs: FOOD_LIFETIME_MS }
}

function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y
}

export function advanceTime(game: SnakeState, elapsedMs: number, random: () => number = Math.random): void {
  if (game.status !== 'running') return
  if (game.effect) {
    game.effect.remainingMs -= elapsedMs
    if (game.effect.remainingMs <= 0) game.effect = null
  }
  if (game.food) {
    game.food.remainingMs -= elapsedMs
    if (game.food.remainingMs <= 0) {
      game.food = spawnFood(game, random, game.food)
      if (!game.food) game.status = 'won'
    }
  }
}

function loseLife(game: SnakeState, collision: Collision, random: () => number): TickResult {
  game.lives--
  game.collision = collision
  game.effect = null
  game.turns = []
  if (game.lives === 0) {
    game.status = 'over'
    return 'over'
  }
  game.snake = initialSnake()
  game.direction = 'right'
  if (game.food && game.snake.some(part => samePoint(part, game.food!))) game.food = spawnFood(game, random)
  game.status = 'recovering'
  return 'life-lost'
}

export function tick(game: SnakeState, random: () => number = Math.random): TickResult {
  if (game.status !== 'running') return 'idle'
  const previousHead = game.snake[0]
  if (!previousHead) return 'idle'
  game.direction = game.turns.shift() ?? game.direction
  const movement = directions[game.direction]
  const head = { x: previousHead.x + movement.x, y: previousHead.y + movement.y }
  const eaten = game.food && samePoint(head, game.food) ? game.food : null
  const body = eaten && eaten.kind !== 'shrink' ? game.snake : game.snake.slice(0, -1)
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) return loseLife(game, 'wall', random)
  if (game.obstacles.some(part => samePoint(part, head))) return loseLife(game, 'obstacle', random)
  if (body.some(part => samePoint(part, head))) return loseLife(game, 'body', random)
  game.snake.unshift(head)
  if (!eaten) {
    game.snake.pop()
    return 'moved'
  }
  game.score += foodTypes[eaten.kind].points
  if (eaten.kind === 'shrink') {
    game.snake.length = Math.max(MIN_SNAKE_LENGTH, game.snake.length - 1 - SHRINK_CELLS)
  } else if (eaten.kind === 'speed' || eaten.kind === 'slow') {
    game.effect = { kind: eaten.kind, remainingMs: EFFECT_DURATION_MS }
  }
  game.food = spawnFood(game, random)
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
