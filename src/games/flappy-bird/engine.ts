export const WIDTH = 420
export const HEIGHT = 560
export const GROUND_Y = 508
export const BIRD_X = 112
export const BIRD_RADIUS = 13
export const PIPE_WIDTH = 64
export const PIPE_GAP = 158
export const PIPE_SPACING = 225
export const PIPE_SPEED = 145
export const GRAVITY = 1150
export const FLAP_VELOCITY = -350

export interface Pipe {
  id: number
  x: number
  gapY: number
  passed: boolean
}

const MIN_GAP_Y = 65 + PIPE_GAP / 2
const MAX_GAP_Y = GROUND_Y - 65 - PIPE_GAP / 2
const MAX_SUBSTEP = 1 / 240

export class FlappyBirdGame {
  status: 'ready' | 'playing' | 'paused' | 'over' = 'ready'
  score = 0
  elapsed = 0
  distance = 0
  bird = { y: GROUND_Y / 2, vy: 0 }
  pipes: Pipe[] = []

  private readonly random: () => number
  private nextPipeId = 0

  constructor(random: () => number = Math.random) {
    this.random = random
    this.restart()
  }

  restart(): void {
    this.status = 'ready'
    this.score = 0
    this.elapsed = 0
    this.distance = 0
    this.bird = { y: GROUND_Y / 2, vy: 0 }
    this.pipes = []
    this.nextPipeId = 0
    this.fillPipes()
  }

  flap(): void {
    if (this.status !== 'ready' && this.status !== 'playing') return
    this.status = 'playing'
    this.bird.vy = FLAP_VELOCITY
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused'
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'playing'
  }

  step(dt: number): void {
    if (this.status !== 'playing' || !Number.isFinite(dt) || dt <= 0) return
    if (this.collides()) {
      this.status = 'over'
      return
    }

    const duration = Math.min(dt, 0.05)
    const count = Math.ceil(duration / MAX_SUBSTEP)
    const interval = duration / count
    for (let index = 0; index < count; index++) {
      // Exact constant-acceleration integration avoids frame-rate-dependent drift.
      this.bird.y += this.bird.vy * interval + GRAVITY * interval * interval / 2
      this.bird.vy += GRAVITY * interval
      for (const pipe of this.pipes) pipe.x -= PIPE_SPEED * interval
      this.elapsed += interval
      this.distance += PIPE_SPEED * interval

      if (this.collides()) {
        this.status = 'over'
        return
      }
    }

    // Commit points only after the entire frame survives, including later substeps.
    for (const pipe of this.pipes) {
      if (!pipe.passed && pipe.x + PIPE_WIDTH < BIRD_X - BIRD_RADIUS) {
        pipe.passed = true
        this.score++
      }
    }
    this.pipes = this.pipes.filter(pipe => pipe.x + PIPE_WIDTH >= 0)
    this.fillPipes()
  }

  private fillPipes(): void {
    while (this.pipes.length < 3) {
      const previous = this.pipes[this.pipes.length - 1]
      const minimum = previous ? Math.max(MIN_GAP_Y, previous.gapY - 90) : MIN_GAP_Y
      const maximum = previous ? Math.min(MAX_GAP_Y, previous.gapY + 90) : MAX_GAP_Y
      this.pipes.push({
        id: this.nextPipeId++,
        x: previous ? previous.x + PIPE_SPACING : WIDTH + 55,
        gapY: minimum + this.random() * (maximum - minimum),
        passed: false,
      })
    }
  }

  private collides(): boolean {
    if (this.bird.y - BIRD_RADIUS <= 0 || this.bird.y + BIRD_RADIUS >= GROUND_Y) return true
    return this.pipes.some(pipe =>
      this.hitsRectangle(pipe.x, 0, pipe.gapY - PIPE_GAP / 2)
      || this.hitsRectangle(pipe.x, pipe.gapY + PIPE_GAP / 2, GROUND_Y),
    )
  }

  private hitsRectangle(x: number, top: number, bottom: number): boolean {
    const nearestX = Math.max(x, Math.min(BIRD_X, x + PIPE_WIDTH))
    const nearestY = Math.max(top, Math.min(this.bird.y, bottom))
    const dx = BIRD_X - nearestX
    const dy = this.bird.y - nearestY
    return dx * dx + dy * dy <= BIRD_RADIUS * BIRD_RADIUS
  }
}
