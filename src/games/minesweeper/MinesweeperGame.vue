<script setup lang="ts">
import SvgIcon from '../../components/SvgIcon.vue';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { chord, createGame, levels, reveal, toggleFlag } from './engine';
import type { Cell, Level } from './engine';

const game = ref(createGame());
const flagMode = ref(false);
const elapsed = ref(0);
const focusedCell = ref(0);
const boardElement = ref<HTMLDivElement | null>(null);
const restartDialog = ref<HTMLDialogElement | null>(null);
const pendingLevel = ref<Level>('easy');
const records = reactive<Record<Level, number | null>>({ easy: null, normal: null, hard: null });
const storageAvailable = ref(true);
const newBest = ref(false);
let startedAt = 0;
let timer: ReturnType<typeof setInterval> | undefined;

const config = computed(() => levels[game.value.level]);
const finished = computed(() => game.value.status === 'won' || game.value.status === 'lost');
const flags = computed(() => game.value.cells.filter((cell) => cell.flagged).length);
const remaining = computed(() => game.value.mines - flags.value);
const safeTotal = computed(() => game.value.cells.length - game.value.mines);
const progress = computed(() => Math.round(game.value.revealedCount / safeTotal.value * 100));
const statusLabel = computed(() => ({ ready: '等待第一步', playing: '探索进行中', won: '挑战成功', lost: '本局结束' })[game.value.status]);
const message = computed(() => {
  if (game.value.status === 'won') return newBest.value ? '新的最佳记录！今天的好运，被你找到了。' : '所有安全格都找到了，做得漂亮！';
  if (game.value.status === 'lost') return '碰到地雷啦。没关系，下一局重新出发。';
  if (flagMode.value) return '插旗模式已开启，点击未翻开的格子，标记或取消旗帜。';
  return game.value.status === 'ready' ? '选一格，轻轻开始。第一步和周围的格子一定安全。' : '不着急，数字会告诉你下一步的方向。';
});

function formatTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function updateTime(): void {
  elapsed.value = Math.floor((performance.now() - startedAt) / 1000);
}

function loadRecords(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('little-break-minesweeper-records') || '{}');
    if (saved !== null && typeof saved === 'object') {
      for (const key of Object.keys(levels) as Level[]) {
        const value: unknown = Reflect.get(saved, key);
        if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
          const previous = records[key];
          records[key] = previous === null ? value : Math.min(previous, value);
        }
      }
    }
  } catch { storageAvailable.value = false; }
}

function onStorage(event: StorageEvent): void {
  if (event.key === 'little-break-minesweeper-records' && event.storageArea === localStorage) loadRecords();
}

function saveRecord(): void {
  loadRecords();
  const previous = records[game.value.level];
  if (previous !== null && elapsed.value >= previous) return;
  newBest.value = true;
  records[game.value.level] = elapsed.value;
  try { localStorage.setItem('little-break-minesweeper-records', JSON.stringify(records)); }
  catch { storageAvailable.value = false; }
}

function openCell(index: number): void {
  if (finished.value) return;
  if (flagMode.value) { toggleFlag(game.value, index); return; }
  const wasReady = game.value.status === 'ready';
  const now = performance.now();
  const changed = game.value.cells[index].revealed ? chord(game.value, index) : reveal(game.value, index);
  if (!changed) return;
  if (wasReady) startedAt = now;
  updateTime();
  if (game.value.status === 'won') saveRecord();
}

function newGame(level: Level): void {
  game.value = createGame(level);
  elapsed.value = 0;
  flagMode.value = false;
  focusedCell.value = 0;
  newBest.value = false;
  boardElement.value?.parentElement?.scrollTo({ left: 0, top: 0 });
}

function requestRestart(level: Level = game.value.level): void {
  if (game.value.status === 'playing' || (game.value.status === 'ready' && flags.value > 0)) {
    pendingLevel.value = level;
    restartDialog.value?.showModal();
  } else newGame(level);
}

function confirmRestart(): void {
  restartDialog.value?.close();
  newGame(pendingLevel.value);
}

function cellLabel(cell: Cell, index: number): string {
  const position = `第${Math.floor(index / game.value.cols) + 1}行第${index % game.value.cols + 1}列`;
  if (cell.exploded) return `${position}，踩中的地雷`;
  if (cell.revealed && cell.mine) return `${position}，地雷`;
  if (cell.flagged) return `${position}，${game.value.status === 'lost' && !cell.mine ? '错误旗帜' : '已插旗'}`;
  if (cell.revealed) return `${position}，${cell.adjacent ? `周围${cell.adjacent}颗地雷` : '空白'}`;
  return `${position}，未翻开`;
}

