import type { Player } from '@engine/types';

/**
 * Featured-player ranking — the pure core of useFeaturedPlayers (v0.17.0).
 *
 * No Nuxt imports on purpose: scripts/test-featured.mjs runs this under plain
 * Node. The composable only wires registries and GameConfig into these two
 * functions.
 *
 * WHY A PERCENT. v0.16 featured anyone with ≥ 25 appearances. That is a fine
 * bar for a 6,000-replay game and an absurd one for a 25,000-replay game —
 * GGST promoted 359 "featured" players, SF6 230. The size of a sensible
 * featured rail scales with the corpus, so the rule is now the top
 * `autoPercent` of UNFLAGGED players, ties at the cutoff included (so the set
 * is stable and does not depend on sort order), floored at `minAppearances`
 * so a tiny game does not feature two-replay names.
 *
 * WHO IS HIDDEN. A registry entry with no appearances at all — a seed row, or
 * a player whose replays were all pruned — is listed nowhere: not featured,
 * not in "all players". They keep their prerendered page; they just are not
 * advertised. Every real player has ≥ 1 appearance, so "zero" means literally
 * no stats entry, never a rounding artefact (see rankPlayers).
 */

export interface RankedPlayer extends Player {
  /** ≈ number of replays the player appears in (derived from stats.playerCharacters). */
  appearances: number;
}

export interface FeaturedRule {
  autoPercent: number;
  minAppearances: number;
}

export interface FeaturedSplit {
  /** Flagged players first (by appearances), then the auto-featured tail. */
  featured: RankedPlayer[];
  /** Everyone visible below the bar, appearances desc then handle. */
  rest: RankedPlayer[];
  /** Zero-appearance registry rows, flagged or not — listed nowhere. */
  hidden: RankedPlayer[];
}

/**
 * stats.playerCharacters increments once per (player × character) per side,
 * and a side fields charactersPerSide characters, so sum ÷ charactersPerSide
 * ≈ replay appearances. The division is exact only when every side lists a
 * full complement; a partially-known side (Tōkon recovers its four characters
 * incrementally) rounds a real player DOWN TO ZERO under ÷ 4. Hence the
 * `Math.max(1, …)`: a player with any stats entry has appeared at least once.
 * Zero is reserved for "no stats entry at all".
 */
export function rankPlayers(
  players: readonly Player[],
  playerCharacters: Record<string, Record<string, number>> | undefined,
  charactersPerSide: number,
): RankedPlayer[] {
  const pc = playerCharacters ?? {};
  const perSide = Math.max(1, charactersPerSide);
  return players
    .map((p) => {
      const sum = Object.values(pc[p.id] ?? {}).reduce((n, x) => n + x, 0);
      const appearances = sum === 0 ? 0 : Math.max(1, Math.round(sum / perSide));
      return { ...p, appearances };
    })
    .sort((a, b) => b.appearances - a.appearances || a.handle.localeCompare(b.handle));
}

export function splitFeatured(ranked: readonly RankedPlayer[], rule: FeaturedRule): FeaturedSplit {
  const hidden: RankedPlayer[] = [];
  const flagged: RankedPlayer[] = [];
  const pool: RankedPlayer[] = []; // visible + unflagged, already sorted desc
  for (const p of ranked) {
    if (p.appearances === 0) hidden.push(p);
    else if (p.featured) flagged.push(p);
    else pool.push(p);
  }

  const pct = Math.min(100, Math.max(0, rule.autoPercent));
  const n = Math.floor((pool.length * pct) / 100);
  const cutoff = n > 0 ? (pool[n - 1] as RankedPlayer).appearances : Infinity;
  const bar = Math.max(cutoff, Math.max(1, rule.minAppearances));

  const auto: RankedPlayer[] = [];
  const rest: RankedPlayer[] = [];
  for (const p of pool) (p.appearances >= bar ? auto : rest).push(p);

  return { featured: [...flagged, ...auto], rest, hidden };
}

/** The `extra.titles` bag, typed, or an empty list. */
export function playerTitles(p: Player | undefined): PlayerTitleLike[] {
  const t = p?.extra?.titles;
  return Array.isArray(t) ? (t as PlayerTitleLike[]) : [];
}

export interface PlayerTitleLike {
  event: string;
  place: 1 | 2;
  date: string;
  url?: string;
}
