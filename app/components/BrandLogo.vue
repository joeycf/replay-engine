<script setup lang="ts">
/**
 * The full ReplayDB lockup (mark + wordmark + tagline) from
 * design/brand/replaydb-primary.svg, re-expressed as HTML/CSS with semantic
 * tokens so it re-tints under any theme. Exported primarily for the SHELL's
 * selector page (PLAN §5); game headers keep the text BrandWordmark.
 */
withDefaults(defineProps<{ markSize?: number; tagline?: boolean }>(), {
  markSize: 56,
  tagline: true,
});
</script>

<template>
  <span class="inline-flex items-center gap-4">
    <BrandMark :size="markSize" />
    <span class="flex min-w-0 flex-col">
      <span
        class="font-display font-bold tracking-tight text-text"
        :style="{ fontSize: `${Math.round(markSize * 0.62)}px`, lineHeight: 1.05 }"
        >Replay<span class="text-primary">DB</span></span
      >
      <span
        v-if="tagline"
        class="mt-1 font-mono uppercase text-secondary"
        :style="{
          fontSize: `${Math.max(9, Math.round(markSize * 0.14))}px`,
          letterSpacing: '0.32em',
        }"
        >Fighting-game replay archive</span
      >
    </span>
  </span>
</template>