function onCellKey(event: KeyboardEvent, index: number): void {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    if (!event.repeat) toggleFlag(game.value, index);
    return;
  }
  const { rows, cols } = game.value;
  const row = Math.floor(index / cols);
  const col = index % cols;
  let next = index;
  if (event.key === 'ArrowRight') next = row * cols + Math.min(cols - 1, col + 1);
  else if (event.key === 'ArrowLeft') next = row * cols + Math.max(0, col - 1);
  else if (event.key === 'ArrowDown') next = Math.min(rows - 1, row + 1) * cols + col;
  else if (event.key === 'ArrowUp') next = Math.max(0, row - 1) * cols + col;
  else if (event.key === 'Home') next = row * cols;
  else if (event.key === 'End') next = row * cols + cols - 1;
  else return;
  event.preventDefault();
  focusedCell.value = next;
  boardElement.value?.querySelector<HTMLButtonElement>(`[data-index="${next}"]`)?.focus();
}

onMounted(() => {
  loadRecords();
  window.addEventListener('storage', onStorage);
  timer = setInterval(() => { if (game.value.status === 'playing') updateTime(); }, 200);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  window.removeEventListener('storage', onStorage);
  restartDialog.value?.close();
});
</script>

<template>
  <main class="minesweeper-game">

    <div class="mine-shell">
      <header class="mine-hero">
        <div>
          <p class="mine-eyebrow"><span></span> A LITTLE FOCUS, A LITTLE LUCK</p>
          <h1>扫走小烦恼<span>，</span><br class="mine-mobile-break">发现小确幸<span class="mine-dot">。</span></h1>
          <p class="mine-description">跟着线索，慢慢探索。每一小步，都藏着一点惊喜。</p>
        </div>
        <div class="mine-hero-art" aria-hidden="true">
          <span class="mine-art-orbit"></span>
          <span class="mine-art-tile mine-art-one">1</span>
          <span class="mine-art-tile mine-art-flag"><SvgIcon class="mine-icon" name="mine-flag" /></span>
          <SvgIcon class="mine-art-spark mine-icon" name="mine-spark" />
          <span class="mine-art-caption">TAKE YOUR NEXT LITTLE STEP.</span>
        </div>
      </header>

      <div class="mine-layout">
        <section class="mine-card" aria-label="扫雷游戏">
          <div class="mine-heading">
            <div class="mine-game-name"><span class="mine-game-icon"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-grid" /></span><div><h2>经典扫雷</h2><span>MINESWEEPER · 慢慢来，也很酷</span></div></div>
            <div class="mine-difficulty" role="group" aria-label="游戏难度">
              <button v-for="(level, key) in levels" :key="key" type="button" :data-level="key" :aria-pressed="game.level === key" :class="{ active: game.level === key }" @click="game.level !== key && requestRestart(key)">{{ level.name }}</button>
            </div>
          </div>

          <div class="mine-stats">
            <div><span class="mine-stat-label"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-flag" />待标记地雷</span><strong id="mine-remaining">{{ String(remaining).padStart(2, '0') }}<small>颗</small></strong></div>
            <div><span class="mine-stat-label"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-clock" />探索用时</span><strong id="mine-timer">{{ formatTime(elapsed) }}</strong></div>
            <div><span class="mine-stat-label"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-grid" />已发现安全格</span><strong id="mine-progress">{{ game.revealedCount }}<small>/ {{ safeTotal }}</small></strong></div>
          </div>

          <div class="mine-board-meta"><span id="mine-status" :data-state="game.status"><i :class="game.status"></i>{{ statusLabel }}</span><span>{{ config.rows }} × {{ config.cols }}<b>·</b>{{ config.mines }} 颗地雷</span></div>
          <div class="mine-field" :class="{ 'mine-field-easy': game.level === 'easy' }">
            <div class="mine-board-scroll" :class="{ 'mine-board-dense': game.level !== 'easy' }">
              <div ref="boardElement" class="mine-board" :style="{ '--mine-cols': config.cols }" role="group" :aria-label="`扫雷棋盘，${config.rows}行${config.cols}列`" aria-describedby="mine-keyboard-help">
                <button v-for="(cell, index) in game.cells" :key="`${game.level}-${index}`" type="button" class="mine-cell"
                  :class="{ revealed: cell.revealed, flagged: cell.flagged, exploded: cell.exploded, 'wrong-flag': finished && game.status === 'lost' && cell.flagged && !cell.mine, 'show-mine': cell.revealed && cell.mine }"
                  :data-index="index" :data-number="cell.revealed && !cell.mine ? cell.adjacent : undefined"
                  :aria-label="cellLabel(cell, index)" :aria-disabled="finished" :tabindex="focusedCell === index ? 0 : -1"
                  @focus="focusedCell = index" @click="openCell(index)" @contextmenu.prevent="toggleFlag(game, index)" @keydown="onCellKey($event, index)">
                  <SvgIcon v-if="cell.revealed && cell.mine" class="mine-icon" aria-hidden="true" name="mine-bomb" />
                  <SvgIcon v-else-if="cell.flagged" class="mine-icon" aria-hidden="true" name="mine-flag" />
                  <span v-else-if="cell.revealed && cell.adjacent">{{ cell.adjacent }}</span>
                  <span v-else-if="cell.revealed" class="mine-empty-dot" aria-hidden="true"></span>
                </button>
              </div>
            </div>
            <p v-if="game.level !== 'easy'" class="mine-scroll-tip">大棋盘可以横向滑动，慢慢探索每一个角落</p>
          </div>

          <div class="mine-feedback" :class="{ 'mine-feedback-won': game.status === 'won', 'mine-feedback-lost': game.status === 'lost' }" role="status">
            <SvgIcon class="mine-icon" aria-hidden="true" :name="game.status === 'won' ? 'mine-trophy' : game.status === 'lost' ? 'mine-smile' : 'mine-shield'" />
            <span>{{ message }}</span>
          </div>
          <div class="mine-toolbar">
            <div class="mine-mode" role="group" aria-label="点击操作">
              <button type="button" :class="{ active: !flagMode }" :aria-pressed="!flagMode" @click="flagMode = false"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-cursor" />翻开</button>
              <button type="button" :class="{ active: flagMode }" :aria-pressed="flagMode" @click="flagMode = true"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-flag" />插旗</button>
            </div>
            <button id="mine-restart" type="button" class="mine-primary" @click="requestRestart()"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-reset" />{{ finished ? '再玩一局' : '重新开始' }}</button>
          </div>
          <div class="mine-card-foot"><span>左键翻开<span class="mine-foot-divider">/</span>右键插旗</span><span><SvgIcon class="mine-icon" aria-hidden="true" name="mine-shield" />第一步，放心走</span></div>
        </section>

        <aside class="mine-sidebar">
          <section class="mine-guide">
            <div class="mine-section-title"><h2>一点线索，就够了</h2><span>HOW TO PLAY</span></div>
            <ol>
              <li><span class="mine-step">01</span><div><h3>翻开一格，开始探索</h3><p>点击格子翻开它，空白区域会自动展开。第一步永远安全。</p></div></li>
              <li><span class="mine-step">02</span><div><h3>读懂数字的小提示</h3><p>数字表示周围八格中的地雷数量。观察周围，让下一步更有把握。</p><div class="mine-example" aria-label="数字2表示周围有2颗地雷"><span></span><span><SvgIcon class="mine-icon" aria-hidden="true" name="mine-flag" /></span><span></span><span></span><b>2</b><span></span><span><SvgIcon class="mine-icon" aria-hidden="true" name="mine-flag" /></span><span></span><span></span></div></div></li>
              <li><span class="mine-step">03</span><div><h3>插上旗帜，绕开地雷</h3><p>右键标记地雷，手机可切换「插旗」。翻开所有安全格，就赢啦。</p></div></li>
            </ol>
            <div class="mine-guide-tip"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-spark" /><p>周围旗数与数字相同时，再点数字可快速展开。旗子标错，也会踩雷哦。</p></div>
          </section>

          <section class="mine-record">
            <div class="mine-section-title"><h2><SvgIcon class="mine-icon" aria-hidden="true" name="mine-trophy" />你的最佳时刻</h2><span class="mine-record-level">{{ config.name }}</span></div>
            <div class="mine-record-value"><strong id="mine-best">{{ records[game.level] === null ? '--:--' : formatTime(records[game.level]!) }}</strong><span>最快通关</span></div>
            <p>{{ !storageAvailable ? '浏览器限制存储，记录仅保留于本次打开' : records[game.level] === null ? '第一份小成就，等你来点亮。' : '每一次专注，都值得被记住。' }}</p>
            <div class="mine-record-foot"><span>{{ storageAvailable ? '记录保存在此浏览器' : '记录暂存于此页' }}</span><i></i></div>
          </section>

          <section class="mine-break-note">
            <SvgIcon class="mine-clover" viewBox="0 0 80 80" aria-hidden="true" sprite="illustrations" name="mine-clover" />
            <span>A LITTLE LUCK FOR YOU</span><h3>好运，藏在下一格。</h3><p>不用走得很快，<br>享受每一次小小的发现。</p>
          </section>
        </aside>
      </div>
      <footer class="mine-footer"><span>放慢一点，也是一种前进。</span><span id="mine-keyboard-help"><kbd>方向键</kbd> 移动 <kbd>Enter / 空格</kbd> 操作 <kbd>F</kbd> 插旗</span><span>{{ progress }}% EXPLORED · TAKE IT EASY</span></footer>
    </div>

    <dialog ref="restartDialog" class="mine-dialog" aria-labelledby="mine-dialog-title" aria-describedby="mine-dialog-description">
      <span class="mine-dialog-icon"><SvgIcon class="mine-icon" aria-hidden="true" name="mine-reset" /></span>
      <h2 id="mine-dialog-title">{{ pendingLevel === game.level ? '要重新出发吗？' : `切换到${levels[pendingLevel].name}难度？` }}</h2>
      <p id="mine-dialog-description">当前棋盘和计时会重置，最佳记录会保留。<br>新的小挑战，随时等你开始。</p>
      <div><button class="mine-secondary" type="button" autofocus @click="restartDialog?.close()">继续本局</button><button class="mine-primary" type="button" @click="confirmRestart">{{ pendingLevel === game.level ? '重新开始' : '切换难度' }}</button></div>
    </dialog>
  </main>
</template>

<style scoped src="./styles.css"></style>
