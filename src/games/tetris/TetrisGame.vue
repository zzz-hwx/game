<script setup lang="ts">
import SvgIcon from '../../components/SvgIcon.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { COLS, ROWS, SHAPES, Tetris } from './engine';
import type { GameState, PieceType } from './engine';

type Action = 'left' | 'right' | 'rotate' | 'down' | 'drop' | 'hold' | 'tick';
type OverlayMessage = { eyebrow: string; title: string; description: string; button: string; hint: string };
type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

const root = ref<HTMLDivElement | null>(null);
const boardCanvas = ref<HTMLCanvasElement | null>(null);
const holdCanvas = ref<HTMLCanvasElement | null>(null);
const next0 = ref<HTMLCanvasElement | null>(null);
const next1 = ref<HTMLCanvasElement | null>(null);
const next2 = ref<HTMLCanvasElement | null>(null);
const nextCanvases = [next0, next1, next2];
const helpDialog = ref<HTMLDialogElement | null>(null);
const restartDialog = ref<HTMLDialogElement | null>(null);
const game = reactive(new Tetris());
const best = ref(0);
const soundEnabled = ref(false);
const announcer = ref('');
const clearNotice = ref('');
const clearNoticeId = ref(0);
const colors: Record<PieceType, string> = {
  I: '#aacbc6', O: '#e1cd91', T: '#b8acd0', S: '#b6d394', Z: '#d69f99', J: '#97b4cb', L: '#d8b38b',
};
const statusLabels: Record<GameState, string> = {
  ready: '准备就绪', running: '游戏进行中', paused: '休息一下', over: '本局结束',
};
const paddedLevel = computed(() => String(game.level).padStart(2, '0'));
const levelBadge = computed(() => game.level < 3 ? '慢慢来' : game.level < 6 ? '渐入佳境' : '心流时刻');
const overlay = computed<OverlayMessage>(() => {
  if (game.state === 'paused') return {
    eyebrow: 'TAKE YOUR TIME', title: '好节奏，也需要停顿。', description: '你的方块会在这里等你。',
    button: '继续游戏', hint: '或按 P / Enter 继续',
  };
  if (game.state === 'over') return {
    eyebrow: 'EVERY END IS A NEW START', title: '这一局，拼得不错。',
    description: `获得 ${game.score.toLocaleString()} 分 · 消除了 ${game.lines} 行`,
    button: '再来一局', hint: '或按 Enter 再来一局',
  };
  return {
    eyebrow: 'MAKE ROOM FOR A LITTLE FUN', title: '准备好，放空一下？', description: '从第一块开始，找到你的节奏。',
    button: '开始游戏', hint: '或按 Enter 开始',
  };
});
const touchControls: { action: Exclude<Action, 'tick'>; label: string; text: string }[] = [
  { action: 'hold', label: '暂存方块', text: 'C' },
  { action: 'left', label: '向左移动', text: '←' },
  { action: 'rotate', label: '旋转方块', text: '↻' },
  { action: 'right', label: '向右移动', text: '→' },
  { action: 'down', label: '加速下落', text: '↓' },
  { action: 'drop', label: '直接落底', text: '落底' },
];
const keyActions: Partial<Record<string, Action>> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'rotate', ArrowDown: 'down', Space: 'drop', KeyC: 'hold',
};

let context: CanvasRenderingContext2D | null = null;
let audio: AudioContext | undefined;
const voices = new Map<OscillatorNode, GainNode>();
let elapsed = 0;
let lastTime = 0;
let frameId = 0;
let renderedState: GameState | undefined;
let resumeAfterHelp = false;
let resumeAfterRestart = false;
let disposed = false;
let touchDelay: ReturnType<typeof setTimeout> | undefined;
let touchRepeat: ReturnType<typeof setInterval> | undefined;

function tone(frequency: number, duration = 0.06, volume = 0.035): void {
  if (!soundEnabled.value || disposed) return;
  try {
    const AudioConstructor = window.AudioContext || (window as AudioWindow).webkitAudioContext;
    if (!AudioConstructor) return;
    audio ??= new AudioConstructor();
    if (audio.state === 'suspended') void audio.resume().catch(() => {});
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    voices.set(oscillator, gain);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      voices.delete(oscillator);
    };
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {
    // Audio support and autoplay permissions are optional.
  }
}

