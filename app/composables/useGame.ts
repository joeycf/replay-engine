import type { GameConfig } from '@engine/types';

/**
 * The single accessor for game-shaped configuration. EVERY other engine
 * composable and component reads game values through this — nothing
 * game-specific is hard-coded anywhere in the engine (PLAN §2.6 / §11).
 *
 * Returns `useAppConfig().game` typed as GameConfig: the engine's umbrella
 * default merged under the consuming game's app/app.config.ts override.
 */
export function useGame(): GameConfig {
  return useAppConfig().game as GameConfig;
}

/**
 * The product brand string: "{name} Replay Database" for a game, or the bare
 * umbrella name when no game slug is set (the selector/engine default).
 * Feeds the default title, OG site name, JSON-LD, manifest, and the footer.
 */
export function useBrandName(): string {
  const game = useGame();
  return game.slug ? `${game.name} Replay Database` : game.name;
}

/**
 * Resolved per-game vocabulary + the characters-section route base (additive,
 * v0.2.0). Every engine template that says "character(s)", "side", "patch",
 * or "source" to the USER — nav, headings, filter labels, placeholders, SEO
 * strings, JSON-LD — reads the word from here, so a game like 2XKO renders
 * champion/team/season/channel without overriding a single component. Terms
 * are lowercase; capitalize at the call site with capWord() where a label
 * needs it. characterPath keeps every character link on the configured URL
 * segment (GameConfig.characterRouteSegment — the route remap lives in
 * nuxt.config's engineCharacterRoutes).
 */
export interface GameTerms {
  character: string;
  characters: string;
  side: string;
  patch: string;
  patches: string;
  source: string;
  /** Route base for the characters section, e.g. '/characters' or '/champions'. */
  charactersBase: string;
  characterPath: (id: string) => string;
}

export function useGameTerms(): GameTerms {
  const game = useGame();
  const t = game.terms ?? {};
  const segment = (game.characterRouteSegment || 'characters').replace(/^\/+|\/+$/g, '');
  const charactersBase = `/${segment}`;
  return {
    character: t.character || 'character',
    characters: t.characters || 'characters',
    side: t.side || 'side',
    patch: t.patch || 'patch',
    patches: t.patches || 'patches',
    source: t.source || 'source',
    charactersBase,
    characterPath: (id: string) => `${charactersBase}/${id}`,
  };
}

/**
 * Canonical absolute site origin for SEO URLs. NUXT_PUBLIC_SITE_URL (runtime
 * config) wins over GameConfig.siteUrl so deploys can override without a code
 * change — exactly like the shipped build.
 */
export function useSiteOrigin(): string {
  const fromRuntime = useRuntimeConfig().public.siteUrl as string | undefined;
  const game = useGame();
  return (fromRuntime || game.siteUrl).replace(/\/$/, '');
}
