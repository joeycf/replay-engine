import type { LocationQuery } from 'vue-router';
import type { ComputedRef } from 'vue';
import type { Replay } from '@engine/types';
import { buildSearchIndex, deriveOptions, filterReplays } from '../utils/filterReplays';
import type { FilterOptions, FilterState, ListFacet, ReplaySort } from '../utils/filterReplays';
import { getProvidedGameFacets } from '../utils/gameFacets';
import type { GameFacet } from '../utils/gameFacets';
import { collapsePatchTokens, expandPatchTokens, patchGroupState } from '../utils/patchGroups';

/**
 * URL-synced facade over the pure filter core (utils/filterReplays — the full
 * semantics writeup lives there). Ported from the shipped build:
 *
 * Query scheme (ALL filter state lives in the route — shareable, back/forward
 * safe; `v=<replayId>` belongs to useVideoModal and is always preserved):
 *   c=aegis,bolt      side=1        mu=aegis:bolt     p=nomad,echo
 *   src=ch-neon       patch=S1,S2   rank=Gold         from=…  to=…
 *   q=free+text       sort=oldest|views|longest
 *
 * Discrete toggles PUSH (Back undoes a step); typing/sort/date REPLACE,
 * debounced where typed. Gated facets never apply unless the game declares
 * them: co-occurrence needs charactersPerSide > 1 && filters.coOccurrence;
 * rank needs filters.rank (options from useGame().ranks).
 */

export interface ActiveChip {
  key: string;
  label: string;
  remove: () => void;
}

type QueryValue = LocationQuery[string] | undefined;
const one = (v: QueryValue): string | null =>
  typeof v === 'string' ? v : Array.isArray(v) ? ((v[0] as string | null) ?? null) : null;
const csv = (v: QueryValue): string[] => one(v)?.split(',').filter(Boolean) ?? [];

export interface FilterController {
  state: ComputedRef<FilterState>;
  filtered: ComputedRef<Replay[]>;
  options: ComputedRef<FilterOptions>;
  /** Rank chips to render: data-present ranks (options.ranks) in highest-first
   *  (reversed-ladder) display order. Empty when no replay carries a rank. */
  rankOptions: ComputedRef<string[]>;
  chips: ComputedRef<ActiveChip[]>;
  activeCount: ComputedRef<number>;
  /** Changes exactly when a filter/search/sort changes (not ?v=) — resets paging. */
  filterKey: ComputedRef<string>;
  /** Gated facets this game enables — drives the FilterBar/Drawer UI. */
  enabled: { coOccurrence: boolean; rank: boolean };
  /** Game-defined custom facets (provideGameFacets, v0.3.0) — render order. */
  gameFacets: GameFacet[];
  /** Whether any replay carries durationSec (shows/hides the Longest sort). */
  hasDurations: ComputedRef<boolean>;
  toggleCharacter: (id: string) => void;
  /** Toggle a value of a game-defined facet (URL param = facet.param). */
  toggleFacetValue: (param: string, id: string) => void;
  isFacetActive: (param: string, id: string) => boolean;
  toggleCoOccurrence: () => void;
  setMatchup: (a: string | null, b: string | null) => void;
  togglePlayer: (id: string) => void;
  toggleSource: (id: string) => void;
  /** Toggle a whole sourceGroup's member ids as a set (v0.5.5). */
  toggleSourceGroup: (ids: string[]) => void;
  /** True when any member of a sourceGroup is selected (v0.5.5). */
  isSourceGroupActive: (ids: string[]) => boolean;
  togglePatch: (id: string) => void;
  /** Toggle a whole patchGroup (v0.6.0): none/some → the parent token (whole
   *  era, incl. era-token replays); all → cleared. No-op without groups. */
  togglePatchGroup: (id: string) => void;
  toggleRank: (id: string) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setSearch: (v: string) => void;
  setSort: (v: ReplaySort) => void;
  isActive: (facet: ListFacet, value: string) => boolean;
  clearAll: () => void;
}

