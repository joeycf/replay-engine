<script setup lang="ts">
// FIXTURE game panel — proves the engine's game-panel extension slot: this
// component OVERRIDES the engine's empty GameStatsPanels at the same path
// (Nuxt layer precedence), exactly how a real game injects its own analytics
// (2XKO's fuse panels in Phase 3). Receives the dashboard's patch context.
const props = defineProps<{ patch?: string | null }>();

const label = computed(() => (props.patch === null || !props.patch ? 'all patches' : props.patch));
</script>

<template>
  <StatPanel title="Fixture game panel" :hint="`extension slot · ${label}`">
    <p data-testid="fixture-game-panel" class="font-ui text-[13px] text-text-secondary">
      Injected by the <b class="text-text">fixtures app</b> through the
      <code class="font-mono text-primary">GameStatsPanels</code> override — the same
      layer-precedence mechanism a real game uses for its own stat systems.
    </p>
  </StatPanel>
</template>
