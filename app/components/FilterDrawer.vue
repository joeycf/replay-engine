<script setup lang="ts">
// Mobile bottom-sheet filter drawer (design 1A / 2a). Filters apply live;
// "Show N replays" confirms & closes, Reset clears everything. Facets mirror
// FilterBar with the same config gating; character-name HoverTip only fires
// on hover-capable pointers (narrow desktop windows) — on touch a tap stays a
// pure toggle.
import type { Character } from '@engine/types';

const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();
const f = props.filters;

const open = useState('filter-drawer-open', () => false);

const game = useGame();
const terms = useGameTerms();
const { list: characters } = useCharacters();
const { ranked, featured } = useFeaturedPlayers();
const { pending } = useReplays();
const { tip, showTip, hideTip } = useHoverTip<Character>({ clampX: 70 });

const showAllPlayers = ref(false);
const playerQuery = ref('');

const playerAliases = (extra?: Record<string, unknown>): string[] => {
  const aliases = extra?.aliases;
  return Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string') : [];
};

const togClass = (on: boolean) =>
  on
    ? 'bg-primary text-primary-contrast border-primary'
    : 'bg-surface-raised text-text-secondary border-border';

// game-facet chips: accent-tinted when active (mirrors FilterBar)
const facetActiveStyle = (accent?: string) => ({
  borderColor: accent ?? 'var(--color-text)',
  background: accent ? `${accent}26` : 'var(--color-surface-raised)',
  color: 'var(--color-text)',
});

