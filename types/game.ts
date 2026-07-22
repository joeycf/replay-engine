/**
 * The game-shaped configuration contract. Every consuming game supplies this
 * via its own `app.config.ts` (merged over the engine's neutral default), and
 * the engine reads it everywhere through `useGame()` — never hard-coding a
 * game-specific value. Transcribed from PLAN.md §3.
 */
export interface GameConfig {
  id: string; // 'tekken8'
  slug: string; // 'tekken'  → URL segment + base path
  name: string; // 'Tekken 8'
  shortName: string; // 'Tekken'  → wordmark
  rightsHolder: string; // 'Bandai Namco Entertainment' → disclaimer
  baseURL: string; // '/tekken' or '/' (fed into app.baseURL)
  siteUrl: string; // canonical origin for SEO/OG/sitemap
  charactersPerSide: 1 | 2 | 3; // 2XKO=2, Tekken=1 → validation + UI hints
  accents: Record<string, string>; // characterId → hex accent
  filters: {
    coOccurrence: boolean; // within-side duos ("same side"); tag fighters only
    rank: boolean; // rank-ladder filter; games with ranks only
    // matchup / character / player / date / patch / source are always available
  };
  ranks?: string[]; // ordered ladder, required iff filters.rank
  sourceChannels: { id: string; name: string }[];
  /** Optional visual grouping of the source filter (additive, v0.5.5): render one
   *  chip per group, each toggling its member source ids as a set. Absent → chips
   *  render 1:1 from sourceChannels. Badge + data stay per-channel — SourceBadge and
   *  the filter predicate are untouched, so per-channel deep links keep working. */
  sourceGroups?: { id: string; name: string; sources: string[] }[];
  fonts?: { display: string; ui: string; mono: string }; // defaults from engine
  /** Web-manifest colors (additive, v0.1.0). Engine defaults to the umbrella
   *  brand; a game sets its own to match its theme.css. */
  manifest?: { themeColor?: string; backgroundColor?: string };
  /** Site-wide OG/Twitter card image path (under base) or absolute URL
   *  (additive, v0.1.0). Engine falls back to the 512 brand icon. */
  ogImage?: string;
  /** Character-page hero splash framing (additive, v0.5.4): the cover image's
   *  object-position. Default '70% 25%' suits wide landscape splashes (2XKO);
   *  games whose portrait renders sit heads-near-top (Tekken) bias the vertical
   *  up so the head isn't cropped. Keep X ~70% to hold the subject on the
   *  right, clear of the left-side gradient + name overlay. */
  heroFocus?: string;
  /** Per-game vocabulary (additive, v0.2.0). The engine renders these nouns in
   *  nav, headings, filter labels, placeholders, SEO strings, and JSON-LD —
   *  resolved through useGameTerms(). Defaults: character/characters · side ·
   *  patch/patches · source. 2XKO: champion/champions · team · season/seasons
   *  · channel. Lowercase; the engine capitalizes where a label needs it. */
  terms?: {
    character?: string;
    characters?: string;
    side?: string;
    patch?: string;
    patches?: string;
    source?: string;
  };
  /** URL segment for the characters section (additive, v0.2.0): 'characters'
   *  by default; 2XKO sets 'champions' so its live, indexed /champions/* URLs
   *  survive the layer refactor (PLAN §6 URL parity). Engine page routes are
   *  remapped at build (engineCharacterRoutes in nuxt.config); engine links
   *  resolve through useGameTerms().characterPath. */
  characterRouteSegment?: string;
  /** Stats-dashboard layout tuning (additive, v0.5.3). Controls the
   *  meta-over-time bump chart on the stats page:
   *  - metaTimelineTopN: how many characters to plot (default 5).
   *  - metaTimelineFullWidth: span the whole row instead of sharing it with
   *    the `beside-timeline` game anchor (default false). A game that leaves
   *    that anchor empty (e.g. Tekken) sets this true; 2XKO keeps the default
   *    so its Fuse-meta companion still sits in the grid's second cell. */
  stats?: {
    metaTimelineTopN?: number;
    metaTimelineFullWidth?: boolean;
  };
}