function silence(): void {
  for (const [oscillator, gain] of voices) {
    oscillator.onended = null;
    try { oscillator.stop(); } catch { /* The note may already have ended. */ }
    oscillator.disconnect();
    gain.disconnect();
  }
  voices.clear();
}

function block(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, ghost = false): void {
  const gap = size > 40 ? 3 : 2;
  ctx.beginPath();
  ctx.roundRect(x + gap, y + gap, size - gap * 2, size - gap * 2, size * 0.08);
  if (ghost) {
    ctx.fillStyle = '#c8e2ad08';
    ctx.fill();
    ctx.strokeStyle = '#c2dda66b';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    return;
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = '#ffffff32';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#ffffff25';
  ctx.fillRect(x + gap + 3, y + gap + 2, size - gap * 2 - 6, 2);
  ctx.fillStyle = '#142e1714';
  ctx.fillRect(x + gap + 2, y + size - gap - 5, size - gap * 2 - 4, 3);
}

function drawBoard(): void {
  const canvas = boardCanvas.value;
  const ctx = context;
  if (!canvas || !ctx) return;
  const cellSize = canvas.width / COLS;
  ctx.fillStyle = '#202c28';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#b9d0b008';
  ctx.lineWidth = 1;
  for (let x = 0; x <= COLS; x++) {
    ctx.beginPath(); ctx.moveTo(x * cellSize, 0); ctx.lineTo(x * cellSize, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= ROWS; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * cellSize); ctx.lineTo(canvas.width, y * cellSize); ctx.stroke();
  }
  if (game.state === 'ready') {
    const scene: [number, number, PieceType][] = [
      [0, 19, 'S'], [1, 19, 'S'], [1, 18, 'S'], [2, 18, 'S'],
      [3, 19, 'I'], [4, 19, 'I'], [5, 19, 'I'], [6, 19, 'I'],
      [7, 19, 'L'], [8, 19, 'L'], [9, 19, 'L'], [9, 18, 'L'],
      [0, 18, 'J'], [0, 17, 'J'], [1, 17, 'J'], [2, 17, 'J'],
      [7, 18, 'O'], [8, 18, 'O'], [7, 17, 'O'], [8, 17, 'O'],
      [4, 18, 'T'], [3, 17, 'T'], [4, 17, 'T'], [5, 17, 'T'],
    ];
    ctx.globalAlpha = 0.35;
    scene.forEach(([x, y, type]) => block(ctx, x * cellSize, y * cellSize, cellSize, colors[type]));
    ctx.globalAlpha = 1;
    return;
  }
  game.board.forEach((row, y) => row.forEach((type, x) => {
    if (type) block(ctx, x * cellSize, y * cellSize, cellSize, colors[type]);
  }));
  if (game.state === 'over') return;
  const ghost = game.ghostY();
  game.active.matrix.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) block(ctx, (game.active.x + x) * cellSize, (ghost + y) * cellSize, cellSize, colors[game.active.type], true);
  }));
  game.active.matrix.forEach((row, y) => row.forEach((cell, x) => {
    if (cell) block(ctx, (game.active.x + x) * cellSize, (game.active.y + y) * cellSize, cellSize, colors[game.active.type]);
  }));
}

function preview(target: HTMLCanvasElement | null, type: PieceType | null | undefined, opacity = 1): void {
  const ctx = target?.getContext('2d');
  if (!target || !ctx) return;
  ctx.clearRect(0, 0, target.width, target.height);
  if (!type) return;
  const cells: [number, number][] = [];
  SHAPES[type].forEach((row, y) => row.forEach((cell, x) => { if (cell) cells.push([x, y]); }));
  const minX = Math.min(...cells.map(cell => cell[0]));
  const minY = Math.min(...cells.map(cell => cell[1]));
  const width = Math.max(...cells.map(cell => cell[0])) - minX + 1;
  const height = Math.max(...cells.map(cell => cell[1])) - minY + 1;
  const size = 34;
  const startX = (target.width - width * size) / 2;
  const startY = (target.height - height * size) / 2;
  ctx.globalAlpha = opacity;
  cells.forEach(([x, y]) => block(ctx, startX + (x - minX) * size, startY + (y - minY) * size, size, colors[type]));
  ctx.globalAlpha = 1;
}

