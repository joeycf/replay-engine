<script setup lang="ts">
// GAME-PANEL EXTENSION SLOT (stats page) — the engine's mechanism for a game
// to inject its own analytics panels (PLAN §11 "game-specific stat systems").
//
// This engine copy renders NOTHING. A game app overrides it by shipping a
// component at the SAME PATH (app/components/GameStatsPanels.vue) — Nuxt layer
// precedence resolves the app's copy over the engine's, the same mechanism as
// per-game component flourishes (PLAN §4b). The stats page passes the active
// patch selection so game panels can follow the dashboard's context.
//
// 2XKO's fuse panels (FuseUsageBars, FuseEraShift) become the first real
// consumers in Phase 3; the fixtures app proves the mechanism with a dummy
// panel.
defineProps<{
  /** the dashboard's active patch selection (null = all-time) */
  patch?: string | null;
}>();
</script>

<template>
  <!-- engine default: no game panels -->
  <span v-if="false" />
</template>
