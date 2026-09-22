<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { PacmanGame, POWER_TICKS } from './engine';
import type { Direction } from './engine';
import { CELL, drawGame } from './renderer';

const game = reactive(new PacmanGame());
const canvas = ref<HTMLCanvasElement | null>(null);
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const best = ref(0);
const storageAvailable = ref(true);
const storageKey = 'little-break-pacman-best-v1';
const announcement = ref('准备好了，就开始收集快乐吧。');
const controls: { direction: Direction; label: string; symbol: string }[] = [
  { direction: 'up', label: '向上移动', symbol: '↑' },
  { direction: 'left', label: '向左移动', symbol: '←' },
  { direction: 'down', label: '向下移动', symbol: '↓' },
  { direction: 'right', label: '向右移动', symbol: '→' },
];
const keys: Partial<Record<string, Direction>> = {
  ArrowUp: 'up', ArrowLeft: 'left', ArrowDown: 'down', ArrowRight: 'right',
  KeyW: 'up', KeyA: 'left', KeyS: 'down', KeyD: 'right',
};
const overlay = computed(() => ({
  ready: { label: 'A LITTLE CHASE. A LOT OF JOY.', title: '快乐，开吃！', text: '吃光豆豆，躲开幽灵。小小迷宫，等你出发。', action: '开始游戏' },
  paused: { label: 'TAKE A LITTLE BREATHER', title: '休息一下，快乐不跑', text: '迷宫已暂停，准备好了就继续吧。', action: '继续游戏' },
  'life-lost': { label: 'ANOTHER LITTLE CHANCE', title: '没关系，再出发', text: `还有 ${game.lives} 次机会，收集的豆豆和分数都还在。`, action: '继续出发' },
  won: { label: 'EVERY LITTLE DOT COUNTS', title: '这一份快乐，收集完毕！', text: '通关奖励 +500 分。下一关，节奏会快一点点。', action: '挑战下一关' },
  over: { label: 'YOU DID A LOVELY JOB', title: '这趟追逐，很开心！', text: `到达第 ${game.level} 关，收获 ${game.score} 分。再来一次？`, action: '再来一局' },
  playing: { label: '', title: '', text: '', action: '暂停游戏' },
}[game.status]));
const statusText = computed(() => game.status === 'playing'
  ? game.powerTicks > 0 ? '能量满满！现在轮到幽灵躲你了' : '一口一个，慢慢收集小快乐'
  : overlay.value.title);
const powerSeconds = computed(() => (game.powerTicks * game.interval / 1000).toFixed(1));
let context: CanvasRenderingContext2D | null = null;
let frame = 0;
let lastTime = 0;
let accumulator = 0;
let fromPlayer = game.player;
let fromGhosts = game.ghosts.map(ghost => ghost.cell);
let resumeAfterDialog = false;
let reduceMotion = false;
let needsDraw = true;
let pointer: { id: number; x: number; y: number } | null = null;

function focusBoard(): void { void nextTick(() => board.value?.focus({ preventScroll: true })); }

function syncActors(): void {
  fromPlayer = game.player;
  fromGhosts = game.ghosts.map(ghost => ghost.cell);
  accumulator = 0;
  lastTime = 0;
  needsDraw = true;
}

function saveBest(): void {
  if (game.score <= best.value) return;
  best.value = game.score;
  try {
    const value = Number(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(value) && value >= 0) best.value = Math.max(best.value, value);
    localStorage.setItem(storageKey, String(best.value));
  } catch { storageAvailable.value = false; }
}

function syncBest(event: StorageEvent): void {
  if (event.key !== storageKey || event.storageArea !== localStorage) return;
  const value = Number(event.newValue);
  if (Number.isSafeInteger(value) && value >= 0) best.value = Math.max(best.value, value);
}

function action(): void {
  if (confirmDialog.value?.open) return;
  if (game.status === 'playing') game.pause();
  else if (game.status === 'won') game.nextLevel();
  else {
    if (game.status === 'over') game.restart();
    game.start();
  }
  syncActors();
  announcement.value = game.status === 'playing' ? `第 ${game.level} 关，游戏开始。` : statusText.value;
  focusBoard();
}

function steer(direction: Direction): void {
  if (confirmDialog.value?.open) return;
  if (game.status === 'ready') action();
  game.steer(direction);
  focusBoard();
}

