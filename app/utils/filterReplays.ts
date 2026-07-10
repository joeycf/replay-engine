import type { Replay } from '@engine/types';

/**
 * Pure, framework-free filtering core — no Nuxt/Vue APIs — so it is unit-testable
 * in isolation and reused by the useFilters composable (which adds URL-sync and
 * reactivity). See useFilters.ts for the full semantics writeup.
 */

export type ListFacet = 'characters' | 'players' | 'sources' | 'patches' | 'ranks';

export interface FilterState {
  characters: string[];
  players: string[];
  sources: string[];
  patches: string[];
  ranks: string[];
  dateFrom: string | null;
  dateTo: string | null;
  coOccurrence: boolean;
  matchup: [string, string] | null;
}

export interface FilterOptions {
  characters: string[];
  players: string[];
  sources: string[];
  patches: string[];
  ranks: string[];
}

export function emptyFilterState(): FilterState {
  return {
    characters: [],
    players: [],
    sources: [],
    patches: [],
    ranks: [],
    dateFrom: null,
    dateTo: null,
    coOccurrence: false,
    matchup: null,
  };
}

function allCharacters(replay: Replay): string[] {
  return [...replay.sides[0].characters, ...replay.sides[1].characters];
}

/** True if a single replay satisfies EVERY active facet (AND across facets). */
export function matchesReplay(replay: Replay, state: FilterState): boolean {
  // characters — AND, or same-side-ALL when co-occurrence is on
  if (state.characters.length) {
    if (state.coOccurrence) {
      const onOneSide = replay.sides.some((side) =>
        state.characters.every((c) => side.characters.includes(c)),
      );
      if (!onOneSide) return false;
    } else {
      const present = allCharacters(replay);
      if (!state.characters.every((c) => present.includes(c))) return false;
    }
  }

  // players — AND
  if (state.players.length) {
    const sidePlayers = replay.sides.map((s) => s.player);
    if (!state.players.every((p) => sidePlayers.includes(p))) return false;
  }

  // source — OR
  if (state.sources.length && !state.sources.includes(replay.source)) return false;

  // patch — OR
  if (state.patches.length && !(replay.patch && state.patches.includes(replay.patch)))
    return false;

  // rank — OR (any side at a selected rank)
  if (state.ranks.length) {
    const sideRanks = replay.sides.map((s) => s.rank).filter(Boolean) as string[];
    if (!state.ranks.some((r) => sideRanks.includes(r))) return false;
  }

  // date — inclusive range (ISO strings compare lexicographically)
  if (state.dateFrom && replay.date < state.dateFrom) return false;
  if (state.dateTo && replay.date > `${state.dateTo}T23:59:59`) return false;

  // matchup — the pair on opposing sides (order-agnostic)
  if (state.matchup) {
    const [a, b] = state.matchup;
    const [s0, s1] = replay.sides;
    const ok =
      (s0.characters.includes(a) && s1.characters.includes(b)) ||
      (s0.characters.includes(b) && s1.characters.includes(a));
    if (!ok) return false;
  }

  return true;
}

/** AND-across-facets filter over a replay list. */
export function filterReplays(replays: Replay[], state: FilterState): Replay[] {
  return replays.filter((r) => matchesReplay(r, state));
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
      players.add(side.player);
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
