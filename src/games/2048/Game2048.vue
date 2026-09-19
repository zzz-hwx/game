<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { Game2048, STORAGE_KEY } from './engine';
import type { Direction, Motion } from './engine';

const game = reactive(new Game2048());
const best = ref(0);
const board = ref<HTMLDivElement | null>(null);
const restartDialog = ref<HTMLDialogElement | null>(null);
const resultButton = ref<HTMLButtonElement | null>(null);
const announcement = ref('');
const storageAvailable = ref(true);
const animating = ref(false);
const motions = ref<Motion[]>([]);
const merged = ref<number[]>([]);
const spawned = ref<number | null>(null);
const gained = ref(0);
const milestones = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
const directions: { direction: Direction; label: string; symbol: string }[] = [
  { direction: 'left', label: '向左移动', symbol: '←' },
  { direction: 'up', label: '向上移动', symbol: '↑' },
  { direction: 'down', label: '向下移动', symbol: '↓' },
  { direction: 'right', label: '向右移动', symbol: '→' },
];
const keys: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
};
const statusLabel = computed(() => game.state === 'won' ? '快乐，成功加倍！' : game.state === 'over' ? '这一局，拼得不错' : game.moves ? '慢慢来，渐入佳境' : '滑动一下，快乐出发');
const progress = computed(() => Math.min(100, Math.max(0, (Math.log2(game.maxTile) - 1) / 10 * 100)));
const nextTarget = computed(() => game.maxTile >= 2048 ? game.maxTile * 2 : 2048);
const boardDescription = computed(() => Array.from({ length: 4 }, (_, row) => `第 ${row + 1} 行：${game.board.slice(row * 4, row * 4 + 4).map((value) => value || '空').join('、')}`).join('；'));
let animationTimer: ReturnType<typeof setTimeout> | undefined;
let pointer: { id: number; x: number; y: number } | null = null;

function tileClass(value: number): string {
  return value > 2048 ? 'tile-super' : `tile-${value}`;
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, game.serialize(best.value));
    storageAvailable.value = true;
  } catch {
    storageAvailable.value = false;
  }
}

function focusBoard(): void { void nextTick(() => board.value?.focus({ preventScroll: true })); }

function move(direction: Direction): void {
  if (animating.value || restartDialog.value?.open) return;
  const result = game.move(direction);
  if (!result.changed) return;
  gained.value = result.gained;
  merged.value = result.merged;
  spawned.value = result.spawned;
  motions.value = result.motions;
  best.value = Math.max(best.value, game.score);
  animating.value = true;
  save();
  animationTimer = setTimeout(() => {
    animating.value = false;
    motions.value = [];
    announcement.value = game.state === 'won' ? '恭喜合成 2048！可以继续挑战。'
      : game.state === 'over' ? `没有可移动的方块了，本局得分 ${game.score}。`
        : `第 ${game.moves} 步，得分 ${game.score}${gained.value ? `，本次加 ${gained.value} 分` : ''}。`;
    if (game.state !== 'playing') void nextTick(() => resultButton.value?.focus({ preventScroll: true }));
  }, 130);
}

function clearAnimation(): void {
  clearTimeout(animationTimer);
  animating.value = false;
  motions.value = [];
  merged.value = [];
  spawned.value = null;
  gained.value = 0;
}

function undo(): void {
  if (animating.value || !game.undo()) return;
  clearAnimation();
  save();
  announcement.value = '已撤销上一步。最高纪录依然保留。';
  focusBoard();
}

function restart(): void {
  restartDialog.value?.close();
  clearAnimation();
  game.restart();
  save();
  announcement.value = '新的一局开始了。';
  focusBoard();
}

function requestRestart(): void {
  if (game.moves > 0 && game.state === 'playing') restartDialog.value?.showModal();
  else restart();
}

function keepPlaying(): void {
  game.keepPlaying();
  save();
  announcement.value = '继续挑战更大的数字吧！';
  focusBoard();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || restartDialog.value?.open) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  const direction = keys[event.code];
  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (event.code === 'KeyZ') {
    event.preventDefault();
    undo();
  }
}

function pointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || game.state !== 'playing' || animating.value) return;
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  board.value?.setPointerCapture(event.pointerId);
  focusBoard();
}

