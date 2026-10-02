/**
 * Unit test for the build-time replay index (lib/replay-index.ts, v0.18.0).
 *
 * Pins the three things the sitemap and the prerendered lists depend on: the
 * order is newest-first, `latest*` is the date of each entity's NEWEST record
 * (not its first-seen), and a mirror match lists a character's record once.
 * Run: `npm run test:replay-index`.
 */
import assert from 'node:assert/strict';
import {
  RECENT_LIMIT,
  RECENT_PER_CHARACTER,
  buildReplayIndex,
  slimReplay,
} from '../lib/replay-index.ts';

const replay = (i, { a = 'ky', b = 'sol', pa = 'alice', pb = 'bob', extra = {} } = {}) => ({
  id: `r${i}`,
  sides: [
    { player: pa, characters: [a] },
    { player: pb, characters: [b] },
  ],
  date: `2026-01-${String(i).padStart(2, '0')}T12:00:00Z`,
  source: 'test',
  title: `Replay ${i}`,
  views: i,
  thumb: `https://img/${i}.jpg`,
  ...extra,
});

// 1. Order: newest first, capped at RECENT_LIMIT; a tag side keeps its players.
{
  const list = Array.from({ length: RECENT_LIMIT + 5 }, (_, i) => replay(i + 1));
  const idx = buildReplayIndex(list);
  assert.equal(idx.total, RECENT_LIMIT + 5);
  assert.equal(idx.latest, `2026-01-${RECENT_LIMIT + 5}`);
  assert.equal(idx.recent.length, RECENT_LIMIT);
  assert.equal(idx.recent[0].id, `r${RECENT_LIMIT + 5}`, 'newest first');
  assert.deepEqual(Object.keys(idx.recent[0]).sort(), ['date', 'id', 'sides', 'title']);
  const slim = slimReplay(replay(1, { extra: { patch: '1.2', event: 'Evo' } }));
  assert.equal(slim.patch, '1.2');
  assert.equal(slim.event, 'Evo');
  assert.equal('thumb' in slim, false, 'no thumb on the prerendered record');
}

// 2. latest* is the entity's newest record, and the per-character buckets are
//    capped and newest-first.
{
  const list = [
    replay(1, { a: 'ky', b: 'sol', pa: 'alice', pb: 'bob' }),
    replay(5, { a: 'may', b: 'sol', pa: 'carol', pb: 'bob' }),
    replay(9, { a: 'ky', b: 'may', pa: 'alice', pb: 'carol' }),
  ];
  const idx = buildReplayIndex(list);
  assert.equal(idx.latestByPlayer.alice, '2026-01-09');
  assert.equal(idx.latestByPlayer.bob, '2026-01-05');
  assert.equal(idx.latestByCharacter.sol, '2026-01-05');
  assert.equal(idx.latestByCharacter.may, '2026-01-09');
  assert.deepEqual(
    idx.recentByCharacter.may.map((r) => r.id),
    ['r9', 'r5'],
  );
  const many = Array.from({ length: RECENT_PER_CHARACTER + 3 }, (_, i) => replay(i + 1));
  assert.equal(buildReplayIndex(many).recentByCharacter.ky.length, RECENT_PER_CHARACTER);
}

// 3. A mirror match appears once in the character's bucket; `players[]` wins
//    over `player` on a tag side; an empty file yields an empty index.
{
  const mirror = replay(3, { a: 'ky', b: 'ky' });
  const idx = buildReplayIndex([mirror]);
  assert.equal(idx.recentByCharacter.ky.length, 1);
  const tag = replay(4, { extra: {} });
  tag.sides[0].players = ['alice', 'dave'];
  const slim = slimReplay(tag);
  assert.deepEqual(slim.sides[0].players, ['alice', 'dave']);
  const empty = buildReplayIndex([]);
  assert.equal(empty.total, 0);
  assert.equal(empty.latest, undefined);
  assert.deepEqual(empty.recent, []);
}

console.log('✓ replay-index: order, latest-per-entity, buckets, mirror, empty');