function directionPointer(event: PointerEvent, direction: Direction): void {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  steer(direction);
}

function autoPause(): void {
  resumeAfterDialog = false;
  if (game.status !== 'playing') return;
  game.pause();
  syncActors();
  announcement.value = '游戏已自动暂停，回来后可以继续。';
}

function visibilityChange(): void { if (document.hidden) autoPause(); }

function requestRestart(): void {
  if (game.status === 'ready') return;
  resumeAfterDialog = game.status === 'playing';
  game.pause();
  syncActors();
  confirmDialog.value?.showModal();
}

function cancelRestart(): void {
  confirmDialog.value?.close();
  if (resumeAfterDialog) game.start();
  resumeAfterDialog = false;
  syncActors();
  focusBoard();
}

function restart(): void {
  confirmDialog.value?.close();
  game.restart();
  resumeAfterDialog = false;
  syncActors();
  announcement.value = '新的一局准备好了，最高分已保留。';
  focusBoard();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || confirmDialog.value?.open) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  const direction = keys[event.code];
  if (direction) {
    event.preventDefault();
    steer(direction);
  } else if (event.code === 'Space' && !event.repeat) {
    event.preventDefault();
    action();
  } else if (event.code === 'Escape') {
    event.preventDefault();
    autoPause();
  } else if (event.code === 'KeyR' && !event.repeat) {
    event.preventDefault();
    requestRestart();
  }
}

function pointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  board.value?.setPointerCapture(event.pointerId);
  focusBoard();
}

