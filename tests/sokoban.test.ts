import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, SokobanGame } from '../src/games/sokoban/engine.ts';
import type { Direction } from '../src/games/sokoban/engine.ts';

const steps: { direction: Direction; code: string; dx: number; dy: number }[] = [
  { direction: 'up', code: 'U', dx: 0, dy: -1 },
  { direction: 'down', code: 'D', dx: 0, dy: 1 },
  { direction: 'left', code: 'L', dx: -1, dy: 0 },
  { direction: 'right', code: 'R', dx: 1, dy: 0 },
];
const firstSolution = 'ULURDRU';
const room = [
  '#######',
  '#.    #',
  '#     #',
  '#  $  #',
  '#     #',
  '#    @#',
  '#######',
];

function parse(map: readonly string[]) {
  const tiles = [...map.join('')];
  return {
    width: map[0].length,
    height: map.length,
    tiles,
    player: tiles.findIndex((tile) => tile === '@' || tile === '+'),
    boxes: tiles.flatMap((tile, index) => tile === '$' || tile === '*' ? [index] : []),
    goals: tiles.flatMap((tile, index) => '.+*'.includes(tile) ? [index] : []),
  };
}

function fixture(map: readonly string[]): SokobanGame {
  const board = parse(map);
  assert.ok(map.every((row) => row.length === board.width));
  const game = new SokobanGame();
  game.width = board.width;
  game.height = board.height;
  game.cells = board.tiles.map((tile) => tile === '#' ? 'wall' : '.+*'.includes(tile) ? 'goal' : 'floor');
  game.player = board.player;
  game.boxes = board.boxes;
  return game;
}

function state(game: SokobanGame) {
  return {
    levelIndex: game.levelIndex, width: game.width, height: game.height,
    cells: [...game.cells], player: game.player, boxes: [...game.boxes],
    moves: game.moves, pushes: game.pushes, goals: game.goals,
    placed: game.placed, won: game.won, canUndo: game.canUndo, deadlocked: game.deadlocked,
  };
}

function play(game: SokobanGame, solution: string): void {
  for (const code of solution) {
    const step = steps.find((candidate) => candidate.code === code);
    assert.ok(step, `Unknown solution letter ${code}`);
    assert.equal(game.move(step.direction), true, `Move ${game.moves + 1}: ${code}`);
  }
}

// Test-only BFS over pushes; a walking BFS supplies the route to each box.
function solve(map: readonly string[], cap = 100_000): { solution: string; states: number } {
  const { width, height, tiles, player, boxes, goals } = parse(map);
  const goalSet = new Set(goals);
  const neighbor = (position: number, dx: number, dy: number): number => {
    const x = position % width + dx;
    const y = Math.floor(position / width) + dy;
    return x >= 0 && x < width && y >= 0 && y < height ? y * width + x : -1;
  };
  const wall = (position: number): boolean => position < 0 || tiles[position] === '#';
  const corner = (position: number): boolean => !goalSet.has(position)
    && (wall(neighbor(position, 0, -1)) || wall(neighbor(position, 0, 1)))
    && (wall(neighbor(position, -1, 0)) || wall(neighbor(position, 1, 0)));
  const walkingPaths = (start: number, crates: number[]): Map<number, string> => {
    const occupied = new Set(crates);
    const paths = new Map<number, string>([[start, '']]);
    const reachable = [start];
    for (let index = 0; index < reachable.length; index++) {
      const position = reachable[index];
      for (const { code, dx, dy } of steps) {
        const next = neighbor(position, dx, dy);
        if (wall(next) || occupied.has(next) || paths.has(next)) continue;
        paths.set(next, paths.get(position)! + code);
        reachable.push(next);
      }
    }
    return paths;
  };
  type Node = { player: number; boxes: number[]; parent: number; route: string };
  const nodes: Node[] = [{ player, boxes: [...boxes].sort((a, b) => a - b), parent: -1, route: '' }];
  const key = (position: number, crates: number[]): string =>
    `${Math.min(...walkingPaths(position, crates).keys())}:${crates.join(',')}`;
  const visited = new Set([key(player, nodes[0].boxes)]);

  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const current = nodes[cursor];
    if (current.boxes.every((box) => goalSet.has(box))) {
      const segments: string[] = [];
      for (let index = cursor; nodes[index].parent !== -1; index = nodes[index].parent) {
        segments.push(nodes[index].route);
      }
      return { solution: segments.reverse().join(''), states: visited.size };
    }
    const occupied = new Set(current.boxes);
    const paths = walkingPaths(current.player, current.boxes);
    for (const [boxIndex, box] of current.boxes.entries()) {
      for (const { code, dx, dy } of steps) {
        const behind = neighbor(box, -dx, -dy);
        const destination = neighbor(box, dx, dy);
        if (!paths.has(behind) || wall(destination) || occupied.has(destination) || corner(destination)) continue;
        const moved = [...current.boxes];
        moved[boxIndex] = destination;
        moved.sort((a, b) => a - b);
        const nextKey = key(box, moved);
        if (visited.has(nextKey)) continue;
        assert.ok(visited.size < cap, `BFS exceeded ${cap} states`);
        visited.add(nextKey);
        nodes.push({ player: box, boxes: moved, parent: cursor, route: paths.get(behind)! + code });
      }
    }
  }
  assert.fail('Level has no solution');
}

