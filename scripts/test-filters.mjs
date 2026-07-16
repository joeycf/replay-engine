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
import {
  buildSearchIndex,
  deriveOptions,
  emptyFilterState,
  filterReplays,
  sidePlayers,
} from '../app/utils/filterReplays.ts';

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

// ── Side.players (v0.2.0): a side that is a TEAM of people ─────────────────
// Synthetic replays — duo sides (2XKO duo queue / tournament sets). The
// primary `player` stays players[0]; every listed player must match the
// player facet, land in the search haystack, and appear in derived options.
const duoReplays = [
  {
    id: 'duo_0001',
    sides: [
      { player: 'nomad', players: ['nomad', 'echo'], characters: ['aegis', 'bolt'] },
      { player: 'sage', characters: ['cinder', 'aegis'] },
    ],
    date: '2025-06-01T12:00:00Z',
    patch: 'S2',
    source: 'ch-neon',
    // deliberately name-free: the search check below can only hit via the
    // players[] → handle haystack path, not the title
    title: 'Duo bracket finals — set 3',
  },
  {
    id: 'duo_0002',
    sides: [
      { player: 'pilot', characters: ['bolt', 'cinder'] },
      { player: 'sage', characters: ['aegis', 'bolt'] },
    ],
    date: '2025-06-02T12:00:00Z',
    patch: 'S2',
    source: 'ch-vault',
    title: 'PILOT (Bolt-Cinder) vs SAGE (Aegis-Bolt)',
  },
];
const duoIndex = buildSearchIndex(duoReplays, characters, players);
const duoRun = (patch) =>
  filterReplays(duoReplays, { ...emptyFilterState(), ...patch }, duoIndex).length;

assert.deepEqual(
  sidePlayers(duoReplays[0].sides[0]),
  ['nomad', 'echo'],
  'sidePlayers expands players[]',
);
assert.deepEqual(sidePlayers(duoReplays[0].sides[1]), ['sage'], 'sidePlayers falls back to player');
assert.deepEqual(
  sidePlayers({ player: '', characters: [] }),
  [],
  'sidePlayers: empty player yields no people',
);
check('duo: second player matches player facet', duoRun({ players: ['echo'] }), 1);
check('duo: primary player still matches', duoRun({ players: ['nomad'] }), 1);
check('duo: search hits the second player handle', duoRun({ search: 'echo' }), 1);
assert.ok(deriveOptions(duoReplays).players.includes('echo'), 'deriveOptions lists duo partners');
console.log('  ✓ Side.players: facet/search/options cover every listed player');

// ── game-defined facets (v0.3.0): predicate wiring + state composition ─────
// Facets are injected as the pure core's 4th arg (the useFilters composable
// passes getProvidedGameFacets() the same way).
const sourceFacet = {
  param: 'origin',
  matches: (selected, { replay }) => selected.includes(replay.source),
};
const runFacets = (patch, facets) =>
  filterReplays(replays, { ...base, ...patch }, index, facets).length;

check('game facet: unselected facet is a no-op', runFacets({}, [sourceFacet]), count({}));
check(
  'game facet: predicate filters (origin=ch-neon)',
  runFacets({ custom: { origin: ['ch-neon'] } }, [sourceFacet]),
  count({ sources: ['ch-neon'] }),
);
check(
  'game facet: ANDs with native facets (origin=ch-neon + patch S2)',
  runFacets({ custom: { origin: ['ch-neon'] }, patches: ['S2'] }, [sourceFacet]),
  count({ sources: ['ch-neon'], patches: ['S2'] }),
);
// composition contract: the predicate sees the LIVE FilterState — the future
// "attach to the same side as the selected characters" refinement needs
// ctx.state.characters/coOccurrence available today
const composedFacet = {
  param: 'style',
  matches: (selected, { replay, state }) =>
    selected.includes('with-selected') &&
    replay.sides.some((s) => state.characters.every((c) => s.characters.includes(c))),
};
check(
  'game facet: ctx.state composes with the character selection',
  runFacets({ custom: { style: ['with-selected'] }, characters: ['aegis', 'bolt'] }, [
    composedFacet,
  ]),
  count({ characters: ['aegis', 'bolt'], coOccurrence: true }),
);
assert.deepEqual(emptyFilterState().custom, {}, 'emptyFilterState carries custom: {}');
console.log('  ✓ game facets: no-op/predicate/AND/ctx.state composition');

console.log('\n✓ filter semantics verified (10-replay fixture dataset)');
