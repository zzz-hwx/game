<script setup lang="ts">
import SvgIcon from '../../components/SvgIcon.vue';
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import type { CSSProperties } from 'vue';
import { applyGravity, createBoard, findMove, findPath, shuffleBoard } from './engine';
import type { Board, Point } from './engine';

const modes = {
  classic: {
    name: '经典限时', title: '经典连连看', tagline: '争分夺秒，挑战连击',
    description: '180 秒内清空棋盘，连续配对赢取额外加分。',
    storageKey: 'link-and-chill-records',
  },
  zen: {
    name: '悠闲模式', title: '悠闲连连看', tagline: '不限时间，慢慢发现',
    description: '没有倒计时，提示和洗牌不限次数。清空棋盘即可通关，不计时间奖励。',
    storageKey: 'link-and-chill-records-zen',
  },
  gravity: {
    name: '重力模式', title: '重力连连看', tagline: '水果下落，步步新局',
    description: '180 秒内清空棋盘；每次消除后，上方水果会向下补位，连接路线随之改变。',
    storageKey: 'link-and-chill-records-gravity',
  },
} as const;
type Mode = keyof typeof modes;
const levels = {
  easy: { name: '轻松', rows: 4, cols: 6, seconds: 180, types: 6, tools: 5 },
  normal: { name: '标准', rows: 6, cols: 8, seconds: 180, types: 10, tools: 3 },
  hard: { name: '挑战', rows: 8, cols: 8, seconds: 180, types: 12, tools: 2 },
} as const;
type Level = keyof typeof levels;
type Status = 'ready' | 'playing' | 'paused' | 'won' | 'lost';
const fruits = [
  ['cherry', '樱桃'], ['orange', '橙子'],
  ['grape', '葡萄'], ['lemon', '柠檬'],
  ['strawberry', '草莓'], ['watermelon', '西瓜'],
  ['avocado', '牛油果'], ['peach', '桃子'],
  ['pear', '梨子'], ['pineapple', '菠萝'],
  ['kiwi', '猕猴桃'], ['blueberry', '蓝莓'],
] as const;
interface GameState {
  level: Level;
  mode: Mode;
  board: Board;
  status: Status;
  selected: Point | null;
  score: number;
  remaining: number;
  deadline: number;
  hints: number;
  shuffles: number;
  combo: number;
  lastMatch: number;
  locked: boolean;
  revision: number;
}
interface ModalOptions {
  title: string;
  content: string;
  confirm?: string;
  action?: () => void;
}
interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
}
const state = reactive<GameState>({
  level: 'normal', mode: 'classic', board: [], status: 'ready', selected: null, score: 0,
  remaining: 180000, deadline: 0, hints: 3, shuffles: 3,
  combo: 0, lastMatch: 0, locked: false, revision: 0,
});
const boardElement = ref<HTMLDivElement | null>(null);
const boardWrap = ref<HTMLDivElement | null>(null);
const connectionLayer = ref<SVGSVGElement | null>(null);
const modalElement = ref<HTMLDialogElement | null>(null);
const modal = ref<ModalOptions | null>(null);
const records = reactive<Record<Mode, Record<Level, number>>>({
  classic: { easy: 0, normal: 0, hard: 0 },
  zen: { easy: 0, normal: 0, hard: 0 },
  gravity: { easy: 0, normal: 0, hard: 0 },
});
const storageAvailable = ref(true);
const soundEnabled = ref(false);
const gameMessage = ref('');
const hinted = ref<Point[]>([]);
const wrong = ref<Point[]>([]);
const matched = ref<(Point & { type: number })[]>([]);
const connectionPath = ref<Point[]>([]);
const connectionPoints = ref('');
const comboText = ref('');
const comboVersion = ref(0);
const comboVisible = ref(false);
const overlay = ref({ symbol: 'pause', title: '休息一下', description: '小美好就在这里，等你回来。', action: '继续游戏' });
const confetti = ref<{ id: number; style: CSSProperties }[]>([]);
let animationTimer: ReturnType<typeof setTimeout> | undefined;
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let tickTimer: ReturnType<typeof setInterval> | undefined;
let observer: ResizeObserver | undefined;
let audio: AudioContext | null = null;
const voices = new Set<Voice>();
let resumeAfterModal = false;
let disposed = false;

