import type { ComputedRef, Ref } from 'vue';
import type { Replay } from '@engine/types';
import { deriveOptions, filterReplays } from '../utils/filterReplays';
import type { FilterOptions, FilterState, ListFacet } from '../utils/filterReplays';

/**
 * Reactive, URL-synced facade over the pure filter core (utils/filterReplays).
 *
 * Facets always available: character, matchup, player, date, patch, source.
 * Gated facets (rendered only when GameConfig enables them): co-occurrence
 * (tag fighters) and rank (games with a ladder). See PLAN.md §3.
 *
 * SEMANTICS — AND across facets (the original build's "AND across chips"): a
 * replay must satisfy EVERY active facet. Within a facet the combination
 * depends on how many values one replay can hold: characters/players (multiple
 * per replay) → AND; source/patch (one per replay) → OR; rank (per side) → OR.
 * Co-occurrence tightens the character facet to "one side holds ALL selected".
 *
 * State lives entirely in the URL query (the single source of truth): shareable,
 * reload-safe, and reactive to back/forward. Mutations router.replace the query.
 */

export interface FilterController {
  state: ComputedRef<FilterState>;
  filtered: ComputedRef<Replay[]>;
  options: ComputedRef<FilterOptions>;
  activeCount: ComputedRef<number>;
  /** Which gated facets this game enables — drives the FilterPanel UI. */
  enabled: { coOccurrence: boolean; rank: boolean };
  toggle: (facet: ListFacet, value: string) => void;
  setCoOccurrence: (on: boolean) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setMatchup: (a: string | null, b: string | null) => void;
  isActive: (facet: ListFacet, value: string) => boolean;
  clear: () => void;
}

function parseList(value: unknown): string[] {
  return typeof value === 'string' && value.length
    ? value.split(',').filter(Boolean)
    : [];
}

function parseMatchup(value: unknown): [string, string] | null {
  if (typeof value !== 'string') return null;
  const [a, b] = value.split(':');
  return a && b ? [a, b] : null;
}

export function useFilters(replays: Ref<Replay[]>): FilterController {
  const route = useRoute();
  const router = useRouter();
  const game = useGame();

  const enabled = {
    coOccurrence: !!game.filters.coOccurrence,
    rank: !!game.filters.rank,
  };

  const state = computed<FilterState>(() => ({
    characters: parseList(route.query.characters),
    players: parseList(route.query.players),
    sources: parseList(route.query.sources),
    patches: parseList(route.query.patches),
    // Gated facets are ignored unless the game enables them, even if present in
    // the URL — the engine never applies a filter the game didn't declare.
    ranks: enabled.rank ? parseList(route.query.ranks) : [],
    dateFrom: (route.query.from as string) || null,
    dateTo: (route.query.to as string) || null,
    coOccurrence: enabled.coOccurrence && route.query.co === '1',
    matchup: parseMatchup(route.query.mu),
  }));

  function setQuery(patch: Record<string, string | undefined>) {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...route.query, ...patch })) {
      if (typeof v === 'string' && v.length) next[k] = v;
    }
    router.replace({ query: next });
  }

  function toggle(facet: ListFacet, value: string) {
    if (facet === 'ranks' && !enabled.rank) return;
    const current = state.value[facet];
    const list = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    setQuery({ [facet]: list.join(',') || undefined });
  }

  function setCoOccurrence(on: boolean) {
    if (!enabled.coOccurrence) return;
    setQuery({ co: on ? '1' : undefined });
  }

  function setDateRange(from: string | null, to: string | null) {
    setQuery({ from: from || undefined, to: to || undefined });
  }

  function setMatchup(a: string | null, b: string | null) {
    setQuery({ mu: a && b ? `${a}:${b}` : undefined });
  }

  function isActive(facet: ListFacet, value: string) {
    return state.value[facet].includes(value);
  }

  function clear() {
    router.replace({ query: {} });
  }

  const filtered = computed(() => filterReplays(replays.value, state.value));
  const options = computed(() => deriveOptions(replays.value, game.ranks));

  const activeCount = computed(() => {
    const s = state.value;
    return (
      s.characters.length +
      s.players.length +
      s.sources.length +
      s.patches.length +
      s.ranks.length +
      (s.dateFrom || s.dateTo ? 1 : 0) +
      (s.coOccurrence ? 1 : 0) +
      (s.matchup ? 1 : 0)
    );
  });

  return {
    state,
    filtered,
    options,
    activeCount,
    enabled,
    toggle,
    setCoOccurrence,
    setDateRange,
    setMatchup,
    isActive,
    clear,
  };
}
