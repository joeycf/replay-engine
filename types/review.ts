/**
 * The review-queue contract (v0.14.0).
 *
 * Every game's `/dev` curation tool answers the same question — "what is still
 * work?" — and every one of them got it wrong the same way: the route computed a
 * done/saved/applied flag and returned the row anyway, leaving the page to
 * restyle finished work rather than drop it. Measured across two apps on the day
 * this landed: 132 of 132 rows in one queue already labelled, 63 of 63 in
 * another, 353 of 353 in a review sheet. A queue that hands back settled work
 * costs review time on every pass and hides the real backlog inside itself.
 *
 * So the vocabulary lives here, in the engine, and each app's routes conform.
 */

/**
 * What a queue's own verdict store says about one item.
 *
 * `negative` is FIRST-CLASS, and is the reason this type is not a boolean. A
 * human who looked and could not read the thing has produced a finding, not a
 * blank — and the only way that finding stops the item reappearing forever is if
 * the vocabulary can say it. Before this existed the two available answers were
 * "has a verdict" and "does not", so "I looked; it is genuinely unreadable" was
 * recorded as the latter and came back every single run.
 *
 * Distinct from exclusion, which the apps already express in their own override
 * files: excluded means "not a match", `negative` means "a match I cannot read".
 */
export type ReviewResolution = 'pending' | 'resolved' | 'negative';

export interface ReviewState {
  resolution: ReviewResolution;
  /** why it is off the queue — surfaced in the resolved view, never inferred */
  reason?: string;
  /** ISO stamp, when the verdict store carries one */
  at?: string;
}

export interface ReviewCounts {
  total: number;
  pending: number;
  /** settled by a positive verdict */
  done: number;
  /**
   * settled by a NEGATIVE verdict.
   *
   * Counted apart from `done` on purpose. A queue that is 90% unreadable is a
   * detector problem wearing the costume of a finished backlog, and folding the
   * two together is exactly how that stays invisible.
   */
  unreadable: number;
}

/**
 * The payload shape a `/api/dev/*` worklist route returns from v0.14.0 on.
 *
 * `items` KEEPS ITS NAME AND ITEM SHAPE — every existing page reads `items`, and
 * this contract is about what belongs in it, not about renaming things. It now
 * holds the open work only.
 */
export interface ReviewQueue<T> {
  generatedAt: string;
  counts: ReviewCounts;
  /** the open work */
  items: T[];
  /**
   * the settled rows, same item shape.
   *
   * Carried rather than dropped: re-checking a past verdict is real work, and a
   * tool that scores itself against its own history needs to see it. What was
   * wrong was making them the DEFAULT VIEW, not their existence.
   */
  resolved: T[];
}