const config = computed(() => levels[state.level]);
const modeConfig = computed(() => modes[state.mode]);
const timed = computed(() => state.mode !== 'zen');
const remainingPairs = computed(() => state.board.flat().filter((value) => value !== null).length / 2);
const seconds = computed(() => Math.ceil(state.remaining / 1000));
const timerText = computed(() => timed.value
  ? `${String(Math.floor(seconds.value / 60)).padStart(2, '0')}:${String(seconds.value % 60).padStart(2, '0')}` : '不限时');
const blocked = computed(() => state.status === 'paused' || state.status === 'won' || state.status === 'lost');
const toolsBlocked = computed(() => state.status !== 'playing' || state.locked);
const startLabel = computed(() => state.status === 'playing' ? '暂停游戏'
  : state.status === 'paused' ? '继续游戏' : state.status === 'ready' ? '开始游戏' : '再玩一局');
const sameCell = (a: Point | null | undefined, b: Point | null | undefined): boolean =>
  a != null && b != null && a.row === b.row && a.col === b.col;
const tiles = computed(() => state.board.flatMap((row, rowIndex) => row.map((type, col) => {
  const cell = { row: rowIndex, col };
  const matching = matched.value.find((point) => sameCell(point, cell));
  const visibleType = matching?.type ?? type;
  return {
    ...cell, key: `${rowIndex}-${col}`, type,
    fruit: visibleType === null ? null : fruits[visibleType],
    selected: sameCell(state.selected, cell), matched: matching !== undefined,
    hinted: hinted.value.some((point) => sameCell(point, cell)),
    wrong: wrong.value.some((point) => sameCell(point, cell)),
  };
})));

function loadRecords(mode: Mode = state.mode): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(modes[mode].storageKey) || '{}');
    if (saved === null || typeof saved !== 'object') return;
    for (const key of Object.keys(levels) as Level[]) {
      const value: unknown = Reflect.get(saved, key);
      if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
        records[mode][key] = Math.max(records[mode][key], value);
      }
    }
  } catch {
    storageAvailable.value = false;
  }
}

function onStorage(event: StorageEvent): void {
  if (event.storageArea !== localStorage) return;
  for (const mode of Object.keys(modes) as Mode[]) {
    if (event.key === modes[mode].storageKey) loadRecords(mode);
  }
}

function saveRecord(): void {
  loadRecords();
  const modeRecords = records[state.mode];
  if (state.score <= modeRecords[state.level]) return;
  modeRecords[state.level] = state.score;
  try { localStorage.setItem(modeConfig.value.storageKey, JSON.stringify(modeRecords)); }
  catch { storageAvailable.value = false; }
}

function clearHighlights(): void {
  clearTimeout(hintTimer);
  hintTimer = undefined;
  hinted.value = [];
  wrong.value = [];
  state.selected = null;
}

function clearMatchAnimation(): void {
  clearTimeout(animationTimer);
  animationTimer = undefined;
  connectionPath.value = [];
  connectionPoints.value = '';
  matched.value = [];
  state.locked = false;
}

function newGame(level: Level = state.level, mode: Mode = state.mode): void {
  state.revision += 1;
  clearMatchAnimation();
  clearHighlights();
  const levelConfig = levels[level];
  Object.assign(state, {
    level, mode, board: createBoard(levelConfig.rows, levelConfig.cols, levelConfig.types), status: 'ready',
    score: 0, remaining: levelConfig.seconds * 1000, deadline: 0,
    hints: levelConfig.tools, shuffles: levelConfig.tools, combo: 0, lastMatch: 0,
  });
  loadRecords();
  comboVisible.value = false;
  confetti.value = [];
  gameMessage.value = `${modeConfig.value.name}已就绪，点击「开始游戏」，收集今天的小快乐。`;
}

function startGame(): void {
  if (disposed || modal.value || document.hidden) return;
  if (state.status === 'ready' || state.status === 'paused') {
    state.status = 'playing';
    state.deadline = timed.value ? performance.now() + state.remaining : 0;
    gameMessage.value = modeConfig.value.description;
  }
}

