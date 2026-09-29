<script setup lang="ts">
import SvgIcon from './components/SvgIcon.vue';
import { ref } from 'vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { games } from './games/registry';

const route = useRoute();
const pageContent = ref<HTMLDivElement | null>(null);
</script>

<template>
  <div class="arcade-app">
    <a class="skip-link" href="#page-content" @click.prevent="pageContent?.focus()">跳到主要内容</a>
    <header class="club-header">
      <div class="club-header-inner">
        <RouterLink to="/" class="club-brand" aria-label="摸鱼俱乐部首页">
          <span class="club-mark" aria-hidden="true">
            <SvgIcon viewBox="0 0 32 32" sprite="illustrations" name="club-mark" />
          </span>
          <span>摸鱼俱乐部<small>THE LITTLE BREAK CLUB</small></span>
        </RouterLink>
        <nav class="club-nav" aria-label="游戏导航">
          <RouterLink to="/" :class="{ selected: route.name === 'home' }">游戏大厅</RouterLink>
          <RouterLink to="/cloud" class="cloud-nav-link" :class="{ selected: route.name === 'cloud-saves' }">云存档</RouterLink>
          <template v-if="route.path.startsWith('/games/')">
            <RouterLink v-for="game in games" :key="game.id" :to="`/games/${game.id}`" :class="{ selected: route.name === game.id }">{{ game.name }}</RouterLink>
          </template>
        </nav>
        <span v-if="route.name === 'home'" class="club-header-note"><i></i> 忙里偷闲，理直气壮</span>
        <RouterLink v-else to="/" class="back-home"><SvgIcon class="back-icon" aria-hidden="true" name="icon-back" /> 返回大厅</RouterLink>
      </div>
    </header>
    <div id="page-content" ref="pageContent" tabindex="-1">
      <RouterView />
    </div>
  </div>
</template>
