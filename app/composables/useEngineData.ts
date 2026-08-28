import { withBase } from 'ufo';
import type { Character, KnownStats, Player, Replay } from '@engine/types';
import {
  getProvidedCharacters,
  getProvidedPlayers,
  getProvidedStats,
} from '../utils/registryStore';
import { canonicalPlayerHandle } from '../utils/playerIdentity';

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

/**
 * Shared options for every client-side data fetch the engine makes.
 *
 * `dedupe: 'defer'` — Nuxt's default is `'cancel'`, which does NOT share an
 * in-flight request between callers. Each component that calls the composable
 * runs its own `execute()`; the previous request's AbortController is aborted,
 * but those bytes are already on the wire, so the browser completes every one
 * of them. With N components calling `useReplays()` on one page that is N full
 * downloads of replays.json — measured at 5 × 6.01 MB = 30 MB on a single SF6
 * browse load before this landed. `'defer'` makes concurrent callers await the
 * one shared promise.
 *
 * `getCachedData` — once a fetch HAS resolved, a component mounting later
 * (opening the modal, navigating to a character page) must not fetch again.
 * Nuxt's default reads `payload.data` only while hydrating and `static.data`
 * otherwise, and both are empty for a `server: false` fetch on a prerendered
 * site, so a late subscriber starts a fresh download. Reading `payload.data`
 * unconditionally is what keeps the result sticky for the life of the page.
 *
 * Behaviour only: no signature, no contract, and no config surface changes.
 */
interface CacheableNuxtApp {
  payload: { data: Record<string, unknown> };
  static: { data: Record<string, unknown> };
}

function sharedFetchOptions<T>() {
  return {
    server: false as const,
    dedupe: 'defer' as const,
    default: () => [] as T[],
    getCachedData: (key: string, nuxtApp: CacheableNuxtApp): T[] | undefined =>
      (nuxtApp.payload.data[key] ?? nuxtApp.static.data[key]) as T[] | undefined,
  };
}

function fetchedRegistry<T extends { id: string }>(key: string, file: string): RegistryHandle<T> {
  const { data, pending } = useAsyncData<T[]>(
    key,
    () => $fetch<T[]>(useDataUrl(file)),
    sharedFetchOptions<T>(),
  );
  return {
    list: data as Ref<T[]>,
    byId: (id: string) => (data.value as T[]).find((item) => item.id === id),
    pending,
    provided: false,
  };
}

/**
 * The cross-game spelling table, applied at the ONE point every consumer shares.
 *
 * Both branches of usePlayers below, deliberately: the provided path is what
 * ships, and the client-fetch fallback would otherwise render a different
 * spelling for the same person depending on how the page got its data.
 *
 * Applied HERE rather than in provideRegistries because this is the read API —
 * the fetch fallback never passes through the store at all — and because
 * everything downstream reads it: the player page, the search index
 * (filterReplays builds its handle map from this same list), the typeahead, the
 * filter chips, the OG titles, the breadcrumbs. One place, so what is searched
 * cannot drift from what is shown.
 *
 * Ids are never touched. See utils/playerIdentity.ts for why that is a
 * structural guarantee rather than a convention.
 */
function withSharedSpelling(p: Player): Player {
  const shared = canonicalPlayerHandle(p.handle);
  return shared && shared !== p.handle ? { ...p, handle: shared } : p;
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
    const list = provided.list.map(withSharedSpelling);
    const byId = new Map(list.map((p) => [p.id, p]));
    return {
      list: shallowRef(list),
      byId: (id: string) => byId.get(id),
      pending: ref(false),
      provided: true,
    };
  }
  const fetched = fetchedRegistry<Player>('players', 'players.json');
  const list = computed(() => (fetched.list.value ?? []).map(withSharedSpelling));
  return {
    list: list as Ref<Player[]>,
    byId: (id: string) => list.value.find((p) => p.id === id),
    pending: fetched.pending,
    provided: false,
  };
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
    sharedFetchOptions<Replay>(),
  );
  const byId = (id: string): Replay | undefined => data.value.find((r) => r.id === id);
  return { replays: data as Ref<Replay[]>, pending, error, byId };
}
