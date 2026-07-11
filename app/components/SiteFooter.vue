<script setup lang="ts">
/**
 * Footer with the templated fan-project disclaimer (PLAN §4b):
 *   "{name} Replay Database is an unofficial fan project, not endorsed by or
 *    affiliated with {rightsHolder}."
 * The umbrella default (no slug) uses the brand name directly. A game may
 * override this component at the same path for extra footer content (support
 * links etc.) — the 2XKO app does exactly that in Phase 3.
 */
const game = useGame();
const brand = useBrandName();

const disclaimer = computed(
  () =>
    `${brand} is an unofficial fan project, not endorsed by or affiliated with ${game.rightsHolder}.`,
);
const year = new Date().getFullYear();
</script>

<template>
  <footer
    class="flex flex-wrap items-center justify-between gap-x-8 gap-y-1 border-t border-border-subtle bg-surface-sunken px-7 py-4 font-ui text-[11px] text-text-muted"
  >
    <p class="max-w-2xl">{{ disclaimer }}</p>
    <p class="font-mono text-[10px]">© {{ year }} {{ brand }}</p>
  </footer>
</template>
