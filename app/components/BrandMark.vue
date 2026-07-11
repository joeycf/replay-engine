<script setup lang="ts">
/**
 * The ReplayDB mark — single geometry source: design/brand/rd-mark.svg
 * (ring + twin rewind triangles). Fills come from semantic tokens only, so
 * the mark re-tints under any game theme; the brand's own colors are the
 * umbrella theme's primary/secondary.
 */
withDefaults(defineProps<{ size?: number; title?: string }>(), {
  size: 28,
  title: 'ReplayDB',
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 100 100"
    role="img"
    :aria-label="title"
    class="block flex-none"
  >
    <circle cx="50" cy="50" r="39" fill="none" class="stroke-primary" stroke-width="7" />
    <path class="fill-secondary" d="M48 36 L48 64 L30 50 Z" />
    <path class="fill-secondary" d="M70 36 L70 64 L52 50 Z" />
  </svg>
</template>
