import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Nuxt } from 'nuxt/schema';
import type { RecentReplay, Replay, Side } from '../types';

/**
 * BUILD-TIME REPLAY INDEX (v0.18.0) — the small, derived slice of the whale
 * file that prerendered HTML is allowed to carry.
 *
 * replays.json is never bundled and never serialized into payloads (see
 * useReplays): a game's file runs to several MB and there are ~18k player
 * pages. But a Browse page whose HTML says only "Loading replays…" and a
 * sitemap whose every <lastmod> is the build date gave crawlers nothing to
 * weigh — Search Console's "Crawled – currently not indexed" bucket is the
 * measured result (PLAN.md, 2026-10-01). This index is read ONCE per build
 * from the app's `data/replays.json` (falling back to `public/data/`, where
 * the fixtures app keeps its copy) and feeds two consumers:
 *
 *  • modules/replay-index.ts — writes `recent` + `recentByCharacter` as a build
 *    template, which useRecentReplays() imports on the server only, so the
 *    newest few records render as real text in the Browse and character pages.
 *  • modules/static-artifacts.ts — `latest*` give every sitemap URL an honest
 *    <lastmod>: the date of the newest replay that page actually shows.
 *
 * Lives in lib/ (NOT modules/ — Nuxt auto-registers every modules/*.ts file as
 * a Nuxt module, and this is a plain util). Nuxt-free on purpose, so the unit
 * test in scripts/test-replay-index.mjs can import it directly.
 */
export interface ReplayIndex {
  /** records in the file; 0 when there is none */
  total: number;
  /** YYYY-MM-DD of the newest record; absent when the file is empty or missing */
  latest?: string;
  /** player id → YYYY-MM-DD of that player's newest record */
  latestByPlayer: Record<string, string>;
  /** character id → YYYY-MM-DD of that character's newest record */
  latestByCharacter: Record<string, string>;
  /** the newest RECENT_LIMIT records, newest first */
  recent: RecentReplay[];
  /** character id → its newest RECENT_PER_CHARACTER records, newest first */
  recentByCharacter: Record<string, RecentReplay[]>;
}

/** Records the Browse page prerenders: one infinite-scroll page's worth. */
export const RECENT_LIMIT = 36;
/** Records a character page prerenders: two grid rows. */
export const RECENT_PER_CHARACTER = 8;

// Same rule as app/utils/filterReplays.ts sidePlayers — repeated here so this
// file stays importable without the Nuxt auto-import context.
const sidePlayers = (s: Side): string[] =>
  s.players?.length ? s.players : s.player ? [s.player] : [];

const day = (iso: string): string => iso.slice(0, 10);

/** A Replay reduced to what the prerendered list prints: no thumb, no views,
 *  no channel — those stay on the client-fetched record. */
export function slimReplay(r: Replay): RecentReplay {
  return {
    id: r.id,
    title: r.title,
    date: r.date,
    ...(r.patch ? { patch: r.patch } : {}),
    ...(r.event ? { event: r.event } : {}),
    sides: r.sides.map((s) => ({ players: sidePlayers(s), characters: s.characters })),
  };
}

export function buildReplayIndex(replays: Replay[]): ReplayIndex {
  const sorted = [...replays].sort((a, b) => b.date.localeCompare(a.date));
  const latestByPlayer: Record<string, string> = {};
  const latestByCharacter: Record<string, string> = {};
  const recentByCharacter: Record<string, RecentReplay[]> = {};
  for (const r of sorted) {
    const d = day(r.date);
    let slim: RecentReplay | undefined;
    for (const s of r.sides) {
      for (const p of sidePlayers(s)) latestByPlayer[p] ??= d;
      for (const c of s.characters) {
        latestByCharacter[c] ??= d;
        const bucket = (recentByCharacter[c] ??= []);
        // a mirror match lists the character on both sides — once is enough
        if (bucket.length < RECENT_PER_CHARACTER && !bucket.some((x) => x.id === r.id)) {
          bucket.push((slim ??= slimReplay(r)));
        }
      }
    }
  }
  return {
    total: sorted.length,
    ...(sorted[0] ? { latest: day(sorted[0].date) } : {}),
    latestByPlayer,
    latestByCharacter,
    recent: sorted.slice(0, RECENT_LIMIT).map(slimReplay),
    recentByCharacter,
  };
}

/** The app's replay file: `data/replays.json` (every game), else the
 *  `public/data/` copy (the fixtures app keeps only that one). */
export function replaysFile(nuxt: Nuxt): string | undefined {
  for (const rel of ['data/replays.json', 'public/data/replays.json']) {
    const file = join(nuxt.options.rootDir, rel);
    if (existsSync(file)) return file;
  }
  return undefined;
}

const cache = new WeakMap<Nuxt, ReplayIndex>();

/** Read-once-per-build accessor. Missing file → an empty index and a warning:
 *  the Browse page then renders its skeletons and <lastmod> falls back to the
 *  build date, exactly the pre-v0.18.0 output. */
export function loadReplayIndex(nuxt: Nuxt): ReplayIndex {
  const cached = cache.get(nuxt);
  if (cached) return cached;
  const file = replaysFile(nuxt);
  // `nuxt prepare` at the engine root has no app and no data — not worth a warning
  if (!file && !nuxt.options._prepare) {
    console.warn(
      '[replay-index] no data/replays.json under rootDir — Browse prerenders without a recent list, sitemap lastmod falls back to the build date',
    );
  }
  const index = buildReplayIndex(file ? (JSON.parse(readFileSync(file, 'utf8')) as Replay[]) : []);
  cache.set(nuxt, index);
  return index;
}
