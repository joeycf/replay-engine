/**
 * Pure-semantics verification of the review-queue partition (v0.14.0). No Nuxt,
 * no nitro, no fixtures — `partitionReviewQueue` is deliberately free of h3 and
 * node:fs so it can be tested as what it is: a function over a list.
 * Run: `npm run test:review`.
 */
import assert from 'node:assert/strict';
import { partitionReviewQueue } from '../server/utils/reviewQueue.ts';

const check = (label, actual, expected) => {
  assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}`);
  console.log(`  ✓ ${label}: ${JSON.stringify(actual)}`);
};

const at = '2026-09-11T00:00:00.000Z';
const rows = [
  { id: 'a', r: 'pending' },
  { id: 'b', r: 'resolved' },
  { id: 'c', r: 'negative' },
  { id: 'd', r: 'pending' },
];
const q = partitionReviewQueue(rows, (x) => x.r, { generatedAt: at });

// ── the partition ──────────────────────────────────────────────────────────
check(
  'open work only in items',
  q.items.map((x) => x.id),
  ['a', 'd'],
);
check(
  'settled work carried in resolved',
  q.resolved.map((x) => x.id),
  ['b', 'c'],
);
check('generatedAt is the artifact stamp, passed through', q.generatedAt, at);

// ── the counts ─────────────────────────────────────────────────────────────
check('counts', q.counts, { total: 4, pending: 2, done: 1, unreadable: 1 });

// A NEGATIVE VERDICT IS NOT A DONE ONE. Folding the two together is how a queue
// that is mostly unreadable passes for a queue that is mostly finished — and the
// detector rot underneath it stays invisible.
check('negative counts apart from done', [q.counts.done, q.counts.unreadable], [1, 1]);
check(
  'negative is off the open list',
  q.items.some((x) => x.id === 'c'),
  false,
);

// ── total is the INPUT length, always ──────────────────────────────────────
// The artifact defines the universe; this function only sorts it. A partition
// that could change the total would be inventing or losing work.
for (const mix of [[], ['pending'], ['resolved', 'negative'], ['pending', 'pending', 'negative']]) {
  const items = mix.map((r, i) => ({ id: `x${i}`, r }));
  const out = partitionReviewQueue(items, (x) => x.r, { generatedAt: at });
  assert.equal(out.counts.total, items.length);
  assert.equal(out.counts.pending + out.counts.done + out.counts.unreadable, items.length);
  assert.equal(out.items.length + out.resolved.length, items.length);
}
console.log('  ✓ total === input length, and the three buckets sum to it (4 mixes)');

// ── the predicate runs exactly once per item ───────────────────────────────
// These predicates read files. Calling one twice is how a partition and its own
// counts come to disagree about the same row.
let calls = 0;
partitionReviewQueue(
  rows,
  (x) => {
    calls++;
    return x.r;
  },
  { generatedAt: at },
);
check('predicate called once per item', calls, rows.length);

// ── the ReviewState form, and includeResolved ──────────────────────────────
const stated = partitionReviewQueue(
  rows,
  (x) => ({ resolution: x.r, reason: x.r === 'negative' ? 'pill occluded' : undefined }),
  { generatedAt: at },
);
check('object form partitions like the bare string', stated.counts, q.counts);

const lean = partitionReviewQueue(rows, (x) => x.r, { generatedAt: at, includeResolved: false });
check('includeResolved:false empties resolved', lean.resolved.length, 0);
check('...but leaves the counts intact', lean.counts, q.counts);
check(
  '...and never touches the open work',
  lean.items.map((x) => x.id),
  ['a', 'd'],
);

console.log('\n✓ review-queue partition verified');