function render(): void {
  if (disposed) return;
  drawBoard();
  if (game.score > best.value) {
    best.value = game.score;
    try { localStorage.setItem('between-blocks-best', String(best.value)); } catch { /* Storage may be unavailable. */ }
  }
  nextCanvases.forEach((canvas, index) => preview(canvas.value, game.queue[index], index ? 0.7 : 1));
  preview(holdCanvas.value, game.held, game.canHold ? 1 : 0.4);
  if (renderedState !== game.state) {
    renderedState = game.state;
    announcer.value = game.state === 'running' ? statusLabels.running : `${overlay.value.title} ${overlay.value.description}`;
  }
}

function hasDialog(): boolean {
  return Boolean(helpDialog.value?.open || restartDialog.value?.open);
}

function focusBoard(): void {
  boardCanvas.value?.focus({ preventScroll: true });
}

function start(): void {
  if (disposed || hasDialog()) return;
  if (game.state === 'over') {
    game.reset();
    clearNotice.value = '';
  }
  game.start();
  elapsed = 0;
  tone(440, 0.12);
  render();
  focusBoard();
}

function togglePause(): void {
  if (disposed || hasDialog()) return;
  stopTouch();
  if (game.state === 'running') game.pause();
  else if (game.state === 'paused') game.start();
  elapsed = 0;
  render();
  focusBoard();
}

function act(action: Action): void {
  if (disposed || game.state !== 'running' || hasDialog()) return;
  game.lastClear = 0;
  const previousLines = game.lines;
  const previousPiece = game.active;
  let changed = false;
  if (action === 'left') changed = game.move(-1);
  if (action === 'right') changed = game.move(1);
  if (action === 'rotate') changed = game.rotate();
  if (action === 'down') { changed = game.step(true); elapsed = 0; }
  if (action === 'drop') { changed = game.hardDrop(); elapsed = 0; }
  if (action === 'hold') { changed = game.hold(); elapsed = 0; }
  if (action === 'tick') changed = game.step();
  if (!changed) return;
  if (previousPiece !== game.active && action !== 'rotate') elapsed = 0;
  if (game.lines > previousLines) {
    const count = game.lines - previousLines;
    clearNotice.value = ['', 'NICE!', 'DOUBLE!', 'TRIPLE!', 'TETRIS!'][count] ?? '';
    clearNoticeId.value++;
    announcer.value = `消除 ${count} 行，当前 ${game.score} 分`;
    tone(count === 4 ? 880 : 660, 0.22, 0.06);
  } else if (action === 'drop') tone(180, 0.13, 0.065);
  else if (action === 'rotate' || action === 'hold') tone(360, 0.05);
  else if (action !== 'tick') tone(250, 0.025, 0.02);
  // Engine calls can change state; read it again after the action.
  if ((game.state as GameState) === 'over') {
    stopTouch();
    tone(110, 0.4, 0.06);
  }
  render();
}

function restart(): void {
  if (disposed || hasDialog()) return;
  stopTouch();
  if (game.state === 'ready' || game.state === 'over') {
    game.reset();
    clearNotice.value = '';
    start();
    return;
  }
  resumeAfterRestart = game.state === 'running';
  game.pause();
  render();
  restartDialog.value?.showModal();
}

function confirmRestart(): void {
  resumeAfterRestart = false;
  restartDialog.value?.close();
  game.reset();
  clearNotice.value = '';
  start();
}

function closeRestart(): void {
  const resume = resumeAfterRestart;
  resumeAfterRestart = false;
  if (resume && !disposed && !document.hidden) start();
}

function openHelp(): void {
  if (disposed || hasDialog()) return;
  stopTouch();
  resumeAfterHelp = game.state === 'running';
  game.pause();
  render();
  helpDialog.value?.showModal();
}

function closeHelp(): void {
  const resume = resumeAfterHelp;
  resumeAfterHelp = false;
  if (resume && !disposed && !document.hidden) start();
}

function toggleSound(): void {
  soundEnabled.value = !soundEnabled.value;
  if (soundEnabled.value) tone(520, 0.1);
  else silence();
}

