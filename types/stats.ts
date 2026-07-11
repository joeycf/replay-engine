import type { Stats } from './replay';

/**
 * The engine-interpreted stats shape (additive, v0.1.0). `Stats` stays the
 * loose contract (`totals` + open bag); these are the WELL-KNOWN OPTIONAL keys
 * the engine's stats/character/player pages render when a game's pipeline
 * emits them. Everything is optional — panels hide when their data is absent.
 *
 * Conventions:
 * - `pairingUsage` keys are sorted character-id pairs joined with '|'
 *   ("aegis|bolt"); meaningful only when charactersPerSide > 1.
 * - `byPatchUsage` key ORDER is the timeline order (JSON preserves insertion
 *   order) — the pipeline emits patches oldest → newest.
 * - `playerCharacters[player][character]` counts (player × character) side
 *   appearances; ÷ charactersPerSide ≈ replay appearances.
 */
export interface KnownStats extends Stats {
  /** characterId → total side appearances, all time. */
  characterUsage?: Record<string, number>;
  /** patch → characterId → side appearances (keys in timeline order). */
  byPatchUsage?: Record<string, Record<string, number>>;
  /** "a|b" (sorted) → same-side pairing count. Tag games only. */
  pairingUsage?: Record<string, number>;
  /** playerId → characterId → side appearances. */
  playerCharacters?: Record<string, Record<string, number>>;
  /** playerId → "a|b" (sorted) → same-side pairing count. Tag games only. */
  playerPairings?: Record<string, Record<string, number>>;
  totals: Stats['totals'] & {
    /** patch → replay count (keys in timeline order). */
    byPatch?: Record<string, number>;
  };
}
