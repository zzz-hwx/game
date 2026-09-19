export const levels = {
  easy: { name: '初级', rows: 9, cols: 9, mines: 10 },
  normal: { name: '中级', rows: 16, cols: 16, mines: 40 },
  hard: { name: '高级', rows: 16, cols: 30, mines: 99 },
} as const;

export type Level = keyof typeof levels;
export type Status = 'ready' | 'playing' | 'won' | 'lost';
export interface Cell {
  mine: boolean;
  adjacent: number;
  revealed: boolean;
  flagged: boolean;
  exploded: boolean;
}
export interface Game {
  level: Level;
  rows: number;
  cols: number;
  mines: number;
  cells: Cell[];
  status: Status;
  revealedCount: number;
}

export function createGame(level: Level = 'easy'): Game {
  const { rows, cols, mines } = levels[level];
  return {
    level, rows, cols, mines, status: 'ready', revealedCount: 0,
    cells: Array.from({ length: rows * cols }, () => ({
      mine: false, adjacent: 0, revealed: false, flagged: false, exploded: false,
    })),
  };
}

export function neighbors(game: Game, index: number): number[] {
  const row = Math.floor(index / game.cols);
  const col = index % game.cols;
  const result: number[] = [];
  for (let y = Math.max(0, row - 1); y <= Math.min(game.rows - 1, row + 1); y++) {
    for (let x = Math.max(0, col - 1); x <= Math.min(game.cols - 1, col + 1); x++) {
      const next = y * game.cols + x;
      if (next !== index) result.push(next);
    }
  }
  return result;
}

function plantMines(game: Game, first: number, random: () => number): void {
  const safe = new Set([first, ...neighbors(game, first)]);
  const candidates = game.cells.map((_, index) => index).filter((index) => !safe.has(index));
  for (let i = 0; i < game.mines; i++) {
    const pick = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[pick]] = [candidates[pick], candidates[i]];
    game.cells[candidates[i]].mine = true;
  }
  game.cells.forEach((cell, index) => {
    cell.adjacent = neighbors(game, index).filter((next) => game.cells[next].mine).length;
  });
  game.status = 'playing';
}

function uncover(game: Game, index: number): void {
  const pending = [index];
  while (pending.length > 0 && game.status === 'playing') {
    const current = pending.pop()!;
    const cell = game.cells[current];
    if (cell.revealed || cell.flagged) continue;
    cell.revealed = true;
    if (cell.mine) {
      cell.exploded = true;
      game.status = 'lost';
      for (const tile of game.cells) if (tile.mine) tile.revealed = true;
      return;
    }
    game.revealedCount += 1;
    if (cell.adjacent === 0) pending.push(...neighbors(game, current));
  }
  if (game.status === 'playing' && game.revealedCount === game.cells.length - game.mines) {
    game.status = 'won';
    for (const cell of game.cells) if (cell.mine) cell.flagged = true;
  }
}

export function reveal(game: Game, index: number, random: () => number = Math.random): boolean {
  const cell = game.cells[index];
  if (!cell || cell.flagged || cell.revealed || game.status === 'won' || game.status === 'lost') return false;
  if (game.status === 'ready') plantMines(game, index, random);
  uncover(game, index);
  return true;
}

export function toggleFlag(game: Game, index: number): boolean {
  const cell = game.cells[index];
  if (!cell || cell.revealed || game.status === 'won' || game.status === 'lost') return false;
  cell.flagged = !cell.flagged;
  return true;
}

export function chord(game: Game, index: number): boolean {
  const cell = game.cells[index];
  if (!cell || !cell.revealed || cell.adjacent === 0 || game.status !== 'playing') return false;
  const around = neighbors(game, index);
  if (around.filter((next) => game.cells[next].flagged).length !== cell.adjacent) return false;
  const targets = around.filter((next) => !game.cells[next].flagged && !game.cells[next].revealed);
  for (const next of targets) {
    if (game.status !== 'playing') break;
    uncover(game, next);
  }
  return targets.length > 0;
}
