<template>
  <span
    class="inline-block flex-none rotate-45 bg-primary"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
    }"
    :title="title"
  />
</template>

<script setup lang="ts">
// The rotated-square mark for FEATURED players (the generic form of the
// shipped "verified pro" diamond — Player.featured is the engine contract).
// `title` lets a caller say WHY (v0.17.0: "… · tournament winner").
withDefaults(defineProps<{ size?: number; title?: string }>(), {
  size: 9,
  title: 'Featured player',
});
</script>