function pointerUp(event: PointerEvent): void {
  if (!pointer || event.pointerId !== pointer.id) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointer = null;
  if (board.value?.hasPointerCapture(event.pointerId)) board.value.releasePointerCapture(event.pointerId);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}

function directionClick(direction: Direction): void {
  move(direction);
  focusBoard();
}

function directionPointer(event: PointerEvent, direction: Direction): void {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  directionClick(direction);
}

onMounted(() => {
  try { best.value = game.restore(localStorage.getItem(STORAGE_KEY)); }
  catch { storageAvailable.value = false; }
  save();
  document.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  clearTimeout(animationTimer);
  pointer = null;
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <main class="game-2048">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 005 — A LITTLE MORE JOY</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="game-title">
        <span class="classic-label">经典益智 <span>·</span> 合并的快乐</span>
        <h1 id="game-title">2048<span>.</span></h1>
        <h2>一点一点，<br>让快乐<span class="highlight">加倍。</span></h2>
        <p class="intro-description">相同的数字，相遇就有好事发生。<br>从一个小小的 2，拼出大大的可能。</p>
        <div class="mode-label"><SvgIcon name="i-grid" /> 4 × 4 经典模式 <span>↗</span></div>
        <section class="controls-guide" aria-labelledby="controls-heading">
          <h3 id="controls-heading">动动手指，就这么简单<span>HOW TO PLAY</span></h3>
          <div class="keyboard" aria-hidden="true"><kbd>↑</kbd><div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div></div>
          <p id="controls-help">方向键 / WASD 移动方块<br>手机上，轻轻滑动棋盘即可</p>
          <span class="undo-hint">按 <kbd>Z</kbd> 可以撤销上一步</span>
        </section>
        <div class="little-note"><SvgIcon name="icon-leaf" /><p>没有倒计时，不用着急。<br>好事情，总是一点点发生。</p></div>
      </section>

      <section class="play-area" aria-label="2048 游戏">
        <div class="score-strip">
          <div class="score-current"><span>当前得分 <small>SCORE</small></span><strong id="score-2048">{{ game.score.toLocaleString() }}</strong><span v-if="gained" :key="game.moves" class="score-gain" aria-hidden="true">+{{ gained }}</span></div>
          <div><span><SvgIcon name="icon-cup" /> 最高纪录</span><strong id="best-2048">{{ best.toLocaleString() }}</strong></div>
          <div><span>移动步数</span><strong id="moves-2048">{{ game.moves.toLocaleString() }}</strong></div>
        </div>
        <div class="board-shell">
          <div class="board-topline"><span id="status-2048" :data-state="game.state"><i></i>{{ statusLabel }}</span><span>LET’S MAKE IT 2048</span></div>
          <div ref="board" class="number-board" role="group" tabindex="0" aria-label="2048 棋盘" aria-describedby="controls-help" :data-animating="animating"
            @pointerdown="pointerDown" @pointerup="pointerUp" @pointercancel="pointer = null" @lostpointercapture="pointer = null">
            <div class="board-grid" role="img" :aria-label="boardDescription">
              <div v-for="(value, index) in game.board" :key="index" class="board-cell" :data-index="index" :data-value="value" aria-hidden="true">
                <div v-if="value && !animating" class="number-tile" :class="[tileClass(value), { 'tile-merged': merged.includes(index), 'tile-new': spawned === index, 'tile-small': value >= 1024 }]">{{ value }}</div>
              </div>
            </div>
            <div v-for="motion in motions" :key="motion.from" class="number-tile moving-tile" :class="[tileClass(motion.value), { 'tile-small': motion.value >= 1024 }]" aria-hidden="true"
              :style="{ '--from-x': motion.from % 4, '--from-y': Math.floor(motion.from / 4), '--to-x': motion.to % 4, '--to-y': Math.floor(motion.to / 4) }">{{ motion.value }}</div>
            <div v-if="game.state !== 'playing' && !animating" class="result-overlay" role="region" aria-labelledby="result-title" @pointerdown.stop @pointerup.stop>
              <span class="result-badge"><SvgIcon :name="game.state === 'won' ? 'icon-cup' : 'icon-leaf'" /></span>
              <span class="result-eyebrow">{{ game.state === 'won' ? 'A LITTLE JOY, DOUBLED.' : 'EVERY END IS A NEW START.' }}</span>
              <h2 id="result-title">{{ game.state === 'won' ? '2048，做到了！' : '休息一下，再来一局？' }}</h2>
              <p>{{ game.state === 'won' ? '小小的坚持，也有大大的回报。' : `本局得分 ${game.score.toLocaleString()}，每一步都算数。` }}</p>
              <button ref="resultButton" class="primary-button" @click="game.state === 'won' ? keepPlaying() : restart()">{{ game.state === 'won' ? '继续挑战' : '再玩一局' }}<SvgIcon name="icon-arrow" /></button>
              <button v-if="game.previous" class="text-button" @click="undo">撤销一步，再想想</button>
            </div>
          </div>
          <div class="board-bottomline"><span>合并相同数字，向 2048 出发</span><SvgIcon name="i-spark" /></div>
        </div>
        <div class="game-actions">
          <button id="undo-2048" class="secondary-button" :disabled="!game.previous || animating" @click="undo"><SvgIcon name="icon-restart" /> 撤销一步 <kbd>Z</kbd></button>
          <button id="restart-2048" class="primary-button" @click="requestRestart"><SvgIcon name="i-shuffle" /> 新的一局</button>
        </div>
        <div class="touch-controls" role="group" aria-label="方向控制"><button v-for="control in directions" :key="control.direction" :aria-label="control.label" :disabled="game.state !== 'playing'" @pointerdown="directionPointer($event, control.direction)" @click="$event.detail === 0 && directionClick(control.direction)">{{ control.symbol }}</button></div>
        <p class="save-note"><i :class="{ unavailable: !storageAvailable }"></i>{{ storageAvailable ? '进度和纪录已自动保存在此设备' : '浏览器存储不可用，本局仍可正常游玩' }}</p>
      </section>

      <aside class="sidebar">
        <section class="journey-card">
          <div class="section-heading"><h2>下一站，{{ nextTarget }}</h2><SvgIcon name="i-spark" /></div>
          <p>每次相遇，都离目标更近一点。</p>
          <div class="largest-tile"><span>本局最大方块<small>YOUR LITTLE MILESTONE</small></span><strong id="max-2048" :class="tileClass(game.maxTile)">{{ game.maxTile }}</strong></div>
          <div class="progress-track" role="progressbar" aria-label="合成 2048 的进度" :aria-valuenow="Math.round(progress)" :aria-valuetext="`最大方块 ${game.maxTile}，目标 2048`" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: `${progress}%` }"></span></div>
          <div class="progress-labels"><span>2</span><span>2048</span></div>
          <div class="milestone-tiles" aria-label="数字合成路线"><span v-for="value in milestones" :key="value" :class="{ reached: value <= game.maxTile, current: value === game.maxTile }">{{ value }}</span><span class="milestone-more">…</span></div>
        </section>
        <section class="rules-card" aria-labelledby="rules-heading">
          <div class="section-heading"><h2 id="rules-heading">快乐加倍指南</h2><span>01 — 03</span></div>
          <ol>
            <li><span>01</span><div><h3>朝同一个方向</h3><p>滑动时，所有方块一起靠拢。</p></div></li>
            <li><span>02</span><div><h3>相同数字，合二为一</h3><p>每次有效移动，出现一个 2 或 4。</p><div class="merge-example" aria-hidden="true"><b>2</b><i>＋</i><b>2</b><i>→</i><b>4</b></div></div></li>
            <li><span>03</span><div><h3>拼出你的 2048</h3><p>无处可移时结束，也可以撤销一步。</p></div></li>
          </ol>
        </section>
        <div class="tip-card"><SvgIcon name="i-bulb" /><div><strong>一个小窍门</strong><p>把最大的数字留在角落，<br>给下一步，多留一点空间。</p></div></div>
      </aside>
    </div>
    <footer><span><i></i> 纯粹的游戏，简单的快乐。</span><span>SMALL NUMBERS. BIG POSSIBILITIES. <b>＋</b></span></footer>
    <dialog ref="restartDialog" class="restart-dialog" aria-labelledby="restart-title-2048">
      <span class="result-eyebrow">A FRESH LITTLE START</span><h2 id="restart-title-2048">换个心情，再来一局？</h2><p>本局进度会清空，最高纪录会好好保留。</p>
      <div class="dialog-actions"><button class="secondary-button" autofocus @click="restartDialog?.close()">继续本局</button><button class="primary-button" @click="restart">开始新的一局</button></div>
    </dialog>
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </main>
</template>

<style scoped src="./styles.css"></style>
