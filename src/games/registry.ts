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
  {
    id: 'sokoban',
    name: '推箱子',
    englishName: 'SOKOBAN',
    tagline: '推开小烦恼，让快乐归位。',
    description: '一个小仓库，几个小箱子。换个角度想想，事情总会井井有条。',
    category: '逻辑益智',
    controls: '方向键 / 触屏',
    color: '#8d7952',
    background: '#f0ecdc',
    component: () => import('./sokoban/SokobanGame.vue'),
  },
  {
    id: 'pacman',
    name: '吃豆人',
    englishName: 'PAC-MAN',
    tagline: '一口一个，吃掉小烦恼。',
    description: '在迷宫里收集快乐，和小幽灵玩一场追逐游戏。吃下能量豆，勇敢反击。',
    category: '经典街机',
    controls: '方向键 / 触屏',
    color: '#968047',
    background: '#f2ecd5',
    component: () => import('./pacman/PacmanGame.vue'),
  },
  {
    id: 'gomoku',
    name: '五子棋',
    englishName: 'GOMOKU',
    tagline: '落下一点从容，连起小胜利。',
    description: '在一黑一白之间，给思绪放个假。与电脑切磋，或和朋友共享一局好时光。',
    category: '经典棋局',
    controls: '鼠标 / 触屏 / 方向键',
    color: '#697858',
    background: '#ecebdc',
    component: () => import('./gomoku/GomokuGame.vue'),
  },
  {
    id: 'breakout',
    name: '打砖块',
    englishName: 'BREAKOUT',
    tagline: '把小烦恼，一块块击碎。',
    description: '接住一点快乐，弹走一点压力。在小球的来回之间，给心情腾出一点空间。',
    category: '经典街机',
    controls: '鼠标 / 方向键 / 触屏',
    color: '#9a8163',
    background: '#f0e8d9',
    component: () => import('./breakout/BreakoutGame.vue'),
  },
];