function onKeyDown(event: KeyboardEvent): void {
  if (disposed || hasDialog() || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof Element) {
    // Keep navigation, dialogs, form controls and assistive button activation independent of the game.
    if (target.closest('button, a, input, textarea, select, [role="button"], [role="textbox"], [contenteditable]:not([contenteditable="false"])')) return;
    if (target !== document.body && target !== document.documentElement && !root.value?.contains(target)) return;
  }
  const { code } = event;
  const action = keyActions[code];
  if (action) {
    if (game.state !== 'running') return;
    event.preventDefault();
    if (event.repeat && ['Space', 'KeyC', 'ArrowUp'].includes(code)) return;
    act(action);
  } else if (code === 'KeyP' || code === 'Escape') {
    if (event.repeat) return;
    event.preventDefault();
    togglePause();
  } else if (code === 'KeyR') {
    if (event.repeat) return;
    event.preventDefault();
    restart();
  } else if (code === 'Enter' && game.state !== 'running') {
    if (event.repeat) return;
    event.preventDefault();
    start();
  }
}

function stopTouch(): void {
  clearTimeout(touchDelay);
  clearInterval(touchRepeat);
  touchDelay = undefined;
  touchRepeat = undefined;
}

function touchStart(event: PointerEvent, action: Action): void {
  if (event.button !== 0 || !event.isPrimary) return;
  event.preventDefault();
  stopTouch();
  if (game.state !== 'running' || hasDialog()) return;
  act(action);
  focusBoard();
  const button = event.currentTarget;
  if (button instanceof HTMLButtonElement) button.setPointerCapture(event.pointerId);
  if (game.state === 'running' && ['left', 'right', 'down'].includes(action)) {
    touchDelay = setTimeout(() => {
      touchRepeat = setInterval(() => act(action), 85);
    }, 180);
  }
}

function touchClick(event: MouseEvent, action: Action): void {
  if (event.detail === 0) act(action);
}

function autoPause(): void {
  stopTouch();
  silence();
  resumeAfterHelp = false;
  resumeAfterRestart = false;
  if (game.state === 'running') {
    game.pause();
    elapsed = 0;
    render();
  }
}

function onVisibilityChange(): void {
  if (document.hidden) autoPause();
}

function frame(time: number): void {
  if (disposed) return;
  const delta = lastTime ? Math.min(time - lastTime, 100) : 0;
  lastTime = time;
  if (game.state === 'running') {
    elapsed += delta;
    if (elapsed >= game.interval) { elapsed -= game.interval; act('tick'); }
  }
  frameId = requestAnimationFrame(frame);
}

onMounted(() => {
  try {
    const saved = Number(localStorage.getItem('between-blocks-best'));
    best.value = Number.isFinite(saved) ? Math.max(0, saved) : 0;
  } catch { /* The game also works without storage access. */ }
  context = boardCanvas.value?.getContext('2d') ?? null;
  render();
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('blur', autoPause);
  frameId = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(frameId);
  stopTouch();
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('blur', autoPause);
  resumeAfterHelp = false;
  resumeAfterRestart = false;
  helpDialog.value?.close();
  restartDialog.value?.close();
  silence();
  if (audio && audio.state !== 'closed') void audio.close().catch(() => {});
  audio = undefined;
  context = null;
});
</script>

