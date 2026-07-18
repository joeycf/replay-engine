<template>
  <!-- compact: stacked rows per the design's Player template -->
  <div
    v-if="compact"
    ref="root"
    data-testid="usage-bars"
    class="flex flex-col gap-3"
  >
    <component
      :is="rowTag"
      v-for="row in shown"
      :key="row.id"
      :to="linkPlayerId ? { path: '/', query: { p: linkPlayerId, c: row.id } } : undefined"
      class="block"
      :class="linkPlayerId ? 'cursor-pointer' : ''"
    >
      <div class="mb-[5px] flex items-center gap-2">
        <CharacterBadge
          :character-id="row.id"
          :size="26"
          :notch="6"
          :font-size="10"
        />
        <span class="font-ui text-[13px] font-semibold text-text">{{ name(row.id) }}</span>
        <span class="ml-auto font-mono text-[11px] text-text-secondary">
          <span
            class="count-up"
            :data-value="row.value"
            >{{ row.value.toLocaleString('en-US') }}</span
          >×
        </span>
      </div>
      <div class="h-2 overflow-hidden bg-surface-sunken">
        <div
          class="bar-fill h-full origin-left"
          :data-pct="row.pct"
          :style="{
            width: `${row.pct}%`,
            background: accentBarGradient(row.id),
          }"
        />
      </div>
    </component>
  </div>

  <!-- full: ranked dashboard rows -->
  <div
    v-else
    ref="root"
    data-testid="usage-bars"
    class="flex flex-col gap-2 md:gap-[9px]"
  >
    <div
      v-for="row in shown"
      :key="row.id"
      class="flex items-center gap-2.5 md:gap-3"
    >
      <span
        class="hidden w-5 flex-none text-right font-mono text-[11px] text-text-muted sm:block"
        >{{ row.rank }}</span
      >
      <CharacterBadge
        :character-id="row.id"
        :size="28"
        :notch="7"
        :font-size="11"
      />
      <span
        class="w-[70px] flex-none font-ui text-[12px] font-semibold text-text md:w-[88px] md:text-[13px]"
        >{{ name(row.id) }}</span
      >
      <div class="h-4 flex-1 overflow-hidden bg-surface-sunken md:h-5">
        <div
          class="bar-fill h-full origin-left transition-[width] duration-slow ease-snap"
          :data-pct="row.pct"
          :style="{
            width: `${row.pct}%`,
            background: accentBarGradient(row.id),
          }"
        />
      </div>
      <span
        class="count-up w-[42px] flex-none text-right font-mono text-[11px] text-text md:w-[52px] md:text-[13px]"
        :data-value="row.value"
        >{{ row.value.toLocaleString('en-US') }}</span
      >
    </div>
  </div>
</template>

<script setup lang="ts">
// Horizontal character usage bars (generalizes ChampionUsageBars).
// full    — the Stats dashboard's ranked rows (design Panel 1).
// compact — the Player page's "Most-used characters": stacked rows
//           (badge + name + N× header, thin bar below), optionally
//           deep-linking each row to /?p=<player>&c=<character>.
// Accent fills via accentBarGradient() → --accent-<id> vars only.
import type { UsageRow } from '@engine/app/composables/useStatsRows';

const props = withDefaults(
  defineProps<{
    items: UsageRow[];
    limit?: number;
    compact?: boolean;
    /** when set (compact rows), rows link to /?p=<linkPlayerId>&c=<characterId> */
    linkPlayerId?: string;
  }>(),
  {
    limit: 0,
    compact: false,
    linkPlayerId: undefined,
  },
);

const { byId } = useCharacters();

const root = ref<HTMLElement | null>(null);

// resolveComponent must run in setup scope — in a template expression it
// returns the bare name string and SSR emits a literal <NuxtLink> element
const NuxtLinkComp = resolveComponent('NuxtLink');

const name = (id: string) => byId(id)?.name ?? id;

const shown = computed(() => (props.limit > 0 ? props.items.slice(0, props.limit) : props.items));
const rowTag = computed(() => (props.linkPlayerId ? NuxtLinkComp : 'div'));

const { revealed } = useReveal(root, {
  prepare: prepareBars,
  reveal: (el, anime) => {
    animateBarsIn(el, anime);
    for (const fill of el.querySelectorAll<HTMLElement>('.bar-fill')) {
      setTimeout(() => (fill.style.transition = ''), 1500); // hand back to the CSS transition
    }
  },
});

// patch switch (full mode): bars transition via CSS; labels re-count
watch(
  () => props.items,
  async () => {
    if (!revealed.value || prefersReducedMotion()) return;
    await nextTick();
    if (root.value) animateCountUps(root.value, await import('animejs'));
  },
);
</script>