function pauseGame(): void {
  if (state.status !== 'playing') return;
  if (timed.value) {
    state.remaining = Math.max(0, state.deadline - performance.now());
    if (state.remaining === 0) { finishGame(remainingPairs.value === 0); return; }
  }
  state.status = 'paused';
  state.combo = 0;
  state.lastMatch = 0;
  overlay.value = { symbol: 'pause', title: '休息一下', description: '小美好就在这里，等你回来。', action: '继续游戏' };
  gameMessage.value = timed.value ? '已为你暂停计时，准备好后再继续。' : '棋盘已暂停，准备好后再继续。';
}

function toggleGame(): void {
  if (disposed || modal.value) return;
  if (state.status === 'playing') pauseGame();
  else if (state.status === 'won' || state.status === 'lost') { newGame(); startGame(); }
  else startGame();
}

function stopVoices(): void {
  for (const voice of voices) {
    voice.oscillator.onended = null;
    voice.oscillator.stop();
    voice.oscillator.disconnect();
    voice.gain.disconnect();
  }
  voices.clear();
}

function playTone(frequencies: readonly number[], duration = 0.13): void {
  if (!soundEnabled.value || !audio || disposed || audio.state === 'closed') return;
  if (audio.state === 'suspended') void audio.resume().catch(() => {});
  frequencies.forEach((frequency, index) => {
    if (!audio) return;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    const voice = { oscillator, gain };
    voices.add(voice);
    const time = audio.currentTime + index * 0.09;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.055, time + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(voice);
    };
  });
}

function toggleSound(): void {
  const AudioConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioConstructor) {
    gameMessage.value = '当前浏览器不支持音效，静静享受游戏也很好。';
    return;
  }
  try {
    if (!audio) audio = new AudioConstructor();
    soundEnabled.value = !soundEnabled.value;
    if (soundEnabled.value) playTone([523.25, 659.25]);
    else stopVoices();
  } catch {
    soundEnabled.value = false;
    gameMessage.value = '暂时无法开启音效，静静享受游戏也很好。';
  }
}

function updateConnection(): void {
  const board = boardElement.value;
  const layer = connectionLayer.value;
  if (disposed || !board || !layer || connectionPath.value.length === 0) return;
  const origin = layer.getBoundingClientRect();
  const grid = board.getBoundingClientRect();
  const tileCenter = (row: number, col: number) => {
    const tile = board.querySelector<HTMLButtonElement>(`[data-row="${row}"][data-col="${col}"]`);
    if (!tile) return null;
    const bounds = tile.getBoundingClientRect();
    return { x: bounds.left + bounds.width / 2 - origin.left, y: bounds.top + bounds.height / 2 - origin.top };
  };
  // SVG coordinates are relative to the layer, not to nested offsetParents. Boundary
  // bends use the middle of the real padding gutter, never a clamped tile center.
  const points = connectionPath.value.map(({ row, col }) => {
    const center = tileCenter(Math.max(0, Math.min(config.value.rows - 1, row)),
      Math.max(0, Math.min(config.value.cols - 1, col)));
    if (!center) return '';
    const x = col < 0 ? (grid.left - origin.left) / 2
      : col >= config.value.cols ? (grid.right - origin.left + origin.width) / 2 : center.x;
    const y = row < 0 ? (grid.top - origin.top) / 2
      : row >= config.value.rows ? (grid.bottom - origin.top + origin.height) / 2 : center.y;
    return `${x},${y}`;
  });
  connectionPoints.value = points.join(' ');
}

function drawConnection(path: Point[]): void {
  connectionPath.value = path;
  const revision = state.revision;
  void nextTick(() => {
    if (!disposed && revision === state.revision) updateConnection();
  });
}

function showCombo(points: number): void {
  comboText.value = state.combo > 1 ? `${state.combo} 连击 · +${points}` : `小美好 +${points}`;
  comboVersion.value += 1;
  comboVisible.value = true;
}

