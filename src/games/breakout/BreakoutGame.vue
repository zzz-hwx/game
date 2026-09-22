<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { BreakoutGame, WIDTH, HEIGHT, MAX_LEVELS, PADDLE_WIDTH } from './engine';
import { drawGame } from './renderer';

const game = reactive(new BreakoutGame());
const canvas = ref<HTMLCanvasElement | null>(null);
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const best = ref(0);
const storageAvailable = ref(true);
const storageKey = 'little-break-breakout-best-v1';
const announcement = ref('移动挡板，准备好后发球。');
const levelNames = ['初见小美好', '快乐加一层', '最后的彩虹'];
const overlay = computed(() => ({
  ready: { title: '把烦恼，弹走！', text: `第 ${game.level} 关 · ${levelNames[game.level - 1]}。接住小球，打掉每一块小烦恼。`, action: '发球开始' },
  playing: { title: '接住快乐，继续向前', text: '', action: '暂停游戏' },
  paused: { title: '歇一下，快乐还在', text: '小球已停下，准备好了再继续。', action: '继续游戏' },
  'life-lost': { title: '没关系，再接再厉', text: `还有 ${game.lives} 次机会，分数和已消除的砖块都会保留。`, action: '再次发球' },
  won: { title: game.level === MAX_LEVELS ? '小烦恼，全部清空！' : '这一关，漂亮！', text: game.level === MAX_LEVELS ? `三关挑战完成，共收获 ${game.score} 分。给认真玩耍的自己一点掌声。` : '通关奖励 +100 分。下一关，快乐再加一点难度。', action: game.level === MAX_LEVELS ? '再来一局' : '挑战下一关' },
  over: { title: '这局，也很棒', text: `到达第 ${game.level} 关，收获 ${game.score} 分。调整一下角度，再试一次？`, action: '再来一局' },
}[game.status]));
const progress = computed(() => Math.round((game.total - game.remaining) / game.total * 100));
const keys = new Set<string>();
let context: CanvasRenderingContext2D | null = null;
let frame = 0;
let lastTime: number | null = null;
let needsDraw = false;
let pointerId: number | null = null;
let resumeAfterDialog = false;
let reduceMotion = false;
const trail: { x: number; y: number }[] = [];

