/**
 * Fixture-data pipeline: derives fixtures/data/stats.json from the replay list
 * + registries — the same derivation a real game's pipeline performs, so the
 * fixture stats can never drift from the fixture replays.
 *
 * Modes:
 *   node scripts/fixtures-data.mjs          # (re)generate stats.json
 *   node scripts/fixtures-data.mjs --1v1    # ALSO rewrite replays.json to a
 *     1v1 variant (first character per side + a rank ladder) for the
 *     charactersPerSide:1 / rank-filter verification. Restore with:
 *     git checkout fixtures/public/data/replays.json fixtures/data/stats.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const replaysPath = resolve(root, 'fixtures/public/data/replays.json');
const statsPath = resolve(root, 'fixtures/data/stats.json');

const characters = JSON.parse(readFileSync(resolve(root, 'fixtures/data/characters.json'), 'utf8'));
const players = JSON.parse(readFileSync(resolve(root, 'fixtures/data/players.json'), 'utf8'));
let replays = JSON.parse(readFileSync(replaysPath, 'utf8'));

// ── optional 1v1 variant (verify item b) ────────────────────────────────────
if (process.argv.includes('--1v1')) {
  const LADDER = ['Bronze', 'Silver', 'Gold', 'Master'];
  replays = replays.map((r, i) => ({
    ...r,
    sides: r.sides.map((s, j) => ({
      ...s,
      characters: s.characters.slice(0, 1),
      rank: LADDER[(i + j) % LADDER.length],
    })),
  }));
  writeFileSync(replaysPath, `${JSON.stringify(replays, null, 2)}\n`);
  console.log(`✓ rewrote ${replays.length} replays to the 1v1+rank variant`);
}

// ── stats derivation (patch keys in timeline order = sorted here) ───────────
const patches = [...new Set(replays.map((r) => r.patch).filter(Boolean))].sort();
const inc = (rec, key, by = 1) => (rec[key] = (rec[key] ?? 0) + by);
const pairKey = (list) => [...list].sort().join('|');

const characterUsage = {};
const byPatchUsage = Object.fromEntries(patches.map((p) => [p, {}]));
const pairingUsage = {};
const playerCharacters = {};
const playerPairings = {};
const byPatch = Object.fromEntries(patches.map((p) => [p, 0]));

for (const r of replays) {
  if (r.patch) byPatch[r.patch] += 1;
  for (const side of r.sides) {
    for (const c of side.characters) {
      inc(characterUsage, c);
      if (r.patch) inc(byPatchUsage[r.patch], c);
      playerCharacters[side.player] ??= {};
      inc(playerCharacters[side.player], c);
    }
    if (side.characters.length > 1) {
      const key = pairKey(side.characters);
      inc(pairingUsage, key);
      playerPairings[side.player] ??= {};
      inc(playerPairings[side.player], key);
    }
  }
}

const stats = {
  totals: {
    replays: replays.length,
    characters: characters.length,
    players: players.length,
    byPatch,
  },
  characterUsage,
  byPatchUsage,
  ...(Object.keys(pairingUsage).length ? { pairingUsage, playerPairings } : {}),
  playerCharacters,
};

writeFileSync(statsPath, `${JSON.stringify(stats, null, 2)}\n`);
console.log(
  `✓ fixtures/data/stats.json ← ${replays.length} replays ` +
    `(usage: ${JSON.stringify(characterUsage)}, pairings: ${Object.keys(pairingUsage).length})`,
);
