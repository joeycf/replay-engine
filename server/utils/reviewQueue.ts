import type { ReviewCounts, ReviewQueue, ReviewResolution, ReviewState } from '../../types/review';

/**
 * Split a review worklist into the open work and the settled work.
 *
 * THE ENGINE'S FIRST SERVER FILE. Two rules govern everything under
 * `server/` here, both learned from the seven repos that consume this layer:
 *
 *  1. NO AUTO-IMPORTS. Nitro does scan a layer's `server/utils` (each consuming
 *     app's generated tsconfig.server.json already includes this directory, and
 *     both Nuxt and nitropack carry explicit node_modules carve-outs so a git
 *     layer resolves too) — but an engine helper that silently depends on that
 *     machinery is a helper that breaks on a bundler bump, in seven apps at
 *     once, for reasons nobody can see from the call site. Apps import this by
 *     path: `@engine/server/utils/reviewQueue`.
 *  2. NO ROUTES, AND NOTHING IMPURE. A `server/api/*` file in this layer would
 *     register in all seven apps and enter every production build whether that
 *     game wanted it or not. This module is pure — no h3, no node:fs, no I/O —
 *     so it has no resolution surface to get wrong and can be tested as plain
 *     semantics.
 */
export type ReviewPredicate<T> = (item: T) => ReviewResolution | ReviewState;

export interface PartitionOptions {
  /** the underlying artifact's own stamp — the page's staleness signal */
  generatedAt: string;
  /**
   * carry the settled rows in the payload (default true).
   *
   * `false` keeps the counts and ships an empty `resolved`, for a queue whose
   * settled half is large enough that sending it is the cost rather than the
   * feature.
   */
  includeResolved?: boolean;
}

const stateOf = (r: ReviewResolution | ReviewState): ReviewState =>
  typeof r === 'string' ? { resolution: r } : r;

/**
 * @param items        the artifact's rows — the universe, unchanged
 * @param resolutionOf what the VERDICT STORE says about one row
 *
 * THE PREDICATE MUST READ THE VERDICT STORE, NEVER THE PUBLISHED RECORDS. The
 * published data is rebuilt by a pipeline run, so a verdict written seconds ago
 * is invisible to it and the page goes on offering work that is already done —
 * the failure one app's own source already describes in prose, where a tool
 * "kept offering buttons for work already done" and read as "clicking does
 * nothing" when in fact every click had landed. The file the verdict WRITES is
 * the file the verdict is READ BACK from; that, and only that, is what makes a
 * save clear its row on the next request rather than after the next pipeline run.
 *
 * THIS DOES NOT INVENT OR REMOVE ROWS. The artifact still defines the universe —
 * `counts.total` always equals `items.length` as passed in. A queue FILE that
 * lists work which no longer exists is a different bug with a different fix, and
 * it belongs in the pipeline that writes the file.
 */
export function partitionReviewQueue<T>(
  items: readonly T[],
  resolutionOf: ReviewPredicate<T>,
  options: PartitionOptions,
): ReviewQueue<T> {
  const pending: T[] = [];
  const resolved: T[] = [];
  const counts: ReviewCounts = {
    total: items.length,
    pending: 0,
    done: 0,
    unreadable: 0,
  };

  for (const item of items) {
    // Called exactly ONCE per item. These predicates read files; calling twice
    // is how a partition and its own counts come to disagree.
    const { resolution } = stateOf(resolutionOf(item));
    if (resolution === 'pending') {
      pending.push(item);
      counts.pending++;
      continue;
    }
    resolved.push(item);
    if (resolution === 'negative') counts.unreadable++;
    else counts.done++;
  }

  return {
    generatedAt: options.generatedAt,
    counts,
    items: pending,
    resolved: options.includeResolved === false ? [] : resolved,
  };
}
