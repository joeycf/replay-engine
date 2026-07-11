<script setup lang="ts">
// Stats dashboard — design screen 3a, config-driven. Fully prerendered with
// real numbers (provided stats); animations are a client-side reveal layer.
// Duo analytics (pairings + synergy matrix) are GENERIC tag-game panels,
// gated on charactersPerSide > 1 — not any single game's mechanic. The
// GameStatsPanels slot is where a game injects its own panels (Phase 3).
const game = useGame();
const { totals, patches, usageFor, pairsRanked } = useStatsRows();
const { byId } = useCharacters();
const { featured } = useFeaturedPlayers();

useSiteMeta({
  title: `Stats — ${useBrandName()}`,
  description: `${game.name} character usage${game.charactersPerSide > 1 ? ', side pairings,' : ''} and meta over time — from ${totals.value.replays.toLocaleString('en-US')} competitive replays.`,
});

const patch = ref<string | null>(null);

const cname = (id: string) => byId(id)?.name ?? id;
const pill = (on: boolean) =>
  on
    ? 'border-primary bg-primary text-primary-contrast'
    : 'border-border bg-surface-raised text-text-secondary hover:text-text';

const showDuo = computed(() => game.charactersPerSide > 1 && pairsRanked.value.length > 0);

const topChar = computed(() => usageFor(null)[0]);
const topPair = computed(() => pairsRanked.value[0]);
const tiles = computed(() => [
  {
    label: 'Total replays',
    value: totals.value.replays.toLocaleString('en-US'),
    accent: 'var(--color-primary)',
  },
  ...(topChar.value
    ? [
        {
          label: 'Most-used character',
          value: cname(topChar.value.id),
          accent: accentVar(topChar.value.id, 'var(--color-primary)'),
        },
      ]
    : []),
  ...(showDuo.value && topPair.value
    ? [
        {
          label: 'Top pairing',
          value: `${cname(topPair.value.a)} + ${cname(topPair.value.b)}`,
          accent: accentVar(topPair.value.b, 'var(--color-secondary)'),
        },
      ]
    : []),
  {
    label: 'Featured players',
    value: featured.value.length.toLocaleString('en-US'),
    accent: 'var(--color-secondary)',
  },
]);

const usageRows = computed(() => usageFor(patch.value));
const patchName = computed(() => (patch.value === null ? 'All patches' : patch.value));
const contextCount = computed(() =>
  patch.value === null ? totals.value.replays : (totals.value.byPatch?.[patch.value] ?? 0),
);
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <!-- title + patch context -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 pb-1.5 pt-[22px] md:px-7">
      <h1 class="font-display text-[22px] font-bold text-text md:text-[26px]">Meta Stats</h1>
      <span class="font-mono text-[11px] text-text-muted">
        {{ patchName }} ·
        <span data-testid="context-count">{{ contextCount.toLocaleString('en-US') }}</span>
        replays
      </span>
      <div
        v-if="patches.length"
        data-testid="patch-chips"
        class="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 md:mx-0 md:ml-auto md:px-0"
      >
        <span
          class="mr-0.5 hidden font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted sm:block"
        >
          Patch
        </span>
        <button
          type="button"
          class="flex-none cursor-pointer rounded-full border px-3.5 py-2 font-ui text-[12px] font-semibold"
          :class="pill(patch === null)"
          @click="patch = null"
        >
          All
        </button>
        <button
          v-for="p in patches"
          :key="p"
          type="button"
          class="flex-none cursor-pointer rounded-full border px-[13px] py-2 font-mono text-[12px]"
          :class="pill(patch === p)"
          @click="patch = p"
        >
          {{ p }}
        </button>
      </div>
    </div>

    <!-- headline tiles -->
    <div class="grid grid-cols-2 gap-3 px-4 pb-1 pt-4 md:grid-cols-4 md:gap-3.5 md:px-7">
      <div
        v-for="t in tiles"
        :key="t.label"
        class="border border-border-subtle bg-surface p-4"
        :style="{ borderTop: `2px solid ${t.accent}` }"
      >
        <div class="font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          {{ t.label }}
        </div>
        <div class="mt-1 truncate font-display text-[22px] font-bold text-text md:text-[30px]">
          {{ t.value }}
        </div>
      </div>
    </div>

    <!-- Panel 1: character usage -->
    <div class="px-4 py-5 md:px-7">
      <StatPanel title="Character usage" :hint="`appearances · ${patchName}`">
        <CharacterUsageBars :items="usageRows" />
      </StatPanel>
    </div>

    <!-- Panel 2: duo analytics — generic tag-game panels, gated -->
    <div v-if="showDuo" class="grid grid-cols-1 gap-4 px-4 pb-5 md:grid-cols-2 md:px-7">
      <StatPanel title="Top side pairings" hint="same-side teams · all time">
        <PairingBars :limit="10" />
      </StatPanel>
      <StatPanel title="Synergy matrix" hint="click a cell → filter">
        <SynergyMatrix />
      </StatPanel>
    </div>

    <!-- Panel 3: meta over time -->
    <div v-if="patches.length > 1" class="grid grid-cols-1 gap-4 px-4 pb-5 md:grid-cols-2 md:px-7">
      <StatPanel
        title="Meta over time"
        :hint="`usage rank · ${patches[0]} → ${patches[patches.length - 1]}`"
      >
        <MetaTimeline :top-n="5" />
      </StatPanel>
    </div>

    <!-- GAME-PANEL EXTENSION SLOT: a game's own analytics (fuse panels etc.)
         land here by overriding GameStatsPanels at the same component path -->
    <div class="px-4 pb-6 md:px-7">
      <GameStatsPanels :patch="patch" />
    </div>
  </div>
</template>