function close() {
  open.value = false;
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

const labelClass = 'font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted';

const playerResults = computed(() => {
  const n = normalizeText(playerQuery.value.trim());
  if (!n) return [];
  return ranked.value
    .filter(
      (p) =>
        normalizeText(p.handle).includes(n) ||
        playerAliases(p.extra).some((a) => normalizeText(a).includes(n)),
    )
    .slice(0, 20);
});

watch(open, (v) => {
  if (import.meta.server) return;
  if (v) {
    lockBodyScroll();
    document.addEventListener('keydown', onKeydown);
  } else {
    unlockBodyScroll();
    document.removeEventListener('keydown', onKeydown);
    hideTip(); // chips unmount without a mouseleave when the sheet closes
  }
});
onBeforeUnmount(() => {
  if (open.value) unlockBodyScroll();
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="fixed inset-0 z-[60] flex items-end md:hidden">
        <button
          type="button"
          class="absolute inset-0 cursor-default bg-bg/60"
          aria-label="Close filters"
          @click="close"
        />
        <div
          class="drawer-sheet relative flex max-h-[85vh] w-full flex-col rounded-t-[22px] border-t border-border bg-surface shadow-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Filters"
        >
          <!-- handle + header -->
          <div class="relative flex flex-none items-center px-[18px] pb-2.5 pt-4">
            <span
              class="absolute left-1/2 top-[9px] h-[5px] w-11 -translate-x-1/2 rounded-[3px] bg-surface-raised"
            />
            <span class="mt-1.5 font-display text-[18px] font-bold text-text">Filters</span>
            <span class="ml-auto mt-1.5 font-mono text-[12px] text-secondary">
              <b class="text-text">{{
                pending ? '…' : f.filtered.value.length.toLocaleString()
              }}</b>
              results
            </span>
          </div>

          <!-- facets -->
          <div class="min-h-0 flex-1 overflow-y-auto px-[18px] pb-3 pt-1.5">
            <div :class="labelClass" class="my-2.5">
              {{ capWord(terms.character)
              }}{{ game.charactersPerSide > 1 ? ` · ${terms.side} includes` : '' }}
            </div>
            <div class="flex flex-wrap gap-[7px]">
              <button
                v-for="c in characters"
                :key="c.id"
                type="button"
                :aria-label="c.name"
                :aria-pressed="f.isActive('characters', c.id)"
                class="flex h-[38px] w-[38px] flex-none cursor-pointer items-center justify-center border-2 p-0 font-display text-[12px] font-bold text-bg cut-sm"
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
                class="h-[38px] cursor-pointer border px-3.5 font-ui text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
                :class="togClass(f.state.value.coOccurrence)"
                :disabled="f.state.value.characters.length < 2 && !f.state.value.coOccurrence"
                :aria-pressed="f.state.value.coOccurrence"
                @click="f.toggleCoOccurrence()"
              >
                ◆ Same side
              </button>
            </div>

            <div v-if="game.sourceChannels.length">
              <div :class="labelClass" class="mb-2.5 mt-5">{{ capWord(terms.source) }}</div>
              <div class="flex gap-2">
                <button
                  v-for="s in game.sourceChannels"
                  :key="s.id"
                  type="button"
                  class="flex-1 cursor-pointer border p-[11px] font-ui text-[13px] font-semibold"
                  :class="togClass(f.isActive('sources', s.id))"
                  :aria-pressed="f.isActive('sources', s.id)"
                  @click="f.toggleSource(s.id)"
                >
                  {{ s.name }}
                </button>
              </div>
            </div>

            <div v-if="f.options.value.patches.length">
              <div :class="labelClass" class="mb-2.5 mt-5">{{ capWord(terms.patch) }}</div>
              <div class="flex gap-2">
                <button
                  v-for="p in f.options.value.patches"
                  :key="p"
                  type="button"
                  class="h-10 flex-1 cursor-pointer border font-mono text-[14px]"
                  :class="togClass(f.isActive('patches', p))"
                  :aria-pressed="f.isActive('patches', p)"
                  @click="f.togglePatch(p)"
                >
                  {{ p }}
                </button>
              </div>
            </div>

            <div v-if="f.enabled.rank && (game.ranks?.length ?? 0) > 0">
              <div :class="labelClass" class="mb-2.5 mt-5">Rank</div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="r in game.ranks"
                  :key="r"
                  type="button"
                  class="h-10 cursor-pointer border px-2 font-mono text-[13px]"
                  :class="togClass(f.isActive('ranks', r))"
                  :aria-pressed="f.isActive('ranks', r)"
                  @click="f.toggleRank(r)"
                >
                  {{ r }}
                </button>
              </div>
            </div>

            <!-- game-defined facets (provideGameFacets, v0.3.0) -->
            <div v-for="facet in f.gameFacets" :key="facet.param">
              <div :class="labelClass" class="mb-2.5 mt-5">{{ facet.label }}</div>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="chip in facet.chips"
                  :key="chip.id"
                  type="button"
                  class="inline-flex h-10 cursor-pointer items-center justify-center gap-2 border px-2 font-ui text-[12px] font-semibold"
                  :class="
                    f.isFacetActive(facet.param, chip.id)
                      ? ''
                      : 'border-border bg-surface-raised text-text-secondary'
                  "
                  :style="
                    f.isFacetActive(facet.param, chip.id)
                      ? facetActiveStyle(chip.accent)
                      : undefined
                  "
                  :aria-pressed="f.isFacetActive(facet.param, chip.id)"
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
              <div v-if="facet.note" class="mt-2 font-mono text-[10px] text-text-muted">
                {{ facet.note }}
              </div>
            </div>

            <div :class="labelClass" class="mb-2.5 mt-5">Player · featured</div>
            <div class="flex flex-wrap gap-[7px]">
              <button
                v-for="p in featured"
                :key="p.id"
                type="button"
                class="inline-flex cursor-pointer items-center gap-1.5 border bg-surface px-[11px] py-2 font-ui text-[12px] font-semibold text-text"
                :style="{
                  borderColor: f.isActive('players', p.id)
                    ? 'var(--color-primary)'
                    : 'var(--color-border)',
                }"
                :aria-pressed="f.isActive('players', p.id)"
                @click="f.togglePlayer(p.id)"
              >
                <VerifiedMark v-if="p.featured" :size="10" />
                {{ p.handle }}
              </button>
              <button
                type="button"
                class="cursor-pointer border border-dashed border-secondary/40 px-[11px] py-2 font-ui text-[12px] font-semibold text-secondary"
                :aria-expanded="showAllPlayers"
                @click="showAllPlayers = !showAllPlayers"
              >
                Search all {{ ranked.length.toLocaleString() }} players ▾
              </button>
            </div>
            <div v-if="showAllPlayers" class="mt-2.5">
              <input
                v-model="playerQuery"
                type="search"
                placeholder="Type a player name…"
                aria-label="Search all players"
                class="w-full border border-border bg-surface-sunken px-3 py-2.5 font-ui text-[13px] text-text outline-none placeholder:text-text-muted"
              />
              <div class="mt-1 max-h-44 overflow-y-auto">
                <button
                  v-for="p in playerResults"
                  :key="p.id"
                  type="button"
                  class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left font-ui text-[12.5px] font-semibold text-text"
                  :class="f.isActive('players', p.id) ? 'bg-primary/15' : ''"
                  :aria-pressed="f.isActive('players', p.id)"
                  @click="f.togglePlayer(p.id)"
                >
                  <VerifiedMark v-if="p.featured" :size="9" />
                  <span class="min-w-0 truncate">{{ p.handle }}</span>
                  <span class="ml-auto font-mono text-[10px] text-text-muted">{{
                    p.appearances
                  }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- footer -->
          <div class="flex flex-none gap-2.5 border-t border-border bg-surface px-[18px] py-3.5">
            <button
              type="button"
              class="flex-1 cursor-pointer border border-border bg-surface-raised p-3.5 font-ui text-[14px] font-bold text-text-secondary"
              @click="f.clearAll()"
            >
              Reset
            </button>
            <button
              type="button"
              class="flex-[2] cursor-pointer bg-primary p-3.5 font-ui text-[14px] font-bold text-primary-contrast cut-bl-lg"
              @click="close"
            >
              Show {{ pending ? '…' : f.filtered.value.length.toLocaleString() }} replays
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <HoverTip :tip="tip">
      <span
        v-if="tip"
        class="font-ui text-[12px] font-semibold"
        :style="{ color: accentVar(tip.data.id, 'var(--color-primary)') }"
        >{{ tip.data.name }}</span
      >
    </HoverTip>
  </Teleport>
</template>

<style scoped>
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.2s;
}
.drawer-enter-active .drawer-sheet,
.drawer-leave-active .drawer-sheet {
  transition: transform 0.36s var(--ease-snap);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .drawer-sheet,
.drawer-leave-to .drawer-sheet {
  transform: translateY(100%);
}
</style>