test('sokoban: sixteen distinct enclosed levels have valid metadata and balanced pieces', () => {
  assert.equal(LEVELS.length, 16);
  assert.equal(new Set(LEVELS.map((level) => level.name)).size, LEVELS.length);
  assert.equal(new Set(LEVELS.map((level) => level.map.join('\n'))).size, LEVELS.length);
  const symbols = new Set<string>();
  for (const [index, level] of LEVELS.entries()) {
    for (const value of [level.name, level.difficulty, level.hint]) assert.ok(value.trim().length > 0);
    const board = parse(level.map);
    assert.ok(board.width >= 6 && board.width <= 9);
    assert.ok(board.height >= 5 && board.height <= 8);
    assert.ok(level.map.every((row) => row.length === board.width && /^[# .$@*+]+$/.test(row)));
    assert.match(level.map[0], /^#+$/);
    assert.match(level.map.at(-1)!, /^#+$/);
    assert.ok(level.map.every((row) => row.startsWith('#') && row.endsWith('#')));
    assert.equal(board.tiles.filter((tile) => tile === '@' || tile === '+').length, 1);
    assert.ok(board.boxes.length > 0);
    assert.equal(board.boxes.length, board.goals.length);
    for (const tile of board.tiles) symbols.add(tile);

    const game = new SokobanGame(index);
    assert.equal(game.levelIndex, index);
    assert.equal(game.width, board.width);
    assert.equal(game.height, board.height);
    assert.equal(game.cells.length, board.width * board.height);
    assert.equal(game.player, board.player);
    assert.deepEqual(game.boxes, board.boxes);
    assert.deepEqual(game.goals, board.goals);
    board.tiles.forEach((tile, position) => {
      assert.equal(game.cells[position], tile === '#' ? 'wall' : '.+*'.includes(tile) ? 'goal' : 'floor');
    });
    assert.equal(game.placed, board.tiles.filter((tile) => tile === '*').length);
    assert.equal(game.moves, 0);
    assert.equal(game.pushes, 0);
    assert.equal(game.canUndo, false);
    assert.equal(game.won, false);
    assert.equal(game.deadlocked, false);
  }
  assert.deepEqual([...symbols].sort(), [...'# .$@*+'].sort());
  assert.deepEqual(state(new SokobanGame()), state(new SokobanGame(0)));
});

for (const [index, level] of LEVELS.entries()) {
  test(`sokoban: level ${index + 1} is solvable by bounded BFS and engine replay`, (context) => {
    const { solution, states } = solve(level.map);
    assert.ok(solution.length > 1);
    const game = new SokobanGame(index);
    for (const code of solution) {
      play(game, code);
      assert.equal(game.deadlocked, false);
      assert.equal(new Set(game.boxes).size, game.boxes.length);
      assert.equal(game.boxes.includes(game.player), false);
    }
    assert.equal(game.won, true);
    assert.equal(game.placed, game.goals.length);
    assert.equal(game.moves, solution.length);
    assert.ok(game.pushes > 0 && game.pushes <= game.moves);
    context.diagnostic(`Level ${index + 1}: ${solution} (${game.moves} moves, ${game.pushes} pushes, ${states} states)`);
  });
}

test('sokoban: level one has a stable browser-test solution and complete winning undo', () => {
  const game = new SokobanGame();
  const snapshots = [state(game)];
  const originalCells = game.cells;
  const originalBoxes = game.boxes;
  for (const code of firstSolution) {
    play(game, code);
    snapshots.push(state(game));
  }
  assert.equal(game.won, true);
  assert.equal(game.moves, 7);
  assert.equal(game.pushes, 3);
  assert.equal(game.canUndo, true);
  const wonState = state(game);
  for (const { direction } of steps) {
    assert.equal(game.move(direction), false);
    assert.deepEqual(state(game), wonState);
  }
  for (let index = snapshots.length - 2; index >= 0; index--) {
    assert.equal(game.undo(), true);
    assert.deepEqual(state(game), snapshots[index]);
    assert.equal(game.boxes, originalBoxes);
    assert.equal(game.cells, originalCells);
  }
  assert.equal(game.undo(), false);
  assert.deepEqual(state(game), snapshots[0]);
  play(game, firstSolution);
  assert.equal(game.won, true);
});

for (const { direction, dx, dy } of steps) {
  test(`sokoban: ordinary ${direction} walking changes only the player and move counter`, () => {
    const game = fixture(room);
    game.player = 2 * game.width + 2;
    game.boxes = [4 * game.width + 4];
    const before = state(game);
    assert.equal(game.move(direction), true);
    assert.equal(game.player, before.player + dy * game.width + dx);
    assert.deepEqual(game.boxes, before.boxes);
    assert.deepEqual(game.cells, before.cells);
    assert.equal(game.moves, 1);
    assert.equal(game.pushes, 0);
    assert.equal(game.canUndo, true);
    assert.equal(game.undo(), true);
    assert.deepEqual(state(game), before);
  });

  test(`sokoban: ${direction} pushes preserve crate identity and both counters undo`, () => {
    const game = fixture(room);
    const box = game.boxes[0];
    const offset = dy * game.width + dx;
    game.player = box - offset;
    const before = state(game);
    const boxes = game.boxes;
    assert.equal(game.move(direction), true);
    assert.equal(game.player, box);
    assert.equal(game.boxes, boxes);
    assert.deepEqual(game.boxes, [box + offset]);
    assert.equal(game.moves, 1);
    assert.equal(game.pushes, 1);
    assert.equal(game.undo(), true);
    assert.deepEqual(state(game), before);
  });

  test(`sokoban: ${direction} pushes onto the last goal win and undo reopens play`, () => {
    const game = fixture(room);
    const box = game.boxes[0];
    const offset = dy * game.width + dx;
    game.player = box - offset;
    game.cells[game.goals[0]] = 'floor';
    game.cells[box + offset] = 'goal';
    const before = state(game);
    assert.equal(game.move(direction), true);
    assert.equal(game.placed, 1);
    assert.equal(game.won, true);
    assert.equal(game.cells[box + offset], 'goal');
    assert.equal(game.undo(), true);
    assert.deepEqual(state(game), before);
    assert.equal(game.move(direction), true);
    assert.equal(game.won, true);
  });

  test(`sokoban: ${direction} cannot walk through walls or push into walls or a second box`, () => {
    for (const obstruction of ['walking wall', 'box wall', 'second box']) {
      const game = fixture(room);
      const box = game.boxes[0];
      const offset = dy * game.width + dx;
      game.player = box - offset;
      if (obstruction === 'walking wall') {
        game.boxes = [];
        game.cells[box] = 'wall';
      } else if (obstruction === 'box wall') {
        game.cells[box + offset] = 'wall';
      } else {
        game.boxes.push(box + offset);
      }
      const before = state(game);
      assert.equal(game.move(direction), false, obstruction);
      assert.deepEqual(state(game), before);
      assert.equal(game.undo(), false);
    }
  });
}

test('sokoban: goal terrain survives walking on and off it', () => {
  const game = fixture(['#######', '#@ .  #', '# $   #', '#     #', '#######']);
  const goals = game.goals;
  play(game, 'RR');
  assert.equal(game.player, goals[0]);
  assert.equal(game.placed, 0);
  assert.equal(game.won, false);
  play(game, 'L');
  assert.deepEqual(game.goals, goals);
  assert.equal(game.cells[goals[0]], 'goal');
  const exposedGoals = game.goals;
  exposedGoals.length = 0;
  assert.deepEqual(game.goals, goals);
});

test('sokoban: a placed box can leave its goal while other boxes are still unplaced', () => {
  const game = fixture(['########', '#@ *  .#', '# $    #', '#      #', '########']);
  const goals = game.goals;
  assert.equal(game.placed, 1);
  assert.equal(game.won, false);
  play(game, 'R');
  const beforePush = state(game);
  play(game, 'R');
  assert.equal(game.placed, 0);
  assert.equal(game.cells[game.player], 'goal');
  assert.deepEqual(game.goals, goals);
  assert.equal(game.undo(), true);
  assert.deepEqual(state(game), beforePush);
});

test('sokoban: crossing row-major order never reorders the box array', () => {
  const game = fixture(['#######', '#  @  #', '#  $  #', '# $   #', '#   ..#', '#######']);
  const boxes = game.boxes;
  const initial = [...boxes];
  play(game, 'DD');
  assert.equal(game.boxes, boxes);
  assert.deepEqual(game.boxes, [initial[0] + 2 * game.width, initial[1]]);
  assert.ok(game.boxes[0] > game.boxes[1]);
  assert.equal(game.undo(), true);
  assert.equal(game.undo(), true);
  assert.equal(game.boxes, boxes);
  assert.deepEqual(game.boxes, initial);
});

test('sokoban: rejected moves do not add history or change existing snapshots', () => {
  const game = new SokobanGame();
  const initial = state(game);
  play(game, 'L');
  const before = state(game);
  assert.equal(game.move('left'), false);
  assert.deepEqual(state(game), before);
  assert.equal(game.undo(), true);
  assert.deepEqual(state(game), initial);
  assert.equal(game.undo(), false);
});

test('sokoban: undo history has no small fixed limit', () => {
  const game = new SokobanGame();
  const initial = state(game);
  for (let index = 0; index < 1_200; index++) assert.equal(game.move(index % 2 ? 'right' : 'left'), true);
  assert.equal(game.moves, 1_200);
  assert.equal(game.pushes, 0);
  for (let index = 1_199; index >= 0; index--) {
    assert.equal(game.undo(), true);
    assert.equal(game.moves, index);
    assert.equal(game.pushes, 0);
  }
  assert.deepEqual(state(game), initial);
  assert.equal(game.undo(), false);
});

test('sokoban: restart resets won and unfinished levels, counters and all undo history', () => {
  for (const solution of ['UL', firstSolution]) {
    const game = new SokobanGame();
    play(game, solution);
    game.restart();
    assert.deepEqual(state(game), state(new SokobanGame()));
    assert.equal(game.undo(), false);
  }
  const game = new SokobanGame(5);
  assert.equal(game.move('right'), true);
  game.restart();
  assert.deepEqual(state(game), state(new SokobanGame(5)));
});

test('sokoban: level switching and reloading reset every dynamic field', () => {
  const game = new SokobanGame();
  for (const index of [...LEVELS.keys(), 1, 1, 0]) {
    game.loadLevel(0);
    play(game, firstSolution);
    game.loadLevel(index);
    assert.deepEqual(state(game), state(new SokobanGame(index)));
    assert.equal(game.undo(), false);
  }
});

test('sokoban: invalid level indices throw without modifying an existing game', () => {
  const game = new SokobanGame();
  play(game, 'UL');
  const before = state(game);
  for (const index of [-1, LEVELS.length, 0.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => new SokobanGame(index), RangeError);
    assert.throws(() => game.loadLevel(index), RangeError);
    assert.deepEqual(state(game), before);
  }
  assert.equal(game.undo(), true);
  assert.equal(game.moves, 1);
  assert.equal(game.pushes, 1);
});

test('sokoban: games and level templates never share mutable board state', () => {
  const templates = JSON.stringify(LEVELS);
  const game = new SokobanGame();
  const other = new SokobanGame();
  const before = state(other);
  play(game, firstSolution);
  game.cells[0] = 'floor';
  assert.deepEqual(state(other), before);
  assert.equal(JSON.stringify(LEVELS), templates);
  game.restart();
  assert.deepEqual(state(game), before);
});

test('sokoban: all four static non-goal corners are advisory, but goal corners are safe', () => {
  for (const horizontal of [-1, 1]) {
    for (const vertical of [-1, 1]) {
      const game = fixture(room);
      const box = game.boxes[0];
      game.cells[box + horizontal] = 'wall';
      game.cells[box + vertical * game.width] = 'wall';
      assert.equal(game.deadlocked, true);
      game.cells[box] = 'goal';
      assert.equal(game.deadlocked, false);
    }
  }
});

test('sokoban: a wall, a corridor, or neighboring boxes alone do not prove corner deadlock', () => {
  const game = fixture(room);
  const box = game.boxes[0];
  game.cells[box - game.width] = 'wall';
  assert.equal(game.deadlocked, false);
  game.cells[box + game.width] = 'wall';
  assert.equal(game.deadlocked, false);
  game.boxes.push(box - 1, box + 1);
  assert.equal(game.deadlocked, false);
});

test('sokoban: entering a corner does not block play, and undo removes the advisory', () => {
  const game = fixture(['#######', '# $ @.#', '#     #', '#######']);
  play(game, 'L');
  const before = state(game);
  assert.equal(game.deadlocked, false);
  play(game, 'L');
  assert.equal(game.deadlocked, true);
  assert.equal(game.won, false);
  play(game, 'D');
  assert.equal(game.deadlocked, true);
  assert.equal(game.undo(), true);
  assert.equal(game.deadlocked, true);
  assert.equal(game.undo(), true);
  assert.deepEqual(state(game), before);
});

for (const { direction, dx, dy } of steps) {
  test(`sokoban: ${direction} movement and pushes respect unwalled boundaries without row wrap`, () => {
    const map = ['.    ', '     ', '  $  ', '     ', '    @'];
    const edge = direction === 'up' ? 2 : direction === 'down' ? 22 : direction === 'left' ? 10 : 14;
    for (const pushing of [false, true]) {
      const game = fixture(map);
      game.player = pushing ? edge - dy * game.width - dx : edge;
      if (pushing) game.boxes = [edge];
      const before = state(game);
      assert.equal(game.move(direction), false);
      assert.deepEqual(state(game), before);
      assert.equal(game.undo(), false);
    }
    const game = fixture(map);
    game.player = edge - dy * game.width - dx;
    const before = state(game);
    assert.equal(game.move(direction), true);
    assert.equal(game.player, edge);
    assert.equal(game.undo(), true);
    assert.deepEqual(state(game), before);
  });
}