function pointerUp(event: PointerEvent): void {
  if (!pointer || pointer.id !== event.pointerId) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer = null;
  if (board.value?.hasPointerCapture(event.pointerId)) board.value.releasePointerCapture(event.pointerId);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
  steer(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
}

function animate(time: number): void {
  if (game.status === 'playing') {
    accumulator += lastTime ? Math.min(time - lastTime, game.interval * 2) : 0;
    while (accumulator >= game.interval && game.status === 'playing') {
      accumulator -= game.interval;
      fromPlayer = game.player;
      fromGhosts = game.ghosts.map(ghost => ghost.cell);
      const hadPower = game.powerTicks > 0;
      game.tick();
      saveBest();
      if (game.status !== 'playing') {
        syncActors();
        announcement.value = `${overlay.value.title}。${overlay.value.text}`;
      } else if (!hadPower && game.powerTicks > 0) announcement.value = '吃到能量豆！现在可以反击幽灵。';
    }
  }
  lastTime = time;
  if (context && (game.status === 'playing' || needsDraw)) {
    drawGame(context, game, fromPlayer, fromGhosts, reduceMotion || game.status !== 'playing' ? 1 : accumulator / game.interval, reduceMotion || game.status !== 'playing' ? 0 : time);
    needsDraw = false;
  }
  frame = requestAnimationFrame(animate);
}

onMounted(() => {
  try {
    const value = Number(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(value) && value >= 0) best.value = value;
  } catch { storageAvailable.value = false; }
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canvas.value) {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.value.width = game.width * CELL * ratio;
    canvas.value.height = game.height * CELL * ratio;
    context = canvas.value.getContext('2d');
    context?.scale(ratio, ratio);
    if (context) drawGame(context, game, fromPlayer, fromGhosts, 1, 0);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', visibilityChange);
  window.addEventListener('blur', autoPause);
  window.addEventListener('storage', syncBest);
  frame = requestAnimationFrame(animate);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', visibilityChange);
  window.removeEventListener('blur', autoPause);
  window.removeEventListener('storage', syncBest);
  pointer = null;
});
</script>

<template>
  <main class="pacman-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 007 — FOLLOW THE LITTLE JOYS</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="pacman-title">
        <span class="eyebrow">经典街机 · 快乐追逐中</span>
        <h1 id="pacman-title">吃豆人<span>.</span></h1>
        <span class="english-title">P A C - M A N</span>
        <h2>把小烦恼，<br>一口<span class="highlight">吃掉。</span></h2>
        <p class="intro-copy">沿着豆豆的方向，找一点快乐。<br>偶尔转个弯，也会有新的小惊喜。</p>
        <span class="mode-tag"><i class="tiny-pacman"></i> 经典迷宫 <b>·</b> 随时来一局</span>
        <section class="controls-guide" aria-labelledby="pacman-controls-title">
          <h3 id="pacman-controls-title">快乐，往这个方向<span>FOLLOW YOUR APPETITE</span></h3>
          <div class="keyboard" aria-hidden="true"><kbd>↑</kbd><div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div></div>
          <p id="pacman-help">方向键 / WASD 控制方向<br>也可滑动迷宫，或点击方向按钮</p>
          <div class="shortcut-note"><span><kbd>Space</kbd> 暂停 / 继续</span><span><kbd>R</kbd> 重开</span></div>
        </section>
        <div class="chase-sketch" aria-hidden="true"><i class="little-ghost pink"></i><i class="sketch-dot"></i><i class="sketch-dot"></i><i class="little-pacman"></i><i class="sketch-dot"></i></div>
        <p class="slow-note">生活偶尔有点绕，<br>快乐总会在下一个转角。</p>
      </section>

      <section class="play-area" aria-label="吃豆人游戏">
        <div class="score-strip">
          <div><span>本局得分 <small>SCORE</small></span><strong id="pacman-score">{{ String(game.score).padStart(4, '0') }}</strong></div>
          <div><span><SvgIcon name="icon-cup" /> 最高纪录</span><strong id="pacman-best">{{ String(best).padStart(4, '0') }}</strong></div>
          <div><span>当前关卡</span><strong id="pacman-level">{{ String(game.level).padStart(2, '0') }}<small> / ∞</small></strong></div>
        </div>
        <div class="board-shell">
          <div class="board-heading"><span><i class="live-dot"></i> 快乐追逐中 <small>THE LITTLE MAZE</small></span><span class="classic-tag">CLASSIC</span></div>
          <div class="maze-frame">
            <div class="maze-hud"><span class="lives" :aria-label="`剩余 ${game.lives} 条生命`" :data-lives="game.lives"><i v-for="life in 3" :key="life" class="tiny-pacman" :class="{ lost: life > game.lives }"></i><span>LIVES</span></span><span>剩余豆豆 <b id="pacman-remaining">{{ game.remaining }}</b></span></div>
            <div ref="board" class="pacman-board" tabindex="0" role="group" aria-label="吃豆人迷宫" aria-describedby="pacman-help"
              :data-state="game.status" :data-player="game.player" :data-direction="game.direction" :data-power="game.powerTicks" :data-ticks="game.ticks"
              @pointerdown="pointerDown" @pointerup="pointerUp" @pointercancel="pointer = null" @lostpointercapture="pointer = null">
              <canvas ref="canvas" :width="game.width * CELL" :height="game.height * CELL" role="img" :aria-label="`迷宫：吃豆人在第 ${Math.floor(game.player / game.width) + 1} 行、第 ${game.player % game.width + 1} 列，剩余 ${game.remaining} 颗豆豆。`">使用方向键或 WASD 移动，吃光豆豆并躲避幽灵。</canvas>
              <div v-if="game.status !== 'playing'" class="board-overlay" @pointerdown.stop @pointerup.stop>
                <div class="overlay-card" role="region" aria-labelledby="pacman-overlay-title">
                  <span class="overlay-mascot" aria-hidden="true"><i class="little-pacman"></i><i class="sketch-dot"></i><i class="sketch-dot"></i></span>
                  <span class="overlay-eyebrow">{{ overlay.label }}</span>
                  <h2 id="pacman-overlay-title">{{ overlay.title }}</h2>
                  <p>{{ overlay.text }}</p>
                  <button id="pacman-overlay-action" class="gold-button" @click="action">{{ overlay.action }}<SvgIcon name="icon-arrow" /></button>
                  <span class="overlay-hint">{{ game.status === 'ready' ? '方向键 / WASD · 手机触屏也能玩' : '按空格键，也可以继续' }}</span>
                </div>
              </div>
            </div>
            <div class="tunnel-note"><span>↔</span> 两侧通道相连，转个弯就能溜走</div>
          </div>
          <div class="board-status" :class="{ powered: game.powerTicks > 0 }"><span><i></i>{{ statusText }}</span><span v-if="game.powerTicks > 0">{{ powerSeconds }}s</span><SvgIcon v-else name="icon-leaf" /></div>
        </div>
        <div class="game-actions"><button id="pacman-start" class="primary-button" @click="action"><SvgIcon :name="game.status === 'playing' ? 'icon-pause' : 'icon-play'" />{{ overlay.action }}<kbd>Space</kbd></button><button id="pacman-restart" class="secondary-button" :disabled="game.status === 'ready'" @click="requestRestart"><SvgIcon name="icon-restart" /> 重新开始</button></div>
        <div class="under-board"><p>跟着豆豆走，<br><span>下一口快乐，就在前面。</span></p><div class="direction-pad" role="group" aria-label="方向控制"><button v-for="control in controls" :key="control.direction" :class="control.direction" :aria-label="control.label" :disabled="!['ready', 'playing'].includes(game.status)" @pointerdown="directionPointer($event, control.direction)" @click="$event.detail === 0 && steer(control.direction)">{{ control.symbol }}</button></div></div>
        <p class="save-note"><i :class="{ unavailable: !storageAvailable }"></i>{{ storageAvailable ? '最高纪录自动保存在此设备 · 快乐不打烊' : '浏览器存储不可用，仍可正常游玩' }}</p>
      </section>

      <aside class="sidebar">
        <section class="menu-card" aria-labelledby="pacman-menu-title"><div class="section-heading"><h2 id="pacman-menu-title">今日快乐菜单</h2><span>JOY MENU</span></div><p class="card-subtitle">每一小口，都算数。</p>
          <div class="menu-item"><span class="menu-symbol"><i class="pellet-symbol"></i></span><div><h3>小豆豆</h3><p>沿路收集，一颗也别落下</p></div><strong>+10</strong></div>
          <div class="menu-item"><span class="menu-symbol"><i class="power-symbol"></i></span><div><h3>能量豆</h3><p>短暂变强，追着幽灵跑</p></div><strong>+50</strong></div>
          <div class="menu-item"><span class="menu-symbol"><i class="little-ghost blue"></i></span><div><h3>蓝色幽灵</h3><p>连续吃到，奖励会翻倍</p></div><strong>+200<span>起</span></strong></div>
          <div class="menu-bonus"><SvgIcon name="i-spark" /><span>吃光全部豆豆</span><strong>额外 +500</strong></div>
        </section>
        <section class="power-card" :class="{ active: game.powerTicks > 0 }"><div><span class="power-symbol"></span><h2>{{ game.powerTicks > 0 ? '你的高光时刻！' : '小小能量，大大勇气' }}</h2></div><p>{{ game.powerTicks > 0 ? `还有 ${powerSeconds} 秒，去追蓝色幽灵吧！` : '吃下大颗能量豆，幽灵就会变蓝。趁它们恢复之前，勇敢反击吧。' }}</p><div class="power-meter" role="progressbar" aria-label="能量剩余" :aria-valuenow="game.powerTicks" :aria-valuemin="0" :aria-valuemax="POWER_TICKS"><span :style="{ width: `${game.powerTicks / POWER_TICKS * 100}%` }"></span></div></section>
        <section class="rules-card" aria-labelledby="pacman-rules-title"><div class="section-heading"><h2 id="pacman-rules-title">迷宫漫游指南</h2><span>HOW TO PLAY</span></div><ol><li><span>01</span><div><h3>一路吃豆，一路向前</h3><p>吃光迷宫里的豆豆即可过关。提前按方向，到路口自动转弯。</p></div></li><li><span>02</span><div><h3>小心这几位“老朋友”</h3><p>碰到普通幽灵会失去一条生命。你有三次机会，别着急。</p><div class="ghost-friends" aria-hidden="true"><i class="little-ghost pink"></i><i class="little-ghost mint"></i><i class="little-ghost lilac"></i><span>有点调皮，没有恶意。</span></div></div></li><li><span>03</span><div><h3>停下来，也没关系</h3><p>空格键随时暂停，离开页面自动暂停。回来接着快乐就好。</p></div></li></ol></section>
      </aside>
    </div>
    <footer><span><i></i> 不赶时间，只追一点小快乐。</span><span>ONE DOT AT A TIME. <b>↗</b></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="pacman-confirm-title" @cancel.prevent="cancelRestart"><span class="eyebrow">A FRESH LITTLE START</span><h2 id="pacman-confirm-title">开始新的一趟追逐？</h2><p>本局分数和关卡将重置，最高纪录会保留。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelRestart">继续本局</button><button class="primary-button" @click="restart">确定重开</button></div></dialog>
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </main>
</template>

<style scoped src="./styles.css"></style>
