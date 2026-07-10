<script setup lang="ts">
/**
 * The product wordmark: `{shortName} / REPLAY` per PLAN.md §4b, built from
 * useGame().shortName — evoking each game through type + color, never a
 * trademarked logo. When shortName is empty (the neutral engine default /
 * selector), it renders the umbrella mark "REPLAY DATABASE".
 *
 * Styling: --font-display + semantic color tokens only. No raw hex, no literal
 * family.
 */
const game = useGame();

const hasGame = computed(() => !!game.shortName?.trim());
const lead = computed(() => (hasGame.value ? game.shortName.trim() : 'REPLAY'));
const trail = computed(() => (hasGame.value ? 'REPLAY' : 'DATABASE'));
</script>

<template>
  <NuxtLink
    to="/"
    class="group inline-flex items-baseline gap-1.5 font-display uppercase tracking-wider select-none"
    :aria-label="`${lead} ${trail} — home`"
  >
    <span class="text-xl font-black leading-none text-text">{{ lead }}</span>
    <span class="text-xl font-medium leading-none text-primary">{{ trail }}</span>
  </NuxtLink>
</template>
