/**
 * The data-collection contract. Each game's pipeline emits these shapes to
 * `public/data/*.json`; the engine fetches them under the base path. A replay
 * has exactly two *sides*; each side is one player plus a *list* of 1..N
 * characters (see `Side.characters`). Transcribed from PLAN.md §3.
 */
export interface Character {
  id: string;
  name: string;
  imgPortrait: string; // path under base, e.g. /img/char/asuka.webp
  imgSplash?: string;
  accent: string; // resolved from GameConfig.accents at build
  extra?: Record<string, unknown>; // game-specific fields
}

export interface Player {
  id: string;
  handle: string;
  featured?: boolean;
  extra?: Record<string, unknown>;
}

export interface Side {
  player: string; // Player.id (primary; equals players[0] when players is set)
  /** All players on this side (additive, v0.2.0) — for games/modes where one
   *  side is a team of PEOPLE (2XKO duo queue, tournament sets), not just one
   *  pilot. Absent ⇒ the side is exactly [player]. Independent of
   *  charactersPerSide. Filtering, search, and display treat every listed
   *  player as on the side (utils/filterReplays.sidePlayers). */
  players?: string[];
  /** Character.id[], 1..N in first-appearance order. `charactersPerSide`
   *  describes the game's simultaneous-character FORMAT and drives UI
   *  affordances — it is not a length cap, and nothing validates it as one. A
   *  tournament set whose player counter-picked lists every character used. */
  characters: string[];
  rank?: string; // present iff the game has ranks
}

export interface Replay {
  /** Stable record key. For most sources this IS the YouTube id, which is why
   *  `videoId` is optional — but a record is not required to be a whole video.
   *  A source that indexes MATCHES inside a longform VOD publishes many records
   *  per video, so their ids must differ from each other and from the video's:
   *  2XKO's Replay Theater intake uses `${videoId}@${startSeconds}`. Treat this
   *  as an opaque string; read `videoId` when you need the YouTube id. */
  id: string;
  sides: [Side, Side];
  date: string; // ISO
  patch?: string; // season / version
  source: string; // channel id
  title: string;
  views?: number;
  thumb?: string;
  /** Video length in seconds (additive, v0.1.0): drives the duration chip and
   *  the "Longest" sort — both hidden when a game's data omits it. */
  durationSec?: number;
  /** The YouTube id, when it differs from `id` (additive, v0.10.0). Every
   *  YouTube-shaped URL the engine builds — embed, watch link, derived
   *  thumbnail — resolves `videoId ?? id`, so a composite-id record keeps
   *  working without its emitter having to publish an explicit `thumb`.
   *  Absent ⇒ `id` is the video id, which is the case for every source that
   *  publishes one record per video. */
  videoId?: string;
  /** Where this record's footage starts inside `videoId`, in seconds
   *  (additive, v0.10.0). Set only when the record is a SEGMENT of a longer
   *  video; absent ⇒ the record is the whole video and playback starts at 0.
   *  Drives the embed's `?start=` and the watch link's `&t=`. It is
   *  deliberately NOT a URL param — see VideoModal. */
  startSeconds?: number;
}

export interface Stats {
  totals: { replays: number; characters: number; players: number };
  [k: string]: unknown; // usage tables, matchup matrix, etc.
}
