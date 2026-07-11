<script setup lang="ts">
// GAME-PANEL EXTENSION SLOT (character detail page) — same override-by-path
// mechanism as GameStatsPanels: the engine copy renders nothing; a game ships
// app/components/GameCharacterPanels.vue to add per-character game panels
// (e.g. 2XKO fuse usage for this character, Phase 3). Receives the page's
// character id.
defineProps<{
  characterId: string;
}>();
</script>

<template>
  <!-- engine default: no game panels -->
  <span v-if="false" />
</template>
