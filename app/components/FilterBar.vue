<template>
  <div class="border-b border-border-subtle bg-bg px-4 py-4 md:px-[26px]">
    <!-- character facet + gated same-side + matchup picker -->
    <div
      :class="labelClass"
      class="mb-2.5"
    >
      {{ capWord(terms.character)
      }}{{ game.charactersPerSide > 1 ? ` · ${terms.side} includes` : '' }}
    </div>
    <div class="flex flex-wrap items-center gap-[7px]">
      <button
        v-for="c in characters"
        :key="c.id"
        type="button"
        :aria-label="c.name"
        :aria-pressed="f.isActive('characters', c.id)"
        class="flex h-9 w-9 flex-none cursor-pointer items-center justify-center border-2 p-0 font-display text-[12px] font-bold text-bg transition-[opacity,border-color] duration-fast cut-sm"
        :style="{
          background: accentGradient(c.id),
          borderColor: f.isActive('characters', c.id)
            ? accentVar(c.id, 'var(--color-text)')
            : 'var(--color-border)',
          opacity: f.isActive('characters', c.id) ? 1 : 0.46,
        }"
        @mouseenter="showTip($event, c)"
        @mouseleave="hideTip"
        @click="f.toggleCharacter(c.id)"
      >
        {{ characterInitials(c) }}
      </button>
      <button
        v-if="f.enabled.coOccurrence"
        type="button"
        class="h-9 cursor-pointer border px-3.5 font-ui text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
        :class="togClass(f.state.value.coOccurrence)"
        :disabled="!coUsable && !f.state.value.coOccurrence"
        :title="
          coUsable
            ? `Require selected ${terms.characters} on one ${terms.side}`
            : `Select 2 ${terms.characters} first`
        "
        :aria-pressed="f.state.value.coOccurrence"
        data-testid="co-occurrence-toggle"
        @click="f.toggleCoOccurrence()"
      >
        ◆ Same side
      </button>
      <div class="relative">
        <button
          type="button"
          class="h-9 cursor-pointer border px-3.5 font-ui text-[12px] font-semibold transition-colors"
          :class="togClass(!!f.state.value.matchup)"
          :aria-expanded="matchupOpen"
          data-testid="matchup-toggle"
          @click="matchupOpen = !matchupOpen"
        >
          ⚔ Matchup
        </button>
        <MatchupPicker
          v-if="matchupOpen"
          :filters="f"
          @close="matchupOpen = false"
        />
      </div>
    </div>

    <!-- source · patch · rank · date · sort -->
    <div class="mt-4 flex flex-wrap items-center gap-[18px]">
      <div
        v-if="game.sourceChannels.length"
        class="flex items-center gap-1.5"
      >
        <span
          :class="labelClass"
          class="mr-1"
          >{{ capWord(terms.source) }}</span
        >
        <template v-if="game.sourceGroups?.length">
          <button
            v-for="(g, i) in game.sourceGroups"
            :key="g.id"
            type="button"
            class="cursor-pointer border px-[13px] py-2 font-ui text-[12px] font-semibold cut-bl-md"
            :class="sourceGroupClass(g.sources, i)"
            :aria-pressed="f.isSourceGroupActive(g.sources)"
            @click="f.toggleSourceGroup(g.sources)"
          >
            {{ g.name }}
          </button>
        </template>
        <button
          v-for="(s, i) in game.sourceGroups?.length ? [] : game.sourceChannels"
          :key="s.id"
          type="button"
          class="cursor-pointer border px-[13px] py-2 font-ui text-[12px] font-semibold cut-bl-md"
          :class="sourceClass(s.id, i)"
          :aria-pressed="f.isActive('sources', s.id)"
          @click="f.toggleSource(s.id)"
        >
          {{ s.name }}
        </button>
      </div>
      <span
        v-if="game.sourceChannels.length"
        class="h-6 w-px bg-border"
      />
      <div
        v-if="f.options.value.patches.length"
        class="flex items-center gap-1.5"
      >
        <span
          :class="labelClass"
          class="mr-1"
          >{{ capWord(terms.patch) }}</span
        >
        <button
          v-for="p in f.options.value.patches"
          :key="p"
          type="button"
          class="h-[34px] cursor-pointer border px-3 font-mono text-[13px]"
          :class="togClass(f.isActive('patches', p))"
          :aria-pressed="f.isActive('patches', p)"
          @click="f.togglePatch(p)"
        >
          {{ p }}
        </button>
      </div>
      <div
        v-if="f.enabled.rank && f.rankOptions.value.length > 0"
        class="flex items-center gap-1.5"
      >
        <span
          :class="labelClass"
          class="mr-1"
          >Rank</span
        >
        <button
          v-for="r in f.rankOptions.value"
          :key="r"
          type="button"
          class="h-[34px] cursor-pointer border px-3 font-mono text-[12px]"
          :class="togClass(f.isActive('ranks', r))"
          :aria-pressed="f.isActive('ranks', r)"
          data-testid="rank-chip"
          @click="f.toggleRank(r)"
        >
          {{ r }}
        </button>
      </div>
      <div class="flex items-center gap-1.5">
        <span
          :class="labelClass"
          class="mr-1"
          >Date</span
        >
        <input
          type="date"
          :value="f.state.value.dateFrom ?? ''"
          aria-label="From date"
          class="h-[34px] cursor-pointer border border-border bg-surface-raised px-2 font-mono text-[12px] text-text [color-scheme:dark]"
          @change="
            f.setDateRange(($event.target as HTMLInputElement).value || null, f.state.value.dateTo)
          "
        />
        <span class="text-[11px] text-text-muted">→</span>
        <input
          type="date"
          :value="f.state.value.dateTo ?? ''"
          aria-label="To date"
          class="h-[34px] cursor-pointer border border-border bg-surface-raised px-2 font-mono text-[12px] text-text [color-scheme:dark]"
          @change="
            f.setDateRange(
              f.state.value.dateFrom,
              ($event.target as HTMLInputElement).value || null,
            )
          "
        />
      </div>
      <div class="ml-auto flex items-center gap-2">
        <label
          :class="labelClass"
          for="browse-sort"
          >Sort</label
        >
        <select
          id="browse-sort"
          :value="f.state.value.sort"
          class="cursor-pointer border border-border bg-surface-raised px-3 py-[9px] font-ui text-[12px] font-semibold text-text"
          @change="f.setSort(($event.target as HTMLSelectElement).value as ReplaySort)"
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="views">Most viewed</option>
          <option
            v-if="f.hasDurations.value"
            value="longest"
          >
            Longest
          </option>
        </select>
      </div>
    </div>

    <!-- game-defined facets (provideGameFacets, v0.3.0) — e.g. 2XKO's fuses -->
    <div
      v-for="facet in f.gameFacets"
      :key="facet.param"
      class="mt-4"
    >
      <div class="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span :class="labelClass">{{ facet.label }}</span>
        <span
          v-if="facet.note"
          :data-testid="`${facet.param}-facet-note`"
          class="font-mono text-[10px] text-text-muted"
          >{{ facet.note }}</span
        >
      </div>
      <div class="flex flex-wrap items-center gap-[7px]">
        <button
          v-for="chip in facet.chips"
          :key="chip.id"
          type="button"
          class="inline-flex h-9 cursor-pointer items-center gap-2 border px-[13px] font-ui text-[12px] font-semibold transition-colors cut-bl-md"
          :class="
            f.isFacetActive(facet.param, chip.id)
              ? ''
              : 'border-border bg-surface-raised text-text-secondary hover:text-text'
          "
          :style="f.isFacetActive(facet.param, chip.id) ? facetActiveStyle(chip.accent) : undefined"
          :aria-pressed="f.isFacetActive(facet.param, chip.id)"
          :data-testid="`${facet.param}-chip-${chip.id}`"
          @click="f.toggleFacetValue(facet.param, chip.id)"
        >
          <span
            v-if="chip.accent"
            class="h-2 w-2 flex-none rotate-45"
            :style="{ background: chip.accent }"
          />
          {{ chip.label }}
        </button>
      </div>
    </div>

    <!-- player facet -->
    <div class="mt-4">
      <div
        :class="labelClass"
        class="mb-2.5"
      >
        Player · featured
      </div>
      <div class="flex flex-wrap items-center gap-[7px]">
        <button
          v-for="p in featured"
          :key="p.id"
          type="button"
          class="inline-flex cursor-pointer items-center gap-1.5 border bg-surface-raised px-[11px] py-1.5 font-ui text-[12px] font-semibold text-text"
          :style="{
            borderColor: f.isActive('players', p.id)
              ? 'var(--color-primary)'
              : 'var(--color-border)',
          }"
          :aria-pressed="f.isActive('players', p.id)"
          @click="f.togglePlayer(p.id)"
        >
          <VerifiedMark
            v-if="p.featured"
            :size="10"
          />
          {{ p.handle }}
          <span class="font-mono text-[10px] text-text-muted">{{ p.appearances }}</span>
        </button>
        <div class="relative">
          <button
            type="button"
            class="cursor-pointer border border-dashed border-secondary/40 bg-transparent px-[11px] py-1.5 font-ui text-[12px] font-semibold text-secondary"
            :aria-expanded="typeaheadOpen"
            @click="typeaheadOpen = !typeaheadOpen"
          >
            Search all {{ ranked.length.toLocaleString() }} players ▾
          </button>
          <PlayerTypeahead
            v-if="typeaheadOpen"
            :filters="f"
            @close="typeaheadOpen = false"
          />
        </div>
      </div>
    </div>

    <HoverTip :tip="tip">
      <span
        v-if="tip"
        class="font-ui text-[12px] font-semibold"
        :style="{ color: accentVar(tip.data.id, 'var(--color-primary)') }"
        >{{ tip.data.name }}</span
      >
    </HoverTip>
  </div>
