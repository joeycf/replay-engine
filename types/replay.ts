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
  player: string; // Player.id
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
}

export interface Stats {
  totals: { replays: number; characters: number; players: number };
  [k: string]: unknown; // usage tables, matchup matrix, etc.
}
