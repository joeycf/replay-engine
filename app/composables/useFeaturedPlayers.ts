import type { Player } from '@engine/types';

export interface RankedPlayer extends Player {
  /** ≈ number of replays the player appears in (derived from stats.playerCharacters). */
  appearances: number;
}

/**
 * Featured = `featured === true` OR appearances ≥ FEATURED_MIN_APPEARANCES.
 * stats.playerCharacters increments once per (player × character) per side,
 * and a side fields charactersPerSide characters, so summing and dividing by
 * charactersPerSide ≈ replay appearances — the generic form of the shipped
 * "sum and halve" (2 chars per side in 2XKO).
 */
export function useFeaturedPlayers() {
  const game = useGame();
  const { list } = usePlayers();
  const { stats } = useStats();

  const perSide = Math.max(1, game.charactersPerSide);

  const ranked = computed<RankedPlayer[]>(() => {
    const pc = stats.value?.playerCharacters ?? {};
    return list.value
      .map((p) => {
        const sum = Object.values(pc[p.id] ?? {}).reduce((n, x) => n + x, 0);
        return { ...p, appearances: Math.round(sum / perSide) };
      })
      .sort((a, b) => b.appearances - a.appearances);
  });

  const featured = computed<RankedPlayer[]>(() =>
    ranked.value
      .filter((p) => p.featured || p.appearances >= FEATURED_MIN_APPEARANCES)
      .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.appearances - a.appearances),
  );

  /** Everyone below the featured bar — mostly 1–2 appearance names, tiebreak alphabetically. */
  const rest = computed<RankedPlayer[]>(() =>
    ranked.value
      .filter((p) => !p.featured && p.appearances < FEATURED_MIN_APPEARANCES)
      .sort((a, b) => b.appearances - a.appearances || a.handle.localeCompare(b.handle)),
  );

  return { ranked, featured, rest };
}
