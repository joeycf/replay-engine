<template>
  <span
    class="inline-block flex-none rotate-45 bg-primary"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
    }"
    title="Featured player"
  />
</template>

<script setup lang="ts">
// The rotated-square mark for FEATURED players (the generic form of the
// shipped "verified pro" diamond — Player.featured is the engine contract).
withDefaults(defineProps<{ size?: number }>(), { size: 9 });
</script>
