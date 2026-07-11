import characters from '../../data/characters.json';
import players from '../../data/players.json';
import stats from '../../data/stats.json';
import type { Character, KnownStats, Player } from '@engine/types';

/**
 * Registry provisioning — the pattern every real game app replicates
 * (PLAN §2.4): statically import the small registries (bundled once at build,
 * synchronously available during SSR/prerender AND on the client) and hand
 * them to the engine. Only the whale file (replays.json) stays in public/data
 * for the client fetch.
 */
export default defineNuxtPlugin(() => {
  provideRegistries({
    characters: characters as Character[],
    players: players as Player[],
    stats: stats as KnownStats,
  });
});