export function useFilters(): FilterController {
  const route = useRoute();
  const router = useRouter();
  const game = useGame();
  const { replays } = useReplays();
  const { list: characters, byId: charById } = useCharacters();
  const { list: players, byId: playerById } = usePlayers();

  const enabled = {
    coOccurrence: game.charactersPerSide > 1 && !!game.filters.coOccurrence,
    rank: !!game.filters.rank,
  };
  // constant per app (module-scope provisioning, like the registries)
  const gameFacets = getProvidedGameFacets();
  // patchGroups (v0.6.0): [] keeps every code path below on the flat behavior
  // (expand/collapse are the identity), byte-stable for non-declaring apps
  const patchGroups = game.patchGroups ?? [];

  const parseMatchup = (v: QueryValue): [string, string] | null => {
    const s = one(v);
    if (!s) return null;
    const [a, b] = s.split(':');
    return a && b ? [a, b] : null;
  };

  const state = computed<FilterState>(() => ({
    characters: csv(route.query.c),
    // gated facets are ignored unless the game declares them, even if present
    // in the URL — the engine never applies a filter the game didn't enable
    coOccurrence: enabled.coOccurrence && one(route.query.side) === '1',
    matchup: parseMatchup(route.query.mu),
    players: csv(route.query.p),
    sources: csv(route.query.src),
    // EXPANDED form: a parent token brings all its declared children (and
    // itself, so era-token replays — "season known, patch unknown" — match a
    // whole-season selection). The URL keeps the collapsed canonical form.
    patches: expandPatchTokens(csv(route.query.patch), patchGroups),
    ranks: enabled.rank ? csv(route.query.rank) : [],
    dateFrom: one(route.query.from),
    dateTo: one(route.query.to),
    search: one(route.query.q) ?? '',
    sort: ((): ReplaySort => {
      const v = one(route.query.sort);
      return v === 'oldest' || v === 'views' || v === 'longest' ? v : 'newest';
    })(),
    custom: Object.fromEntries(gameFacets.map((gf) => [gf.param, csv(route.query[gf.param])])),
  }));

  // ── URL writes (push = Back undoes; replace = typing/sort/date) ──────────
  function write(patch: Record<string, string | null>, mode: 'push' | 'replace' = 'push') {
    const q = new Map<string, string>();
    for (const [k, v] of Object.entries(route.query)) {
      const s = one(v);
      if (s !== null && s !== '') q.set(k, s);
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') q.delete(k);
      else q.set(k, v);
    }
    router[mode]({ query: Object.fromEntries(q) });
  }

  const toggled = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const toggleCharacter = (id: string) =>
    write({ c: toggled(state.value.characters, id).join(',') || null });
  const toggleCoOccurrence = () => {
    if (!enabled.coOccurrence) return;
    write({ side: state.value.coOccurrence ? null : '1' });
  };
  const setMatchup = (a: string | null, b: string | null) =>
    write({ mu: a && b ? `${a}:${b}` : null });
  const togglePlayer = (id: string) =>
    write({ p: toggled(state.value.players, id).join(',') || null });
  const toggleSource = (id: string) =>
    write({ src: toggled(state.value.sources, id).join(',') || null });
  // sourceGroups (v0.5.5): one chip toggles a SET of source ids. On = none selected
  // → add all; off = any selected → remove all. Writes the same ?src= CSV, so the
  // predicate, badge, and per-channel deep links are untouched.
  const toggleSourceGroup = (ids: string[]) => {
    const cur = state.value.sources;
    const next = ids.some((id) => cur.includes(id))
      ? cur.filter((id) => !ids.includes(id))
      : [...cur, ...ids.filter((id) => !cur.includes(id))];
    write({ src: next.join(',') || null });
  };
  const isSourceGroupActive = (ids: string[]) => ids.some((id) => state.value.sources.includes(id));
  const togglePatch = (id: string) =>
    write({
      patch: collapsePatchTokens(toggled(state.value.patches, id), patchGroups).join(',') || null,
    });
  // patchGroups (v0.6.0): parent chip = whole-era toggle. Writing the PARENT
  // token (expanded before collapse so the canonical form survives) is what
  // keeps legacy season deep links and their exact counts native.
  const togglePatchGroup = (id: string) => {
    const group = patchGroups.find((g) => g.id === id);
    if (!group) return;
    const members = new Set([id, ...(group.children ?? []).map((c) => c.id)]);
    const rest = state.value.patches.filter((t) => !members.has(t));
    const { state: sel } = patchGroupState(group, state.value.patches, options.value.patches);
    const next = sel === 'all' ? rest : [...rest, ...expandPatchTokens([id], patchGroups)];
    write({ patch: collapsePatchTokens(next, patchGroups).join(',') || null });
  };
  const toggleRank = (id: string) => {
    if (!enabled.rank) return;
    write({ rank: toggled(state.value.ranks, id).join(',') || null });
  };
  const setDateRange = (from: string | null, to: string | null) =>
    write({ from: from || null, to: to || null }, 'replace');
  const toggleFacetValue = (param: string, id: string) =>
    write({ [param]: toggled(state.value.custom?.[param] ?? [], id).join(',') || null });
  const isFacetActive = (param: string, id: string) =>
    (state.value.custom?.[param] ?? []).includes(id);
  const setSort = (v: ReplaySort) => write({ sort: v === 'newest' ? null : v }, 'replace');

  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  function setSearch(v: string) {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => write({ q: v.trim() || null }, 'replace'), SEARCH_DEBOUNCE_MS);
  }

  const clearAll = () =>
    write({
      c: null,
      side: null,
      mu: null,
      p: null,
      src: null,
      patch: null,
      rank: null,
      from: null,
      to: null,
      q: null,
      sort: null,
      ...Object.fromEntries(gameFacets.map((gf) => [gf.param, null])),
    });

  const isActive = (facet: ListFacet, value: string) => state.value[facet].includes(value);

  // ── labels ────────────────────────────────────────────────────────────────
  const charName = (id: string) => charById(id)?.name ?? id;
  const sourceName = (id: string) => game.sourceChannels.find((s) => s.id === id)?.name ?? id;
  const patchChildLabel = (token: string) => {
    for (const g of patchGroups) {
      const child = g.children?.find((c) => c.id === token);
      if (child) return child.label ?? child.id;
    }
    return token;
  };

  // ── active chips (design order) ──────────────────────────────────────────
  const chips = computed<ActiveChip[]>(() => {
    const s = state.value;
    const out: ActiveChip[] = [];
    for (const c of s.characters)
      out.push({ key: `c:${c}`, label: charName(c), remove: () => toggleCharacter(c) });
    if (s.coOccurrence) out.push({ key: 'side', label: 'Same side', remove: toggleCoOccurrence });
    if (s.matchup)
      out.push({
        key: 'mu',
        label: `${charName(s.matchup[0])} vs ${charName(s.matchup[1])}`,
        remove: () => setMatchup(null, null),
      });
    for (const p of s.players)
      out.push({
        key: `p:${p}`,
        label: playerById(p)?.handle ?? p,
        remove: () => togglePlayer(p),
      });
    // sources: collapse to one pill per selected group when sourceGroups is set,
    // else one pill per selected id.
    if (game.sourceGroups?.length) {
      const grouped = new Set<string>();
      for (const g of game.sourceGroups)
        if (g.sources.some((id) => s.sources.includes(id))) {
          out.push({
            key: `srcgrp:${g.id}`,
            label: g.name,
            remove: () => toggleSourceGroup(g.sources),
          });
          for (const id of g.sources) grouped.add(id);
        }
      for (const src of s.sources)
        if (!grouped.has(src))
          out.push({ key: `src:${src}`, label: sourceName(src), remove: () => toggleSource(src) });
    } else {
      for (const src of s.sources)
        out.push({ key: `src:${src}`, label: sourceName(src), remove: () => toggleSource(src) });
    }
    // patches: with patchGroups (v0.6.0) render the CANONICAL form — one pill
    // per fully-selected parent, child pills for partial picks (mirrors the
    // sourceGroups collapse above); else one pill per token as before.
    if (patchGroups.length) {
      for (const pt of collapsePatchTokens(s.patches, patchGroups)) {
        const group = patchGroups.find((g) => g.id === pt);
        out.push({
          key: `patch:${pt}`,
          label: group?.label ?? patchChildLabel(pt),
          remove: group ? () => togglePatchGroup(pt) : () => togglePatch(pt),
        });
      }
    } else {
      for (const pt of s.patches)
        out.push({ key: `patch:${pt}`, label: pt, remove: () => togglePatch(pt) });
    }
    for (const rk of s.ranks)
      out.push({ key: `rank:${rk}`, label: rk, remove: () => toggleRank(rk) });
    if (s.dateFrom || s.dateTo)
      out.push({
        key: 'date',
        label: `${s.dateFrom ?? '…'} → ${s.dateTo ?? '…'}`,
        remove: () => setDateRange(null, null),
      });
    for (const gf of gameFacets)
      for (const v of s.custom?.[gf.param] ?? [])
        out.push({
          key: `${gf.param}:${v}`,
          label: gf.chipLabel?.(v) ?? gf.chips.find((c) => c.id === v)?.label ?? v,
          remove: () => toggleFacetValue(gf.param, v),
        });
    if (s.search)
      out.push({ key: 'q', label: `“${s.search}”`, remove: () => write({ q: null }, 'replace') });
    return out;
  });
  const activeCount = computed(() => chips.value.length);

  // ── the filtered + sorted list ────────────────────────────────────────────
  const searchIndex = computed(() =>
    buildSearchIndex(replays.value, characters.value, players.value),
  );
  const filtered = computed(() =>
    filterReplays(replays.value, state.value, searchIndex.value, gameFacets),
  );
  const options = computed(() => deriveOptions(replays.value, game.ranks));
  // Highest-first for display; the ladder in game.ranks is canonical ascending,
  // so the reversal is purely presentational (the filter chips read top-down).
  const rankOptions = computed(() => [...options.value.ranks].reverse());
  const hasDurations = computed(() => replays.value.some((r) => (r.durationSec ?? 0) > 0));

  const filterKey = computed(() => {
    const s = state.value;
    return JSON.stringify([
      s.characters,
      s.coOccurrence,
      s.matchup,
      s.players,
      s.sources,
      s.patches,
      s.ranks,
      s.dateFrom,
      s.dateTo,
      s.search,
      s.sort,
      s.custom,
    ]);
  });

  return {
    state,
    filtered,
    options,
    rankOptions,
    chips,
    activeCount,
    filterKey,
    enabled,
    gameFacets,
    hasDurations,
    toggleCharacter,
    toggleFacetValue,
    isFacetActive,
    toggleCoOccurrence,
    setMatchup,
    togglePlayer,
    toggleSource,
    toggleSourceGroup,
    isSourceGroupActive,
    togglePatch,
    togglePatchGroup,
    toggleRank,
    setDateRange,
    setSearch,
    setSort,
    isActive,
    clearAll,
  };
}
