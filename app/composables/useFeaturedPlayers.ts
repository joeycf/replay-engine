/**
 * Featured = `featured === true` (the registry flag — a curated list or a
 * tournament placement set by the game's pipeline) OR top
 * `GameConfig.featured.autoPercent` of the UNFLAGGED players by appearances
 * (ties included, floored at `featured.minAppearances`). Defaults 2% / 5.
 * Zero-appearance registry rows are `hidden` — listed nowhere.
 *
 * The math lives in utils/featuredRank.ts (pure, unit-tested). Before v0.17.0
 * this was a fixed `appearances ≥ 25`, which featured 359 GGST players.
 */
export function useFeaturedPlayers() {
  const game = useGame();
  const { list } = usePlayers();
  const { stats } = useStats();

  const rule = {
    autoPercent: game.featured?.autoPercent ?? FEATURED_AUTO_PERCENT,
    minAppearances: game.featured?.minAppearances ?? FEATURED_FLOOR_APPEARANCES,
  };

  /** Every registry row with its appearances, sorted desc — the typeahead's
   *  search space. Includes the hidden zero-appearance rows. */
  const ranked = computed<RankedPlayer[]>(() =>
    rankPlayers(list.value, stats.value?.playerCharacters, game.charactersPerSide),
  );

  const split = computed(() => splitFeatured(ranked.value, rule));
  const featured = computed(() => split.value.featured);
  const rest = computed(() => split.value.rest);
  const hidden = computed(() => split.value.hidden);

  return { ranked, featured, rest, hidden };
}
