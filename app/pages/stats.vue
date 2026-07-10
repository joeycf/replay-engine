<script setup lang="ts">
/** Stats overview. Renders the guaranteed `totals` plus an optional character
 *  usage table read generically off the loosely-typed Stats bag. Charts (viz)
 *  are Phase 2. */
const game = useGame();
const { data: stats } = useStats();
const { data: characters } = useCharacters();

const charName = computed(() =>
  Object.fromEntries((characters.value ?? []).map((c) => [c.id, c.name])),
);

const totals = computed(() => Object.entries(stats.value?.totals ?? {}) as [string, number][]);

// Optional, game-declared usage table — engine renders it generically.
const usage = computed(
  () => (stats.value?.characterUsage as { id: string; count: number }[] | undefined) ?? [],
);
const maxUsage = computed(() => Math.max(1, ...usage.value.map((u) => u.count)));

useHead({ title: () => `Stats · ${game.name}` });
</script>

<template>
  <div class="space-y-8">
    <h1 class="font-display text-2xl font-bold text-text">Stats</h1>

    <section>
      <h2 class="mb-3 text-2xs font-semibold uppercase tracking-widest text-text-muted">Totals</h2>
      <div class="grid grid-cols-3 gap-3">
        <div
          v-for="[key, value] in totals"
          :key="key"
          class="corner-cut border border-border bg-surface p-4 shadow-sm"
        >
          <p class="font-display text-3xl font-black text-text">{{ value }}</p>
          <p class="mt-1 font-mono text-2xs text-text-muted">{{ key }}</p>
        </div>
      </div>
    </section>

    <section v-if="usage.length">
      <h2 class="mb-3 text-2xs font-semibold uppercase tracking-widest text-text-muted">
        Character usage
      </h2>
      <ul class="space-y-2">
        <li v-for="u in usage" :key="u.id" class="flex items-center gap-3">
          <span class="w-24 shrink-0 truncate text-sm text-text">{{ charName[u.id] ?? u.id }}</span>
          <span class="h-2 flex-1 overflow-hidden rounded-full bg-surface-raised">
            <span
              class="block h-full rounded-full bg-primary"
              :style="{ width: `${(u.count / maxUsage) * 100}%` }"
            />
          </span>
          <span class="w-8 shrink-0 text-right font-mono text-2xs text-text-muted">{{
            u.count
          }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>
