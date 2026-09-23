export type Direction = 'up' | 'left' | 'down' | 'right';
export type GameStatus = 'ready' | 'playing' | 'paused' | 'life-lost' | 'won' | 'over';
export interface Ghost { cell: number; direction: Direction; home: number; cooldown: number; }

export const MAZES: { name: string; map: readonly string[] }[] = [
  {
    name: '经典街区',
    map: [
      '###################',
      '#o.......#.......o#',
      '#.##.###.#.###.##.#',
      '#.................#',
      '#.##.#.#####.#.##.#',
      '#....#...#...#....#',
      '####.###.#.###.####',
      '#....#.......#....#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#....#.......#....#',
      '#.##.###.#.###.##.#',
      '#..#.....P.....#..#',
      '##.#.#.#####.#.#.##',
      '#....#...#...#....#',
      '#.######.#.######.#',
      '#.................#',
      '#.##.###.#.###.##.#',
      '#o.......#.......o#',
      '###################',
    ],
  },
  {
    name: '十字长街',
    map: [
      '###################',
      '#o...............o#',
      '#.###.###.###.###.#',
      '#.....#.....#.....#',
      '#.###.#.###.#.###.#',
      '#.....#.....#.....#',
      '#.#.###.#.#.###.#.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#.................#',
      '#.###.###.###.###.#',
      '#........P........#',
      '#.#.#####.#####.#.#',
      '#...#.........#...#',
      '#.#.#.###.###.#.#.#',
      '#.................#',
      '#.###.###.###.###.#',
      '#o...............o#',
      '###################',
    ],
  },
  {
    name: '环形花园',
    map: [
      '###################',
      '#o...............o#',
      '#.###############.#',
      '#.#.............#.#',
      '#.#.###.###.###.#.#',
      '#...#.........#...#',
      '#.#.###.###.###.#.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#.................#',
      '#.#.###.###.###.#.#',
      '#.#......P......#.#',
      '#.#.###.###.###.#.#',
      '#...#.........#...#',
      '#.#.###.###.###.#.#',
      '#.#.............#.#',
      '#.###############.#',
      '#o...............o#',
      '###################',
    ],
  },
  {
    name: '曲折回廊',
    map: [
      '###################',
      '#o.......#.......o#',
      '#.##.###.#.###.##.#',
      '#.......#.#.......#',
      '#.#.#.###.###.#.#.#',
      '#...#...#.#...#...#',
      '#.#.###.#.#.###.#.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#....#.......#....#',
      '#.##.###.#.###.##.#',
      '#....P............#',
      '#.#.###.#.#.###.#.#',
      '#...#...#.#...#...#',
      '#.#.#.###.###.#.#.#',
      '#.......#.#.......#',
      '#.##.###.#.###.##.#',
      '#o.......#.......o#',
      '###################',
    ],
  },
  {
    name: '双城通道',
    map: [
      '###################',
      '#o...............o#',
      '#.###.###.###.###.#',
      '#.....#.....#.....#',
      '#.###.#.###.#.###.#',
      '#.....#.....#.....#',
      '#.###.###.###.###.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#.................#',
      '#.###.###.###.###.#',
      '#.....#..P..#.....#',
      '#.###.#.###.#.###.#',
      '#.....#.....#.....#',
      '#.###.###.###.###.#',
      '#.................#',
      '#.######.#.######.#',
      '#o...............o#',
      '###################',
    ],
  },
  {
    name: '星光棋盘',
    map: [
      '###################',
      '#o...............o#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.................#',
      '#.##.###.#.###.##.#',
      '#.................#',
      '#.#.###.#.#.###.#.#',
      '#....#.......#....#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#....#.......#....#',
      '#.#.###.#.#.###.#.#',
      '#............P....#',
      '#.##.###.#.###.##.#',
      '#.................#',
      '#.#.#.#.#.#.#.#.#.#',
      '#.................#',
      '#.##.###.#.###.##.#',
      '#o...............o#',
      '###################',
    ],
  },
  {
    name: '穿梭工坊',
    map: [
      '###################',
      '#o.......#.......o#',
      '#.#####.#.#.#####.#',
      '#.......#.#.......#',
      '#.#.###.#.#.###.#.#',
      '#....#.......#....#',
      '#.##.###.#.###.##.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#.................#',
      '#.##.###.#.###.##.#',
      '#....#...#...#....#',
      '#.##.#.#####.#.##.#',
      '#........P........#',
      '#.#.#.###.###.#.#.#',
      '#.....#.....#.....#',
      '#.###.###.###.###.#',
      '#o...............o#',
      '###################',
    ],
  },
  {
    name: '终极漫游',
    map: [
      '###################',
      '#o...............o#',
      '#.#.#####.#####.#.#',
      '#...#.........#...#',
      '#.#.#.###.###.#.#.#',
      '#...#...#.#...#...#',
      '#.#.###.#.#.###.#.#',
      '#.................#',
      '#.##.#.## ##.#.##.#',
      '.......#123#.......',
      '#.##.#.#   #.#.##.#',
      '#.................#',
      '#.#.###.#.#.###.#.#',
      '#...#...#.#...#...#',
      '#.#.#.###.###.#.#.#',
      '#...#.........#...#',
      '#.#.#####.#####.#.#',
      '#........P........#',
      '#.#.#.#.#.#.#.#.#.#',
      '#o...............o#',
      '###################',
    ],
  },
];

