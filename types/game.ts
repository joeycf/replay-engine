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
  fonts?: { display: string; ui: string; mono: string }; // defaults from engine
}
