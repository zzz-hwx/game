export type Direction = 'up' | 'down' | 'left' | 'right';

type Cell = 'wall' | 'floor' | 'goal';
type Snapshot = { player: number; boxes: number[]; moves: number; pushes: number };

export const LEVELS: { name: string; difficulty: string; hint: string; map: readonly string[] }[] = [
  {
    name: '初次转弯', difficulty: '入门', hint: '绕到箱子侧面，先对准目标所在的列。',
    map: [
      '#######',
      '#  .  #',
      '#     #',
      '# $   #',
      '# @   #',
      '#######',
    ],
  },
  {
    name: '双线归位', difficulty: '入门', hint: '从下方分别推箱子，留好绕行的空间。',
    map: [
      '#######',
      '# . . #',
      '#  #  #',
      '# $ $ #',
      '#  @  #',
      '#######',
    ],
  },
  {
    name: '先上后下', difficulty: '进阶', hint: '先处理上方目标，再让左边的箱子向右转弯。',
    map: [
      '#######',
      '#   . #',
      '# #   #',
      '# $ $ #',
      '#  #. #',
      '# @   #',
      '#######',
    ],
  },
  {
    name: '错身而过', difficulty: '进阶', hint: '两个相邻的箱子不能一起推，先给左边的箱子找出路。',
    map: [
      '########',
      '#    . #',
      '#  #   #',
      '# $$   #',
      '#  # . #',
      '# @    #',
      '########',
    ],
  },
  {
    name: '三箱排班', difficulty: '挑战', hint: '先疏通两侧，中间的箱子需要横向移动。',
    map: [
      '########',
      '# . .  #',
      '#  #   #',
      '# $$$  #',
      '#    . #',
      '# @    #',
      '########',
    ],
  },
  {
    name: '借位腾挪', difficulty: '挑战', hint: '已就位的箱子也能移动；先把右边的箱子送往左上方。',
    map: [
      '########',
      '# +    #',
      '# #$#  #',
      '#  * $ #',
      '# # #. #',
      '#      #',
      '########',
    ],
  },
  {
    name: '上下分流', difficulty: '高手', hint: '下方目标需要从侧面进入，别把绕到箱子背后的路堵住。',
    map: [
      '########',
      '#  ..  #',
      '# #  # #',
      '#  $$  #',
      '##$  $ #',
      '#  ##  #',
      '#  ..@ #',
      '########',
    ],
  },
  {
    name: '仓库调度', difficulty: '高手', hint: '中间的目标先别急着填满；上下叠放的箱子要先错开。',
    map: [
      '#########',
      '#   #   #',
      '# . . . #',
      '# #$$ # #',
      '#  $ $  #',
      '# .   # #',
      '#   @   #',
      '#########',
    ],
  },
];

export class SokobanGame {
  levelIndex = 0;
  width = 0;
  height = 0;
  cells: Cell[] = [];
  player = 0;
  boxes: number[] = [];
  moves = 0;
  pushes = 0;
  private history: Snapshot[] = [];

  constructor(levelIndex = 0) {
    this.loadLevel(levelIndex);
  }

  get goals(): number[] {
    return this.cells.flatMap((cell, index) => cell === 'goal' ? [index] : []);
  }

  get placed(): number {
    return this.boxes.filter((box) => this.cells[box] === 'goal').length;
  }

  get won(): boolean {
    return this.boxes.length > 0 && this.boxes.length === this.goals.length && this.placed === this.boxes.length;
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  get deadlocked(): boolean {
    return this.boxes.some((box) => this.cells[box] !== 'goal'
      && (this.isWall(this.neighbor(box, 'up')) || this.isWall(this.neighbor(box, 'down')))
      && (this.isWall(this.neighbor(box, 'left')) || this.isWall(this.neighbor(box, 'right'))));
  }

  move(direction: Direction): boolean {
    if (this.won) return false;
    const next = this.neighbor(this.player, direction);
    if (this.isWall(next)) return false;
    const boxIndex = this.boxes.indexOf(next);
    const destination = boxIndex < 0 ? next : this.neighbor(next, direction);
    if (boxIndex >= 0 && (this.isWall(destination) || this.boxes.includes(destination))) return false;

    this.history.push({ player: this.player, boxes: [...this.boxes], moves: this.moves, pushes: this.pushes });
    if (boxIndex >= 0) {
      this.boxes[boxIndex] = destination;
      this.pushes += 1;
    }
    this.player = next;
    this.moves += 1;
    return true;
  }

  undo(): boolean {
    const previous = this.history.pop();
    if (!previous) return false;
    this.player = previous.player;
    this.boxes.splice(0, this.boxes.length, ...previous.boxes);
    this.moves = previous.moves;
    this.pushes = previous.pushes;
    return true;
  }

  restart(): void {
    this.loadLevel(this.levelIndex);
  }

  loadLevel(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= LEVELS.length) {
      throw new RangeError('Invalid Sokoban level index');
    }
    const { map } = LEVELS[index];
    this.levelIndex = index;
    this.width = map[0].length;
    this.height = map.length;
    this.cells = [];
    this.boxes = [];
    this.player = 0;
    for (const row of map) {
      for (const tile of row) {
        const position = this.cells.length;
        this.cells.push(tile === '#' ? 'wall' : '.+*'.includes(tile) ? 'goal' : 'floor');
        if (tile === '@' || tile === '+') this.player = position;
        if (tile === '$' || tile === '*') this.boxes.push(position);
      }
    }
    this.moves = 0;
    this.pushes = 0;
    this.history = [];
  }

  private isWall(index: number): boolean {
    return index < 0 || index >= this.cells.length || this.cells[index] === 'wall';
  }

  private neighbor(index: number, direction: Direction): number {
    const x = index % this.width;
    const y = Math.floor(index / this.width);
    switch (direction) {
      case 'up': return y > 0 ? index - this.width : -1;
      case 'down': return y < this.height - 1 ? index + this.width : -1;
      case 'left': return x > 0 ? index - 1 : -1;
      case 'right': return x < this.width - 1 ? index + 1 : -1;
      default: return -1;
    }
  }
}
