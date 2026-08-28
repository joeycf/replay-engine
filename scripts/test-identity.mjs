/**
 * Unit test for the cross-game player spelling table (app/utils/playerIdentity.ts).
 *
 * The two properties worth asserting are the two that make the mechanism safe
 * rather than merely useful: it must never rename anyone, and it must never
 * touch a handle it has not been told about.
 * Run: `npm run test:identity`.
 */
import assert from 'node:assert/strict';
import {
  canonicalPlayerHandle,
  identityKey,
  playerIdentities,
} from '../app/utils/playerIdentity.ts';

// 1. The point of the thing: spellings that differ only in case, spacing or
//    punctuation collapse onto one.
for (const [written, expected] of [
  ['F.Champ', 'FChamp'],
  ['FCHAMP', 'FChamp'],
  ['FChamp', 'FChamp'],
  ['Snake eyez', 'Snake Eyez'],
  ['SNAKEEYEZ', 'Snake Eyez'],
  ['JUSTIN WONG', 'Justin Wong'],
  ['Sonicfox', 'SonicFox'],
  ['K7_Showoff', 'K7 Showoff'],
]) {
  assert.equal(canonicalPlayerHandle(written), expected, `${written} → ${expected}`);
}

// 2. Unverified entries are NEVER applied. These are common words appearing in
//    three or four games and are very likely different people; the honest
//    answer is "no shared spelling", not a guess.
for (const word of ['Mystic', 'Shine', 'Cloud', 'Lucky', 'Justice', 'Shiro', 'Dizzy']) {
  assert.equal(canonicalPlayerHandle(word), undefined, `${word} is left alone`);
}

// 3. An unknown handle passes through.
assert.equal(canonicalPlayerHandle('Nobody At All'), undefined, 'unknown handle untouched');

// 4. THE SAFETY INVARIANT. Every confirmed entry's display must normalise back
//    to its own key, which is what makes a wrong match cosmetic rather than a
//    misattribution: the worst it can do is restyle the same letters. Asserted
//    over the real table so a bad edit fails here rather than shipping.
for (const e of playerIdentities()) {
  assert.equal(
    identityKey(e.display),
    e.key,
    `entry '${e.key}' must restyle its own letters, got '${e.display}'`,
  );
}

// 5. Keys are unique — two entries for one key would make the winner depend on
//    array order.
const keys = playerIdentities().map((e) => e.key);
assert.equal(new Set(keys).size, keys.length, 'identity keys are unique');

// 6. identityKey survives a non-Latin handle rather than collapsing every one
//    of them to the same empty string.
assert.notEqual(identityKey('シルクちゃん'), '', 'non-Latin handle keys to something');
assert.notEqual(identityKey('シルクちゃん'), identityKey('ソニック'), 'and to something distinct');

console.log(
  `\n✓ player identity verified (${playerIdentities().length} entries, ` +
    `${playerIdentities().filter((e) => e.status === 'confirmed').length} applied)`,
);
