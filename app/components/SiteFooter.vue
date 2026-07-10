<script setup lang="ts">
/**
 * Footer with the templated fan-project disclaimer (PLAN.md §4b, Phase-1 spec):
 *   "{name} Replay Database is an unofficial fan project, not endorsed by or
 *    affiliated with {rightsHolder}."
 *
 * For the neutral umbrella default (empty slug) we drop the "{name} Replay
 * Database" doubling and use the brand name directly, so the selector's own
 * footer reads cleanly. All values come from useGame(); colors/fonts are
 * semantic tokens only.
 */
const game = useGame();

const brand = computed(() => (game.slug ? `${game.name} Replay Database` : game.name));
const disclaimer = computed(
  () =>
    `${brand.value} is an unofficial fan project, not endorsed by or affiliated with ${game.rightsHolder}.`,
);
const year = new Date().getFullYear();
</script>

<template>
  <footer class="mt-16 border-t border-border-subtle bg-surface/40">
    <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-text-muted">
      <p class="max-w-2xl text-xs font-ui leading-relaxed">{{ disclaimer }}</p>
      <p class="text-2xs font-mono">© {{ year }} {{ brand }}</p>
    </div>
  </footer>
</template>
