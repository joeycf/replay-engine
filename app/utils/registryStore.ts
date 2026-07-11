import type { Character, KnownStats, Player } from '@engine/types';

/**
 * THE REGISTRY PROVISIONING API (PLAN §2.4, as amended).
 *
 * A game app statically imports its small registry JSON (bundled once at
 * build) and hands it to the engine from a normal app plugin:
 *
 *   // app/plugins/registries.ts (in the GAME app)
 *   import characters from '../../data/characters.json';
 *   import players from '../../data/players.json';
 *   import stats from '../../data/stats.json';
 *   export default defineNuxtPlugin(() => {
 *     provideRegistries({ characters, players, stats });
 *   });
 *
 * Because the plugin runs during SSR/prerender AND on the client, provided
 * data is synchronously available everywhere: registry pages prerender as real
 * HTML with data-derived titles (the SEO requirement — prerender-time $fetch
 * cannot read the app's own public/, see STACK §5.6), and the client hydrates
 * against the identical bundled data, so no payload serialization and no
 * hydration drift.
 *
 * The holder is module-scope on purpose: registries are constant per app —
 * the same for every request — so there is no cross-request state to isolate.
 * Engine composables (useCharacters/usePlayers/useStats) consume provided-first
 * and fall back to a client fetch of /data/*.json only when nothing was
 * provided (standalone robustness; the fixtures app uses provisioning, same as
 * a real game).
 *
 * Pure TS (no Nuxt imports) so the semantics are unit-testable in isolation:
 * scripts/test-registry.mjs.
 */

/** Registries as a game provides them: arrays or id-keyed records both work. */
export interface ProvidedRegistries {
  characters?: Character[] | Record<string, Character>;
  players?: Player[] | Record<string, Player>;
  stats?: KnownStats;
}

export interface NormalizedRegistry<T> {
  list: T[];
  byId: ReadonlyMap<string, T>;
}

interface RegistryState {
  characters: NormalizedRegistry<Character> | null;
  players: NormalizedRegistry<Player> | null;
  stats: KnownStats | null;
}

const state: RegistryState = { characters: null, players: null, stats: null };

function normalize<T extends { id: string }>(
  input: T[] | Record<string, T>,
): NormalizedRegistry<T> {
  const list = Array.isArray(input) ? input : Object.values(input);
  return { list, byId: new Map(list.map((item) => [item.id, item])) };
}

/** Provide registries (typically from an app plugin). Partial + idempotent:
 *  later calls overwrite only the keys they carry. */
export function provideRegistries(data: ProvidedRegistries): void {
  if (data.characters) state.characters = normalize(data.characters);
  if (data.players) state.players = normalize(data.players);
  if (data.stats) state.stats = data.stats;
}

export function getProvidedCharacters(): NormalizedRegistry<Character> | null {
  return state.characters;
}
export function getProvidedPlayers(): NormalizedRegistry<Player> | null {
  return state.players;
}
export function getProvidedStats(): KnownStats | null {
  return state.stats;
}

/** Test-only: reset the holder between cases. */
export function clearProvidedRegistries(): void {
  state.characters = null;
  state.players = null;
  state.stats = null;
}
