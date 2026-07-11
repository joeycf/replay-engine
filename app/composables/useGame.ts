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
 * Canonical absolute site origin for SEO URLs. NUXT_PUBLIC_SITE_URL (runtime
 * config) wins over GameConfig.siteUrl so deploys can override without a code
 * change — exactly like the shipped build.
 */
export function useSiteOrigin(): string {
  const fromRuntime = useRuntimeConfig().public.siteUrl as string | undefined;
  const game = useGame();
  return (fromRuntime || game.siteUrl).replace(/\/$/, '');
}
