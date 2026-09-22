export const DIFFICULTIES = {
  easy: { name: '轻松', pairs: 6, rows: 3 },
  normal: { name: '标准', pairs: 8, rows: 4 },
  hard: { name: '挑战', pairs: 12, rows: 6 },
} as const;

export type Difficulty = keyof typeof DIFFICULTIES;
export const MISMATCH_DELAY = 900;
export const FRUITS = [
  { id: 'cherry', name: '樱桃' },
  { id: 'orange', name: '橙子' },
  { id: 'grape', name: '葡萄' },
  { id: 'lemon', name: '柠檬' },
  { id: 'strawberry', name: '草莓' },
  { id: 'watermelon', name: '西瓜' },
  { id: 'avocado', name: '牛油果' },
  { id: 'peach', name: '桃子' },
  { id: 'pear', name: '梨' },
  { id: 'pineapple', name: '菠萝' },
  { id: 'kiwi', name: '猕猴桃' },
  { id: 'blueberry', name: '蓝莓' },
] as const;

export interface Card {
  fruit: number;
  faceUp: boolean;
  matched: boolean;
}

export class MemoryGame {
  difficulty: Difficulty;
  cards: Card[] = [];
  selected: number[] = [];
  status: 'ready' | 'playing' | 'paused' | 'won' = 'ready';
  moves = 0;
  matchedPairs = 0;
  elapsedMs = 0;
  mismatchMs = 0;

  constructor(difficulty: Difficulty = 'normal', random: () => number = Math.random) {
    this.difficulty = difficulty;
    this.reset(difficulty, random);
  }

  get totalPairs(): number {
    return DIFFICULTIES[this.difficulty].pairs;
  }

  flip(index: number): boolean {
    if (this.status === 'paused' || this.status === 'won' || this.selected.length === 2
      || !Number.isInteger(index) || index < 0 || index >= this.cards.length) return false;
    const card = this.cards[index];
    if (card.faceUp || card.matched) return false;
    this.status = 'playing';
    card.faceUp = true;
    this.selected.push(index);
    if (this.selected.length === 2) {
      this.moves++;
      const first = this.cards[this.selected[0]];
      if (first.fruit === card.fruit) {
        first.matched = card.matched = true;
        this.matchedPairs++;
        this.selected = [];
        if (this.matchedPairs === this.totalPairs) this.status = 'won';
      } else this.mismatchMs = MISMATCH_DELAY;
    }
    return true;
  }

  tick(deltaMs: number): void {
    if (this.status !== 'playing') return;
    this.elapsedMs += deltaMs;
    if (this.mismatchMs > 0) {
      this.mismatchMs = Math.max(0, this.mismatchMs - deltaMs);
      if (this.mismatchMs === 0) {
        for (const index of this.selected) this.cards[index].faceUp = false;
        this.selected = [];
      }
    }
  }

  pause(): void {
    if (this.status === 'playing') this.status = 'paused';
  }

  resume(): void {
    if (this.status === 'paused') this.status = 'playing';
  }

  reset(difficulty: Difficulty = this.difficulty, random: () => number = Math.random): void {
    this.difficulty = difficulty;
    this.cards = Array.from({ length: this.totalPairs * 2 }, (_, index) => ({
      fruit: Math.floor(index / 2), faceUp: false, matched: false,
    }));
    for (let index = this.cards.length - 1; index > 0; index--) {
      const other = Math.floor(random() * (index + 1));
      [this.cards[index], this.cards[other]] = [this.cards[other], this.cards[index]];
    }
    this.selected = [];
    this.status = 'ready';
    this.moves = 0;
    this.matchedPairs = 0;
    this.elapsedMs = 0;
    this.mismatchMs = 0;
  }
}
