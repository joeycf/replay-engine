<template>
  <!-- engine default: no game panels -->
  <span v-if="false" />
</template>

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
// POSITIONED ANCHORS (v0.4.0): the page invokes this component at THREE
// spots, passing `position` — overrides MUST branch on it or their content
// renders at every anchor:
//   'after-usage'      full-width row below the usage panel (naked — the
//                      override owns its container; 2XKO: Fuse usage)
//   'beside-timeline'  the Meta-over-time grid's second cell (naked; only
//                      when the timeline row renders; 2XKO: Fuse meta by era)
//   'bottom'           the original slot (engine-wrapped px-4 pb-6 container)
defineProps<{
  /** the dashboard's active patch selection (null = all-time) */
  patch?: string | null;
  /** which page anchor is invoking this render — branch on it */
  position?: 'after-usage' | 'beside-timeline' | 'bottom';
}>();
</script>
