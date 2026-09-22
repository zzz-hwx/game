<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import GameArtwork from '../../components/GameArtwork.vue';
import { FlappyBirdGame, WIDTH, HEIGHT } from './engine';
import { drawGame } from './renderer';

const game = reactive(new FlappyBirdGame());
const canvas = ref<HTMLCanvasElement | null>(null);
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const best = ref(0);
const storageAvailable = ref(true);
const storageKey = 'little-break-flappy-bird-best-v1';
const announcement = ref('准备好了吗？轻轻拍翅，开始一段小小的飞行。');
const overlay = computed(() => ({
  ready: { title: '让快乐，飞一会', text: '轻点屏幕或按空格拍翅，穿过水管间隙。一次一小步，飞远一点点。', action: '开始飞行', label: '准备起飞' },
  playing: { title: '保持节奏，慢慢飞', text: '', action: '暂停游戏', label: '飞行中' },
  paused: { title: '天空会等你', text: '飞行已暂停。准备好后，接着刚才的节奏继续吧。', action: '继续飞行', label: '休息一下' },
  over: { title: '下一次，再远一点', text: `这次穿过了 ${game.score} 道水管。落地也没关系，每一次起飞都是新的可能。`, action: '再飞一次', label: '本局结束' },
}[game.status]));
const flightTime = computed(() => {
  const seconds = Math.floor(game.elapsed);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});
const progress = computed(() => Math.min(game.score, 10) * 10);
let context: CanvasRenderingContext2D | null = null;
let frame = 0;
let lastTime = 0;
let resumeAfterDialog = false;
let reduceMotion = false;

function focusBoard(): void { void nextTick(() => board.value?.focus({ preventScroll: true })); }
function action(): void {
  if (confirmDialog.value?.open) return;
  if (game.status === 'playing') game.pause();
  else if (game.status === 'paused') game.resume();
  else {
    if (game.status === 'over') game.restart();
    game.flap();
  }
  lastTime = 0;
  announcement.value = overlay.value.title;
  focusBoard();
}
function flap(): void {
  if (confirmDialog.value?.open) return;
  if (game.status === 'playing') game.flap();
  else action();
}
function autoPause(): void {
  resumeAfterDialog = false;
  lastTime = 0;
  if (game.status !== 'playing') return;
  game.pause();
  announcement.value = '游戏已自动暂停，回来后可以继续飞行。';
}
function visibilityChange(): void { if (document.hidden) autoPause(); }
function requestRestart(): void {
  if (game.status === 'ready' || confirmDialog.value?.open) return;
  if (game.status === 'over') { restart(); return; }
  resumeAfterDialog = game.status === 'playing';
  game.pause();
  lastTime = 0;
  confirmDialog.value?.showModal();
}
function cancelRestart(): void {
  confirmDialog.value?.close();
  if (resumeAfterDialog) game.resume();
  resumeAfterDialog = false;
  lastTime = 0;
  focusBoard();
}
function restart(): void {
  confirmDialog.value?.close();
  game.restart();
  lastTime = 0;
  resumeAfterDialog = false;
  announcement.value = '新的飞行准备好了，最高纪录已保留。';
  focusBoard();
}
function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || confirmDialog.value?.open) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  if (['Space', 'ArrowUp', 'KeyW', 'KeyP', 'Escape', 'KeyR'].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    if (['Space', 'ArrowUp', 'KeyW'].includes(event.code)) flap();
    else if (event.code === 'Escape') autoPause();
    else if (event.code === 'KeyP' && (game.status === 'playing' || game.status === 'paused')) action();
    else if (event.code === 'KeyR') requestRestart();
  }
}
function pointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || confirmDialog.value?.open) return;
  event.preventDefault();
  if (game.status === 'ready' || game.status === 'playing') flap();
  focusBoard();
}
function saveBest(): void {
  if (game.score <= best.value) return;
  best.value = game.score;
  try { localStorage.setItem(storageKey, String(best.value)); }
  catch { storageAvailable.value = false; }
}
function animate(time: number): void {
  const dt = lastTime ? (time - lastTime) / 1000 : 0;
  lastTime = time;
  const previousStatus = game.status;
  const previousScore = game.score;
  game.step(dt);
  if (previousScore !== game.score) {
    saveBest();
    announcement.value = `成功穿过 ${game.score} 道水管。`;
  }
  if (game.status !== previousStatus) announcement.value = overlay.value.title + '。' + overlay.value.text;
  if (context) drawGame(context, game, reduceMotion ? 0 : time / 1000);
  frame = requestAnimationFrame(animate);
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
    if (context) drawGame(context, game);
  }
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('visibilitychange', visibilityChange);
  window.addEventListener('blur', autoPause);
  frame = requestAnimationFrame(animate);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('visibilitychange', visibilityChange);
  window.removeEventListener('blur', autoPause);
});
</script>

