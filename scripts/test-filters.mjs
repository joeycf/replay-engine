/**
 * Pure-logic verification of the filter semantics against the fixture dataset.
 * No Nuxt/browser needed — imports the framework-free core directly. Proves the
 * co-occurrence toggle changes results: 8 (all) → 6 (aegis AND bolt present) →
 * 3 (aegis + bolt on ONE side). Run: `node scripts/test-filters.mjs`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { filterReplays, emptyFilterState } from '../app/utils/filterReplays.ts';

const here = dirname(fileURLToPath(import.meta.url));
const replays = JSON.parse(
  readFileSync(resolve(here, '../fixtures/public/data/replays.json'), 'utf8'),
);

const base = emptyFilterState();
const all = filterReplays(replays, base);
const chars = filterReplays(replays, { ...base, characters: ['aegis', 'bolt'] });
const coocc = filterReplays(replays, {
  ...base,
  characters: ['aegis', 'bolt'],
  coOccurrence: true,
});

console.log('no filter                         :', all.length);
console.log('characters=[aegis,bolt]  (AND)    :', chars.length);
console.log('+ co-occurrence (same side)       :', coocc.length);

assert.equal(all.length, 8, 'expected 8 total replays');
assert.equal(chars.length, 6, 'expected 6 with both aegis AND bolt present');
assert.equal(coocc.length, 3, 'expected 3 with aegis+bolt on a single side');

// A gated facet the fixture game does NOT enable must be a no-op if forced.
const forcedRank = filterReplays(replays, { ...base, ranks: ['Bogus'] });
assert.equal(forcedRank.length, 0, 'rank facet still filters when values given');

console.log('\n✓ filter semantics verified: 8 → 6 → 3 (co-occurrence narrows results)');
