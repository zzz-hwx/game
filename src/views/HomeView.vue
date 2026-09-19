<script setup lang="ts">
import SvgIcon from '../components/SvgIcon.vue';
import { RouterLink } from 'vue-router';
import GameArtwork from '../components/GameArtwork.vue';
import { games } from '../games/registry';
</script>

<template>
  <main class="lobby">
    <section class="lobby-hero" aria-labelledby="lobby-title">
      <div class="hero-copy">
        <p class="lobby-eyebrow"><span></span> 小游戏，大快乐 <i>/</i> A LITTLE BREAK, A LITTLE PLAY</p>
        <h1 id="lobby-title">把忙碌放一边，<br>快乐<span class="hero-highlight">玩一会</span><span class="hero-dot">。</span></h1>
        <p class="hero-description">不必填满每一分钟。<br class="mobile-break">选一个喜欢的小游戏，给自己放个小小的假。</p>
        <div class="hero-pills"><span><i></i> 无需下载</span><span><i></i> 即点即玩</span><span><i></i> 快乐不限量</span></div>
      </div>
      <div class="hero-stamp" aria-hidden="true">
        <span class="stamp-top">OFF DUTY. ON PLAY.</span>
        <SvgIcon viewBox="0 0 100 90" fill="none" sprite="illustrations" name="club-stamp" />
        <strong>今日宜摸鱼</strong><span class="stamp-bottom">TAKE IT EASY, TAKE A BREAK</span>
      </div>
    </section>

    <section class="collection" aria-labelledby="collection-title">
      <div class="collection-heading">
        <h2 id="collection-title">快乐，从这里开始<span>{{ String(games.length).padStart(2, '0') }}</span></h2>
        <p>老朋友，新心情。 <span>THE CLASSICS COLLECTION</span></p>
      </div>
      <div class="game-grid">
        <RouterLink v-for="(game, index) in games" :key="game.id" :to="`/games/${game.id}`" class="game-card-link" :style="{ '--card-color': game.color, '--card-background': game.background }" :aria-label="`开始玩${game.name}`">
          <div class="card-art">
            <div class="card-art-top"><span>VOL. {{ String(index + 1).padStart(3, '0') }}</span><span class="category">{{ game.category }}</span></div>
            <GameArtwork :kind="game.id" />
          </div>
          <div class="card-copy">
            <div class="card-title"><h3>{{ game.name }}</h3><span>{{ game.englishName }}</span></div>
            <p class="card-tagline">{{ game.tagline }}</p>
            <p class="card-description">{{ game.description }}</p>
            <div class="card-bottom"><span class="card-controls"><SvgIcon viewBox="0 0 24 24" aria-hidden="true" sprite="illustrations" name="card-keyboard" />{{ game.controls }}</span><span class="play-link">开始玩 <span class="play-arrow" aria-hidden="true">↗</span></span></div>
          </div>
        </RouterLink>
      </div>
    </section>

    <section class="lobby-note" aria-label="更多小游戏">
      <span class="note-plus" aria-hidden="true">＋</span>
      <div><h2>快乐不止这些，下一份惊喜正在路上。</h2><p>更多小游戏，慢慢加入。你的休息时间，值得被认真对待。</p></div>
      <span class="note-label">MORE LITTLE JOYS TO COME</span>
    </section>
    <footer class="lobby-footer"><span><i></i> 纯粹的游戏，简单的快乐。</span><span>MADE FOR YOUR LITTLE BREAK <b>＋</b></span></footer>
  </main>
</template>
