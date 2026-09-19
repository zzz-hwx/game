import type { Component } from 'vue';

export interface GameDefinition {
  id: string;
  name: string;
  englishName: string;
  tagline: string;
  description: string;
  category: string;
  controls: string;
  color: string;
  background: string;
  component: () => Promise<{ default: Component }>;
}

export const games: GameDefinition[] = [
  {
    id: 'snake',
    name: '贪吃蛇',
    englishName: 'SNAKE',
    tagline: '放下待办，吃掉烦恼。',
    description: '带着小蛇一路向前，把小小的快乐，一口一口收集起来。',
    category: '反应挑战',
    controls: '方向键 / WASD',
    color: '#42633b',
    background: '#eaf0d8',
    component: () => import('./snake/SnakeGame.vue'),
  },
  {
    id: 'tetris',
    name: '俄罗斯方块',
    englishName: 'TETRIS',
    tagline: '落下的每一块，都刚刚好。',
    description: '旋转、拼合、消除。在方块之间，找回一点久违的专注。',
    category: '经典益智',
    controls: '方向键 / 空格',
    color: '#527270',
    background: '#e4eeea',
    component: () => import('./tetris/TetrisGame.vue'),
  },
  {
    id: 'link',
    name: '连连看',
    englishName: 'LINK & CHILL',
    tagline: '连起小美好，快乐刚刚好。',
    description: '找一找相同的水果，让每一次连接，都带来一点好心情。',
    category: '轻松配对',
    controls: '鼠标 / 触屏',
    color: '#8872af',
    background: '#eee8f5',
    component: () => import('./link/LinkGame.vue'),
  },
  {
    id: 'minesweeper',
    name: '扫雷',
    englishName: 'MINESWEEPER',
    tagline: '扫走小烦恼，发现小确幸。',
    description: '跟着数字的线索，轻轻揭开每一格。把一点好运，留给下一步。',
    category: '逻辑推理',
    controls: '鼠标 / 触屏',
    color: '#58734e',
    background: '#e7ecda',
    component: () => import('./minesweeper/MinesweeperGame.vue'),
  },
  {
    id: '2048',
    name: '2048',
    englishName: 'DOUBLE THE JOY',
    tagline: '一点一点，让快乐加倍。',
    description: '相同的数字，相遇就有好事发生。从一个小小的 2，拼出大大的可能。',
    category: '数字益智',
    controls: '方向键 / 滑动',
    color: '#78834b',
    background: '#eef0dd',
    component: () => import('./2048/Game2048.vue'),
  },
];
