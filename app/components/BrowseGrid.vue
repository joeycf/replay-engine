<script setup lang="ts">
import type { Replay } from '@engine/types';

/** Responsive grid of ReplayCards, with a themed empty state. */
defineProps<{
  replays: Replay[];
  charName?: Record<string, string>;
  playerHandle?: Record<string, string>;
}>();
</script>

<template>
  <div v-if="replays.length" class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <ReplayCard
      v-for="replay in replays"
      :key="replay.id"
      :replay="replay"
      :char-name="charName"
      :player-handle="playerHandle"
    />
  </div>
  <div
    v-else
    class="corner-cut border border-dashed border-border bg-surface/40 px-6 py-16 text-center text-text-muted"
  >
    <p class="font-ui text-sm">No replays match these filters.</p>
  </div>
</template>
