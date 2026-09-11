/**
 * What a `/dev` page declares about itself, read by the engine's dev index
 * (`app/pages/dev/index.vue`) out of the merged route table.
 *
 * ```ts
 * definePageMeta({
 *   devTool: {
 *     title: 'Fuse review',
 *     category: 'Diagnostic',
 *     description: 'Manual fuse workbench — adjudicate every gap the CV could not settle.',
 *     writes: 'data/overrides.json',
 *     queue: '/api/dev/fuse-review',
 *   },
 * });
 * ```
 *
 * EVERY VALUE MUST BE A PLAIN QUOTED LITERAL. The build extracts them from the
 * AST (`experimental.extraPageMetaExtractionKeys` in the engine's nuxt.config),
 * so a variable, a computed value or even a backtick string drops the key
 * silently — the page still builds and the index just shows less.
 */
export interface DevToolMeta {
  title?: string;
  category?: string;
  description?: string;
  /** The committed JSON the tool writes back to, if it writes at all. */
  writes?: string;
  /**
   * v0.14.0, additive. The dev-only API path whose payload carries a
   * `ReviewCounts` under `counts`, so the index can say how much of this tool's
   * queue is actually open.
   *
   * Absent means the tool has no queue, and the index says nothing about it —
   * which is not the same as saying zero.
   */
  queue?: string;
}
