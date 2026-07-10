import type { GameConfig } from '@engine/types';

/**
 * The single accessor for game-shaped configuration. EVERY other engine
 * composable and component reads game values through this — nothing
 * game-specific is hard-coded anywhere in the engine (PLAN.md §2.6 / §11).
 *
 * Returns `useAppConfig().game` typed as GameConfig: the engine's neutral
 * default merged under the consuming game's app.config.ts override.
 */
export function useGame(): GameConfig {
  return useAppConfig().game as GameConfig;
}
