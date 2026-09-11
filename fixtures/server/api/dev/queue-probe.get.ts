import { partitionReviewQueue } from '@engine/server/utils/reviewQueue';
import type { ReviewState } from '@engine/types';

/**
 * Proves the engine can ship server code at all.
 *
 * `server/utils/reviewQueue.ts` is the first file the engine has ever placed
 * under `server/`, and the whole v0.14.0 review-queue contract rests on a
 * consuming app being able to reach it. Reading the Nuxt and nitropack source
 * says it resolves; this route is the part that actually runs. fixtures/
 * `extends` the engine exactly the way a game does, so a 200 here is the same
 * mechanism a game will use.
 *
 * Dev-only, like every /dev surface in this stack.
 */
export default defineEventHandler(() => {
  if (!import.meta.dev) throw createError({ statusCode: 404 });

  interface Row {
    id: string;
    state: ReviewState['resolution'];
  }
  const rows: Row[] = [
    { id: 'open-1', state: 'pending' },
    { id: 'open-2', state: 'pending' },
    { id: 'done-1', state: 'resolved' },
    { id: 'unreadable-1', state: 'negative' },
  ];

  const queue = partitionReviewQueue(rows, (r) => r.state, {
    generatedAt: new Date().toISOString(),
  });

  // Assert the invariants here rather than trusting a shape at a glance: this
  // endpoint exists to be believed.
  const ok =
    queue.counts.total === rows.length &&
    queue.counts.pending === 2 &&
    queue.counts.done === 1 &&
    queue.counts.unreadable === 1 &&
    queue.items.length === 2 &&
    queue.resolved.length === 2;

  return {
    ok,
    resolution: 'path import via @engine/server/utils/reviewQueue',
    counts: queue.counts,
    items: queue.items.map((r) => r.id),
    resolved: queue.resolved.map((r) => r.id),
  };
});
