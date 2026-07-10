<script setup lang="ts">
/**
 * /health — the wiring check every consuming app reuses. Renders the counts of
 * each fetched collection and echoes the ACTIVE GameConfig, so a game can
 * confirm at a glance that its data files, base path, and config overrides all
 * resolved through the engine (PLAN.md §5, Phase-1 spec §9).
 */
const game = useGame();

const { data: replays } = useReplays();
const { data: characters } = useCharacters();
const { data: players } = usePlayers();
const { data: stats } = useStats();

const counts = computed(() => [
  {
    label: 'replays.json',
    value: replays.value?.length ?? 0,
    note: 'client-fetched (server:false)',
  },
  { label: 'characters.json', value: characters.value?.length ?? 0 },
  { label: 'players.json', value: players.value?.length ?? 0 },
  { label: 'stats.totals.replays', value: stats.value?.totals?.replays ?? 0 },
]);

const configRows = computed(() => [
  { key: 'name', value: game.name },
  { key: 'id', value: game.id },
  { key: 'slug', value: game.slug === '' ? "'' (neutral default)" : game.slug },
  { key: 'shortName', value: game.shortName || "'' (umbrella wordmark)" },
  { key: 'baseURL', value: game.baseURL },
  { key: 'siteUrl', value: game.siteUrl },
  { key: 'charactersPerSide', value: String(game.charactersPerSide) },
  { key: 'filters.coOccurrence', value: String(game.filters.coOccurrence) },
  { key: 'filters.rank', value: String(game.filters.rank) },
  { key: 'accents', value: `${Object.keys(game.accents).length} defined` },
  { key: 'sourceChannels', value: `${game.sourceChannels.length} defined` },
  { key: 'ranks', value: game.ranks?.length ? game.ranks.join(', ') : '—' },
]);

useHead({ title: () => `Health · ${game.name}` });
</script>

<template>
  <div class="space-y-8">
    <div>
      <h1 class="font-display text-2xl font-bold text-text">Health</h1>
      <p class="mt-1 text-sm text-text-muted">
        Engine wiring check — fetched collection counts and the active
        <code class="font-mono text-primary">GameConfig</code>.
      </p>
    </div>

    <section>
      <h2 class="mb-3 text-2xs font-semibold uppercase tracking-widest text-text-muted">
        Collections
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="c in counts"
          :key="c.label"
          class="corner-cut border border-border bg-surface p-4 shadow-sm"
        >
          <p class="font-display text-3xl font-black text-text">{{ c.value }}</p>
          <p class="mt-1 truncate font-mono text-2xs text-text-muted">{{ c.label }}</p>
          <p v-if="c.note" class="mt-0.5 text-2xs text-text-muted/70">{{ c.note }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 text-2xs font-semibold uppercase tracking-widest text-text-muted">
        Active GameConfig
      </h2>
      <dl class="corner-cut divide-y divide-border-subtle border border-border bg-surface text-sm">
        <div
          v-for="row in configRows"
          :key="row.key"
          class="flex items-center justify-between gap-4 px-4 py-2"
        >
          <dt class="font-mono text-2xs text-text-muted">{{ row.key }}</dt>
          <dd class="text-right font-ui text-text">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
