export type Cell = number | null;
export type Board = Cell[][];
export type ReadonlyBoard = readonly (readonly Cell[])[];

export interface Point {
  row: number;
  col: number;
}

export interface Move {
  start: Point;
  end: Point;
  path: Point[];
}

interface SearchState extends Point {
  direction: number;
  turns: number;
  previous: SearchState | null;
}

const DIRECTIONS: readonly (readonly [number, number])[] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

function reconstructPath(state: SearchState): Point[] {
  const path = [{ row: state.row, col: state.col }];
  while (state.previous) {
    const previous = state.previous;
    if (previous.direction !== state.direction) {
      path.push({ row: previous.row, col: previous.col });
    }
    state = previous;
  }
  return path.reverse();
}

export function findPath(
  board: ReadonlyBoard,
  start: Readonly<Point> | null | undefined,
  end: Readonly<Point> | null | undefined,
): Point[] | null {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const isCell = (point: Readonly<Point> | null | undefined): point is Readonly<Point> =>
    point != null && Number.isInteger(point.row)
    && Number.isInteger(point.col) && point.row >= 0 && point.row < rows
    && point.col >= 0 && point.col < cols;

  if (!isCell(start) || !isCell(end)
    || (start.row === end.row && start.col === end.col)
    || board[start.row][start.col] === null
    || board[start.row][start.col] !== board[end.row][end.col]) {
    return null;
  }

  const width = cols + 2;
  const minimumTurns = new Uint8Array((rows + 2) * width * 4).fill(3);
  const indexOf = (row: number, col: number, direction: number): number =>
    ((row + 1) * width + col + 1) * 4 + direction;
  const queue: SearchState[] = [
    { row: start.row, col: start.col, direction: -1, turns: 0, previous: null },
  ];

  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head];
    if (state.direction !== -1
      && state.turns > minimumTurns[indexOf(state.row, state.col, state.direction)]) {
      continue;
    }

    for (let direction = 0; direction < DIRECTIONS.length; direction += 1) {
      if (state.direction !== -1 && direction === (state.direction + 2) % 4) continue;
      const turns = state.turns + Number(state.direction !== -1 && direction !== state.direction);
      if (turns > 2) continue;

      const row = state.row + DIRECTIONS[direction][0];
      const col = state.col + DIRECTIONS[direction][1];
      if (row < -1 || row > rows || col < -1 || col > cols) continue;

      const isEnd = row === end.row && col === end.col;
      if (!isEnd && row >= 0 && row < rows && col >= 0 && col < cols
        && board[row][col] !== null) continue;

      const index = indexOf(row, col, direction);
      if (turns >= minimumTurns[index]) continue;
      minimumTurns[index] = turns;
      const next: SearchState = { row, col, direction, turns, previous: state };
      if (isEnd) return reconstructPath(next);
      queue.push(next);
    }
  }
  return null;
}

export function findMove(board: ReadonlyBoard): Move | null {
  const groups = new Map<number, Point[]>();
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[row].length; col += 1) {
      const type = board[row][col];
      if (type === null) continue;
      const cells = groups.get(type) ?? [];
      cells.push({ row, col });
      groups.set(type, cells);
    }
  }

  for (const cells of groups.values()) {
    for (let first = 0; first < cells.length; first += 1) {
      for (let second = first + 1; second < cells.length; second += 1) {
        const start = cells[first];
        const end = cells[second];
        const path = findPath(board, start, end);
        if (path) return { start, end, path };
      }
    }
  }
  return null;
}

export function applyGravity(board: ReadonlyBoard): Board {
  const result = board.map((row) => row.slice());
  for (let col = 0; col < (board[0]?.length ?? 0); col += 1) {
    let target = board.length - 1;
    for (let row = board.length - 1; row >= 0; row -= 1) {
      const type = board[row][col];
      if (type !== null) {
        result[target][col] = type;
        target -= 1;
      }
    }
    for (; target >= 0; target -= 1) result[target][col] = null;
  }
  return result;
}

export function createBoard(rows: number, cols: number, typeCount: number): Board {
  if (!Number.isSafeInteger(rows) || rows <= 0
    || !Number.isSafeInteger(cols) || cols <= 0
    || !Number.isSafeInteger(rows * cols) || (rows * cols) % 2 !== 0
    || !Number.isSafeInteger(typeCount) || typeCount <= 0) {
    throw new RangeError('Board dimensions must be positive integers with an even total, and typeCount must be positive.');
  }

  const board = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => Math.floor((row * cols + col) / 2) % typeCount));
  return shuffleBoard(board);
}

export function shuffleBoard(board: ReadonlyBoard): Board {
  const result = board.map((row) => row.slice());
  const cells: Point[] = [];
  const types: number[] = [];
  const seen = new Set<number>();
  let matchingType: number | undefined;

  for (let row = 0; row < result.length; row += 1) {
    for (let col = 0; col < result[row].length; col += 1) {
      const type = result[row][col];
      if (type === null) continue;
      cells.push({ row, col });
      types.push(type);
      if (seen.has(type)) matchingType = type;
      seen.add(type);
    }
  }

  if (cells.length < 2) return result;
  const attempts = matchingType === undefined ? 1 : 24;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (let index = types.length - 1; index > 0; index -= 1) {
      const other = Math.floor(Math.random() * (index + 1));
      [types[index], types[other]] = [types[other], types[index]];
    }
    cells.forEach(({ row, col }, index) => { result[row][col] = types[index]; });
    if (matchingType === undefined || findMove(result)) return result;
  }

  // The first two row-major occupied cells always have a clear straight or L-shaped route.
  for (let target = 0; target < 2; target += 1) {
    const destination = cells[target];
    if (result[destination.row][destination.col] === matchingType) continue;
    const source = cells.find(({ row, col }, index) => index >= target
      && result[row][col] === matchingType);
    if (!source) throw new Error('The matching pair must remain in the shuffled board.');
    [result[destination.row][destination.col], result[source.row][source.col]] =
      [result[source.row][source.col], result[destination.row][destination.col]];
  }
  return result;
}
