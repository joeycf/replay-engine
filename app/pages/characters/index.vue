<script setup lang="ts">
/** Roster grid. Full per-character detail UI lands in Phase 2. */
const game = useGame();
const { data: characters } = useCharacters();

useHead({ title: () => `Characters · ${game.name}` });
</script>

<template>
  <div class="space-y-6">
    <h1 class="font-display text-2xl font-bold text-text">Characters</h1>
    <div
      v-if="characters?.length"
      class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6"
    >
      <CharacterCard v-for="c in characters" :key="c.id" :character="c" />
    </div>
    <p v-else class="text-sm text-text-muted">No characters.</p>
  </div>
</template>
