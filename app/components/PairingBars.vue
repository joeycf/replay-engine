<template>
  <!-- boxed: player-page signature pairings -->
  <div
    v-if="boxed"
    ref="root"
    data-testid="pairing-bars"
    class="flex flex-col gap-[11px]"
  >
    <NuxtLink
      v-for="p in rows"
      :key="p.key"
      :to="pairTo(p)"
      :data-pair="p.key"
      class="flex w-full cursor-pointer items-center gap-2.5 border border-border-subtle bg-surface-sunken px-[11px] py-[9px] text-left transition-colors hover:border-primary/40"
    >
      <div class="flex">
        <CharacterBadge
          :character-id="p.a"
          :size="28"
          :notch="6"
          :font-size="10"
        />
        <CharacterBadge
          :character-id="p.b"
          :size="28"
          :notch="6"
          :font-size="10"
          class="-ml-1.5"
        />
      </div>
      <span class="font-ui text-[13px] font-semibold text-text"
        >{{ name(p.a) }} + {{ name(p.b) }}</span
      >
      <span class="ml-auto font-mono text-[11px] text-text-secondary">
        <span
          class="count-up"
          :data-value="p.value"
          >{{ p.value.toLocaleString('en-US') }}</span
        >×
      </span>
    </NuxtLink>
  </div>

  <!-- soloFor: character-page top teammates -->
  <div
    v-else-if="soloFor"
    ref="root"
    data-testid="pairing-bars"
    class="flex flex-col gap-3"
  >
    <NuxtLink
      v-for="p in rows"
      :key="p.key"
      :to="pairTo(p)"
      :data-pair="p.key"
      class="block w-full cursor-pointer text-left"
    >
      <div class="mb-[5px] flex items-center gap-2">
        <CharacterBadge
          :character-id="mateOf(p)"
          :size="24"
          :notch="6"
          :font-size="10"
        />
        <span class="font-ui text-[13px] font-semibold text-text">{{ name(mateOf(p)) }}</span>
        <span
          class="count-up ml-auto font-mono text-[11px] text-text-secondary"
          :data-value="p.value"
          >{{ p.value.toLocaleString('en-US') }}</span
        >
      </div>
      <div class="h-[7px] overflow-hidden bg-surface-sunken">
        <div
          class="bar-fill h-full origin-left"
          :data-pct="p.pct"
          :style="{
            width: `${p.pct}%`,
            background: accentBarGradient(soloFor, mateOf(p)),
          }"
        />
      </div>
    </NuxtLink>
  </div>

  <!-- default: stats dashboard ranked bars -->
  <div
    v-else
    ref="root"
    data-testid="pairing-bars"
    class="flex flex-col gap-[11px] md:gap-3"
  >
    <NuxtLink
      v-for="p in rows"
      :key="p.key"
      :to="pairTo(p)"
      :data-pair="p.key"
      class="block w-full cursor-pointer text-left"
    >
      <div class="mb-[5px] flex items-center gap-2 md:gap-[9px]">
        <div class="flex">
          <CharacterBadge
            :character-id="p.a"
            :size="24"
            :notch="6"
            :font-size="10"
          />
          <CharacterBadge
            :character-id="p.b"
            :size="24"
            :notch="6"
            :font-size="10"
            class="-ml-1.5"
          />
        </div>
        <span class="font-ui text-[12px] font-semibold text-text md:text-[13px]">
          {{ name(p.a) }} + {{ name(p.b) }}
        </span>
        <span
          class="count-up ml-auto font-mono text-[11px] text-text-secondary md:text-[12px]"
          :data-value="p.value"
          >{{ p.value.toLocaleString('en-US') }}</span
        >
      </div>
      <div class="h-[7px] overflow-hidden bg-surface-sunken md:h-2">
        <div
          class="bar-fill h-full origin-left"
          :data-pct="p.pct"
          :style="{
            width: `${p.pct}%`,
            background: accentBarGradient(p.a, p.b),
          }"
        />
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
// Same-side pairing rows — GENERIC duo analytics (only rendered by pages when
// charactersPerSide > 1; the data itself only exists for tag games). Three
// faces, all deep-linking with the useFilters schema (/?c=<a>,<b>&side=1,
// plus &p=<withPlayer> when provided):
//  default — Stats dashboard ranked bars (two badges, dual-accent bar)
//  soloFor — Character page "Top teammates": only the mate is shown, bar runs
//            from the page character's accent to the mate's
//  boxed   — Player page "Signature pairings": boxed rows, N× counts, no bar
import type { PairRow } from '@engine/app/composables/useStatsRows';

const props = withDefaults(
  defineProps<{
    items?: PairRow[];
    limit?: number;
    /** character id whose page this renders on — mate-only display */
    soloFor?: string;
    /** player-page boxed style */
    boxed?: boolean;
    /** append p=<id> to the deep-link (player-page pairings) */
    withPlayer?: string;
  }>(),
  {
    items: undefined,
    limit: 10,
    soloFor: undefined,
    boxed: false,
    withPlayer: undefined,
  },
);

const { pairsRanked } = useStatsRows();
const { byId } = useCharacters();

const name = (id: string) => byId(id)?.name ?? id;
const mateOf = (p: PairRow) => (p.a === props.soloFor ? p.b : p.a);

// real <a href> deep-links (NuxtLink), not JS-only click handlers — crawlers
// follow these into the filtered Browse views
const pairTo = (p: PairRow) => {
  const query: Record<string, string> = {
    c: `${p.a},${p.b}`,
    side: '1',
  };
  if (props.withPlayer) query.p = props.withPlayer;
  return {
    path: '/',
    query,
  };
};

const rows = computed(() => (props.items ?? pairsRanked.value).slice(0, props.limit));

const root = ref<HTMLElement | null>(null);
useReveal(root, {
  prepare: prepareBars,
  reveal: animateBarsIn,
});
</script>
