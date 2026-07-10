import { withBase } from 'ufo';
import type { Character, Player, Replay, Stats } from '@engine/types';

/**
 * Base-path-safe absolute URL for a file the game publishes to public/data.
 * Runs every /data path through withBase() + the runtime app.baseURL so it
 * resolves under '/', '/2xko', or any future subpath (PLAN.md §2.3 / §11).
 * ufo's withBase needs the base explicitly — Nuxt does not auto-inject it — and
 * passing app.baseURL is exactly what makes the fetch subpath-proof.
 */
export function useDataUrl(file: string): string {
  return withBase(`/data/${file}`, useRuntimeConfig().app.baseURL);
}

/**
 * Base-path-safe URL for an absolute asset path from the data (e.g. a
 * Character.imgPortrait like '/img/char/asuka.webp'). Every absolute /img path
 * the engine renders goes through this, so images resolve under any subpath and
 * never bypass base-awareness (PLAN.md §11 base-path traps). Passes through
 * already-absolute (http) URLs untouched.
 */
export function useAssetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return withBase(path, useRuntimeConfig().app.baseURL);
}

/**
 * DATA-PROVISIONING NOTE (PLAN.md §2.4 — "fetch-all-under-baseURL for
 * robustness"): every collection is CLIENT-fetched (`server: false`).
 *
 * Nuxt's internal SSR/prerender `$fetch` does not serve the *app's own* public/
 * assets — those are served by Vite (dev) / as static files (prod), not by the
 * Nitro handler the internal fetch targets — so a server-side `$fetch('/data/
 * *.json')` falls through to the SPA catch-all and resolves to null. Fetching on
 * the client (real HTTP, where the static handler serves the file) is the
 * reliable, base-path-safe, cross-layer-safe path, and matches the whale-file
 * pattern from the original build. Collections therefore hydrate on the client.
 *
 * (A game that needs prerendered/SEO content for registry pages can instead
 * import its registries in-app and provide them via a plugin — the alternative
 * noted in PLAN.md §2.4 — without the engine ever reaching into its filesystem.)
 */

/** The whale file — the replay list. */
export function useReplays() {
  const url = useDataUrl('replays.json');
  return useAsyncData<Replay[]>('replays', () => $fetch<Replay[]>(url), {
    server: false,
    default: () => [],
  });
}

/** Small registry: characters. */
export function useCharacters() {
  const url = useDataUrl('characters.json');
  return useAsyncData<Character[]>('characters', () => $fetch<Character[]>(url), {
    server: false,
    default: () => [],
  });
}

/** Small registry: players. */
export function usePlayers() {
  const url = useDataUrl('players.json');
  return useAsyncData<Player[]>('players', () => $fetch<Player[]>(url), {
    server: false,
    default: () => [],
  });
}

/** Aggregate stats (totals + usage/matchup tables). */
export function useStats() {
  const url = useDataUrl('stats.json');
  return useAsyncData<Stats | null>('stats', () => $fetch<Stats>(url), {
    server: false,
    default: () => null,
  });
}
