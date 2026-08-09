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
 * - THE USAGE UNIT IS PER-GAME AND DECLARED, NOT PLATFORM-WIDE. A 1v1 game
 *   counts SIDE APPEARANCES (a mirror adds 2), which is what the engine's own
 *   fixtures emit and what the "appearances" labels read naturally as. A tag
 *   game on a shared roster — where both sides routinely field the same
 *   character — may instead count a PER-RECORD DEDUPED UNION, answering "how
 *   many replays feature this character"; the sum-of-side-lengths gate would be
 *   wrong there by construction (measured on the shipped tag game: 21,730
 *   against an actual 19,563). Both are correct; they are different questions.
 *   Each game states its unit in its own README and asserts it in emit.
 * - WHICHEVER UNIT A GAME PICKS, IT USES THAT ONE EVERYWHERE. characterUsage,
 *   byPatchUsage and playerCharacters share a denominator so the usage bars,
 *   the per-patch timeline and the player tables agree. Mixing units makes
 *   three panels disagree with no visible symptom.
 */
export interface KnownStats extends Stats {
  /** characterId → total usage, all time, in the game's declared unit. */
  characterUsage?: Record<string, number>;
  /** patch → characterId → usage, same unit (keys in timeline order). */
  byPatchUsage?: Record<string, Record<string, number>>;
  /** "a|b" (sorted) → same-side pairing count. Tag games only. Sides longer
   *  than charactersPerSide are EXCLUDED here (naive C(n,2) fabricates pairs
   *  that were never played) even though they count in characterUsage. */
  pairingUsage?: Record<string, number>;
  /** playerId → characterId → usage, in the same unit as characterUsage. */
  playerCharacters?: Record<string, Record<string, number>>;
  /** playerId → "a|b" (sorted) → same-side pairing count. Tag games only. */
  playerPairings?: Record<string, Record<string, number>>;
  totals: Stats['totals'] & {
    /** patch → replay count (keys in timeline order). */
    byPatch?: Record<string, number>;
  };
}
