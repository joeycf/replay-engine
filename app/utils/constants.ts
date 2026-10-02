/** Unflagged players in the top this-many PERCENT by appearances are
 *  auto-featured (ties included). Overridable per game via
 *  `GameConfig.featured.autoPercent`. See utils/featuredRank.ts. */
export const FEATURED_AUTO_PERCENT = 2;

/** An unflagged player is never auto-featured below this many appearances,
 *  whatever the percentile says — a 400-player game's top 2% would otherwise
 *  feature people with two replays. `GameConfig.featured.minAppearances`. */
export const FEATURED_FLOOR_APPEARANCES = 5;

/** A player page below this many replays is noindex,follow and out of the
 *  sitemap (v0.18.0). `GameConfig.seo.indexMinReplays`. See types/game.ts. */
export const SEO_INDEX_MIN_REPLAYS = 5;

/** Cards rendered per infinite-scroll page. */
export const GRID_PAGE_SIZE = 36;

/** Debounce for typing → URL query writes. */
export const SEARCH_DEBOUNCE_MS = 300;

/** Max related replays shown in the video modal. */
export const RELATED_LIMIT = 10;