function chooseTile(cell: Point, event: MouseEvent): void {
  if (disposed || modal.value) return;
  if (state.status === 'ready') startGame();
  if (state.status !== 'playing' || state.locked || state.board[cell.row][cell.col] === null) return;
  if (timed.value && performance.now() >= state.deadline) { tick(); return; }
  const previous = state.selected;
  clearHighlights();
  if (sameCell(previous, cell)) return;
  if (!previous) {
    state.selected = cell;
    playTone([440], 0.08);
    return;
  }
  const path = findPath(state.board, previous, cell);
  if (!path) {
    state.selected = cell;
    wrong.value = [previous, cell];
    state.combo = 0;
    state.lastMatch = 0;
    gameMessage.value = state.board[previous.row][previous.col] === state.board[cell.row][cell.col]
      ? '这条路被挡住啦，试试别的相同水果吧。' : '要选相同的水果哦，已经为你选中这一枚。';
    return;
  }
  const type = state.board[cell.row][cell.col];
  if (type === null) return;
  const focusedTile = event.detail === 0 && event.currentTarget === document.activeElement ? document.activeElement : null;
  state.locked = true;
  matched.value = [{ ...previous, type }, { ...cell, type }];
  drawConnection(path);
  const now = performance.now();
  state.combo = now - state.lastMatch < 5000 ? state.combo + 1 : 1;
  state.lastMatch = now;
  const points = 100 + Math.min(state.combo - 1, 5) * 20;
  state.score += points;
  state.board[previous.row][previous.col] = null;
  state.board[cell.row][cell.col] = null;
  showCombo(points);
  playTone([523.25, 659.25, 783.99]);
  saveRecord();
  gameMessage.value = state.combo > 1 ? `好默契！${state.combo} 次连续配对，本次收获 ${points} 分。` : '又连起了一份小美好，继续加油。';
  const revision = state.revision;
  animationTimer = setTimeout(() => {
    if (disposed || revision !== state.revision || state.status === 'won' || state.status === 'lost') return;
    clearMatchAnimation();
    if (state.mode === 'gravity') state.board = applyGravity(state.board);
    if (remainingPairs.value === 0) finishGame(true);
    else if (!findMove(state.board)) {
      state.board = shuffleBoard(state.board);
      gameMessage.value = '暂时没有可连的水果，已为你免费洗牌，快乐继续。';
    }
    if (focusedTile) void nextTick(() => {
      if (disposed || revision !== state.revision || modal.value || (state.status !== 'playing' && state.status !== 'won')) return;
      if (document.activeElement !== document.body && document.activeElement !== focusedTile) return;
      if (state.status === 'won') {
        boardWrap.value?.querySelector<HTMLButtonElement>('#overlay-action')?.focus();
        return;
      }
      const remaining = Array.from(boardElement.value?.querySelectorAll<HTMLButtonElement>('.tile:not(:disabled)') ?? []);
      const index = cell.row * config.value.cols + cell.col;
      const next = remaining.find(tile => Number(tile.dataset.row) * config.value.cols + Number(tile.dataset.col) > index) ?? remaining[0];
      next?.focus();
    });
  }, 260);
}

function useHint(): void {
  if (disposed || modal.value || toolsBlocked.value || (timed.value && state.hints <= 0)) return;
  if (timed.value && performance.now() >= state.deadline) { tick(); return; }
  clearHighlights();
  const move = findMove(state.board);
  if (!move) return;
  if (timed.value) state.hints -= 1;
  hinted.value = [move.start, move.end];
  const { start, end } = move;
  const fruit = fruits[state.board[start.row][start.col]!][1];
  const allowance = timed.value ? `剩余${state.hints}次提示。` : '悠闲模式提示不限次数。';
  gameMessage.value = `提示：${fruit}，第${start.row + 1}行第${start.col + 1}列与第${end.row + 1}行第${end.col + 1}列可以配对。${allowance}`;
  const revision = state.revision;
  hintTimer = setTimeout(() => {
    if (!disposed && revision === state.revision) hinted.value = [];
  }, 4500);
}

function useShuffle(): void {
  if (disposed || modal.value || toolsBlocked.value || (timed.value && state.shuffles <= 0)) return;
  if (timed.value && performance.now() >= state.deadline) { tick(); return; }
  clearHighlights();
  state.board = shuffleBoard(state.board);
  if (timed.value) state.shuffles -= 1;
  state.combo = 0;
  state.lastMatch = 0;
  playTone([392, 523.25]);
  gameMessage.value = '换个位置，换个心情。新的小美好已经就位。';
}

