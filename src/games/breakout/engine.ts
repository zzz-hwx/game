export const WIDTH = 480
export const HEIGHT = 560
export const BALL_RADIUS = 7
export const PADDLE_WIDTH = 96
export const PADDLE_HEIGHT = 12
export const PADDLE_Y = 514
export const MAX_LEVELS = 3

export interface Brick {
  id: number
  x: number
  y: number
  width: number
  height: number
  hp: number
  maxHp: number
  row: number
}

const PADDLE_SPEED = 420
const MAX_BALL_SPEED = 480
const MAX_STEP = 1 / 240
const EPSILON = 0.0001

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export class BreakoutGame {
  status: 'ready' | 'playing' | 'paused' | 'life-lost' | 'won' | 'over' = 'ready'
  score = 0
  lives = 3
  level = 1
  paddleX = WIDTH / 2
  ball = { x: WIDTH / 2, y: PADDLE_Y - BALL_RADIUS, vx: 0, vy: 0 }
  bricks: Brick[] = this.createBricks()

  get remaining(): number {
    return this.bricks.filter(brick => brick.hp > 0).length
  }

  get total(): number {
    return this.bricks.length
  }

  start(): void {
    if (this.status === 'paused') {
      this.status = 'playing'
      return
    }
    if (this.status !== 'ready' && this.status !== 'life-lost') return
    const speed = 300 + (this.level - 1) * 40
    this.ball.vx = speed * 0.22
    this.ball.vy = -Math.sqrt(speed * speed - this.ball.vx * this.ball.vx)
    this.status = 'playing'
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused'
  }

  restart(): void {
    this.status = 'ready'
    this.score = 0
    this.lives = 3
    this.level = 1
    this.paddleX = WIDTH / 2
    this.bricks = this.createBricks()
    this.resetBall()
  }

  nextLevel(): void {
    if (this.status !== 'won' || this.level >= MAX_LEVELS) return
    this.level++
    this.status = 'ready'
    this.paddleX = WIDTH / 2
    this.bricks = this.createBricks()
    this.resetBall()
  }

  movePaddle(x: number): void {
    if (this.status !== 'ready' && this.status !== 'playing' && this.status !== 'life-lost') return
    if (!Number.isFinite(x)) return
    this.paddleX = clamp(x, PADDLE_WIDTH / 2, WIDTH - PADDLE_WIDTH / 2)
    if (this.status !== 'playing') this.resetBall()
  }

  step(dt: number, direction: -1 | 0 | 1 = 0): void {
    if (!Number.isFinite(dt) || dt <= 0) return
    const duration = Math.min(dt, 0.05)
    if (this.status === 'ready' || this.status === 'life-lost') {
      this.movePaddle(this.paddleX + direction * PADDLE_SPEED * duration)
      return
    }
    if (this.status !== 'playing') return
    const steps = Math.ceil(duration / MAX_STEP)
    const interval = duration / steps
    for (let i = 0; i < steps && this.status === 'playing'; i++) {
      const previousPaddleX = this.paddleX
      this.movePaddle(this.paddleX + direction * PADDLE_SPEED * interval)
      this.advanceBall(interval, previousPaddleX)
    }
  }

  private createBricks(): Brick[] {
    const bricks: Brick[] = []
    const columns = 8
    const gap = 8
    const width = (WIDTH - 48 - (columns - 1) * gap) / columns
    for (let row = 0; row < this.level + 4; row++) {
      const hp = this.level > 1 && row < this.level ? 2 : 1
      for (let column = 0; column < columns; column++) {
        bricks.push({
          id: row * columns + column,
          x: 24 + column * (width + gap),
          y: 62 + row * (20 + gap),
          width,
          height: 20,
          hp,
          maxHp: hp,
          row,
        })
      }
    }
    return bricks
  }

  private resetBall(): void {
    this.ball.x = this.paddleX
    this.ball.y = PADDLE_Y - BALL_RADIUS
    this.ball.vx = 0
    this.ball.vy = 0
  }

  private advanceBall(dt: number, previousPaddleX: number): void {
    const previousX = this.ball.x
    const previousY = this.ball.y
    this.ball.x += this.ball.vx * dt
    this.ball.y += this.ball.vy * dt
    this.bouncePaddle(previousX, previousY, previousPaddleX, dt)
    this.bounceWalls()
    for (const brick of this.bricks) {
      if (brick.hp > 0 && this.hitBrick(brick) && this.remaining === 0) {
        this.score += 100
        this.status = 'won'
        return
      }
    }
    if (this.ball.y - BALL_RADIUS >= HEIGHT) {
      this.lives--
      if (this.lives > 0) {
        this.status = 'life-lost'
        this.resetBall()
      } else {
        this.status = 'over'
        this.ball.vx = 0
        this.ball.vy = 0
      }
    }
  }

  private bounceWalls(): void {
    if (this.ball.x < BALL_RADIUS) {
      this.ball.x = BALL_RADIUS
      if (this.ball.vx < 0) this.ball.vx = -this.ball.vx
    } else if (this.ball.x > WIDTH - BALL_RADIUS) {
      this.ball.x = WIDTH - BALL_RADIUS
      if (this.ball.vx > 0) this.ball.vx = -this.ball.vx
    }
    if (this.ball.y < BALL_RADIUS) {
      this.ball.y = BALL_RADIUS
      if (this.ball.vy < 0) this.ball.vy = -this.ball.vy
    }
  }

  private bouncePaddle(previousX: number, previousY: number, previousPaddleX: number, dt: number): void {
    const plane = PADDLE_Y - BALL_RADIUS
    if (this.ball.vy <= 0 || previousY > plane || this.ball.y < plane) return
    const fraction = (plane - previousY) / (this.ball.y - previousY)
    const hitX = previousX + (this.ball.x - previousX) * fraction
    const paddleX = previousPaddleX + (this.paddleX - previousPaddleX) * fraction
    const offset = (hitX - paddleX) / (PADDLE_WIDTH / 2)
    if (Math.abs(offset) > 1) return
    let angle = offset * Math.PI / 3
    if (Math.abs(angle) < 0.06) angle = Math.sign(angle || this.ball.vx || 1) * 0.06
    const speed = Math.min(MAX_BALL_SPEED, Math.hypot(this.ball.vx, this.ball.vy))
    this.ball.vx = speed * Math.sin(angle)
    this.ball.vy = -speed * Math.cos(angle)
    const remainder = dt * (1 - fraction)
    this.ball.x = hitX + this.ball.vx * remainder
    this.ball.y = plane - EPSILON + this.ball.vy * remainder
  }

  private hitBrick(brick: Brick): boolean {
    const closestX = clamp(this.ball.x, brick.x, brick.x + brick.width)
    const closestY = clamp(this.ball.y, brick.y, brick.y + brick.height)
    const dx = this.ball.x - closestX
    const dy = this.ball.y - closestY
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared > BALL_RADIUS * BALL_RADIUS) return false
    let nx: number
    let ny: number
    let penetration: number
    if (distanceSquared > 0) {
      const distance = Math.sqrt(distanceSquared)
      nx = dx / distance
      ny = dy / distance
      penetration = BALL_RADIUS - distance
    } else {
      const faces = [
        { distance: this.ball.x - brick.x, nx: -1, ny: 0 },
        { distance: brick.x + brick.width - this.ball.x, nx: 1, ny: 0 },
        { distance: this.ball.y - brick.y, nx: 0, ny: -1 },
        { distance: brick.y + brick.height - this.ball.y, nx: 0, ny: 1 },
      ]
      const face = faces.reduce((nearest, candidate) => candidate.distance < nearest.distance ? candidate : nearest)
      nx = face.nx
      ny = face.ny
      penetration = BALL_RADIUS + face.distance
    }
    this.ball.x += nx * (penetration + EPSILON)
    this.ball.y += ny * (penetration + EPSILON)
    const approach = this.ball.vx * nx + this.ball.vy * ny
    if (approach >= 0) return false
    this.ball.vx -= 2 * approach * nx
    this.ball.vy -= 2 * approach * ny
    const speed = Math.hypot(this.ball.vx, this.ball.vy)
    const scale = Math.min(MAX_BALL_SPEED, speed + 5) / speed
    this.ball.vx *= scale
    this.ball.vy *= scale
    brick.hp--
    this.score += 10
    return true
  }
}
