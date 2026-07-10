<script setup lang="ts">
/** Players directory. Full detail UI lands in Phase 2. */
const game = useGame();
const { data: players } = usePlayers();

const sorted = computed(() =>
  [...(players.value ?? [])].sort(
    (a, b) => Number(!!b.featured) - Number(!!a.featured) || a.handle.localeCompare(b.handle),
  ),
);

useHead({ title: () => `Players · ${game.name}` });
</script>

<template>
  <div class="space-y-6">
    <h1 class="font-display text-2xl font-bold text-text">Players</h1>
    <ul v-if="sorted.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <li v-for="p in sorted" :key="p.id">
        <NuxtLink
          :to="`/players/${p.id}`"
          class="corner-cut-sm flex items-center justify-between gap-2 border border-border bg-surface px-3 py-2 transition-colors duration-fast ease-standard hover:border-primary/50 hover:bg-surface-raised"
        >
          <span class="truncate font-ui text-sm text-text">{{ p.handle }}</span>
          <span
            v-if="p.featured"
            class="rounded-xs bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-contrast"
            >Featured</span
          >
        </NuxtLink>
      </li>
    </ul>
    <p v-else class="text-sm text-text-muted">No players.</p>
  </div>
</template>
