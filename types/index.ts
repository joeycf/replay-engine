/**
 * The single barrel for the shared data contract. Engine and every consuming
 * game import types from here (via the `@engine/types` alias defined in
 * nuxt.config.ts, which is layer-safe — see PLAN.md §11 on cross-layer aliases).
 */
export type { GameConfig } from './game';
export type { Character, Player, Side, Replay, Stats } from './replay';
