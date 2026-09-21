<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { LEVELS, SokobanGame } from './engine';
import type { Direction } from './engine';

const game = reactive(new SokobanGame());
const level = computed(() => LEVELS[game.levelIndex]);
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const nextButton = ref<HTMLButtonElement | null>(null);
const best = ref<(number | null)[]>(LEVELS.map(() => null));
const completed = computed(() => best.value.filter(value => value !== null).length);
const storageAvailable = ref(true);
const announcement = ref('');
const showHint = ref(false);
const facing = ref<Direction>('down');
const pendingLevel = ref(0);
const storageKey = 'little-break-sokoban-v1';
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
const status = computed(() => game.won ? '全部归位，干得漂亮！' : game.deadlocked ? '箱子卡在角落了，试试撤销' : game.moves ? '一步一步，慢慢来就好' : '小仓库，等你来整理');
const boardDescription = computed(() => `你在第 ${Math.floor(game.player / game.width) + 1} 行、第 ${game.player % game.width + 1} 列。` +
  game.boxes.map((cell, index) => `箱子 ${index + 1} 在第 ${Math.floor(cell / game.width) + 1} 行、第 ${cell % game.width + 1} 列${game.cells[cell] === 'goal' ? '，已归位' : ''}。`).join('') +
  `目标位置：${game.goals.map(cell => `${Math.floor(cell / game.width) + 1} 行 ${cell % game.width + 1} 列`).join('、')}。`);
let pointer: { id: number; x: number; y: number } | null = null;

function position(cell: number) {
  return { left: `${cell % game.width / game.width * 100}%`, top: `${Math.floor(cell / game.width) / game.height * 100}%` };
}

function focusBoard(): void {
  void nextTick(() => board.value?.focus({ preventScroll: true }));
}

function saveRecords(): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, levelIndex: game.levelIndex, best: best.value }));
    storageAvailable.value = true;
  } catch {
    storageAvailable.value = false;
  }
}

function move(direction: Direction): void {
  if (confirmDialog.value?.open || game.won) return;
  facing.value = direction;
  if (!game.move(direction)) {
    announcement.value = '这边走不通，换个方向试试。';
    return;
  }
  if (game.won) {
    const previous = best.value[game.levelIndex];
    best.value[game.levelIndex] = previous === null ? game.moves : Math.min(previous, game.moves);
    saveRecords();
    announcement.value = `第 ${game.levelIndex + 1} 关完成！用了 ${game.moves} 步，推动 ${game.pushes} 次。`;
    void nextTick(() => nextButton.value?.focus({ preventScroll: true }));
  } else {
    announcement.value = game.deadlocked ? '箱子卡在非目标角落了，按 Z 可以撤销。' : `第 ${game.moves} 步，已归位 ${game.placed} / ${game.boxes.length} 个箱子。${boardDescription.value}`;
  }
}

function directionClick(direction: Direction): void {
  move(direction);
  if (!game.won) focusBoard();
}

function directionPointer(event: PointerEvent, direction: Direction): void {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  directionClick(direction);
}

function undo(): void {
  if (!game.undo()) return;
  announcement.value = '已撤销上一步，继续想一想。';
  focusBoard();
}

function loadLevel(index: number): void {
  confirmDialog.value?.close();
  game.loadLevel(index);
  showHint.value = false;
  facing.value = 'down';
  pointer = null;
  saveRecords();
  announcement.value = `第 ${index + 1} 关，${LEVELS[index].name}。`;
  focusBoard();
}

function requestLevel(index: number): void {
  pendingLevel.value = index;
  if (game.moves && !game.won) confirmDialog.value?.showModal();
  else loadLevel(index);
}

function cancelChange(): void {
  confirmDialog.value?.close();
  focusBoard();
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || confirmDialog.value?.open) return;
  if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [contenteditable="true"]')) return;
  const direction = keys[event.code];
  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (event.code === 'KeyZ') {
    event.preventDefault();
    undo();
  } else if (event.code === 'KeyR' && !event.repeat) {
    event.preventDefault();
    requestLevel(game.levelIndex);
  }
}

function pointerDown(event: PointerEvent): void {
  if (!event.isPrimary || event.button !== 0 || game.won) return;
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
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
}

onMounted(() => {
  let raw: string | null = null;
  try { raw = localStorage.getItem(storageKey); }
  catch { storageAvailable.value = false; }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.version === 1) {
        if (Array.isArray(data.best)) {
          best.value = LEVELS.map((_, index) => Number.isSafeInteger(data.best[index]) && data.best[index] > 0 ? data.best[index] : null);
        }
        if (Number.isInteger(data.levelIndex) && data.levelIndex >= 0 && data.levelIndex < LEVELS.length) game.loadLevel(data.levelIndex);
      }
    } catch { /* Ignore malformed local records. */ }
  }
  document.addEventListener('keydown', onKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown);
  pointer = null;
});
</script>

