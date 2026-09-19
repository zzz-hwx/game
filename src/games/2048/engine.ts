export type Direction = 'left' | 'right' | 'up' | 'down';
export type GameState = 'playing' | 'won' | 'over';
export interface Motion { from: number; to: number; value: number }
export interface MoveResult {
  changed: boolean;
  gained: number;
  merged: number[];
  spawned: number | null;
  motions: Motion[];
}
interface Snapshot {
  board: number[];
  score: number;
  moves: number;
  continued: boolean;
}
export const STORAGE_KEY = 'little-break-2048';

export function canMove(board: number[]): boolean {
  return board.some((value, index) => value === 0
    || (index % 4 < 3 && value === board[index + 1])
    || (index < 12 && value === board[index + 4]));
}

export function slide(board: number[], direction: Direction): Omit<MoveResult, 'spawned'> & { board: number[] } {
  const next = Array<number>(16).fill(0);
  const merged: number[] = [];
  const motions: Motion[] = [];
  let gained = 0;
  for (let line = 0; line < 4; line++) {
    const indices = Array.from({ length: 4 }, (_, offset) => {
      if (direction === 'left') return line * 4 + offset;
      if (direction === 'right') return line * 4 + 3 - offset;
      if (direction === 'up') return offset * 4 + line;
      return (3 - offset) * 4 + line;
    });
    const occupied = indices.filter((index) => board[index] !== 0);
    let destination = 0;
    for (let source = 0; source < occupied.length; source++) {
      const from = occupied[source];
      const to = indices[destination++];
      const value = board[from];
      motions.push({ from, to, value });
      if (source + 1 < occupied.length && value === board[occupied[source + 1]]) {
        motions.push({ from: occupied[++source], to, value });
        next[to] = value * 2;
        gained += next[to];
        merged.push(to);
      } else {
        next[to] = value;
      }
    }
  }
  return { board: next, changed: next.some((value, index) => value !== board[index]), gained, merged, motions };
}

export class Game2048 {
  board = Array<number>(16).fill(0);
  score = 0;
  moves = 0;
  continued = false;
  previous: Snapshot | null = null;

  constructor(private random: () => number = Math.random) { this.restart(); }

  get maxTile(): number { return Math.max(...this.board); }
  get state(): GameState {
    if (!this.continued && this.maxTile >= 2048) return 'won';
    return canMove(this.board) ? 'playing' : 'over';
  }

  restart(): void {
    this.board = Array<number>(16).fill(0);
    this.score = 0;
    this.moves = 0;
    this.continued = false;
    this.previous = null;
    this.spawn();
    this.spawn();
  }

  private spawn(): number | null {
    const empty = this.board.flatMap((value, index) => value === 0 ? [index] : []);
    if (!empty.length) return null;
    const index = empty[Math.floor(this.random() * empty.length)];
    this.board[index] = this.random() < 0.9 ? 2 : 4;
    return index;
  }

  move(direction: Direction): MoveResult {
    const unchanged: MoveResult = { changed: false, gained: 0, merged: [], spawned: null, motions: [] };
    if (this.state !== 'playing') return unchanged;
    const result = slide(this.board, direction);
    if (!result.changed) return unchanged;
    this.previous = { board: [...this.board], score: this.score, moves: this.moves, continued: this.continued };
    this.board = result.board;
    this.score += result.gained;
    this.moves++;
    const spawned = this.spawn();
    return { changed: true, gained: result.gained, merged: result.merged, motions: result.motions, spawned };
  }

  undo(): boolean {
    if (!this.previous) return false;
    this.board = [...this.previous.board];
    this.score = this.previous.score;
    this.moves = this.previous.moves;
    this.continued = this.previous.continued;
    this.previous = null;
    return true;
  }

  keepPlaying(): void {
    if (this.state === 'won') this.continued = true;
  }

  serialize(best: number): string {
    return JSON.stringify({ version: 1, board: this.board, score: this.score, moves: this.moves, continued: this.continued, best });
  }

  restore(raw: string | null): number {
    if (!raw) return 0;
    try {
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== 'object' || saved.version !== 1) return 0;
      const best = Number.isSafeInteger(saved.best) && saved.best >= 0 ? saved.best : 0;
      const validBoard = Array.isArray(saved.board) && saved.board.length === 16
        && saved.board.every((value: unknown) => typeof value === 'number' && Number.isSafeInteger(value)
          && (value === 0 || (value >= 2 && 2 ** Math.round(Math.log2(value)) === value)))
        && saved.board.filter((value: number) => value > 0).length >= 2;
      if (!validBoard || !Number.isSafeInteger(saved.score) || saved.score < 0
        || !Number.isSafeInteger(saved.moves) || saved.moves < 0 || typeof saved.continued !== 'boolean') return best;
      this.board = [...saved.board];
      this.score = saved.score;
      this.moves = saved.moves;
      this.continued = saved.continued;
      this.previous = null;
      return Math.max(best, this.score);
    } catch {
      return 0;
    }
  }
}