export const TICK_MS = 150;
export const POWER_TICKS = 40;
const directions: Direction[] = ['up', 'left', 'down', 'right'];
const opposite: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const vectors: Record<Direction, [number, number]> = { up: [0, -1], left: [-1, 0], down: [0, 1], right: [1, 0] };

export class PacmanGame {
  readonly width = MAZES[0].map[0].length;
  readonly height = MAZES[0].map.length;
  tiles: string[] = [];
  spawn = 0;
  walls = new Set<number>();
  pellets = new Set<number>();
  powerPellets = new Set<number>();
  ghosts: Ghost[] = [];
  player = 0;
  direction: Direction = 'left';
  queuedDirection: Direction = 'left';
  status: GameStatus = 'ready';
  score = 0;
  level = 1;
  lives = 3;
  ticks = 0;
  powerTicks = 0;
  invulnerableTicks = 0;
  combo = 0;
  totalPellets = 0;

  constructor() { this.loadMaze(); }

  get mazeIndex(): number { return (this.level - 1) % MAZES.length; }
  get maze() { return MAZES[this.mazeIndex]; }
  get remaining(): number { return this.pellets.size + this.powerPellets.size; }
  get interval(): number { return Math.max(105, TICK_MS - (this.level - 1) * 10); }

  private loadMaze(): void {
    this.tiles = [...this.maze.map.join('')];
    this.spawn = this.tiles.indexOf('P');
    this.walls = new Set(this.tiles.flatMap((tile, cell) => tile === '#' ? [cell] : []));
    this.pellets = new Set(this.tiles.flatMap((tile, cell) => tile === '.' ? [cell] : []));
    this.powerPellets = new Set(this.tiles.flatMap((tile, cell) => tile === 'o' ? [cell] : []));
    this.totalPellets = this.remaining;
    this.resetActors();
  }

  private resetActors(): void {
    this.player = this.spawn;
    this.direction = 'left';
    this.queuedDirection = 'left';
    this.ticks = 0;
    this.powerTicks = 0;
    this.combo = 0;
    this.invulnerableTicks = 14;
    this.ghosts = this.tiles.flatMap((tile, cell) => /[123]/.test(tile)
      ? [{ cell, home: cell, direction: 'up' as Direction, cooldown: Number(tile) * 5 }]
      : []);
  }

  start(): void {
    if (this.status === 'ready' || this.status === 'paused' || this.status === 'life-lost') this.status = 'playing';
  }

  pause(): void { if (this.status === 'playing') this.status = 'paused'; }