<template>
  <main class="flappy-bird-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 011 — A LITTLE FLIGHT OF FREEDOM</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="flappy-title">
        <span class="eyebrow">反应挑战 · 给心情放个飞行假</span>
        <h1 id="flappy-title">Flappy<br> Bird<span>.</span></h1>
        <span class="english-title">小 小 翅 膀 ， 大 大 天 空</span>
        <h2>轻轻拍翅，<br>把烦恼<span class="highlight">留在地面。</span></h2>
        <p class="intro-copy">不用飞得很快，也不用飞得很高。<br>找到自己的节奏，就很好。</p>
        <section class="controls-guide" aria-labelledby="flappy-controls-title">
          <h3 id="flappy-controls-title">快乐，只需轻轻一点<span>FIND YOUR OWN LITTLE RHYTHM</span></h3>
          <div class="keyboard" aria-hidden="true"><kbd>Space</kbd><span>或</span><kbd>↑</kbd><span>拍翅</span></div>
          <p id="flappy-help">空格 / ↑ / W，或点击画面拍翅。<br>手机轻点画面即可飞行。<br>P 暂停 / 继续，Esc 暂停，R 重开。</p>
        </section>
        <div class="flight-sketch" aria-hidden="true"><GameArtwork kind="flappy-bird" /></div>
        <p class="slow-note">风刚刚好，天空也刚刚好。<br>今天，宜轻装上阵。</p>
      </section>

      <section class="play-area" aria-label="Flappy Bird 游戏">
        <div class="score-strip">
          <div><span>本局得分 <small>SCORE</small></span><strong id="flappy-score">{{ String(game.score).padStart(2, '0') }}</strong></div>
          <div><span><SvgIcon name="icon-cup" /> 最高纪录</span><strong id="flappy-best">{{ String(best).padStart(2, '0') }}</strong></div>
          <div><span>飞行时间</span><strong class="flight-time">{{ flightTime }}</strong></div>
        </div>
        <div class="board-shell">
          <div class="board-heading"><span><i></i> 今日天空 · 晴 <small>A GOOD DAY TO FLY</small></span><span class="classic-tag">CLASSIC</span></div>
          <div ref="board" class="flappy-board" tabindex="0" role="group" aria-label="飞行区域" aria-describedby="flappy-help"
            :data-state="game.status" :data-bird-y="game.bird.y" :data-velocity="game.bird.vy" @pointerdown="pointerDown">
            <canvas ref="canvas" :width="WIDTH" :height="HEIGHT" role="img" :aria-label="`飞行画面，已穿过 ${game.score} 道水管，${overlay.label}。`">轻点拍翅，穿过水管间隙，避开水管、天空顶部和地面。</canvas>
            <div v-if="game.status !== 'playing'" class="board-overlay" @pointerdown.stop>
              <div class="overlay-card" role="region" aria-labelledby="flappy-overlay-title">
                <span class="flight-badge" aria-hidden="true"><SvgIcon :name="game.status === 'paused' ? 'icon-pause' : 'icon-leaf'" /></span>
                <span class="overlay-eyebrow">LITTLE WINGS. BIG LITTLE JOYS.</span>
                <h2 id="flappy-overlay-title">{{ overlay.title }}</h2>
                <p>{{ overlay.text }}</p>
                <div v-if="game.status === 'over'" class="result-score"><span>本次飞行</span><strong>{{ game.score }}</strong><span>道水管</span></div>
                <button id="flappy-overlay-action" class="gold-button" @click="action">{{ overlay.action }}<SvgIcon name="icon-arrow" /></button>
                <span class="overlay-hint">{{ game.status === 'paused' ? '按 P 或空格继续 · 不着急' : '也可以按空格键 · 轻点，不长按' }}</span>
              </div>
            </div>
          </div>
          <div class="board-status"><span><i :class="{ flying: game.status === 'playing' }"></i>{{ overlay.label }}</span><span>一对水管，一点进步 <b>+1</b></span></div>
        </div>
        <div class="game-actions"><button id="flappy-start" class="primary-button" @click="action"><SvgIcon :name="game.status === 'playing' ? 'icon-pause' : 'icon-play'" />{{ overlay.action }}<kbd>{{ game.status === 'playing' || game.status === 'paused' ? 'P' : 'Space' }}</kbd></button><button id="flappy-restart" class="secondary-button" :disabled="game.status === 'ready'" @click="requestRestart"><SvgIcon name="icon-restart" /> 重新开始</button></div>
        <p class="save-note">{{ storageAvailable ? '最高纪录自动保存在此设备 · 每次进步都算数' : '浏览器存储不可用，仍可正常游玩，本次纪录仅在当前页面保留' }}</p>
      </section>

      <aside class="sidebar">
        <section class="flight-card" aria-labelledby="flappy-plan-title">
          <div class="section-heading"><h2 id="flappy-plan-title">今天的小小飞行计划</h2><span>FLIGHT PLAN</span></div>
          <p class="card-subtitle">不赶路，只收集一点轻盈。</p>
          <div class="flight-route" aria-hidden="true"><span>起飞</span><i></i><SvgIcon name="icon-leaf" /><i></i><span>再远一点</span></div>
          <div class="goal-heading"><span>{{ game.score >= 10 ? '小目标，达成！' : '先飞过 10 道水管' }}</span><strong>{{ Math.min(game.score, 10) }} <small>/ 10</small></strong></div>
          <div class="progress-meter" role="progressbar" aria-label="飞过十道水管的小目标" :aria-valuenow="Math.min(game.score, 10)" :aria-valuemin="0" :aria-valuemax="10"><span :style="{ width: `${progress}%` }"></span></div>
          <p class="goal-note">{{ game.score >= 10 ? '好节奏！天空没有终点，继续向前吧。' : '不用一次就做到，每次起飞都是练习。' }}</p>
        </section>
        <section class="rules-card" aria-labelledby="flappy-rules-title">
          <div class="section-heading"><h2 id="flappy-rules-title">一份轻盈飞行指南</h2><span>HOW TO FLY</span></div>
          <ol>
            <li><span>01</span><div><h3>轻点一下，向上一点</h3><p>每次拍翅都会向上飞，松开后自然下落。轻点比长按更有用。</p></div></li>
            <li><span>02</span><div><h3>瞄准中间，留点余地</h3><p>从水管的间隙穿过去，每通过一对得 1 分。碰到水管、顶部或地面，本局结束。</p></div></li>
            <li><span>03</span><div><h3>自己的节奏，就是好节奏</h3><p>别连续点得太急。离开窗口会自动暂停，回来后再继续这一程。</p></div></li>
          </ol>
        </section>
        <div class="little-note"><span>A NOTE TO YOURSELF</span><p>偶尔落地，<br>也是为了下一次<span>起飞。</span></p><SvgIcon name="icon-leaf" /></div>
      </aside>
    </div>
    <footer><span><i></i> 给自己一点空间，让快乐自由飞行。</span><span>TAKE A BREATH. TAKE FLIGHT. <b>↗</b></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="flappy-confirm-title" @cancel.prevent="cancelRestart"><span class="eyebrow">A FRESH LITTLE START</span><h2 id="flappy-confirm-title">重新开始这段飞行？</h2><p>本局分数和飞行时间将重置，最高纪录会保留。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelRestart">继续本局</button><button class="primary-button" @click="restart">确定重开</button></div></dialog>
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </main>
</template>

<style scoped src="./styles.css"></style>
