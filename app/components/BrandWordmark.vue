<template>
  <a
    href="/"
    class="flex-none select-none font-display text-[16px] font-bold tracking-tight text-text md:text-[20px]"
    :aria-label="ariaLabel"
  >
    <template v-if="hasGame">
      {{ game.shortName.trim() }}<span class="text-primary">/</span
      ><span class="hidden sm:inline">REPLAY</span>
    </template>
    <template v-else>Replay<span class="text-primary">DB</span></template>
  </a>
</template>

<script setup lang="ts">
/**
 * The header wordmark: `{shortName}/REPLAY` per PLAN §4b — each game evoked
 * through type + color, never a trademarked logo. The umbrella default (no
 * game slug) wears the ReplayDB lockup text instead: `Replay·DB`.
 *
 * Clicking it returns to the game SELECTOR at the true site root. This is a
 * plain `<a href="/">`, NOT a <NuxtLink>, on purpose: under a subpath build
 * (app.baseURL = '/2xko') NuxtLink/withBase would prefix the base and send you
 * back to the game's own home instead. The selector lives above the base, so
 * this is the one engine link that intentionally escapes it — don't "fix" it
 * back to <NuxtLink>. At a root deploy (base '/') the selector simply IS '/'.
 * --font-display + semantic tokens only.
 */
const game = useGame();
const brandName = useBrandName();

const hasGame = computed(() => !!game.shortName?.trim());
const ariaLabel = computed(() => `${brandName} — ${hasGame.value ? 'all games' : 'home'}`);
</script>
