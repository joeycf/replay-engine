import { withBase } from 'ufo';
import type { Character, KnownStats, Player, Replay } from '@engine/types';
import {
  getProvidedCharacters,
  getProvidedPlayers,
  getProvidedStats,
} from '../utils/registryStore';

/**
 * Base-path-safe absolute URL for a file the game publishes to public/data.
 * Runs every /data path through withBase() + the runtime app.baseURL so it
 * resolves under '/', '/2xko', or any future subpath (PLAN §2.3 / §11).
 */
export function useDataUrl(file: string): string {
  return withBase(`/data/${file}`, useRuntimeConfig().app.baseURL);
}

/**
 * Base-path-safe URL for an absolute asset path from the data (e.g. a
 * Character.imgPortrait like '/img/char/asuka.webp'). Every absolute /img path
 * the engine renders goes through this, so images resolve under any subpath
 * and never bypass base-awareness (PLAN §11 base-path traps). Passes through
 * already-absolute (http) URLs untouched.
 */
export function useAssetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return withBase(path, useRuntimeConfig().app.baseURL);
}

/** Common shape both provisioning branches present to pages/components. */
export interface RegistryHandle<T> {
  list: Ref<T[]>;
  byId: (id: string) => T | undefined;
  pending: Ref<boolean>;
  /** true ⇒ bundled via provideRegistries (SSR/prerender-visible);
   *  false ⇒ client-fetch fallback (hydrates after mount). */
  provided: boolean;
}

function fetchedRegistry<T extends { id: string }>(key: string, file: string): RegistryHandle<T> {
  const { data, pending } = useAsyncData<T[]>(key, () => $fetch<T[]>(useDataUrl(file)), {
    server: false,
    default: () => [],
  });
  return {
    list: data as Ref<T[]>,
    byId: (id: string) => (data.value as T[]).find((item) => item.id === id),
    pending,
    provided: false,
  };
}

/**
 * Character registry — provided-first (see utils/registryStore.ts), falling
 * back to a client fetch of /data/characters.json when nothing was provided.
 */
export function useCharacters(): RegistryHandle<Character> {
  const provided = getProvidedCharacters();
  if (provided) {
    return {
      list: shallowRef(provided.list),
      byId: (id: string) => provided.byId.get(id),
      pending: ref(false),
      provided: true,
    };
  }
  return fetchedRegistry<Character>('characters', 'characters.json');
}

/** Player registry — provided-first, client-fetch fallback. */
export function usePlayers(): RegistryHandle<Player> {
  const provided = getProvidedPlayers();
  if (provided) {
    return {
      list: shallowRef(provided.list),
      byId: (id: string) => provided.byId.get(id),
      pending: ref(false),
      provided: true,
    };
  }
  return fetchedRegistry<Player>('players', 'players.json');
}

/** Aggregate stats — provided-first, client-fetch fallback. */
export function useStats(): {
  stats: Ref<KnownStats | null>;
  pending: Ref<boolean>;
  provided: boolean;
} {
  const provided = getProvidedStats();
  if (provided) {
    return { stats: shallowRef(provided), pending: ref(false), provided: true };
  }
  const { data, pending } = useAsyncData<KnownStats | null>(
    'stats',
    () => $fetch<KnownStats>(useDataUrl('stats.json')),
    { server: false, default: () => null },
  );
  return { stats: data as Ref<KnownStats | null>, pending, provided: false };
}

/**
 * The whale file — the replay list. ALWAYS client-fetched (`server: false`)
 * from public/data/replays.json under the base path, exactly like the original
 * build's videos.json: never bundled, never serialized into payloads.
 * Prerendered pages show skeletons until this resolves on the client.
 */
export function useReplays() {
  const { data, pending, error } = useAsyncData<Replay[]>(
    'replays',
    () => $fetch<Replay[]>(useDataUrl('replays.json')),
    { server: false, default: () => [] },
  );
  const byId = (id: string): Replay | undefined => data.value.find((r) => r.id === id);
  return { replays: data as Ref<Replay[]>, pending, error, byId };
}
