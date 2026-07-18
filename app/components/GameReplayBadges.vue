<template>
  <!-- engine default: nothing -->
  <span v-if="false" />
</template>

<script setup lang="ts">
// GAME-BADGE EXTENSION SLOT (v0.3.0) — the center/unbound badge strip. A game
// overrides this component at the same path (layer precedence, like
// GameStatsPanels) to attach match-level accent chips to cards and the modal
// when per-side attribution is NOT known — e.g. 2XKO's fusesUnordered pair.
// Rendered NAKED (no wrapper): the override owns its full row markup incl.
// margins, so games that don't use it cost zero pixels.
//
//   context 'card'  — between the matchup row and the players row on BrowseCard
//   context 'modal' — below the sides block in VideoModal
import type { Replay } from '@engine/types';

defineProps<{ replay: Replay; context: 'card' | 'modal' }>();
</script>
