import type { GameConfig } from '../types';

/**
 * The engine's DEFAULT GameConfig — a generic, game-agnostic neutral fallback.
 * Every consuming game ships its own app.config.ts which Nuxt MERGES OVER this
 * (the app wins), so a game only overrides what differs. The engine reads all
 * of this through useGame() and hard-codes nothing game-specific.
 *
 * Safe fallbacks per PLAN.md §4a / Phase-1 spec: no game identity (empty slug),
 * single character per side, optional filters off, empty roster/channels, and
 * the neutral self-hosted default fonts.
 */
export default defineAppConfig({
  game: {
    id: 'replay-engine',
    slug: '',
    name: 'Replay Database',
    shortName: '', // empty ⇒ BrandWordmark renders the umbrella "REPLAY DATABASE"
    rightsHolder: 'the respective rights holders',
    baseURL: '/',
    siteUrl: 'https://replaydatabase.com',
    charactersPerSide: 1,
    accents: {},
    filters: {
      coOccurrence: false,
      rank: false,
    },
    sourceChannels: [],
    // Family names mirror the self-hosted @font-face defaults in
    // tailwind/theme-default.css. Note: the *rendered* families come from the
    // CSS --font-* variables; this field is the informational/typed default.
    fonts: {
      display: 'Space Grotesk',
      ui: 'Inter',
      mono: 'JetBrains Mono',
    },
  } satisfies GameConfig,
});
