/**
 * Unit test for the featured-player ranking (app/utils/featuredRank.ts).
 *
 * The rule changed in v0.17.0 from "≥ 25 appearances" to "top N% of the
 * unflagged, floored", and the three properties worth pinning are the ones a
 * casual edit would break: the percent is of the UNFLAGGED pool, ties at the
 * cutoff are all in or all out, and zero means "no stats entry" — never a
 * rounding artefact.
 * Run: `npm run test:featured`.
 */
import assert from 'node:assert/strict';
import { rankPlayers, splitFeatured, playerTitles } from '../app/utils/featuredRank.ts';

// A 1,000-player registry whose appearances are 1000, 999, …, 1 — unique, so
// "top 2%" has an exact answer: 20 players, cutoff 981.
const N = 1000;
const players = Array.from({ length: N }, (_, i) => ({
  id: `p${i}`,
  handle: `Player ${String(i).padStart(4, '0')}`,
}));
const pc = Object.fromEntries(players.map((p, i) => [p.id, { ky: N - i }]));

// 1. Top 2% of a 1,000-player unflagged pool is exactly 20, by appearances.
{
  const ranked = rankPlayers(players, pc, 1);
  const { featured, rest, hidden } = splitFeatured(ranked, { autoPercent: 2, minAppearances: 5 });
  assert.equal(featured.length, 20, '2% of 1000 → 20');
  assert.equal(featured[0].appearances, 1000);
  assert.equal(featured[19].appearances, 981, 'cutoff is the 20th appearance count');
  assert.equal(rest.length, 980);
  assert.equal(hidden.length, 0);
  assert.equal(featured.length + rest.length + hidden.length, N, 'partition is total');
  console.log('  ✓ top 2% of 1,000 → 20 players, cutoff 981');
}

// 2. The percent is of the UNFLAGGED pool, and flagged players come first
//    regardless of their appearances.
{
  const flaggedLow = { id: 'legend', handle: 'Legend', featured: true };
  const ranked = rankPlayers([...players, flaggedLow], { ...pc, legend: { ky: 3 } }, 1);
  const { featured } = splitFeatured(ranked, { autoPercent: 2, minAppearances: 5 });
  assert.equal(featured.length, 21, 'flagged + 2% of the 1,000 unflagged');
  assert.equal(featured[0].id, 'legend', 'flagged first even with 3 appearances');
  assert.equal(featured[1].appearances, 1000);
  console.log('  ✓ flagged players sit first and do not consume the percent');
}

// 3. Ties at the cutoff are all included — the set cannot depend on sort order.
{
  const tied = Array.from({ length: 100 }, (_, i) => ({ id: `t${i}`, handle: `T${i}` }));
  // 10 players at 50, the other 90 at 10. 2% → n=2, cutoff=50 → all ten at 50.
  const tpc = Object.fromEntries(tied.map((p, i) => [p.id, { ky: i < 10 ? 50 : 10 }]));
  const { featured, rest } = splitFeatured(rankPlayers(tied, tpc, 1), {
    autoPercent: 2,
    minAppearances: 5,
  });
  assert.equal(featured.length, 10, 'all ten tied at the cutoff are featured');
  assert.ok(featured.every((p) => p.appearances === 50));
  assert.equal(rest.length, 90);
  console.log('  ✓ ties at the cutoff are all in');
}

// 4. The floor wins over a low cutoff: a small game does not feature
//    two-replay names.
{
  const small = Array.from({ length: 50 }, (_, i) => ({ id: `s${i}`, handle: `S${i}` }));
  const spc = Object.fromEntries(small.map((p, i) => [p.id, { ky: i < 1 ? 9 : 2 }]));
  const { featured } = splitFeatured(rankPlayers(small, spc, 1), {
    autoPercent: 10,
    minAppearances: 5,
  });
  assert.equal(featured.length, 1, 'only the 9-appearance player clears the floor');
  assert.equal(featured[0].appearances, 9);
  console.log('  ✓ minAppearances floor beats a low percentile cutoff');
}

// 5. Zero means NO STATS ENTRY. A flagged seed row with no replays is hidden,
//    an unflagged one too; a partially-known 4-per-side player with one
//    character on file is ONE appearance, not zero.
{
  const regs = [
    { id: 'seed', handle: 'Seed', featured: true },
    { id: 'ghost', handle: 'Ghost' },
    { id: 'partial', handle: 'Partial' },
    { id: 'full', handle: 'Full' },
  ];
  const ranked = rankPlayers(regs, { partial: { a: 1 }, full: { a: 8, b: 8, c: 8, d: 8 } }, 4);
  const by = Object.fromEntries(ranked.map((p) => [p.id, p.appearances]));
  assert.equal(by.seed, 0);
  assert.equal(by.ghost, 0);
  assert.equal(by.partial, 1, 'sum 1 ÷ 4 rounds to 0 but any entry means ≥ 1');
  assert.equal(by.full, 8);
  const { featured, rest, hidden } = splitFeatured(ranked, { autoPercent: 2, minAppearances: 5 });
  assert.deepEqual(
    hidden.map((p) => p.id).sort(),
    ['ghost', 'seed'],
    'zero-appearance rows are hidden whether flagged or not',
  );
  // A pool of two: 2% rounds to zero players, so nobody is auto-featured —
  // the percent is the rule, the floor only ever REMOVES people.
  assert.equal(featured.length, 0, 'pool of 2 → n = 0 → no auto-featured');
  assert.deepEqual(
    rest.map((p) => p.id),
    ['full', 'partial'],
  );
  console.log('  ✓ hidden = no stats entry; ÷ perSide never rounds a real player to zero');
}

// 6. Deterministic order: appearances desc, then handle; `rest` likewise.
{
  const regs = [
    { id: 'b', handle: 'Bravo' },
    { id: 'a', handle: 'Alpha' },
    { id: 'c', handle: 'Charlie' },
  ];
  const r1 = rankPlayers(regs, { a: { k: 2 }, b: { k: 2 }, c: { k: 9 } }, 1).map((p) => p.id);
  const r2 = rankPlayers([...regs].reverse(), { a: { k: 2 }, b: { k: 2 }, c: { k: 9 } }, 1).map(
    (p) => p.id,
  );
  assert.deepEqual(r1, ['c', 'a', 'b']);
  assert.deepEqual(r1, r2, 'input order does not leak into output order');
  console.log('  ✓ ranking order is deterministic');
}

// 7. An autoPercent of 0 features only the flagged; 100 features everyone
//    visible above the floor.
{
  const ranked = rankPlayers(players, pc, 1);
  assert.equal(splitFeatured(ranked, { autoPercent: 0, minAppearances: 5 }).featured.length, 0);
  assert.equal(
    splitFeatured(ranked, { autoPercent: 100, minAppearances: 5 }).featured.length,
    N - 4,
    'everyone at ≥ 5 appearances',
  );
  console.log('  ✓ 0% and 100% behave at the edges');
}

// 8. playerTitles reads the well-known bag defensively.
{
  assert.deepEqual(playerTitles(undefined), []);
  assert.deepEqual(playerTitles({ id: 'x', handle: 'X' }), []);
  assert.deepEqual(playerTitles({ id: 'x', handle: 'X', extra: { titles: 'nope' } }), []);
  const t = [{ event: 'Evo 2026', place: 1, date: '2026-08-02' }];
  assert.deepEqual(playerTitles({ id: 'x', handle: 'X', extra: { titles: t } }), t);
  console.log('  ✓ playerTitles tolerates a missing or malformed bag');
}

console.log('test-featured: all assertions passed');
