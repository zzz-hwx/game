<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { BOARD_SIZE, GomokuGame, chooseComputerMove } from './engine';
import type { Player } from './engine';

type Mode = 'computer' | 'local';
const game = reactive(new GomokuGame());
const mode = ref<Mode>('computer');
const pendingMode = ref<Mode>('computer');
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const focusedCell = ref(112);
const showNumbers = ref(false);
const columns = Array.from({ length: BOARD_SIZE }, (_, index) => String.fromCharCode(65 + index));
const stars = [48, 56, 112, 168, 176];
let computerTimer: ReturnType<typeof setTimeout> | undefined;
const finished = computed(() => Boolean(game.winner || game.draw));
const thinking = computed(() => mode.value === 'computer' && game.currentPlayer === 2 && !finished.value);
const lastMove = computed(() => game.history.at(-1));
const moveNumbers = computed(() => {
  const numbers = new Map<number, number>();
  game.history.forEach((move, index) => numbers.set(move.row * BOARD_SIZE + move.col, index + 1));
  return numbers;
});
const recentMoves = computed(() => game.history.slice(-6).map((move, index) => ({ ...move, number: game.history.length - Math.min(6, game.history.length) + index + 1 })).reverse());
const status = computed(() => {
  if (game.winner) return mode.value === 'computer' ? (game.winner === 1 ? '你赢了，落子有方！' : '电脑获胜，再切磋一局吧') : `${game.winner === 1 ? '黑' : '白'}棋获胜，五子连珠！`;
  if (game.draw) return '旗鼓相当，这一局和棋';
  if (thinking.value) return '电脑正在思考…';
  return mode.value === 'computer' ? '轮到你了，执黑落子' : `轮到${game.currentPlayer === 1 ? '黑' : '白'}棋落子`;
});

function stopComputer(): void {
  clearTimeout(computerTimer);
  computerTimer = undefined;
}

function scheduleComputer(): void {
  stopComputer();
  if (!thinking.value || confirmDialog.value?.open) return;
  computerTimer = setTimeout(() => {
    computerTimer = undefined;
    const move = chooseComputerMove(game);
    if (move) game.place(move.row, move.col);
  }, 380);
}

function focusCell(index = focusedCell.value): void {
  focusedCell.value = index;
  void nextTick(() => board.value?.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)?.focus({ preventScroll: true }));
}

function place(index: number): void {
  if (thinking.value || confirmDialog.value?.open) return;
  if (game.place(Math.floor(index / BOARD_SIZE), index % BOARD_SIZE)) {
    focusedCell.value = index;
    scheduleComputer();
  }
}

function undo(): void {
  if (!game.history.length || confirmDialog.value?.open) return;
  stopComputer();
  const steps = mode.value === 'computer' && lastMove.value?.player === 2 ? 2 : 1;
  const move = game.history[Math.max(0, game.history.length - steps)];
  game.undo(steps);
  focusCell(move.row * BOARD_SIZE + move.col);
}

function newGame(nextMode: Mode): void {
  stopComputer();
  confirmDialog.value?.close();
  mode.value = nextMode;
  game.reset();
  focusCell(112);
}

function requestNewGame(nextMode = mode.value): void {
  pendingMode.value = nextMode;
  if (game.history.length && !finished.value) {
    stopComputer();
    confirmDialog.value?.showModal();
  } else newGame(nextMode);
}

function cancelChange(): void {
  confirmDialog.value?.close();
  scheduleComputer();
  focusCell();
}

function onBoardKey(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const row = Math.floor(focusedCell.value / BOARD_SIZE);
  const col = focusedCell.value % BOARD_SIZE;
  const moves: Record<string, number> = {
    ArrowUp: Math.max(0, row - 1) * BOARD_SIZE + col,
    ArrowDown: Math.min(BOARD_SIZE - 1, row + 1) * BOARD_SIZE + col,
    ArrowLeft: row * BOARD_SIZE + Math.max(0, col - 1),
    ArrowRight: row * BOARD_SIZE + Math.min(BOARD_SIZE - 1, col + 1),
  };
  if (event.key in moves) {
    event.preventDefault();
    focusCell(moves[event.key]);
  } else if (event.code === 'KeyZ') {
    event.preventDefault();
    if (!event.repeat) undo();
  } else if (event.code === 'KeyR') {
    event.preventDefault();
    if (!event.repeat) requestNewGame();
  }
}

function cellLabel(index: number): string {
  const value = game.board[index];
  return `第 ${Math.floor(index / BOARD_SIZE) + 1} 行，第 ${index % BOARD_SIZE + 1} 列，${value ? (value === 1 ? '黑棋' : '白棋') : '空位'}${moveNumbers.value.has(index) ? `，第 ${moveNumbers.value.get(index)} 手` : ''}`;
}