function celebrate(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  confetti.value = Array.from({ length: 42 }, (_, id) => ({
    id,
    style: {
      left: `${Math.random() * 100}%`,
      background: ['#a6bd85', '#e4cf91', '#dce6b4', '#dfb78a'][id % 4],
      animationDelay: `${Math.random() * 0.6}s`,
      animationDuration: `${2 + Math.random() * 1.5}s`,
    },
  }));
}

function finishGame(won: boolean): void {
  if (disposed || state.status === 'won' || state.status === 'lost') return;
  clearMatchAnimation();
  clearHighlights();
  if (timed.value && state.status === 'playing') state.remaining = Math.max(0, state.deadline - performance.now());
  state.status = won ? 'won' : 'lost';
  if (won) {
    const bonus = timed.value ? Math.ceil(state.remaining / 1000) * 5 : 0;
    state.score += bonus;
    overlay.value = {
      symbol: 'trophy', title: '小美好，全部收集！',
      description: `收获 ${state.score.toLocaleString('zh-CN')} 分，${timed.value ? `其中时间奖励 ${bonus} 分` : '悠闲模式不计时间奖励'}。\n这一刻的快乐，属于你。`, action: '再玩一局',
    };
    gameMessage.value = '恭喜通关！换个玩法或难度，再来一次小挑战。';
    playTone([523.25, 659.25, 783.99, 1046.5], 0.25);
    celebrate();
  } else {
    state.remaining = 0;
    overlay.value = {
      symbol: 'heart', title: '差一点点，也很棒',
      description: `这次收集了 ${state.score.toLocaleString('zh-CN')} 分的小美好。\n不用着急，再试一次吧。`, action: '再试一次',
    };
    gameMessage.value = '时间到了。下一次，一定会连起更多小美好。';
  }
  saveRecord();
}

function tick(): void {
  if (disposed || state.status !== 'playing' || !timed.value) return;
  state.remaining = Math.max(0, state.deadline - performance.now());
  if (state.remaining === 0) finishGame(remainingPairs.value === 0);
}

function openModal(options: ModalOptions): void {
  if (disposed || modal.value) return;
  resumeAfterModal = state.status === 'playing';
  if (resumeAfterModal) pauseGame();
  modal.value = options;
  void nextTick(() => {
    if (!disposed && modal.value && modalElement.value && !modalElement.value.open) modalElement.value.showModal();
  });
}

function closeModal(): void {
  modalElement.value?.close();
}

function onModalClosed(): void {
  modal.value = null;
  const shouldResume = resumeAfterModal;
  resumeAfterModal = false;
  if (!disposed && shouldResume && state.status === 'paused' && !document.hidden) startGame();
}

function confirmModal(): void {
  const action = modal.value?.action;
  if (action) {
    resumeAfterModal = false;
    action();
  }
  closeModal();
}

function requestRestart(level: Level = state.level, mode: Mode = state.mode): void {
  if (state.status === 'playing' || state.status === 'paused') {
    const switchingMode = mode !== state.mode;
    openModal({
      title: switchingMode ? `切换到${modes[mode].name}？`
        : level === state.level ? '重新收集小美好？' : `切换到${levels[level].name}难度？`,
      content: '当前棋盘和计时将重置，各玩法、各难度的最佳分数会分别保留。',
      confirm: switchingMode ? '切换玩法' : level === state.level ? '重新开始' : '切换难度',
      action: () => newGame(level, mode),
    });
  } else newGame(level, mode);
}

function showRules(): void {
  openModal({
    title: '快乐很简单',
    content: `1. 点击两枚相同的水果，连线最多转两次弯。\n2. 连线不能穿过其他水果，但可以经过棋盘外侧。\n3. ${modeConfig.value.name}：${modeConfig.value.description}\n\n每对水果 100 分；5 秒内连续配对，连击每级额外加 20 分，最多额外加 100 分。${timed.value ? '通关后每剩余 1 秒奖励 5 分。' : '不限时，也不计时间奖励。'}\n\n提示会标出一对可消除的水果；洗牌保留空位和水果数量。${timed.value ? '道具次数由难度决定。' : '提示和洗牌不限次数。'}无解时会自动免费洗牌。切换页面会自动暂停。各玩法、各难度分别记录最高分。\n\n快捷键：空格暂停 / 继续，H 提示，R 洗牌。`,
    confirm: '我知道啦',
  });
}

