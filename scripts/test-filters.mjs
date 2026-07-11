/**
 * Pure-logic verification of the filter semantics against the fixture dataset
 * (10 replays / 3 characters / 4 players). No Nuxt/browser — imports the
 * framework-free core directly. Golden values hand-verified against the
 * dataset AND cross-checked against the derived stats (e.g. the same-side
 * count equals stats.pairingUsage["aegis|bolt"]).
 * Run: `npm run test:filters`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildSearchIndex, emptyFilterState, filterReplays } from '../app/utils/filterReplays.ts';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(resolve(here, '..', p), 'utf8'));
const replays = read('fixtures/public/data/replays.json');
const characters = read('fixtures/data/characters.json');
const players = read('fixtures/data/players.json');
const stats = read('fixtures/data/stats.json');

const base = emptyFilterState();
const index = buildSearchIndex(replays, characters, players);
const run = (patch) => filterReplays(replays, { ...base, ...patch }, index);
const count = (patch) => run(patch).length;

const check = (label, actual, expected) => {
  assert.equal(actual, expected, `${label}: got ${actual}, expected ${expected}`);
  console.log(`  ✓ ${label}: ${actual}`);
};

// ── characters: AND across sides; co-occurrence tightens to one side ───────
check('no filter', count({}), 10);
check('characters [aegis,bolt] (AND)', count({ characters: ['aegis', 'bolt'] }), 8);
check(
  'co-occurrence narrows to same side',
  count({ characters: ['aegis', 'bolt'], coOccurrence: true }),
  5,
);
check('co-occurrence == stats.pairingUsage consistency', stats.pairingUsage['aegis|bolt'], 5);
check(
  'co-occurrence ignored with a single selection',
  count({ characters: ['aegis'], coOccurrence: true }),
  count({ characters: ['aegis'] }),
);

// ── matchup: the pair on OPPOSING sides, order-agnostic ─────────────────────
check('matchup aegis:bolt', count({ matchup: ['aegis', 'bolt'] }), 8);
check(
  'matchup is order-agnostic',
  count({ matchup: ['bolt', 'aegis'] }),
  count({ matchup: ['aegis', 'bolt'] }),
);

// ── players: OR (ported behavior — chips widen) ─────────────────────────────
check('players OR [nomad,sage]', count({ players: ['nomad', 'sage'] }), 9);

// ── single-valued facets: OR within facet ───────────────────────────────────
check('source ch-neon', count({ sources: ['ch-neon'] }), 5);
check('patch S2', count({ patches: ['S2'] }), 6);
check('patch S1 OR S2', count({ patches: ['S1', 'S2'] }), 10);

// ── date range (inclusive) ──────────────────────────────────────────────────
check('from 2025-05-01', count({ dateFrom: '2025-05-01' }), 5);
check('to 2025-02-28', count({ dateTo: '2025-02-28' }), 2);

// ── search: title + handles + character names/aliases, tokenized AND ───────
check('alias search "zap" (Bolt)', count({ search: 'zap' }), 9);
check('multi-token "echo mirror"', count({ search: 'echo mirror' }), 1);
check('handle search "pilot"', count({ search: 'pilot' }), 5);
check('no match', count({ search: 'xyzzy' }), 0);

// ── sort ────────────────────────────────────────────────────────────────────
assert.equal(run({ sort: 'views' })[0].id, 'rpl_0006', 'views sort leader');
assert.equal(run({ sort: 'longest' })[0].id, 'rpl_0010', 'longest sort leader');
assert.equal(run({ sort: 'oldest' })[0].id, 'rpl_0001', 'oldest sort leader');
assert.equal(run({})[0].id, 'rpl_0010', 'newest default sort leader');
console.log('  ✓ sort: views/longest/oldest/newest leaders correct');

// ── AND across facets ───────────────────────────────────────────────────────
check(
  'facets combine with AND (S2 + ch-vault)',
  count({ patches: ['S2'], sources: ['ch-vault'] }),
  4,
);

console.log('\n✓ filter semantics verified (10-replay fixture dataset)');
