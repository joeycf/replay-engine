<template>
  <!-- engine default: nothing -->
  <span v-if="false" />
</template>

<script setup lang="ts">
// GAME-BADGE EXTENSION SLOT (v0.3.0) — the per-side badge. A game overrides
// this at the same path to attach a small accent chip to ONE side when
// attribution is known — e.g. 2XKO's ordered fuse detections. Rendered NAKED
// inside the modal's side blocks (under the player line); `compact` marks the
// mobile variant. Games render nothing when attribution is unknown (pair
// belongs in GameReplayBadges instead — never pin an unattributed badge).
import type { Replay } from '@engine/types';

defineProps<{
  replay: Replay;
  /** sides index — 0 = left/first, 1 = right/second */
  side: 0 | 1;
  context: 'card' | 'modal';
  /** small variant (mobile stacked layout) */
  compact?: boolean;
}>();
</script>
