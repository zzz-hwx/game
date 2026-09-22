<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import SvgIcon from '../../components/SvgIcon.vue';
import { DIFFICULTIES, FRUITS, MemoryGame } from './engine';
import type { Difficulty } from './engine';

const game = reactive(new MemoryGame());
const board = ref<HTMLDivElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const resumeButton = ref<HTMLButtonElement | null>(null);
const focusedCard = ref(0);
const round = ref(0);
const pendingDifficulty = ref<Difficulty>('normal');
const announcement = ref('翻开第一张牌，开始收集小美好。');
const difficultyIds = Object.keys(DIFFICULTIES) as Difficulty[];
const progress = computed(() => Math.round(game.matchedPairs / game.totalPairs * 100));
const time = computed(() => {
  const seconds = Math.floor(game.elapsedMs / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});
const collected = computed(() => new Set(game.cards.filter(card => card.matched).map(card => card.fruit)));
let timer: ReturnType<typeof setInterval> | undefined;
let lastTime = 0;
let resumeAfterDialog = false;

function syncClock(): void {
  const now = performance.now();
  const wasWaiting = game.mismatchMs > 0;
  game.tick(now - lastTime);
  lastTime = now;
  if (wasWaiting && game.mismatchMs === 0) announcement.value = '记住它们的位置，再找一对吧。';
}

function focusCard(index = focusedCard.value): void {
  focusedCard.value = index;
  void nextTick(() => board.value?.querySelector<HTMLButtonElement>(`[data-card="${index}"]`)?.focus({ preventScroll: true }));
}

function flip(index: number): void {
  if (confirmDialog.value?.open) return;
  syncClock();
  if (!game.flip(index)) return;
  focusedCard.value = index;
  const fruit = FRUITS[game.cards[index].fruit].name;
  announcement.value = game.status === 'won' ? '小美好，全部找到！'
    : game.cards[index].matched ? `${fruit}配对成功！已找到 ${game.matchedPairs} 对。`
      : game.selected.length === 2 ? '这两张不一样，记住它们的位置。' : `翻开了${fruit}，找找另一张在哪里。`;
}

function pause(): void {
  syncClock();
  game.pause();
  if (game.status === 'paused' && !confirmDialog.value?.open) {
    void nextTick(() => resumeButton.value?.focus({ preventScroll: true }));
  }
}

function resume(): void {
  syncClock();
  game.resume();
  focusCard();
}

function newGame(difficulty: Difficulty): void {
  confirmDialog.value?.close();
  game.reset(difficulty);
  round.value++;
  lastTime = performance.now();
  announcement.value = '牌已洗好，翻开第一张，开始新的小快乐。';
  focusCard(0);
}

function requestNewGame(difficulty = game.difficulty): void {
  pendingDifficulty.value = difficulty;
  syncClock();
  if (game.status === 'playing' || game.status === 'paused') {
    resumeAfterDialog = game.status === 'playing';
    game.pause();
    confirmDialog.value?.showModal();
  } else newGame(difficulty);
}

function cancelChange(): void {
  confirmDialog.value?.close();
  syncClock();
  if (resumeAfterDialog) {
    game.resume();
    focusCard();
  } else void nextTick(() => resumeButton.value?.focus({ preventScroll: true }));
}

function onBoardKey(event: KeyboardEvent): void {
  if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
  const index = focusedCard.value;
  const col = index % 4;
  const targets: Record<string, number> = {
    ArrowLeft: col > 0 ? index - 1 : index,
    ArrowRight: col < 3 ? index + 1 : index,
    ArrowUp: Math.max(col, index - 4),
    ArrowDown: Math.min(game.cards.length - 4 + col, index + 4),
    Home: index - col,
    End: index - col + 3,
  };
  if (event.key in targets) {
    event.preventDefault();
    focusCard(targets[event.key]);
  }
}

function cardLabel(index: number): string {
  const card = game.cards[index];
  const visible = card.faceUp && game.status !== 'paused';
  return `第 ${index + 1} 张，${visible ? FRUITS[card.fruit].name : '牌背'}${card.matched ? '，已配对' : ''}`;
}

function visibilityChange(): void {
  if (document.hidden) pause();
}

onMounted(() => {
  lastTime = performance.now();
  timer = setInterval(syncClock, 100);
  document.addEventListener('visibilitychange', visibilityChange);
});
onBeforeUnmount(() => {
  clearInterval(timer);
  document.removeEventListener('visibilitychange', visibilityChange);
});
</script>

<template>
  <main class="memory-game">
    <div class="edition-line"><span><i></i> 小游戏，大快乐 <b>/</b> THE CLASSICS</span><span>VOL. 010 — A LITTLE MATCH, A LITTLE JOY</span></div>
    <div class="game-layout">
      <section class="intro" aria-labelledby="memory-title">
        <span class="eyebrow">记忆小游戏 · 翻开小惊喜</span>
        <h1 id="memory-title">翻牌配对<span>.</span></h1>
        <span class="english-title">FLIP & FIND</span>
        <h2>翻开小美好，<br>记住<span class="highlight">小快乐。</span></h2>
        <p class="intro-copy">有些美好，值得再遇见一次。<br>翻一翻，找一找，让快乐成双。</p>
        <div class="mode-tag"><SvgIcon name="i-heart" /> 不限时间 <span>·</span> 慢慢来也很好</div>
        <section class="controls-guide" aria-labelledby="memory-controls-title">
          <h3 id="memory-controls-title">一点记忆，一点默契<span>A PERFECT LITTLE MATCH</span></h3>
          <div class="demo-pair" aria-hidden="true"><span><SvgIcon sprite="fruits" name="fruit-cherry" viewBox="0 0 64 64" /></span><SvgIcon class="pair-link" name="i-link" /><span><SvgIcon sprite="fruits" name="fruit-cherry" viewBox="0 0 64 64" /></span></div>
          <p>点击或轻触卡片，翻开两张相同的水果。<br>找齐所有配对，就是今天的小胜利。</p>
          <div class="keyboard-note"><SvgIcon name="icon-keyboard" /><span>方向键选牌 · Enter / 空格翻牌</span></div>
        </section>
        <div class="slow-note"><SvgIcon name="icon-leaf" /><p>不必过目不忘，<br>每次翻开，都是新的发现。</p></div>
      </section>

      <section class="play-area" aria-label="翻牌配对游戏">
        <div class="stats-strip">
          <div><span><SvgIcon name="i-link" /> 已配对</span><strong><b id="memory-pairs">{{ game.matchedPairs }}</b><small> / {{ game.totalPairs }}</small></strong></div>
          <div><span><SvgIcon name="i-grid" /> 翻牌步数</span><strong id="memory-moves">{{ String(game.moves).padStart(2, '0') }}</strong></div>
          <div><span><SvgIcon name="i-clock" /> 本局用时</span><strong id="memory-time">{{ time }}</strong></div>
        </div>
        <div class="board-shell" :data-state="game.status">
          <div class="board-heading"><h2><i></i> 水果小聚会</h2><span>{{ DIFFICULTIES[game.difficulty].name }} · {{ game.cards.length }} 张卡片</span></div>
          <div class="board-mat" :class="{ compact: game.difficulty === 'hard' }">
            <div :key="round" ref="board" class="memory-board" role="group" aria-label="翻牌配对牌桌" aria-describedby="memory-help" :inert="game.status === 'paused'" :class="{ concealed: game.status === 'paused' }" @keydown="onBoardKey">
              <button v-for="(card, index) in game.cards" :key="index" class="memory-card" :class="{ flipped: card.faceUp, matched: card.matched }" :data-card="index"
                :tabindex="focusedCard === index ? 0 : -1" :aria-label="cardLabel(index)" :aria-pressed="card.faceUp"
                :aria-disabled="card.faceUp || game.selected.length === 2 || game.status === 'won' || game.status === 'paused'"
                @focus="focusedCard = index" @click="flip(index)">
                <span class="card-inner" aria-hidden="true">
                  <span class="card-back"><span class="back-emblem"><SvgIcon name="icon-leaf" /></span><small>LITTLE JOY</small></span>
                  <span class="card-front"><SvgIcon sprite="fruits" :name="`fruit-${FRUITS[card.fruit].id}`" viewBox="0 0 64 64" /><span class="match-mark" v-if="card.matched">✓</span></span>
                </span>
              </button>
            </div>
            <div v-if="game.status === 'paused'" class="pause-overlay"><span class="overlay-icon"><SvgIcon name="icon-pause" /></span><span class="eyebrow">TAKE A LITTLE BREAK</span><h2>歇一下，快乐还在</h2><p>卡片和计时都已暂停。<br>准备好了，我们再继续。</p><button ref="resumeButton" class="primary-button" @click="resume"><SvgIcon name="icon-play" /> 继续游戏</button></div>
          </div>
          <div id="memory-status" class="board-status" :class="{ finished: game.status === 'won' }" role="status">{{ game.status === 'paused' ? '已暂停，回来再继续找朋友。' : announcement }}<SvgIcon :name="game.status === 'won' ? 'icon-cup' : 'i-spark'" /></div>
        </div>
        <div v-if="game.status === 'won'" class="win-card" role="region" aria-label="通关结果"><SvgIcon name="icon-cup" /><div><h2>小美好，全部找到！</h2><p>{{ game.moves }} 步 · {{ time }} · {{ game.moves === game.totalPairs ? '一次不差，记忆力满分！' : '认真玩耍的你，值得一点掌声。' }}</p></div></div>
        <div class="game-actions"><button class="secondary-button" :disabled="game.status === 'ready' || game.status === 'won'" @click="game.status === 'paused' ? resume() : pause()"><SvgIcon :name="game.status === 'paused' ? 'icon-play' : 'icon-pause'" />{{ game.status === 'paused' ? '继续游戏' : '暂停一下' }}</button><button class="primary-button" @click="requestNewGame()"><SvgIcon name="i-shuffle" />{{ game.status === 'won' ? '再来一局' : '重新开始' }}</button></div>
        <p id="memory-help" class="board-note">{{ game.status === 'ready' ? '翻开任意一张即开始计时' : '每翻两张算一步，相同的卡片会留在正面' }}<span>鼠标 / 触屏 / 键盘</span></p>
      </section>

      <aside class="sidebar">
        <section class="difficulty-card" aria-labelledby="memory-difficulty-title"><div class="section-heading"><h2 id="memory-difficulty-title">今天，想玩哪一种？</h2><span>PICK YOUR PACE</span></div><div class="difficulty-options" role="group" aria-label="游戏难度"><button v-for="id in difficultyIds" :key="id" :aria-pressed="game.difficulty === id" @click="game.difficulty !== id && requestNewGame(id)"><strong>{{ DIFFICULTIES[id].name }}</strong><small>{{ DIFFICULTIES[id].pairs }} 对</small></button></div><p>从轻松开始，或给记忆力一点小挑战。<br>没有倒计时，按自己的节奏来。</p></section>
        <section class="collection-card" aria-labelledby="memory-collection-title"><div class="section-heading"><h2 id="memory-collection-title">成双的小美好</h2><span>{{ game.matchedPairs }} / {{ game.totalPairs }}</span></div><div class="collection-fruits"><span v-for="(fruit, index) in FRUITS.slice(0, game.totalPairs)" :key="fruit.id" :class="{ collected: collected.has(index) }" :aria-label="`${fruit.name}：${collected.has(index) ? '已找到' : '待寻找'}`"><SvgIcon sprite="fruits" :name="`fruit-${fruit.id}`" viewBox="0 0 64 64" /></span></div><div class="progress-track" role="progressbar" aria-label="配对进度" :aria-valuenow="game.matchedPairs" :aria-valuemin="0" :aria-valuemax="game.totalPairs"><span :style="{ width: `${progress}%` }"></span></div><p>{{ game.status === 'won' ? '每一份小美好，都找到了朋友。' : '每找到一对，就点亮一份小快乐。' }}</p></section>
        <section class="rules-card" aria-labelledby="memory-rules-title"><div class="section-heading"><h2 id="memory-rules-title">快乐配对指南</h2><span>HOW TO PLAY</span></div><ol><li><span>01</span><div><h3>翻开两张，看看是谁</h3><p>每次选择两张卡片，记住水果和位置。</p></div></li><li><span>02</span><div><h3>相同留下，不同再试</h3><p>一样的水果配对成功；不一样的稍后会盖回去，别急着翻下一张。</p></div></li><li><span>03</span><div><h3>找齐所有，快乐成双</h3><p>用更少的步数找到所有配对。没有失败，只有越来越熟悉。</p></div></li></ol></section>
      </aside>
    </div>
    <footer><span><i></i> 把小美好，记在心上。</span><span>FLIP A CARD. FIND A LITTLE JOY. <b>↗</b></span></footer>
    <dialog ref="confirmDialog" class="confirm-dialog" aria-labelledby="memory-confirm-title" @cancel.prevent="cancelChange"><span class="eyebrow">A FRESH LITTLE START</span><h2 id="memory-confirm-title">{{ pendingDifficulty === game.difficulty ? '重新洗牌，开始一局？' : '换个难度，重新开始？' }}</h2><p>当前配对和用时会清空，卡片也会重新洗牌。</p><div class="dialog-actions"><button class="secondary-button" autofocus @click="cancelChange">保留本局</button><button class="primary-button" @click="newGame(pendingDifficulty)">{{ pendingDifficulty === game.difficulty ? '确定重开' : '确定切换' }}</button></div></dialog>
  </main>
</template>

<style scoped src="./styles.css"></style>
