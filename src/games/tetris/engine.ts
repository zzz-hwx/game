export const COLS = 10;
export const ROWS = 20;

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Matrix = number[][];
export type Board = (PieceType | null)[][];
export type GameState = 'ready' | 'running' | 'paused' | 'over';
export interface Piece {
  type: PieceType;
  matrix: Matrix;
  x: number;
  y: number;
}

export const SHAPES: Record<PieceType, Matrix> = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};

export class Tetris {
  random: () => number;
  board!: Board;
  queue!: PieceType[];
  active!: Piece;
  score!: number;
  lines!: number;
  level!: number;
  held!: PieceType | null;
  canHold!: boolean;
  lastClear!: number;
  state!: GameState;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.reset();
  }

  reset(): void {
    this.board = Array.from({ length: ROWS }, () => Array<PieceType | null>(COLS).fill(null));
    this.queue = [];
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.held = null;
    this.canHold = true;
    this.lastClear = 0;
    this.state = 'ready';
    this.spawn();
  }

  refill(): void {
    while (this.queue.length < 7) {
      const bag = Object.keys(SHAPES) as PieceType[];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j]!, bag[i]!];
      }
      this.queue.push(...bag);
    }
  }

  spawn(type?: PieceType): void {
    this.refill();
    const next = type ?? this.queue.shift()!;
    const matrix = SHAPES[next].map(row => [...row]);
    this.active = { type: next, matrix, x: Math.floor((COLS - matrix.length) / 2), y: 0 };
    this.refill();
    if (this.collides()) this.state = 'over';
  }

  start(): void {
    if (this.state === 'ready' || this.state === 'paused') this.state = 'running';
  }

  pause(): void {
    if (this.state === 'running') this.state = 'paused';
  }

  collides(piece: Piece = this.active, dx = 0, dy = 0): boolean {
    return piece.matrix.some((row, y) => row.some((cell, x) => {
      if (!cell) return false;
      const bx = piece.x + x + dx;
      const by = piece.y + y + dy;
      return bx < 0 || bx >= COLS || by >= ROWS || (by >= 0 && Boolean(this.board[by]![bx]));
    }));
  }

  move(dx: number): boolean {
    if (this.state !== 'running' || this.collides(this.active, dx, 0)) return false;
    this.active.x += dx;
    return true;
  }

  rotate(): boolean {
    if (this.state !== 'running') return false;
    if (this.active.type === 'O') return true;
    const matrix = this.active.matrix[0]!.map((_, x) => this.active.matrix.map(row => row[x]!).reverse());
    const rotated = { ...this.active, matrix };
    const kicks: [number, number][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1], [0, -2]];
    for (const [dx, dy] of kicks) {
      if (!this.collides(rotated, dx, dy)) {
        this.active = { ...rotated, x: rotated.x + dx, y: rotated.y + dy };
        return true;
      }
    }
    return false;
  }

  step(soft = false): boolean {
    if (this.state !== 'running') return false;
    this.lastClear = 0;
    if (!this.collides(this.active, 0, 1)) {
      this.active.y++;
      if (soft) this.score++;
    } else {
      this.lock();
    }
    return true;
  }

  ghostY(): number {
    let distance = 0;
    while (!this.collides(this.active, 0, distance + 1)) distance++;
    return this.active.y + distance;
  }

  hardDrop(): boolean {
    if (this.state !== 'running') return false;
    const y = this.ghostY();
    this.score += (y - this.active.y) * 2;
    this.active.y = y;
    this.lock();
    return true;
  }

  lock(): void {
    let aboveTop = false;
    this.active.matrix.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell) return;
      const by = this.active.y + y;
      if (by < 0) aboveTop = true;
      else this.board[by]![this.active.x + x] = this.active.type;
    }));
    if (aboveTop) {
      this.state = 'over';
      return;
    }
    const remaining = this.board.filter(row => row.some(cell => !cell));
    this.lastClear = ROWS - remaining.length;
    this.score += [0, 100, 300, 500, 800][this.lastClear]! * this.level;
    this.lines += this.lastClear;
    this.level = Math.floor(this.lines / 10) + 1;
    this.board = [...Array.from({ length: this.lastClear }, () => Array<PieceType | null>(COLS).fill(null)), ...remaining];
    this.canHold = true;
    this.spawn();
  }

  hold(): boolean {
    if (this.state !== 'running' || !this.canHold) return false;
    const previous = this.held;
    this.held = this.active.type;
    this.spawn(previous ?? undefined);
    this.canHold = false;
    return true;
  }

  get interval(): number {
    return Math.max(85, 850 * Math.pow(0.82, this.level - 1));
  }
}
