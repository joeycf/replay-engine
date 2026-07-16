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
  /** Web-manifest colors (additive, v0.1.0). Engine defaults to the umbrella
   *  brand; a game sets its own to match its theme.css. */
  manifest?: { themeColor?: string; backgroundColor?: string };
  /** Site-wide OG/Twitter card image path (under base) or absolute URL
   *  (additive, v0.1.0). Engine falls back to the 512 brand icon. */
  ogImage?: string;
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
}
