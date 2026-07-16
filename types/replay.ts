/**
 * The data-collection contract. Each game's pipeline emits these shapes to
 * `public/data/*.json`; the engine fetches them under the base path. A replay
 * has exactly two *sides*; each side is one player plus a *list* of characters
 * whose length equals `GameConfig.charactersPerSide`. Transcribed from PLAN.md §3.
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
  characters: string[]; // Character.id[]; length === charactersPerSide
  rank?: string; // present iff the game has ranks
}

export interface Replay {
  id: string; // youtube id
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
}

export interface Stats {
  totals: { replays: number; characters: number; players: number };
  [k: string]: unknown; // usage tables, matchup matrix, etc.
}