function direction(): -1 | 0 | 1 {
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  return left === right ? 0 : left ? -1 : 1;
}
function shouldAnimate(): boolean {
  if (document.hidden || confirmDialog.value?.open) return false;
  if (game.status === 'playing') return true;
  if (game.status !== 'ready' && game.status !== 'life-lost') return false;
  return direction() < 0 ? game.paddleX > PADDLE_WIDTH / 2
    : direction() > 0 && game.paddleX < WIDTH - PADDLE_WIDTH / 2;
}
function stopAnimation(): void {
  cancelAnimationFrame(frame);
  frame = 0;
  lastTime = null;
}
function updateAnimation(redraw = false): void {
  needsDraw ||= redraw;
  // Keep a pending final draw, but never leave a frame queued in a hidden tab.
  if (!document.hidden && (needsDraw || shouldAnimate())) {
    if (!frame) frame = requestAnimationFrame(animate);
  } else stopAnimation();
}
function focusBoard(): void { void nextTick(() => board.value?.focus({ preventScroll: true })); }
function resetInput(): void {
  keys.clear();
  if (pointerId !== null && board.value?.hasPointerCapture(pointerId)) board.value.releasePointerCapture(pointerId);
  pointerId = null;
  lastTime = null;
  trail.length = 0;
}
function action(): void {
  if (confirmDialog.value?.open) return;
  if (game.status === 'playing') game.pause();
  else if (game.status === 'won' && game.level < MAX_LEVELS) game.nextLevel();
  else {
    if (game.status === 'over' || game.status === 'won') game.restart();
    game.start();
  }
  resetInput();
  updateAnimation(true);
  announcement.value = game.status === 'playing' ? `第 ${game.level} 关，游戏开始。` : overlay.value.title;
  focusBoard();
}
function autoPause(): void {
  const redraw = game.status === 'playing' || trail.length > 0;
  resetInput();
  resumeAfterDialog = false;
  if (game.status === 'playing') {
    game.pause();
    announcement.value = '游戏已自动暂停，回来后可以继续。';
  }
  updateAnimation(redraw);
}
function visibilityChange(): void {
  if (document.hidden) autoPause();
  else updateAnimation();
}
function requestRestart(): void {
  if (game.status === 'ready' && game.level === 1 && game.score === 0) return;
  resumeAfterDialog = game.status === 'playing';
  game.pause();
  resetInput();
  confirmDialog.value?.showModal();
  updateAnimation(true);
}
function cancelRestart(): void {
  confirmDialog.value?.close();
  if (resumeAfterDialog) game.start();
  resetInput();
  updateAnimation(true);
  focusBoard();
}
function restart(): void {
  confirmDialog.value?.close();
  game.restart();
  resetInput();
  updateAnimation(true);
  announcement.value = '新的一局准备好了，最高纪录已保留。';
  focusBoard();
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || confirmDialog.value?.open) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(event.code)) {
    event.preventDefault();
    keys.add(event.code);
    updateAnimation();
  } else if (event.code === 'Space') {
    event.preventDefault();
    if (!event.repeat) action();
  } else if (event.code === 'Escape') {
    event.preventDefault();
    autoPause();
  } else if (event.code === 'KeyR' && !event.repeat) {
    event.preventDefault();
    requestRestart();
  }
}
function onKeyUp(event: KeyboardEvent): void {
  keys.delete(event.code);
  updateAnimation();
}
function steer(event: PointerEvent): void {
  if (!event.isPrimary || confirmDialog.value?.open) return;
  if (event.pointerType !== 'mouse' && pointerId !== event.pointerId) return;
  const bounds = canvas.value?.getBoundingClientRect();
  const previousX = game.paddleX;
  if (bounds) game.movePaddle((event.clientX - bounds.left) / bounds.width * WIDTH);
  if (game.paddleX !== previousX) updateAnimation(true);
}
function pointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || confirmDialog.value?.open) return;
  pointerId = event.pointerId;
  board.value?.setPointerCapture(event.pointerId);
  steer(event);
  focusBoard();
}
function pointerUp(event: PointerEvent): void {
  if (pointerId !== event.pointerId) return;
  if (board.value?.hasPointerCapture(event.pointerId)) board.value.releasePointerCapture(event.pointerId);
  pointerId = null;
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
function animate(time: number): void {
  frame = 0;
  const dt = lastTime !== null ? Math.min((time - lastTime) / 1000, .05) : 0;
  lastTime = time;
  const previousStatus = game.status;
  if (shouldAnimate()) game.step(dt, direction());
  if (game.status !== previousStatus) {
    resetInput();
    announcement.value = overlay.value.title + '。' + overlay.value.text;
  }
  saveBest();
  if (game.status === 'playing' && !reduceMotion) {
    trail.push({ x: game.ball.x, y: game.ball.y });
    if (trail.length > 8) trail.shift();
  }
  if (context) drawGame(context, game, trail);
  needsDraw = false;
  updateAnimation();
}
onMounted(() => {
  try {
    const value = Number(localStorage.getItem(storageKey));
    if (Number.isSafeInteger(value) && value >= 0) best.value = value;
  } catch { storageAvailable.value = false; }
  reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (canvas.value) {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.value.width = WIDTH * ratio;
    canvas.value.height = HEIGHT * ratio;
    context = canvas.value.getContext('2d');
    context?.scale(ratio, ratio);
    if (context) drawGame(context, game, trail);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', visibilityChange);
  window.addEventListener('blur', autoPause);
  window.addEventListener('storage', syncBest);
});
onBeforeUnmount(() => {
  stopAnimation();
  resetInput();
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup', onKeyUp);
  document.removeEventListener('visibilitychange', visibilityChange);
  window.removeEventListener('blur', autoPause);
  window.removeEventListener('storage', syncBest);
});
</script>

<template>
  <main class="breakout-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 009 — A LITTLE BOUNCE OF JOY</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="breakout-title">
        <span class="eyebrow">经典街机 · 快乐反弹中</span>
        <h1 id="breakout-title">打砖块<span>.</span></h1>
        <span class="english-title">B R E A K O U T</span>
        <h2>把小烦恼，<br>一块块<span class="highlight">击碎。</span></h2>
        <p class="intro-copy">接住一点快乐，弹走一点压力。<br>让今天的心情，轻盈一点点。</p>
        <span class="mode-tag"><SvgIcon name="i-grid" /> 三关挑战 <b>·</b> 三次机会</span>
        <section class="controls-guide" aria-labelledby="breakout-controls-title">
          <h3 id="breakout-controls-title">快乐，接在手里<span>KEEP THE GOOD THINGS BOUNCING</span></h3>
          <div class="keyboard" aria-hidden="true"><kbd>←</kbd><kbd>→</kbd><span>或</span><kbd>A</kbd><kbd>D</kbd></div>
          <p id="breakout-help">移动鼠标、左右方向键 / A D 控制挡板。<br>手机在球场内左右拖动即可。<br>空格发球 / 暂停，Esc 暂停，R 重开。</p>
        </section>
        <div class="bounce-sketch" aria-hidden="true"><i></i><span></span><b></b></div>
        <p class="slow-note">偶尔落空也没关系，<br>下一次，又是新的角度。</p>
      </section>

      <section class="play-area" aria-label="打砖块游戏">
        <div class="score-strip">
          <div><span>本局得分 <small>SCORE</small></span><strong id="breakout-score">{{ String(game.score).padStart(4, '0') }}</strong></div>
          <div><span><SvgIcon name="icon-cup" /> 最高纪录</span><strong id="breakout-best">{{ String(best).padStart(4, '0') }}</strong></div>
          <div><span>当前关卡</span><strong id="breakout-level">{{ String(game.level).padStart(2, '0') }}<small> / 03</small></strong></div>
        </div>
        <div class="board-shell">
          <div class="board-heading"><span><i></i> {{ levelNames[game.level - 1] }} <small>THE LITTLE BOUNCE</small></span><span class="classic-tag">CLASSIC</span></div>
          <div class="court-frame">
            <div class="court-hud"><span class="lives" :data-lives="game.lives" :aria-label="`剩余 ${game.lives} 条生命`"><i v-for="life in 3" :key="life" :class="{ lost: life > game.lives }"></i><small>LIVES</small></span><span>剩余砖块 <b id="breakout-remaining">{{ game.remaining }}</b></span></div>
            <div ref="board" class="breakout-board" tabindex="0" role="group" aria-label="打砖块球场" aria-describedby="breakout-help"
              :data-state="game.status" :data-paddle="game.paddleX" :data-ball-x="game.ball.x" :data-ball-y="game.ball.y"
              @pointerdown="pointerDown" @pointermove="steer" @pointerup="pointerUp" @pointercancel="pointerUp" @lostpointercapture="pointerId = null">
              <canvas ref="canvas" :width="WIDTH" :height="HEIGHT" role="img" :aria-label="`第 ${game.level} 关球场，剩余 ${game.remaining} 块砖，${game.lives} 条生命。`">移动挡板接住小球，消除全部砖块。</canvas>
              <div v-if="game.status !== 'playing'" class="board-overlay" @pointerdown.stop @pointermove.stop @pointerup.stop>
                <div class="overlay-card" role="region" aria-labelledby="breakout-overlay-title">
                  <div class="mini-bricks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>
                  <span class="overlay-eyebrow">A LITTLE BOUNCE. A LOT OF JOY.</span>
                  <h2 id="breakout-overlay-title">{{ overlay.title }}</h2>
                  <p>{{ overlay.text }}</p>
                  <button id="breakout-overlay-action" class="gold-button" @click="action">{{ overlay.action }}<SvgIcon name="icon-arrow" /></button>
                  <span class="overlay-hint">也可以按空格键 · 慢慢来，接得住</span>
                </div>
              </div>
            </div>
            <div class="court-note"><span>↔</span> 移动鼠标 / 左右方向键 / 触屏拖动</div>
          </div>
          <div class="board-status"><span><i></i>{{ overlay.title }}</span><SvgIcon name="icon-leaf" /></div>
        </div>
        <div class="game-actions"><button id="breakout-start" class="primary-button" @click="action"><SvgIcon :name="game.status === 'playing' ? 'icon-pause' : 'icon-play'" />{{ overlay.action }}<kbd>Space</kbd></button><button id="breakout-restart" class="secondary-button" :disabled="game.status === 'ready' && game.level === 1 && game.score === 0" @click="requestRestart"><SvgIcon name="icon-restart" /> 重新开始</button></div>
        <p class="save-note">{{ storageAvailable ? '最高纪录自动保存在此设备 · 每次进步都算数' : '浏览器存储不可用，仍可正常游玩' }}</p>
      </section>

      <aside class="sidebar">
        <section class="palette-card" aria-labelledby="breakout-palette-title">
          <div class="section-heading"><h2 id="breakout-palette-title">今日解压清单</h2><span>LESS STRESS</span></div>
          <p class="card-subtitle">一小块，一小块，把心情腾空。</p>
          <div class="palette-item"><i class="sample-brick"></i><div><h3>轻轻一碰</h3><p>普通砖块，击中一次消除</p></div><strong>+10</strong></div>
          <div class="palette-item"><i class="sample-brick reinforced"></i><div><h3>再接再厉</h3><p>双层砖块，需要击中两次</p></div><strong>+20</strong></div>
          <div class="palette-bonus"><SvgIcon name="i-spark" /><span>清空整面砖墙</span><strong>+100</strong></div>
        </section>
        <section class="progress-card">
          <div class="section-heading"><h2>烦恼清空进度</h2><strong>{{ progress }}<small>%</small></strong></div>
          <div class="progress-meter" role="progressbar" aria-label="本关消除进度" :aria-valuenow="progress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: `${progress}%` }"></span></div>
          <p>已消除 {{ game.total - game.remaining }} / {{ game.total }} 块，快乐正在一点点变多。</p>
        </section>
        <section class="rules-card" aria-labelledby="breakout-rules-title">
          <div class="section-heading"><h2 id="breakout-rules-title">一点反弹小技巧</h2><span>HOW TO PLAY</span></div>
          <ol><li><span>01</span><div><h3>接住，就有下一次</h3><p>左右移动挡板，不要让小球落到底部。每局共有三条生命，三关共用。</p></div></li><li><span>02</span><div><h3>换个角度，打破僵局</h3><p>靠近挡板边缘接球，反弹角度更大。用中间接球，小球会更向上。</p></div></li><li><span>03</span><div><h3>越玩越有一点挑战</h3><p>后面的砖块会变厚，小球也会加速。按空格或离开窗口，随时歇一歇。</p></div></li></ol>
        </section>
      </aside>
    </div>
    <footer><span><i></i> 接住小快乐，给生活一点回弹。</span><span>MAKE ROOM FOR JOY. <b>↗</b></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="breakout-confirm-title" @cancel.prevent="cancelRestart"><span class="eyebrow">A FRESH LITTLE START</span><h2 id="breakout-confirm-title">重新开始这一场快乐？</h2><p>本局分数、生命和关卡将重置，最高纪录会保留。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelRestart">继续本局</button><button class="primary-button" @click="restart">确定重开</button></div></dialog>
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </main>
</template>

<style scoped src="./styles.css"></style>
