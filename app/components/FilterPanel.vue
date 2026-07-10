<script setup lang="ts">
import type { FilterController } from '../composables/useFilters';
import type { ListFacet } from '../utils/filterReplays';

/**
 * Renders the always-available facets (character, source, player, patch) plus
 * the gated facets — co-occurrence and rank — which appear ONLY when the game
 * enables them (`controller.enabled`). All state changes flow through the
 * controller, which keeps them in the URL. Labels resolve through the passed
 * maps; nothing game-specific is hard-coded.
 */
const props = defineProps<{
  filters: FilterController;
  charName?: Record<string, string>;
  playerHandle?: Record<string, string>;
}>();

const { state, options, enabled, activeCount } = props.filters;

const game = useGame();
const sourceName = computed<Record<string, string>>(() =>
  Object.fromEntries(game.sourceChannels.map((c) => [c.id, c.name])),
);

const label = (facet: ListFacet, value: string) => {
  if (facet === 'characters') return props.charName?.[value] ?? value;
  if (facet === 'players') return props.playerHandle?.[value] ?? value;
  if (facet === 'sources') return sourceName.value[value] ?? value;
  return value;
};

// Always-available list facets, in display order.
const baseGroups: { key: ListFacet; label: string }[] = [
  { key: 'characters', label: 'Characters' },
  { key: 'sources', label: 'Source' },
  { key: 'players', label: 'Players' },
  { key: 'patches', label: 'Patch' },
];
</script>

<template>
  <div class="corner-cut space-y-5 border border-border bg-surface p-4">
    <div class="flex items-center justify-between">
      <h2 class="font-display text-sm font-bold uppercase tracking-wider text-text">
        Filters
      </h2>
      <button
        v-if="activeCount > 0"
        type="button"
        class="text-2xs font-mono text-text-muted underline-offset-2 hover:text-text hover:underline"
        @click="props.filters.clear()"
      >
        Clear ({{ activeCount }})
      </button>
    </div>

    <!-- Co-occurrence: gated on GameConfig.filters.coOccurrence (tag fighters) -->
    <div v-if="enabled.coOccurrence" class="space-y-1.5">
      <p class="text-2xs font-semibold uppercase tracking-widest text-text-muted">
        Same side
      </p>
      <button
        type="button"
        role="switch"
        :aria-checked="state.coOccurrence"
        class="corner-cut-sm flex w-full items-center justify-between gap-2 border px-3 py-2 text-xs transition-colors duration-fast ease-standard"
        :class="
          state.coOccurrence
            ? 'border-primary bg-primary text-primary-contrast'
            : 'border-border-subtle bg-bg/40 text-text-muted hover:text-text'
        "
        @click="props.filters.setCoOccurrence(!state.coOccurrence)"
      >
        <span>Both characters on one side</span>
        <span class="font-mono">{{ state.coOccurrence ? 'ON' : 'OFF' }}</span>
      </button>
    </div>

    <!-- Always-available list facets -->
    <div v-for="group in baseGroups" :key="group.key" class="space-y-1.5">
      <p class="text-2xs font-semibold uppercase tracking-widest text-text-muted">
        {{ group.label }}
      </p>
      <p v-if="!options[group.key].length" class="text-2xs text-text-muted/70">—</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <button
          v-for="value in options[group.key]"
          :key="value"
          type="button"
          :aria-pressed="props.filters.isActive(group.key, value)"
          class="rounded-sm border px-2 py-1 text-2xs transition-colors duration-fast ease-standard"
          :class="
            props.filters.isActive(group.key, value)
              ? 'border-primary bg-primary text-primary-contrast'
              : 'border-border-subtle bg-bg/40 text-text-muted hover:border-border hover:text-text'
          "
          @click="props.filters.toggle(group.key, value)"
        >
          {{ label(group.key, value) }}
        </button>
      </div>
    </div>

    <!-- Date range: always available -->
    <div class="space-y-1.5">
      <p class="text-2xs font-semibold uppercase tracking-widest text-text-muted">Date</p>
      <div class="flex items-center gap-1.5">
        <input
          type="date"
          :value="state.dateFrom ?? ''"
          aria-label="From date"
          class="corner-cut-sm w-full min-w-0 border border-border-subtle bg-bg/40 px-2 py-1 font-mono text-2xs text-text [color-scheme:dark]"
          @change="
            props.filters.setDateRange(
              ($event.target as HTMLInputElement).value || null,
              state.dateTo,
            )
          "
        />
        <span class="text-2xs text-text-muted">→</span>
        <input
          type="date"
          :value="state.dateTo ?? ''"
          aria-label="To date"
          class="corner-cut-sm w-full min-w-0 border border-border-subtle bg-bg/40 px-2 py-1 font-mono text-2xs text-text [color-scheme:dark]"
          @change="
            props.filters.setDateRange(
              state.dateFrom,
              ($event.target as HTMLInputElement).value || null,
            )
          "
        />
      </div>
    </div>

    <!-- Rank: gated on GameConfig.filters.rank (games with a ladder) -->
    <div v-if="enabled.rank" class="space-y-1.5">
      <p class="text-2xs font-semibold uppercase tracking-widest text-text-muted">Rank</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="value in options.ranks"
          :key="value"
          type="button"
          :aria-pressed="props.filters.isActive('ranks', value)"
          class="rounded-sm border px-2 py-1 text-2xs transition-colors duration-fast ease-standard"
          :class="
            props.filters.isActive('ranks', value)
              ? 'border-primary bg-primary text-primary-contrast'
              : 'border-border-subtle bg-bg/40 text-text-muted hover:border-border hover:text-text'
          "
          @click="props.filters.toggle('ranks', value)"
        >
          {{ value }}
        </button>
      </div>
    </div>
  </div>
</template>
