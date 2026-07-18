<template>
  <NuxtLink
    to="/"
    class="flex-none select-none font-display text-[16px] font-bold tracking-tight text-text md:text-[20px]"
    :aria-label="`${useBrandName()} — home`"
  >
    <template v-if="hasGame">
      {{ game.shortName.trim() }}<span class="text-primary">/</span
      ><span class="hidden sm:inline">REPLAY</span>
    </template>
    <template v-else>Replay<span class="text-primary">DB</span></template>
  </NuxtLink>
</template>

<script setup lang="ts">
/**
 * The header wordmark: `{shortName}/REPLAY` per PLAN §4b — each game evoked
 * through type + color, never a trademarked logo. The umbrella default (no
 * game slug) wears the ReplayDB lockup text instead: `Replay·DB`.
 * --font-display + semantic tokens only.
 */
const game = useGame();

const hasGame = computed(() => !!game.shortName?.trim());
</script>
