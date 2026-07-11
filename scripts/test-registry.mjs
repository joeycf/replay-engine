/**
 * Unit test for the registry provisioning store (pure core of PLAN §2.4):
 * provide/normalize/lookup semantics and — critically — the NOT-provided state
 * that makes engine composables fall back to the client fetch.
 * Run: `npm run test:registry`.
 */
import assert from 'node:assert/strict';
import {
  provideRegistries,
  getProvidedCharacters,
  getProvidedPlayers,
  getProvidedStats,
  clearProvidedRegistries,
} from '../app/utils/registryStore.ts';

const characters = [
  { id: 'aegis', name: 'Aegis', imgPortrait: '/img/char/aegis.webp', accent: '#e0563b' },
  { id: 'bolt', name: 'Bolt', imgPortrait: '/img/char/bolt.webp', accent: '#3ba7e9' },
];

// 1. Nothing provided → null across the board (composables take the fetch path).
clearProvidedRegistries();
assert.equal(getProvidedCharacters(), null, 'characters null before provide');
assert.equal(getProvidedPlayers(), null, 'players null before provide');
assert.equal(getProvidedStats(), null, 'stats null before provide');
console.log('  ✓ unprovided state → null (fetch-fallback path)');

// 2. Array form normalizes with working byId.
provideRegistries({ characters });
const chars = getProvidedCharacters();
assert.equal(chars.list.length, 2);
assert.equal(chars.byId.get('bolt').name, 'Bolt');
assert.equal(chars.byId.get('nope'), undefined);
console.log('  ✓ array form normalized (list + byId)');

// 3. Record form (2XKO-style id-keyed) normalizes identically.
provideRegistries({
  players: {
    nomad: { id: 'nomad', handle: 'Nomad', featured: true },
    echo: { id: 'echo', handle: 'Echo' },
  },
});
const players = getProvidedPlayers();
assert.equal(players.list.length, 2);
assert.equal(players.byId.get('nomad').handle, 'Nomad');
console.log('  ✓ record form normalized');

// 4. Partial provides don't clobber other keys; later provides overwrite.
assert.equal(getProvidedCharacters().list.length, 2, 'characters survive player provide');
provideRegistries({ characters: [characters[0]] });
assert.equal(getProvidedCharacters().list.length, 1, 'later provide overwrites');
console.log('  ✓ partial + idempotent semantics');

// 5. Stats pass through untouched.
provideRegistries({ stats: { totals: { replays: 10, characters: 3, players: 4 } } });
assert.equal(getProvidedStats().totals.replays, 10);
console.log('  ✓ stats pass-through');

// 6. Clear restores the fallback state.
clearProvidedRegistries();
assert.equal(getProvidedCharacters(), null);
console.log('  ✓ clear() → fallback state');

console.log('\n✓ registry provisioning semantics verified');