function onKeyDown(event: KeyboardEvent): void {
  if (modal.value || event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  if (event.code === 'Space' && !target?.closest('button, a')) { event.preventDefault(); toggleGame(); }
  else if (event.key.toLowerCase() === 'h') useHint();
  else if (event.key.toLowerCase() === 'r') useShuffle();
}

function onBlur(): void {
  resumeAfterModal = false;
  pauseGame();
}

function onVisibilityChange(): void {
  if (document.hidden) onBlur();
}

newGame();
onMounted(() => {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', onBlur);
  window.addEventListener('resize', updateConnection);
  window.addEventListener('storage', onStorage);
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(updateConnection);
    if (boardWrap.value) observer.observe(boardWrap.value);
    if (boardElement.value) observer.observe(boardElement.value);
  }
  tickTimer = setInterval(tick, 200);
});
onBeforeUnmount(() => {
  disposed = true;
  state.revision += 1;
  resumeAfterModal = false;
  clearInterval(tickTimer);
  clearMatchAnimation();
  clearHighlights();
  observer?.disconnect();
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('blur', onBlur);
  window.removeEventListener('resize', updateConnection);
  window.removeEventListener('storage', onStorage);
  modalElement.value?.close();
  stopVoices();
  if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  audio = null;
  confetti.value = [];
});
</script>