</template>

<script setup lang="ts">
// Desktop filter bar — port of design 1A rows, config-driven: character chips
// + same-side toggle (GATED: charactersPerSide > 1 && filters.coOccurrence) +
// matchup picker; source/patch/rank(GATED: filters.rank)/date/sort; player
// facet with featured chips + typeahead. Character chips show the full name
// in a HoverTip. Everything game-shaped comes from useGame()/registries.
import type { Character } from '@engine/types';
import type { ReplaySort } from '@engine/app/utils/filterReplays';

const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();
const f = props.filters;

const game = useGame();
const terms = useGameTerms();
const { list: characters } = useCharacters();
const { ranked, featured } = useFeaturedPlayers();
// clampX sized for a single character name, not the matrix's pairing line
const { tip, showTip, hideTip } = useHoverTip<Character>({ clampX: 70 });

const typeaheadOpen = ref(false);
const matchupOpen = ref(false);

const togClass = (on: boolean) =>
  on
    ? 'bg-primary text-primary-contrast border-primary'
    : 'bg-surface-raised text-text-secondary border-border hover:text-text';

const labelClass = 'font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted';

const coUsable = computed(() => f.state.value.characters.length >= 2);
const sourceClass = (id: string, i: number) =>
  f.isActive('sources', id)
    ? i === 0
      ? 'bg-primary text-primary-contrast border-primary'
      : 'bg-secondary/15 text-secondary border-secondary'
    : 'bg-surface-raised text-text-secondary border-border hover:text-text';
// same index-based active styling as sourceClass, keyed on the group's id set
const sourceGroupClass = (ids: string[], i: number) =>
  f.isSourceGroupActive(ids)
    ? i === 0
      ? 'bg-primary text-primary-contrast border-primary'
      : 'bg-secondary/15 text-secondary border-secondary'
    : 'bg-surface-raised text-text-secondary border-border hover:text-text';

// game-facet chips: accent-tinted when active (the ported fuse-chip anatomy —
// accent border + 15%-alpha accent fill); inactive styling is class-based
const facetActiveStyle = (accent?: string) => ({
  borderColor: accent ?? 'var(--color-text)',
  background: accent ? `${accent}26` : 'var(--color-surface-raised)',
  color: 'var(--color-text)',
});
</script>
