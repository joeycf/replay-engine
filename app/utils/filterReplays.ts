import type { Character, Player, Replay, Side } from '@engine/types';

/**
 * Pure, framework-free filtering core — no Nuxt/Vue APIs — unit-tested in
 * isolation (scripts/test-filters.mjs) and wrapped by the useFilters
 * composable (URL-sync + reactivity). Ported from the shipped 2XKO build,
 * generalized to the engine contract.
 *
 * SEMANTICS (AND across facets — "AND across chips"):
 * - characters: AND — every selected id present across the two sides.
 *   coOccurrence (co && ≥2 selected) tightens to "ONE side's list contains ALL
 *   selected ids" (the within-side duo filter; tag games only).
 * - matchup [a, b]: the pair on OPPOSING sides, order-agnostic.
 * - players: OR — a replay matches when ANY selected player is on a side
 *   (ported behavior: player chips widen, they don't intersect).
 * - sources / patches / ranks: OR within the facet (single-valued per replay
 *   or per side).
 * - date: inclusive [from, to] on the ISO date.
 * - search: normalized tokens, ALL must hit the replay's haystack (title +
 *   player handles + character names/aliases).
 * - sort: newest | oldest | views | longest (longest only meaningful when the
 *   game's data carries durationSec).
 */

export type ReplaySort = 'newest' | 'oldest' | 'views' | 'longest';
export type ListFacet = 'characters' | 'players' | 'sources' | 'patches' | 'ranks';

/** Case + diacritic-insensitive normalization for search matching.
 *  (Lives here so the pure core stays dependency-free for the node test
 *  harness; format.ts re-uses it.) */
export function normalizeText(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** `Character.extra.aliases` (well-known extra key, see README) as a safe list. */
export function characterAliases(character: Pick<Character, 'extra'>): string[] {
  const aliases = character.extra?.aliases;
  return Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string') : [];
}

export interface FilterState {
  characters: string[];
  coOccurrence: boolean;
  matchup: [string, string] | null;
  players: string[];
  sources: string[];
  patches: string[];
  ranks: string[];
  dateFrom: string | null;
  dateTo: string | null;
  search: string;
  sort: ReplaySort;
}

export function emptyFilterState(): FilterState {
  return {
    characters: [],
    coOccurrence: false,
    matchup: null,
    players: [],
    sources: [],
    patches: [],
    ranks: [],
    dateFrom: null,
    dateTo: null,
    search: '',
    sort: 'newest',
  };
}

export interface FilterOptions {
  characters: string[];
  players: string[];
  sources: string[];
  patches: string[];
  ranks: string[];
}

const allCharacters = (r: Replay): string[] => [...r.sides[0].characters, ...r.sides[1].characters];

/** Every player on a side: `players` when the side is a team of people
 *  (additive v0.2.0 — 2XKO duo queue / tournament sets), else `[player]`. */
export const sidePlayers = (s: Side): string[] =>
  s.players?.length ? s.players : s.player ? [s.player] : [];

/**
 * Search haystack per replay: title + side player handles + character
 * names/aliases (via the well-known `extra.aliases` key). Registries are
 * optional so the index degrades to ids when a lookup is missing.
 */
export function buildSearchIndex(
  replays: Replay[],
  characters: Character[] = [],
  players: Player[] = [],
): Map<string, string> {
  const charText = new Map(
    characters.map((c) => [c.id, normalizeText([c.name, ...characterAliases(c)].join(' '))]),
  );
  const handle = new Map(players.map((p) => [p.id, p.handle]));
  const index = new Map<string, string>();
  for (const r of replays) {
    const parts: string[] = [r.title];
    for (const side of r.sides) {
      for (const pid of sidePlayers(side)) parts.push(handle.get(pid) ?? pid);
      for (const cid of side.characters) parts.push(charText.get(cid) ?? cid);
    }
    index.set(r.id, normalizeText(parts.join(' ')));
  }
  return index;
}

/** True if a single replay satisfies EVERY active facet (search handled via index). */
export function matchesReplay(
  replay: Replay,
  state: FilterState,
  searchIndex?: Map<string, string>,
): boolean {
  if (state.characters.length) {
    if (state.coOccurrence && state.characters.length >= 2) {
      if (!replay.sides.some((s) => state.characters.every((c) => s.characters.includes(c))))
        return false;
    } else {
      const present = allCharacters(replay);
      if (!state.characters.every((c) => present.includes(c))) return false;
    }
  }

  if (state.matchup) {
    const [a, b] = state.matchup;
    const [s0, s1] = replay.sides;
    const ok =
      (s0.characters.includes(a) && s1.characters.includes(b)) ||
      (s0.characters.includes(b) && s1.characters.includes(a));
    if (!ok) return false;
  }

  if (state.players.length) {
    const present = replay.sides.flatMap(sidePlayers);
    if (!state.players.some((p) => present.includes(p))) return false;
  }

  if (state.sources.length && !state.sources.includes(replay.source)) return false;

  if (state.patches.length && !(replay.patch && state.patches.includes(replay.patch))) return false;

  if (state.ranks.length) {
    const sideRanks = replay.sides.map((s) => s.rank).filter((r): r is string => !!r);
    if (!state.ranks.some((r) => sideRanks.includes(r))) return false;
  }

  if (state.dateFrom && replay.date < state.dateFrom) return false;
  if (state.dateTo && replay.date > `${state.dateTo}T23:59:59`) return false;

  const tokens = normalizeText(state.search).split(/\s+/).filter(Boolean);
  if (tokens.length) {
    const hay = searchIndex?.get(replay.id) ?? normalizeText(replay.title);
    if (!tokens.every((t) => hay.includes(t))) return false;
  }

  return true;
}

/** AND-across-facets filter + sort over a replay list. */
export function filterReplays(
  replays: Replay[],
  state: FilterState,
  searchIndex?: Map<string, string>,
): Replay[] {
  const out = replays.filter((r) => matchesReplay(r, state, searchIndex));
  const s = state.sort;
  return out.sort((a, b) =>
    s === 'oldest'
      ? a.date.localeCompare(b.date)
      : s === 'views'
        ? (b.views ?? 0) - (a.views ?? 0)
        : s === 'longest'
          ? (b.durationSec ?? 0) - (a.durationSec ?? 0)
          : b.date.localeCompare(a.date),
  );
}

/** Available facet values derived from the data; ranks prefer the game's ladder. */
export function deriveOptions(replays: Replay[], rankOrder?: string[]): FilterOptions {
  const chars = new Set<string>();
  const players = new Set<string>();
  const sources = new Set<string>();
  const patches = new Set<string>();
  const ranks = new Set<string>();
  for (const replay of replays) {
    for (const side of replay.sides) {
      sidePlayers(side).forEach((p) => players.add(p));
      side.characters.forEach((c) => chars.add(c));
      if (side.rank) ranks.add(side.rank);
    }
    sources.add(replay.source);
    if (replay.patch) patches.add(replay.patch);
  }
  const sorted = (s: Set<string>) => [...s].sort();
  return {
    characters: sorted(chars),
    players: sorted(players),
    sources: sorted(sources),
    patches: sorted(patches),
    ranks: rankOrder?.length ? rankOrder : sorted(ranks),
  };
}