<template>
  <main class="sokoban-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 006 — EVERYTHING IN ITS PLACE</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="sokoban-title">
        <span class="eyebrow">经典益智 · 整理的艺术</span>
        <h1 id="sokoban-title">推箱子<span>.</span></h1>
        <span class="english-title">S O K O B A N</span>
        <h2>推开小烦恼，<br>让快乐<span class="highlight">归位。</span></h2>
        <p class="intro-copy">一个小仓库，几个小箱子。<br>换个角度想想，事情总会井井有条。</p>
        <div class="mode-tag"><SvgIcon name="i-grid" /> {{ LEVELS.length }} 个小关卡 <span>·</span> 不限时，慢慢想</div>
        <section class="controls-guide" aria-labelledby="controls-title">
          <h3 id="controls-title">快乐，往这个方向<span>MAKE YOUR NEXT MOVE</span></h3>
          <div class="keyboard" aria-hidden="true"><kbd>↑</kbd><div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div></div>
          <p id="sokoban-help">方向键 / WASD 移动小搬运工<br>也可以滑动棋盘，或点击方向按钮</p>
          <div class="shortcut-note"><span><kbd>Z</kbd> 撤销一步</span><span><kbd>R</kbd> 重新开始</span></div>
        </section>
        <div class="slow-note"><SvgIcon name="icon-leaf" /><p>不必每一步都正确，<br>退一步，也是在向前。</p></div>
      </section>

      <section class="play-area" aria-label="推箱子游戏">
        <div class="score-strip">
          <div><span>移动步数 <small>STEPS</small></span><strong id="sokoban-moves">{{ String(game.moves).padStart(2, '0') }}</strong></div>
          <div><span>推动次数</span><strong id="sokoban-pushes">{{ String(game.pushes).padStart(2, '0') }}</strong></div>
          <div><span><SvgIcon name="icon-cup" /> 最佳步数</span><strong id="sokoban-best">{{ best[game.levelIndex] ?? '—' }}</strong></div>
        </div>
        <div class="board-shell">
          <div class="board-heading">
            <div><span class="level-chip">{{ String(game.levelIndex + 1).padStart(2, '0') }}</span><div><h2>{{ level.name }}</h2><span>LEVEL {{ String(game.levelIndex + 1).padStart(2, '0') }} <b>/</b> {{ level.difficulty }}</span></div></div>
            <span class="placed-count" id="sokoban-placed"><i></i>{{ game.placed }} / {{ game.boxes.length }} 已归位</span>
          </div>
          <div class="warehouse">
            <div ref="board" class="sokoban-board" role="group" tabindex="0" aria-label="推箱子棋盘" aria-describedby="sokoban-help"
              :data-state="game.won ? 'won' : 'playing'" :style="{ '--cols': game.width, '--rows': game.height, aspectRatio: `${game.width} / ${game.height}` }"
              @pointerdown="pointerDown" @pointerup="pointerUp" @pointercancel="pointer = null" @lostpointercapture="pointer = null">
              <div class="tile-grid" role="img" :aria-label="boardDescription">
                <div v-for="(cell, index) in game.cells" :key="`${game.levelIndex}-${index}`" class="tile" :class="cell" aria-hidden="true"><span v-if="cell === 'goal'" class="goal-marker"></span></div>
              </div>
              <div v-for="(cell, index) in game.boxes" :key="`${game.levelIndex}-box-${index}`" class="piece box-piece" :style="position(cell)" :data-cell="cell" aria-hidden="true"><div class="crate" :class="{ placed: game.cells[cell] === 'goal' }"><span v-if="game.cells[cell] === 'goal'">✓</span></div></div>
              <div class="piece player-piece" :class="`facing-${facing}`" :style="position(game.player)" :data-cell="game.player" aria-hidden="true"><div class="worker"><span class="worker-body"></span><span class="worker-face"><i></i><i></i></span><span class="worker-cap"></span></div></div>
            </div>
            <div v-if="game.won" class="win-overlay" role="region" aria-labelledby="sokoban-win-title">
              <span class="win-icon"><SvgIcon name="icon-cup" /></span>
              <span class="eyebrow">A LITTLE ORDER. A LOT OF JOY.</span>
              <h2 id="sokoban-win-title">{{ completed === LEVELS.length ? '小小仓库，全部搞定！' : '每一份快乐，都归位了！' }}</h2>
              <p>{{ game.moves }} 步，{{ game.pushes }} 次推动。给认真思考的自己点个赞。</p>
              <button ref="nextButton" class="primary-button" @click="loadLevel(game.levelIndex < LEVELS.length - 1 ? game.levelIndex + 1 : 0)">{{ game.levelIndex < LEVELS.length - 1 ? '下一关，继续出发' : '回到第一关' }}<SvgIcon name="icon-arrow" /></button>
              <button class="text-button" @click="loadLevel(game.levelIndex)">再试一次，挑战更少步数</button>
            </div>
          </div>
          <div class="board-status" :class="{ warning: game.deadlocked && !game.won }"><span><i></i>{{ status }}</span><SvgIcon :name="game.won ? 'i-spark' : 'icon-leaf'" /></div>
        </div>
        <div class="game-actions"><button id="sokoban-undo" class="secondary-button" :disabled="!game.canUndo" @click="undo"><SvgIcon name="icon-restart" /> 撤销一步 <kbd>Z</kbd></button><button id="sokoban-restart" class="primary-button" @click="requestLevel(game.levelIndex)"><SvgIcon name="i-reset" /> 重新开始 <kbd>R</kbd></button></div>
        <div class="under-board">
          <div class="board-legend" aria-label="棋盘图例"><span><i class="legend-worker"></i>搬运工</span><span><i class="legend-crate"></i>箱子</span><span><i class="legend-goal"></i>目标点</span></div>
          <div class="direction-pad" role="group" aria-label="方向控制"><button v-for="control in controls" :key="control.direction" :class="control.direction" :aria-label="control.label" :disabled="game.won" @pointerdown="directionPointer($event, control.direction)" @click="$event.detail === 0 && directionClick(control.direction)">{{ control.symbol }}</button></div>
        </div>
        <p class="save-note"><i :class="{ unavailable: !storageAvailable }"></i>{{ storageAvailable ? '通关纪录自动保存在此设备 · 随时回来，重新出发' : '浏览器存储不可用，仍可正常游玩' }}</p>
      </section>

      <aside class="sidebar">
        <section class="levels-card" aria-labelledby="levels-title">
          <div class="section-heading"><h2 id="levels-title">小小闯关之旅</h2><span>{{ completed }} / {{ LEVELS.length }}</span></div>
          <p>每一关，都是一个新的小可能。</p>
          <div class="level-buttons"><button v-for="(item, index) in LEVELS" :key="index" :class="{ active: index === game.levelIndex, completed: best[index] !== null }" :aria-label="`第 ${index + 1} 关：${item.name}${best[index] !== null ? '，已通关' : ''}`" :aria-current="index === game.levelIndex ? 'step' : undefined" :data-level="index" @click="index !== game.levelIndex && requestLevel(index)"><span>{{ String(index + 1).padStart(2, '0') }}</span><i v-if="best[index] !== null">✓</i><i v-else class="level-dot"></i></button></div>
          <div class="journey-progress" role="progressbar" aria-label="通关进度" :aria-valuenow="completed" :aria-valuemin="0" :aria-valuemax="LEVELS.length"><span :style="{ width: `${completed / LEVELS.length * 100}%` }"></span></div>
          <div class="level-note"><span>所有关卡都可以自由探索</span><SvgIcon name="icon-leaf" /></div>
        </section>
        <section class="rules-card" aria-labelledby="rules-title">
          <div class="section-heading"><h2 id="rules-title">箱子归位指南</h2><span>HOW TO PLAY</span></div>
          <ol><li><span>01</span><div><h3>走到箱子身后</h3><p>用方向键移动，把箱子向前推。</p></div></li><li><span>02</span><div><h3>只能推，不能拉</h3><p>一次只能推一个箱子。小心角落，<br>别把它推到出不来的地方。</p></div></li><li><span>03</span><div><h3>每个箱子，都有归宿</h3><p>把所有箱子推到圆圈标记上，<br>这一关就完成了。</p><div class="rule-example" aria-hidden="true"><i class="mini-crate"></i><span>→</span><i class="mini-goal"></i><span>→</span><i class="mini-done">✓</i></div></div></li></ol>
        </section>
        <section class="hint-card"><button class="hint-toggle" :aria-expanded="showHint" aria-controls="sokoban-hint" @click="showHint = !showHint"><SvgIcon name="i-bulb" /><span>{{ showHint ? '给你一点小灵感' : '需要一点小灵感？' }}</span><span>{{ showHint ? '−' : '＋' }}</span></button><p v-if="showHint" id="sokoban-hint">{{ level.hint }}</p></section>
      </aside>
    </div>
    <footer><span><i></i> 整理小箱子，也整理一下心情。</span><span>ONE PUSH AT A TIME. <b>↗</b></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="sokoban-confirm-title" @cancel="focusBoard">
      <span class="eyebrow">A FRESH LITTLE START</span><h2 id="sokoban-confirm-title">{{ pendingLevel === game.levelIndex ? '重新整理这个小仓库？' : '去另一个仓库看看？' }}</h2><p>本关的移动进度将重置，已通关的纪录会保留。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelChange">继续本关</button><button class="primary-button" @click="loadLevel(pendingLevel)">确定{{ pendingLevel === game.levelIndex ? '重开' : '切换' }}</button></div>
    </dialog>
    <div class="sr-only" role="status" aria-live="polite">{{ announcement }}</div>
  </main>
</template>

<style scoped src="./styles.css"></style>
