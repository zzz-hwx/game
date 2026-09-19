<script setup lang="ts">
import icons from '../../assets/svg/icons.svg?url&no-inline';
import fruits from '../../assets/svg/fruits.svg?url&no-inline';
import illustrations from '../../assets/svg/illustrations.svg?url&no-inline';
import artwork from '../../assets/svg/artwork.svg?url&no-inline';

const sprites = { icons, fruits, illustrations, artwork };
withDefaults(defineProps<{
  name: string;
  sprite?: keyof typeof sprites;
}>(), { sprite: 'icons' });
</script>

<template>
  <svg aria-hidden="true" focusable="false">
    <use :href="`${sprites[sprite]}#${name}`" />
  </svg>
</template>