  restart(): void {
    this.score = 0;
    this.level = 1;
    this.lives = 3;
    this.status = 'ready';
    this.loadMaze();
  }

  nextLevel(): void {
    if (this.status !== 'won') return;
    this.level++;
    this.loadMaze();
    this.status = 'playing';
  }

  steer(direction: Direction): void {
    if (this.status === 'playing' || this.status === 'ready') this.queuedDirection = direction;
  }

  neighbor(cell: number, direction: Direction): number | null {
    const [dx, dy] = vectors[direction];
    let x = cell % this.width + dx;
    const y = Math.floor(cell / this.width) + dy;
    if (y < 0 || y >= this.height) return null;
    if (x < 0 || x >= this.width) {
      if (y !== 9) return null;
      x = (x + this.width) % this.width;
    }
    const target = y * this.width + x;
    return this.walls.has(target) ? null : target;
  }

  tick(): void {
    if (this.status !== 'playing') return;
    this.ticks++;
    if (this.powerTicks > 0) this.powerTicks--;
    if (this.invulnerableTicks > 0) this.invulnerableTicks--;
    for (const ghost of this.ghosts) if (ghost.cooldown > 0) ghost.cooldown--;
    if (this.neighbor(this.player, this.queuedDirection) !== null) this.direction = this.queuedDirection;
    this.player = this.neighbor(this.player, this.direction) ?? this.player;
    if (this.pellets.delete(this.player)) this.score += 10;
    if (this.powerPellets.delete(this.player)) {
      this.score += 50;
      this.powerTicks = POWER_TICKS;
      this.combo = 0;
      for (const ghost of this.ghosts) ghost.direction = opposite[ghost.direction];
    }
    if (this.collide()) return;
    if (!this.remaining) {
      this.score += 500;
      this.status = 'won';
      return;
    }
    const ghostPeriod = this.powerTicks > 0 ? 3 : 2;
    if (this.ticks % ghostPeriod === 0) {
      const distances = this.distancesFrom(this.player);
      this.ghosts.forEach((ghost, index) => {
        if (ghost.cooldown > 0) return;
        let options = directions.flatMap(direction => {
          const cell = this.neighbor(ghost.cell, direction);
          return cell === null ? [] : [{ direction, cell }];
        });
        const forward = options.filter(option => option.direction !== opposite[ghost.direction]);
        if (forward.length) options = forward;
        const scatter = this.powerTicks === 0 && (Math.floor(this.ticks / 60) + index) % 4 === 0;
        const corner = [this.width + 1, this.width * 2 - 2, this.width * (this.height - 2) + 1][index];
        const targetDistances = scatter ? this.distancesFrom(corner) : distances;
        options.sort((a, b) => this.powerTicks > 0
          ? targetDistances[b.cell] - targetDistances[a.cell]
          : targetDistances[a.cell] - targetDistances[b.cell]);
        if (options[0]) {
          ghost.cell = options[0].cell;
          ghost.direction = options[0].direction;
        }
      });
      this.collide();
    }
  }

  private distancesFrom(start: number): number[] {
    const distances = Array<number>(this.tiles.length).fill(Infinity);
    distances[start] = 0;
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      for (const direction of directions) {
        const next = this.neighbor(queue[i], direction);
        if (next !== null && distances[next] === Infinity) {
          distances[next] = distances[queue[i]] + 1;
          queue.push(next);
        }
      }
    }
    return distances;
  }

  private collide(): boolean {
    for (const ghost of this.ghosts) {
      if (ghost.cell !== this.player || ghost.cooldown > 0) continue;
      if (this.powerTicks > 0) {
        this.score += 200 * 2 ** Math.min(this.combo++, 3);
        ghost.cell = ghost.home;
        ghost.cooldown = 24;
      } else if (this.invulnerableTicks === 0) {
        this.lives--;
        this.resetActors();
        this.status = this.lives > 0 ? 'life-lost' : 'over';
        return true;
      }
    }
    return false;
  }
}
