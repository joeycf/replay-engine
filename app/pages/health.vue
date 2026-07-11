<script setup lang="ts">
/**
 * /health — the wiring check every consuming app reuses. Renders each
 * collection's count AND its provisioning path (provided/bundled vs
 * client-fetched), plus the active GameConfig, so a game can confirm at a
 * glance that its registries, base path, and config overrides all resolved
 * through the engine.
 */
const game = useGame();

const { replays, pending: replaysPending } = useReplays();
const characters = useCharacters();
const players = usePlayers();
const stats = useStats();

const srcLabel = (provided: boolean) => (provided ? 'provided (bundled)' : 'client-fetched');

const counts = computed(() => [
  {
    label: 'replays.json',
    value: replays.value.length,
    note: replaysPending.value ? 'fetching…' : 'client-fetched (server:false)',
  },
  {
    label: 'characters',
    value: characters.list.value.length,
    note: srcLabel(characters.provided),
  },
  { label: 'players', value: players.list.value.length, note: srcLabel(players.provided) },
  {
    label: 'stats.totals.replays',
    value: stats.stats.value?.totals?.replays ?? 0,
    note: srcLabel(stats.provided),
  },
]);

const configRows = computed(() => [
  { key: 'name', value: game.name },
  { key: 'id', value: game.id },
  { key: 'slug', value: game.slug === '' ? "'' (umbrella default)" : game.slug },
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

const brand = useBrandName();
useHead({ title: `Health · ${brand}` });
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-8 px-4 py-8">
    <div>
      <h1 class="font-display text-2xl font-bold text-text">Health</h1>
      <p class="mt-1 text-sm text-text-muted">
        Engine wiring check — collection counts, provisioning paths, and the active
        <code class="font-mono text-primary">GameConfig</code>.
      </p>
    </div>

    <section>
      <h2 class="mb-3 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
        Collections
      </h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="c in counts"
          :key="c.label"
          class="border border-border bg-surface p-4 shadow-sm cut-md"
        >
          <p class="font-display text-3xl font-black text-text">{{ c.value }}</p>
          <p class="mt-1 truncate font-mono text-[11px] text-text-muted">{{ c.label }}</p>
          <p v-if="c.note" class="mt-0.5 text-[11px] text-text-faint">{{ c.note }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
        Active GameConfig
      </h2>
      <dl class="divide-y divide-border-subtle border border-border bg-surface text-sm cut-md">
        <div
          v-for="row in configRows"
          :key="row.key"
          class="flex items-center justify-between gap-4 px-4 py-2"
        >
          <dt class="font-mono text-[11px] text-text-muted">{{ row.key }}</dt>
          <dd class="text-right font-ui text-text">{{ row.value }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
