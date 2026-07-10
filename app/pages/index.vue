<script setup lang="ts">
/**
 * Browse: the replay grid + filter panel. Wires useReplays (client-fetched) +
 * the small registries into useFilters, whose filtered output feeds BrowseGrid.
 * Everything here is generic — the same page renders 1v1 and 2-per-side games.
 */
const game = useGame();

const { data: replays, pending } = useReplays();
const { data: characters } = useCharacters();
const { data: players } = usePlayers();

const filters = useFilters(replays);
const filtered = filters.filtered;

const charName = computed(() =>
  Object.fromEntries((characters.value ?? []).map((c) => [c.id, c.name])),
);
const playerHandle = computed(() =>
  Object.fromEntries((players.value ?? []).map((p) => [p.id, p.handle])),
);

useHead({ title: () => `Browse · ${game.name}` });
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[16rem_1fr]">
    <aside class="lg:sticky lg:top-20 lg:self-start">
      <FilterPanel :filters="filters" :char-name="charName" :player-handle="playerHandle" />
    </aside>

    <section>
      <div class="mb-4 flex items-baseline justify-between gap-4">
        <h1 class="font-display text-2xl font-bold text-text">Browse</h1>
        <p class="font-mono text-sm text-text-muted">
          {{ filtered.length }} / {{ replays?.length ?? 0 }}
        </p>
      </div>

      <!-- All collections are client-fetched (server:false), so the results are
           client-only. ClientOnly keeps this subtree out of hydration matching,
           avoiding a pending-state mismatch (SSR has no data; the client does). -->
      <ClientOnly>
        <p v-if="pending" class="text-sm text-text-muted">Loading replays…</p>
        <BrowseGrid
          v-else
          :replays="filtered"
          :char-name="charName"
          :player-handle="playerHandle"
        />
        <template #fallback>
          <p class="text-sm text-text-muted">Loading replays…</p>
        </template>
      </ClientOnly>
    </section>
  </div>
</template>