<template>
  <div class="link-game">

    <div class="page-shell">
      <section class="hero" aria-labelledby="page-title">
        <div>
          <div class="eyebrow"><span></span> A LITTLE BREAK, A LOT OF JOY</div>
          <h1 id="page-title">连起小美好<span>，</span>快乐刚刚好<span class="title-dot">。</span></h1>
          <p>找一找，连一连。给忙碌的生活，留一点轻松的时间。</p>
          <div class="hero-actions">
            <button id="rules-button" class="sound-button" type="button" @click="showRules"><SvgIcon class="icon" aria-hidden="true" name="i-help" /><span>怎么玩</span></button>
            <button id="sound-button" class="sound-button" type="button" :aria-label="soundEnabled ? '关闭音效' : '开启音效'" :aria-pressed="soundEnabled" @click="toggleSound"><SvgIcon class="icon" aria-hidden="true" :name="soundEnabled ? 'i-sound' : 'i-muted'" /><span>音效已{{ soundEnabled ? '开' : '关' }}</span></button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true"><span class="art-spark spark-one">✦</span><span class="art-dots"></span><div class="floating-tile tile-back"><SvgIcon sprite="fruits" name="fruit-cherry" /></div><div class="floating-tile tile-front"><SvgIcon sprite="fruits" name="fruit-cherry" /></div><span class="art-spark spark-two">✦</span><SvgIcon class="art-line" viewBox="0 0 100 50" sprite="illustrations" name="link-art-line" /></div>
      </section>

      <div class="game-layout">
        <section class="game-card" aria-label="连连看游戏">
          <div class="game-heading">
            <div class="game-name"><span class="game-symbol"><SvgIcon class="icon" aria-hidden="true" name="i-grid" /></span><div><h2>{{ modeConfig.title }}</h2><span>小小的连接，大大的快乐</span></div></div>
            <div class="difficulty" role="group" aria-label="游戏难度">
              <button v-for="(level, key) in levels" :key="key" type="button" :data-level="key" :class="{ active: state.level === key }" :aria-pressed="state.level === key" @click="state.level !== key && requestRestart(key)">{{ level.name }}</button>
            </div>
          </div>
          <div class="mode-picker" role="group" aria-label="游戏玩法" aria-describedby="mode-description">
            <button v-for="(mode, key) in modes" :key="key" type="button" :data-mode="key"
              :class="{ active: state.mode === key }" :aria-pressed="state.mode === key" @click="state.mode !== key && requestRestart(state.level, key)">
              <strong>{{ mode.name }}</strong><span>{{ mode.tagline }}</span>
            </button>
          </div>
          <p id="mode-description" class="mode-description">{{ modeConfig.description }}</p>
          <div class="stats-row">
            <div class="stat"><span class="stat-icon score-icon"><SvgIcon class="icon" aria-hidden="true" name="i-spark" /></span><div><span class="stat-label">当前得分</span><strong id="score">{{ state.score.toLocaleString('zh-CN') }}<span>分</span></strong></div></div>
            <div class="stat"><span class="stat-icon time-icon"><SvgIcon class="icon" aria-hidden="true" name="i-clock" /></span><div><span class="stat-label">{{ timed ? '剩余时间' : '悠闲时光' }}</span><strong id="timer" :class="{ urgent: timed && seconds <= 30 && state.status === 'playing' }">{{ timerText }}</strong></div></div>
            <div class="stat"><span class="stat-icon pair-icon"><SvgIcon class="icon" aria-hidden="true" name="i-grid" /></span><div><span class="stat-label">剩余配对</span><strong id="pairs">{{ remainingPairs }}<span>对</span></strong></div></div>
          </div>
          <div id="board-wrap" ref="boardWrap" class="board-wrap">
            <div id="board" ref="boardElement" class="board" :class="{ locked: state.locked }" :style="{ '--cols': config.cols }" :inert="blocked" :aria-label="`水果棋盘，${config.rows}行${config.cols}列`">
              <button v-for="tile in tiles" :key="`${state.revision}-${tile.key}`" type="button" class="tile"
                :class="{ empty: !tile.fruit, selected: tile.selected, hinted: tile.hinted, wrong: tile.wrong, matched: tile.matched }"
                :data-row="tile.row" :data-col="tile.col"
                :disabled="tile.type === null || state.locked" :aria-hidden="!tile.fruit ? true : undefined"
                :aria-label="tile.fruit ? `${tile.fruit[1]}，第${tile.row + 1}行第${tile.col + 1}列` : undefined"
                :aria-pressed="tile.fruit ? tile.selected : undefined" @click="chooseTile({ row: tile.row, col: tile.col }, $event)">
                <SvgIcon v-if="tile.fruit" aria-hidden="true" viewBox="0 0 64 64" sprite="fruits" :name="`fruit-${tile.fruit[0]}`" />
              </button>
            </div>
            <svg id="connection-layer" ref="connectionLayer" class="connection-layer" aria-hidden="true"><polyline id="connection-line" :key="comboVersion" :points="connectionPoints"/></svg>
            <div id="board-overlay" class="board-overlay" :hidden="!blocked">
              <div class="overlay-symbol"><SvgIcon class="icon" aria-hidden="true" :name="`i-${overlay.symbol}`" /></div>
              <h3 id="overlay-title">{{ overlay.title }}</h3><p id="overlay-description">{{ overlay.description }}</p>
              <button id="overlay-action" class="primary-button" type="button" @click="toggleGame"><SvgIcon class="icon" aria-hidden="true" name="i-play" /><span>{{ overlay.action }}</span></button>
            </div>
            <span id="combo-pop" :key="comboVersion" class="combo-pop" :class="{ show: comboVisible }" aria-live="polite" @animationend="comboVisible = false">{{ comboText }}</span>
          </div>
          <div class="game-toolbar">
            <div class="tools">
              <button id="hint-button" class="tool-button" type="button" :disabled="toolsBlocked || (timed && state.hints === 0)" @click="useHint"><SvgIcon class="icon" aria-hidden="true" name="i-bulb" />提示<span id="hint-count" class="count" :aria-label="!timed ? '不限次数' : undefined">{{ timed ? state.hints : '∞' }}</span></button>
              <button id="shuffle-button" class="tool-button" type="button" :disabled="toolsBlocked || (timed && state.shuffles === 0)" @click="useShuffle"><SvgIcon class="icon" aria-hidden="true" name="i-shuffle" />洗牌<span id="shuffle-count" class="count" :aria-label="!timed ? '不限次数' : undefined">{{ timed ? state.shuffles : '∞' }}</span></button>
              <button id="reset-button" class="reset-button" type="button" aria-label="重新开始" title="重新开始" @click="requestRestart()"><SvgIcon class="icon" aria-hidden="true" name="i-reset" /></button>
            </div>
            <button id="start-button" class="primary-button" type="button" @click="toggleGame"><SvgIcon class="icon" aria-hidden="true" :name="state.status === 'playing' ? 'i-pause' : 'i-play'" /><span>{{ startLabel }}</span></button>
          </div>
          <div class="game-note"><SvgIcon class="icon" aria-hidden="true" name="i-bulb" /><span id="game-message" role="status">{{ gameMessage }}</span></div>
        </section>

        <aside class="sidebar">
          <section class="guide-card"><div class="section-heading"><h2>快乐很简单</h2><span>HOW TO PLAY</span></div><ol class="guide-list"><li><span class="step-number step-one">1</span><div><h3>找到相同的水果</h3><p>点击两个一样的图案<br>让它们成为一对好朋友</p></div></li><li><span class="step-number step-two">2</span><div><h3>两次转弯，就能连上</h3><p>连线不能穿过其他图案<br>但可以从棋盘外面绕个弯</p></div></li><li><span class="step-number step-three">3</span><div><h3>消除全部，收获快乐</h3><p>{{ timed ? '在时间结束前清空棋盘' : '不限时间，慢慢清空棋盘' }}<br>{{ state.mode === 'gravity' ? '消除后水果向下补位' : '连续配对还会有额外加分' }}</p></div></li></ol><div class="guide-tip"><SvgIcon class="icon" aria-hidden="true" name="i-heart" />卡住了？提示和洗牌来帮你。</div></section>
          <section class="record-card">
            <div class="section-heading"><h2><SvgIcon class="icon" aria-hidden="true" name="i-trophy" />你的最佳记录</h2><span class="record-badge">{{ config.name }}</span></div>
            <p class="record-mode">{{ modeConfig.name }} · 各玩法独立记录</p>
            <div class="record-value"><strong id="best-score">{{ records[state.mode][state.level].toLocaleString('zh-CN') }}</strong><span>分</span><SvgIcon class="record-spark icon" aria-hidden="true" name="i-spark" /></div>
            <div class="record-bottom"><span id="record-caption" :class="{ 'storage-notice': !storageAvailable }">{{ storageAvailable ? '每一次尝试，都值得被记录' : '浏览器限制存储，记录仅保留于本次打开' }}</span><span>{{ storageAvailable ? '本地保存' : '暂存于此页' }}<SvgIcon v-if="storageAvailable" class="tiny-dot" viewBox="0 0 8 8" aria-hidden="true" sprite="illustrations" name="status-dot" /></span></div>
          </section>
          <section class="break-card"><div class="flower" aria-hidden="true"><SvgIcon viewBox="0 0 100 100" sprite="illustrations" name="link-flower" /></div><span class="break-label">A MOMENT FOR YOURSELF</span><h3>慢慢来，快乐不赶时间。</h3><p>放松眼睛，深呼吸<br>下一对小美好，就在眼前。</p></section>
        </aside>
      </div>
      <footer class="page-footer"><span>简单一点，开心多一点。<SvgIcon class="icon" aria-hidden="true" name="i-heart" /></span><div class="keyboard-hints"><span><kbd>Space</kbd> 暂停 / 继续</span><span><kbd>H</kbd> 提示</span><span><kbd>R</kbd> 洗牌</span></div><span class="footer-brand">MADE FOR YOUR LITTLE BREAK</span></footer>
    </div>

    <dialog id="modal" ref="modalElement" class="modal" aria-labelledby="modal-title" aria-describedby="modal-content" @close="onModalClosed" @cancel.prevent="closeModal">
      <div class="modal-heading"><h2 id="modal-title">{{ modal?.title }}</h2><button id="modal-close" class="reset-button" type="button" aria-label="关闭弹窗" @click="closeModal"><SvgIcon class="icon" aria-hidden="true" name="i-close" /></button></div>
      <div id="modal-content">{{ modal?.content }}</div>
      <div class="modal-actions"><button id="modal-cancel" class="tool-button" type="button" :hidden="!modal?.action" @click="closeModal">取消</button><button id="modal-confirm" class="primary-button" type="button" @click="confirmModal">{{ modal?.confirm ?? '确定' }}</button></div>
    </dialog>
    <div id="confetti" class="confetti" aria-hidden="true"><i v-for="piece in confetti" :key="piece.id" :style="piece.style" @animationend="confetti = confetti.filter((item) => item.id !== piece.id)"></i></div>
  </div>
</template>

<style scoped src="./styles.css"></style>