function playerName(player: Player): string {
  return mode.value === 'computer' ? (player === 1 ? '你' : '电脑') : (player === 1 ? '黑棋' : '白棋');
}

onBeforeUnmount(stopComputer);
</script>

<template>
  <main class="gomoku-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 008 — FIVE IN A LITTLE ROW</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="gomoku-title">
        <span class="eyebrow">经典棋局 · 黑白之间</span>
        <h1 id="gomoku-title">五子棋<span>.</span></h1>
        <span class="english-title">G O M O K U</span>
        <h2>落下一点从容，<br>连起<span class="highlight">小胜利。</span></h2>
        <p class="intro-copy">不急着走下一步。<br>在一黑一白之间，给思绪放个假。</p>
        <div class="mode-tag"><SvgIcon name="i-grid" /> 15 × 15 棋盘 <span>·</span> 自由五子棋</div>
        <section class="controls-guide" aria-labelledby="gomoku-controls-title">
          <h3 id="gomoku-controls-title">快乐，落在这一点<span>MAKE YOUR NEXT MOVE</span></h3>
          <div class="stone-pair" aria-hidden="true"><i class="stone black"></i><i class="stone white"></i><span>你的下一步，<br>藏着新的可能。</span></div>
          <p id="gomoku-help">点击或轻触交叉点落子。<br>键盘方向键选点，Enter / 空格落子。</p>
          <div class="shortcut-note"><span><kbd>Z</kbd> 悔棋</span><span><kbd>R</kbd> 重新开始</span></div>
        </section>
        <div class="slow-note"><SvgIcon name="icon-leaf" /><p>输赢都没关系，<br>享受认真思考的这一刻。</p></div>
      </section>

      <section class="play-area" aria-label="五子棋游戏">
        <div class="players-strip">
          <div class="player" :class="{ active: !finished && game.currentPlayer === 1 }"><i class="stone black" aria-hidden="true"></i><div><strong>{{ playerName(1) }} <small>黑棋</small></strong><span>先手 · BLACK</span></div><i class="turn-dot" aria-hidden="true"></i></div>
          <span class="versus">VS</span>
          <div class="player" :class="{ active: !finished && game.currentPlayer === 2 }"><i class="stone white" aria-hidden="true"></i><div><strong>{{ playerName(2) }} <small>白棋</small></strong><span>后手 · WHITE</span></div><i class="turn-dot" aria-hidden="true"></i></div>
        </div>
        <div class="board-shell">
          <div class="board-heading"><h2><i></i> {{ mode === 'computer' ? '和电脑，切磋一下' : '与朋友，手谈一局' }}</h2><span>第 <strong id="gomoku-moves">{{ String(game.history.length).padStart(2, '0') }}</strong> 手</span></div>
          <div class="board-mat">
            <div class="column-labels" aria-hidden="true"><span v-for="column in columns" :key="column">{{ column }}</span></div>
            <div class="row-labels" aria-hidden="true"><span v-for="row in BOARD_SIZE" :key="row">{{ row }}</span></div>
            <div ref="board" class="gomoku-board" role="grid" aria-label="五子棋棋盘" aria-describedby="gomoku-help" :aria-rowcount="BOARD_SIZE" :aria-colcount="BOARD_SIZE" :aria-busy="thinking" :data-state="game.winner ? 'won' : game.draw ? 'draw' : 'playing'" :class="{ 'white-turn': game.currentPlayer === 2 }" @keydown="onBoardKey">
              <div v-for="row in BOARD_SIZE" :key="row" class="board-row" role="row" :aria-rowindex="row">
                <button v-for="col in BOARD_SIZE" :key="col" class="cell" role="gridcell" :aria-colindex="col"
                  :data-cell="(row - 1) * BOARD_SIZE + col - 1" :data-player="game.board[(row - 1) * BOARD_SIZE + col - 1]"
                  :tabindex="focusedCell === (row - 1) * BOARD_SIZE + col - 1 ? 0 : -1"
                  :aria-label="cellLabel((row - 1) * BOARD_SIZE + col - 1)"
                  :aria-disabled="Boolean(game.board[(row - 1) * BOARD_SIZE + col - 1]) || finished || thinking"
                  :class="{ winning: game.winningLine.includes((row - 1) * BOARD_SIZE + col - 1), last: lastMove?.row === row - 1 && lastMove?.col === col - 1 }"
                  @focus="focusedCell = (row - 1) * BOARD_SIZE + col - 1" @click="place((row - 1) * BOARD_SIZE + col - 1)">
                  <span v-if="stars.includes((row - 1) * BOARD_SIZE + col - 1)" class="star-point" aria-hidden="true"></span>
                  <span v-if="game.board[(row - 1) * BOARD_SIZE + col - 1]" class="stone" :class="game.board[(row - 1) * BOARD_SIZE + col - 1] === 1 ? 'black' : 'white'" aria-hidden="true"><span v-if="showNumbers">{{ moveNumbers.get((row - 1) * BOARD_SIZE + col - 1) }}</span><i v-else-if="lastMove?.row === row - 1 && lastMove?.col === col - 1" class="last-mark"></i></span>
                </button>
              </div>
            </div>
          </div>
          <div id="gomoku-status" class="board-status" :class="{ finished, thinking }" role="status" aria-live="polite"><span><i></i>{{ status }}</span><SvgIcon :name="finished ? 'icon-cup' : 'icon-leaf'" /></div>
        </div>
        <div class="game-actions"><button id="gomoku-undo" class="secondary-button" :disabled="!game.history.length" @click="undo"><SvgIcon name="icon-restart" /> 悔棋 <kbd>Z</kbd></button><button id="gomoku-restart" class="primary-button" @click="requestNewGame()"><SvgIcon name="i-reset" /> {{ finished ? '再来一局' : '重新开始' }} <kbd>R</kbd></button></div>
        <div class="under-board"><span><i class="last-mark"></i> 标记最后一手</span><label><input v-model="showNumbers" type="checkbox"> 显示手数</label></div>
        <p class="board-note">{{ mode === 'computer' ? '你执黑先行 · 悔棋退回到你上次落子前' : '同屏轮流落子 · 悔棋撤回最近一手' }}</p>
      </section>

      <aside class="sidebar">
        <section class="mode-card" aria-labelledby="gomoku-mode-title">
          <div class="section-heading"><h2 id="gomoku-mode-title">找个棋友，下一局</h2><span>PLAY YOUR WAY</span></div>
          <div class="mode-options" role="group" aria-label="对弈模式"><button :aria-pressed="mode === 'computer'" @click="mode !== 'computer' && requestNewGame('computer')">人机对弈</button><button :aria-pressed="mode === 'local'" @click="mode !== 'local' && requestNewGame('local')">双人对弈</button></div>
          <p>{{ mode === 'computer' ? '一个人也能开局，和电脑过过招。' : '把屏幕分享给朋友，轮流落下黑白子。' }}</p>
        </section>
        <section class="rules-card" aria-labelledby="gomoku-rules-title">
          <div class="section-heading"><h2 id="gomoku-rules-title">五子连珠指南</h2><span>HOW TO PLAY</span></div>
          <ol><li><span>01</span><div><h3>一人一手，黑棋先行</h3><p>在棋盘交叉点落子。已落子的地方，<br>就留给那颗棋子。</p></div></li><li><span>02</span><div><h3>五颗相连，就是胜利</h3><p>横着、竖着、斜着都可以。<br>同色棋子连续五颗或更多即可获胜。</p><div class="five-example" aria-hidden="true"><i v-for="n in 5" :key="n" class="stone black"></i></div></div></li><li><span>03</span><div><h3>简单一点，自在下棋</h3><p>不设禁手，不限思考时间。<br>棋盘下满仍无人连五，则为和棋。</p></div></li></ol>
        </section>
        <section class="moves-card" aria-labelledby="gomoku-history-title"><div class="section-heading"><h2 id="gomoku-history-title">落子足迹</h2><span>LAST 6 MOVES</span></div><p v-if="!recentMoves.length" class="empty-history">棋盘已就绪，等你的第一手。</p><ol v-else class="move-list"><li v-for="move in recentMoves" :key="move.number"><span class="move-number">{{ String(move.number).padStart(2, '0') }}</span><i class="stone" :class="move.player === 1 ? 'black' : 'white'" aria-hidden="true"></i><span>{{ playerName(move.player) }}</span><strong>{{ columns[move.col] }}{{ move.row + 1 }}</strong><small v-if="move.number === game.history.length">最新</small></li></ol></section>
      </aside>
    </div>
    <footer><span><i></i> 黑白之间，留一点时间给自己。</span><span>A LITTLE FOCUS. A LITTLE JOY. <SvgIcon class="footer-arrow" aria-hidden="true" name="icon-arrow-up-right" /></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="gomoku-confirm-title" @cancel.prevent="cancelChange">
      <span class="eyebrow">A FRESH LITTLE START</span><h2 id="gomoku-confirm-title">{{ pendingMode === mode ? '重新开始这一局？' : '换个棋友，重新开局？' }}</h2><p>当前棋局将被清空。没关系，每一局都是新的可能。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelChange">继续本局</button><button class="primary-button" @click="newGame(pendingMode)">{{ pendingMode === mode ? '确定重开' : '确定切换' }}</button></div>
    </dialog>
  </main>
</template>

<style scoped src="./styles.css"></style>