<template>
  <div ref="root" class="tetris-game">

    <div class="game-layout">
      <section class="intro" aria-labelledby="page-title">
        <div class="eyebrow"><span class="live-dot"></span> 经典游戏，全新心情</div>
        <h1 id="page-title">落下，<br>刚刚好<span class="title-period">。</span></h1>
        <p class="intro-copy">把纷乱拼成秩序，<br>在方块之间，找回一点专注。</p>
        <div class="mode-tag"><span>01</span> 经典 · 无尽模式 <span class="tag-arrow">↗</span></div>
        <div class="intro-actions" aria-label="游戏设置与帮助">
          <button id="sound-button" class="sound-button" :aria-pressed="soundEnabled" :title="soundEnabled ? '关闭音效' : '开启音效'" @click="toggleSound">
            <SvgIcon aria-hidden="true" name="tetris-icon-sound" /><span id="sound-label">{{ soundEnabled ? '音效开' : '音效关' }}</span>
          </button>
          <button id="help-button" class="help-button" aria-label="查看游戏玩法" @click="openHelp">?</button>
        </div>
        <div id="controls-guide" class="controls-guide">
          <h2><SvgIcon aria-hidden="true" name="tetris-icon-key" /> 操作指南 <span>HOW TO PLAY</span></h2>
          <div class="control-row"><span>左右移动</span><div><kbd>←</kbd><kbd>→</kbd></div></div>
          <div class="control-row"><span>旋转方块</span><div><kbd>↑</kbd></div></div>
          <div class="control-row"><span>加速下落</span><div><kbd>↓</kbd></div></div>
          <div class="control-row"><span>直接落底</span><div><kbd class="wide-key">SPACE</kbd></div></div>
          <div class="control-row"><span>暂存 / 暂停</span><div><kbd>C</kbd><span class="key-separator">/</span><kbd>P</kbd></div></div>
        </div>
        <div class="little-note"><span class="note-spark">✳</span><p>不必填满每一分钟。<br>偶尔，消除几行就好。</p></div>
      </section>

      <section class="play-area" aria-label="俄罗斯方块游戏">
        <div class="board-shell">
          <div class="board-topbar"><span><span id="status-dot" class="status-dot" :class="{ running: game.state === 'running' }"></span><span id="status-label">{{ statusLabels[game.state] }}</span></span><span class="board-coordinate">10 × 20</span></div>
          <div id="board-container" class="board-container">
            <canvas id="board" ref="boardCanvas" width="600" height="1200" tabindex="0" aria-label="俄罗斯方块游戏区域，使用方向键移动旋转，空格落底，C 暂存，P 暂停" @pointerdown="focusBoard">请使用支持 Canvas 的浏览器进行游戏。</canvas>
            <div id="game-overlay" class="game-overlay" :hidden="game.state === 'running'">
              <div class="overlay-decoration" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
              <span id="overlay-eyebrow" class="overlay-eyebrow">{{ overlay.eyebrow }}</span>
              <h2 id="overlay-title">{{ overlay.title }}</h2>
              <p id="overlay-description">{{ overlay.description }}</p>
              <button id="start-button" class="start-button" @click="start">{{ overlay.button }} <SvgIcon aria-hidden="true" name="tetris-icon-arrow" /></button>
              <span id="start-hint" class="start-hint">{{ overlay.hint }}</span>
            </div>
            <div id="clear-notice" :key="clearNoticeId" class="clear-notice" :class="{ show: Boolean(clearNotice) }" aria-hidden="true" @animationend="clearNotice = ''">{{ clearNotice }}</div>
          </div>
          <div class="board-bottom"><span><i class="ghost-icon"></i> 虚线为落点预览</span><span id="board-level">LV. {{ paddedLevel }}</span></div>
        </div>
        <div class="game-actions">
          <button id="pause-button" :disabled="game.state === 'ready' || game.state === 'over'" @click="togglePause"><SvgIcon aria-hidden="true" name="tetris-icon-pause" /><span>{{ game.state === 'paused' ? '继续' : '暂停' }}</span><kbd>P</kbd></button>
          <button id="restart-button" @click="restart"><SvgIcon aria-hidden="true" name="tetris-icon-reset" /><span>重新开始</span><kbd>R</kbd></button>
        </div>
        <div class="touch-controls" aria-label="触屏游戏操作">
          <button v-for="control in touchControls" :key="control.action" :data-action="control.action" :class="{ 'touch-drop': control.action === 'drop' }" :aria-label="control.label"
            @pointerdown="touchStart($event, control.action)" @pointerup="stopTouch" @pointercancel="stopTouch" @lostpointercapture="stopTouch" @click="touchClick($event, control.action)">{{ control.text }}</button>
        </div>
        <p class="board-caption">一块一块来，好状态自然会来。</p>
      </section>

      <aside class="dashboard" aria-label="游戏数据">
        <section class="score-card">
          <h2>当前得分 <span>SCORE</span></h2>
          <div id="score" class="score-value">{{ String(game.score).padStart(6, '0') }}</div>
          <div class="best-score"><span><SvgIcon aria-hidden="true" name="tetris-icon-trophy" /> 个人最佳</span><strong id="best-score">{{ best.toLocaleString() }}</strong></div>
        </section>
        <section class="progress-card">
          <div class="stat-row"><div><h2>等级 <span>LEVEL</span></h2><strong id="level">{{ paddedLevel }}</strong></div><span id="level-badge" class="level-badge">{{ levelBadge }}</span></div>
          <div id="level-progress" class="progress-track" role="progressbar" aria-label="升级进度" aria-valuemin="0" aria-valuemax="10" :aria-valuenow="game.lines % 10"><span id="progress-fill" :style="{ width: `${game.lines % 10 * 10}%` }"></span></div>
          <p id="progress-label">再消除 {{ 10 - game.lines % 10 }} 行升级</p>
          <div class="lines-stat"><h2>已消除行数 <span>LINES</span></h2><strong id="lines">{{ String(game.lines).padStart(2, '0') }}</strong></div>
        </section>
        <section class="next-card">
          <h2>下一个 <span>NEXT</span></h2>
          <div class="next-pieces">
            <div class="next-item first-next"><canvas id="next-0" ref="next0" width="240" height="112" aria-label="下一个方块"></canvas><span>01</span></div>
            <div class="next-item"><canvas id="next-1" ref="next1" width="240" height="92" aria-label="第二个待出场方块"></canvas><span>02</span></div>
            <div class="next-item"><canvas id="next-2" ref="next2" width="240" height="92" aria-label="第三个待出场方块"></canvas><span>03</span></div>
          </div>
        </section>
        <section class="hold-card"><h2>暂存方块 <span>HOLD <kbd>C</kbd></span></h2><div class="hold-content"><canvas id="hold" ref="holdCanvas" width="240" height="100" aria-label="暂存的方块"></canvas><span id="hold-hint" :hidden="Boolean(game.held)">留一手，给下一步</span></div></section>
        <p class="save-note"><span></span> 最高分自动保存在此设备</p>
      </aside>
    </div>

    <footer class="site-footer"><span>小小方块，大大快乐。</span><div><span>NO DOWNLOAD. JUST PLAY.</span><i></i><span>MADE FOR YOUR BREAK</span></div><span class="footer-edition">EST. 1984 / REIMAGINED TODAY</span></footer>
    <dialog id="help-dialog" ref="helpDialog" aria-labelledby="help-title" @close="closeHelp">
      <button id="help-close" class="dialog-close" aria-label="关闭说明" @click="helpDialog?.close()">×</button>
      <span class="eyebrow">A CLASSIC, FOR EVERYONE</span><h2 id="help-title">让每一块，恰到好处。</h2>
      <p>移动、旋转下落的方块，填满一整行即可消除。方块堆到顶部时，游戏结束。</p>
      <div class="help-scoring"><span>消除 1 / 2 / 3 / 4 行</span><strong>100 / 300 / 500 / 800 分 × 等级</strong></div>
      <p>每消除 10 行升一级，下落速度会加快。按 <kbd>C</kbd> 暂存方块，每个新方块可暂存一次。虚线轮廓会告诉你方块将落在哪里。</p>
      <p class="help-small">方向键移动和旋转 · 空格落底 · P 暂停 · R 重开<br>手机上可以使用棋盘下方的触屏按钮。</p>
      <button id="help-done" class="start-button" @click="helpDialog?.close()">知道了 <SvgIcon aria-hidden="true" name="tetris-icon-arrow" /></button>
    </dialog>
    <dialog id="restart-dialog" ref="restartDialog" aria-labelledby="restart-title" @close="closeRestart">
      <span class="eyebrow">A FRESH START</span><h2 id="restart-title">重新开始这一局？</h2><p>当前进度会清空，个人最佳会保留。</p>
      <div class="dialog-actions"><button id="restart-cancel" class="secondary-button" autofocus @click="restartDialog?.close()">继续这一局</button><button id="restart-confirm" class="start-button" @click="confirmRestart">重新开始</button></div>
    </dialog>
    <div id="announcer" class="sr-only" role="status" aria-live="polite">{{ announcer }}</div>
  </div>
</template>

<style scoped src="./styles.css"></style>
