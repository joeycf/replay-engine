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
import {
  collapsePatchTokens,
  expandPatchTokens,
  parentOfPatchToken,
  patchGroupState,
  patchTokenParts,
  ungroupedPatchTokens,
} from '../app/utils/patchGroups.ts';

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

// ── patchGroups (v0.6.0): expand/collapse URL contract + tri-state ─────────
// Synthetic hierarchy: two parented eras + a childless Beta. The URL carries
// the COLLAPSED canonical form; FilterState.patches carries the EXPANDED
// form (see app/utils/patchGroups.ts header) — collapse expects expanded
// input, so canonicalization checks compose collapse(expand(x)).
const groupsFx = [
  { id: 'S1', children: [{ id: '1.1' }, { id: '1.2' }, { id: '1.3', note: 'DLC' }] },
  { id: 'S2', children: [{ id: '2.1' }, { id: '2.2' }] },
  { id: 'Beta' },
];
const expand = (t) => expandPatchTokens(t, groupsFx);
const collapse = (t) => collapsePatchTokens(t, groupsFx);
const canonical = (t) => collapse(expand(t));

// expansion
assert.deepEqual(expand(['S1']), ['S1', '1.1', '1.2', '1.3'], 'expand: parent brings children');
assert.deepEqual(expand(['Beta']), ['Beta'], 'expand: childless parent is itself');
assert.deepEqual(expand(['2.1', '9.9']), ['2.1', '9.9'], 'expand: child/unknown pass through');
assert.deepEqual(expand(['S1', '1.2']), ['S1', '1.1', '1.2', '1.3'], 'expand: dedupes');
assert.deepEqual(expandPatchTokens(['S1', 'x'], []), ['S1', 'x'], 'expand: no groups = identity');

// collapse canonical form
assert.deepEqual(canonical(['S1']), ['S1'], 'collapse: full era → parent token');
assert.deepEqual(
  canonical(['S1', '1.1']),
  ['S1'],
  'collapse: redundant parent+child link → parent',
);
assert.deepEqual(collapse(['1.1', '1.3']), ['1.1', '1.3'], 'collapse: partial → children only');
assert.deepEqual(
  collapse(['S1', '1.1', '1.3']),
  ['1.1', '1.3'],
  'collapse: stale parent dropped on partial selection',
);
assert.deepEqual(collapse(['S1']), [], 'collapse: bare parent w/ children (last child off) clears');
assert.deepEqual(canonical(['Beta']), ['Beta'], 'collapse: childless parent passes through');
assert.deepEqual(
  canonical(['9.9', 'S2', '1.1']),
  ['1.1', 'S2', '9.9'],
  'collapse: declared group order, passthrough tokens trail',
);
assert.deepEqual(
  collapsePatchTokens(['S1', 'x'], []),
  ['S1', 'x'],
  'collapse: no groups = identity',
);
assert.deepEqual(
  canonical(canonical(['S2', '1.1'])),
  canonical(['S2', '1.1']),
  'canonical idempotent',
);
console.log('  ✓ patchGroups: expand/collapse canonical URL contract');

// tri-state (judged over data-PRESENT children; childless parents are binary)
const present = ['1.1', '1.2', '2.1', 'Beta', 'S1'];
const gs = (sel) => patchGroupState(groupsFx[0], sel, present);
assert.equal(gs([]).state, 'none', 'tri-state none');
assert.equal(gs(['1.1']).state, 'some', 'tri-state some');
assert.deepEqual([gs(['1.1']).selected, gs(['1.1']).total], [1, 2], 'tri-state n/m over present');
assert.equal(gs(['1.1', '1.2']).state, 'all', 'tri-state all (1.3 absent from data)');
assert.equal(
  patchGroupState(groupsFx[2], ['Beta'], present).state,
  'all',
  'childless parent binary on',
);
assert.equal(
  patchGroupState(groupsFx[2], [], present).state,
  'none',
  'childless parent binary off',
);
console.log('  ✓ patchGroups: tri-state none/some/all with present-gating');

// token display helpers
assert.equal(parentOfPatchToken('1.2', groupsFx), 'S1', 'parentOf: child → era');
assert.equal(parentOfPatchToken('S1', groupsFx), null, 'parentOf: parent → null');
assert.deepEqual(patchTokenParts('1.2', groupsFx), ['S1', '1.2'], 'tokenParts: era · patch');
assert.deepEqual(patchTokenParts('Beta', groupsFx), ['Beta'], 'tokenParts: parent bare');
assert.deepEqual(patchTokenParts('9.9', []), ['9.9'], 'tokenParts: no groups = identity');
assert.deepEqual(
  ungroupedPatchTokens(['1.1', '9.9', 'Beta'], groupsFx),
  ['9.9'],
  'ungrouped: only unknown tokens trail',
);
console.log('  ✓ patchGroups: parentOf/tokenParts/ungrouped helpers');

// predicate integration: the UNCHANGED pure core over expanded selections.
// Fine-token replays plus one era-token replay ("season known, patch
// unknown") and the era-mapped view of the same data (the old flat facet).
const mkReplay = (id, patch, date) => ({
  id,
  sides: [
    { player: 'nomad', characters: ['aegis'] },
    { player: 'sage', characters: ['bolt'] },
  ],
  date,
  patch,
  source: 'ch-neon',
  title: `fixture ${id}`,
});
const fineReplays = [
  mkReplay('pg_01', '1.1', '2025-01-10T00:00:00Z'),
  mkReplay('pg_02', '1.1', '2025-01-20T00:00:00Z'),
  mkReplay('pg_03', '1.2', '2025-02-10T00:00:00Z'),
  mkReplay('pg_04', 'S1', '2025-02-20T00:00:00Z'), // era token: patch unknown
  mkReplay('pg_05', '2.1', '2025-03-10T00:00:00Z'),
  mkReplay('pg_06', '2.2', '2025-03-20T00:00:00Z'),
  mkReplay('pg_07', 'Beta', '2024-12-01T00:00:00Z'),
];
const eraOf = (t) => parentOfPatchToken(t, groupsFx) ?? t;
const eraReplays = fineReplays.map((r) => ({ ...r, patch: eraOf(r.patch) }));
const fineCount = (tokens) =>
  filterReplays(fineReplays, { ...emptyFilterState(), patches: expand(tokens) }).length;
const flatEraCount = (tokens) =>
  filterReplays(eraReplays, { ...emptyFilterState(), patches: tokens }).length;

check('grouped: whole-era selection == old flat season count (S1)', fineCount(['S1']), 4);
check('grouped: era parity holds', fineCount(['S1']), flatEraCount(['S1']));
check('grouped: era-token replay matches its whole-era selection', fineCount(['S1']) >= 1, true);
check('grouped: single patch', fineCount(['1.1']), 2);
check('grouped: era-token replay does NOT match a child-only pick', fineCount(['1.2']), 1);
check('grouped: mixed parent + other-era child union', fineCount(['S2', '1.1']), 4);
check('grouped: childless Beta', fineCount(['Beta']), 1);
console.log('  ✓ patchGroups: predicate parity over expanded selections');

console.log('\n✓ filter semantics verified (10-replay fixture dataset)');
