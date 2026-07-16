import type { Replay } from '@engine/types';
import type { FilterState } from './filterReplays';

/**
 * GAME-DEFINED FILTER FACETS (v0.3.0) — the Browse-filter analogue of the
 * game-panel slots: a game registers custom facets from an app plugin and the
 * engine renders them with the standard chip anatomy, wires their URL param
 * into filter state / active chips / Clear all / deep links, and applies the
 * game's predicate inside the pure filter core.
 *
 *   // app/plugins/facets.ts (in the GAME app)
 *   export default defineNuxtPlugin(() => {
 *     provideGameFacets([{
 *       param: 'fuse',                       // public URL contract — old deep
 *       label: 'Fuse · either team',         // links keep working by reusing
 *       note: 'fuse identified for …',       // the shipped param name
 *       chips: [{ id: 'freestyle', label: 'Freestyle', accent: '#FFD24A' }],
 *       matches: (selected, { replay }) => …,// game decides OR/AND internally
 *     }]);
 *   });
 *
 * The predicate context carries the WHOLE FilterState alongside the replay so
 * facets can compose with native facets without further engine changes —
 * e.g. the promised "fuse attaches to the same side as the selected
 * characters" refinement reads ctx.state.characters/coOccurrence and checks
 * side attribution itself; the engine already re-runs predicates whenever any
 * state changes.
 *
 * Module-scope holder like the registry store: facets are constant per app;
 * pure TS so the semantics stay unit-testable (scripts/test-filters.mjs).
 */

export interface GameFacetChip {
  id: string;
  label: string;
  /** accent hex for the chip diamond + active tint (omit for plain chips) */
  accent?: string;
}

export interface GameFacetContext {
  replay: Replay;
  /** the full live filter state — for cross-facet composition */
  state: FilterState;
}

export interface GameFacet {
  /** URL query param — also the facet's identity in state.custom */
  param: string;
  /** facet row label, e.g. 'Fuse · either team' */
  label: string;
  /** optional honesty/annotation line rendered beside the label */
  note?: string;
  /** chips to render, in display order */
  chips: GameFacetChip[];
  /** true ⇒ the replay stays in the result set for this selection */
  matches: (selected: string[], ctx: GameFacetContext) => boolean;
  /** active-chip label for a selected value (defaults to the chip's label) */
  chipLabel?: (value: string) => string;
}

let facets: GameFacet[] = [];

/** Register the game's custom facets (typically from an app plugin).
 *  Replaces the whole list — facets are constant per app. */
export function provideGameFacets(list: GameFacet[]): void {
  facets = list;
}

export function getProvidedGameFacets(): GameFacet[] {
  return facets;
}

/** Test-only: reset between cases. */
export function clearProvidedGameFacets(): void {
  facets = [];
}
