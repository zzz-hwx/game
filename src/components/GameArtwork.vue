<script setup lang="ts">
import SvgIcon from './SvgIcon.vue';

defineProps<{ kind: string }>();
const kinds = ['snake', 'tetris', 'link', 'minesweeper', '2048', 'sokoban', 'pacman', 'gomoku', 'breakout', 'memory'];
</script>

<template>
  <SvgIcon class="game-artwork" sprite="artwork" :name="kinds.includes(kind) ? kind : 'default'" viewBox="0 0 360 240" fill="none" />
</template>

<style scoped>
.game-artwork { display: block; width: 100%; height: 100%; transition: transform .4s ease; }
@media (prefers-reduced-motion: reduce) { .game-artwork { transition: none; } }
</style>
