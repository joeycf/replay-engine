/**
 * COMBOFORGE CROSS-LINK GATE — every character link we emit must land on a real
 * ComboForge page.
 *
 * The character band on /characters/:id deep-links to comboforge.gg, and their
 * ids are not ours: the game id diverges (our 'tokon' is their 'marveltokon')
 * and their character ids are the FULL name kebab-cased ('a-k-i',
 * 'marshall-law', 'alisa-bosconovitch'). GameConfig.comboforge carries that
 * mapping by hand, which means it rots the moment either roster moves — a new
 * character on our side emits a derived id that does not exist over there, and
 * a character they ADD stays pinned to our hub fallback forever. Nothing else
 * would notice; both failures render as a perfectly normal-looking link.
 *
 * So this reads the live rosters and checks all three directions:
 *   1. the configured gameId exists                    (/api/games)
 *   2. every deep link we would emit resolves          (/api/games/<id>/characters)
 *   3. every explicit null is STILL absent upstream    (so gaps get promoted)
 *
 * Network-dependent, so it is NOT wired into typecheck — run it by hand before
 * a release, like verify:override and verify:subpath.
 *
 * Run: node scripts/verify-comboforge.mjs             (engine fixtures + siblings)
 *      node scripts/verify-comboforge.mjs ../sf6-replay-database
 *      node scripts/verify-comboforge.mjs --suggest ../tekken-replay-database
 *      node scripts/verify-comboforge.mjs --suggest --game=tekken8 ../tekken-replay-database
 *
 * --suggest prints a paste-ready `characters` block, matching our characters.json
 * name / extra.aliases / extra['full name'] against their character names. It is
 * a starting point, not an oracle: eyeball what it emits, and note that a local
 * character whose name shares no spelling with theirs (Tekken's bare "Leo" vs
 * their "Leo Kliesen") lands in the null list and needs a hand entry.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const ORIGIN = 'https://comboforge.gg';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const suggest = args.includes('--suggest');
/** --game=<their id> supplies the gameId for a repo that has no block yet, so
 *  --suggest can bootstrap one from nothing. */
const forcedGameId = args.find((a) => a.startsWith('--game='))?.slice('--game='.length);
const paths = args.filter((a) => !a.startsWith('--'));

// ── target discovery ────────────────────────────────────────────────────────
/** A target is a repo dir plus where its app config and characters.json live —
 *  the engine keeps both under fixtures/, a game repo at its root. */
function discover() {
  const parent = join(ROOT, '..');
  const siblings = readdirSync(parent)
    .map((name) => join(parent, name))
    .filter((p) => {
      if (p === ROOT || !existsSync(join(p, 'package.json'))) return false;
      const cfg = join(p, 'nuxt.config.ts');
      return existsSync(cfg) && readFileSync(cfg, 'utf8').includes('replay-engine');
    });
  return [join(ROOT, 'fixtures'), ...siblings];
}

const targets = paths.length
  ? paths.map((p) => (p.startsWith('/') ? p : join(process.cwd(), p)))
  : discover();

// ── upstream rosters (fetched once each, shared across targets) ─────────────
const rosters = new Map();
const jiti = createJiti(import.meta.url, { interopDefault: true });

async function api(path) {
  const res = await fetch(`${ORIGIN}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

async function roster(gameId) {
  if (!rosters.has(gameId)) rosters.set(gameId, await api(`/api/games/${gameId}/characters`));
  return rosters.get(gameId);
}

/** jiti-import an app.config.ts with the defineAppConfig macro shimmed away. */
async function loadGame(dir) {
  const file = join(dir, 'app', 'app.config.ts');
  if (!existsSync(file)) return undefined;
  const g = globalThis;
  const prev = g.defineAppConfig;
  g.defineAppConfig = (c) => c;
  try {
    const mod = await jiti.import(file, { default: true });
    return mod?.game;
  } finally {
    if (prev === undefined) delete g.defineAppConfig;
    else g.defineAppConfig = prev;
  }
}

function localCharacters(dir) {
  const file = join(dir, 'data', 'characters.json');
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(raw) ? raw : (raw.characters ?? []);
}

// ── run ─────────────────────────────────────────────────────────────────────
let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
};

const norm = (s) =>
  String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

console.log(`comboforge cross-link — ${ORIGIN}\n`);

const games = await api('/api/games');
const gameIds = new Set(games.map((g) => g.id));

for (const dir of targets) {
  const game = await loadGame(dir);
  const cf = forcedGameId ? { ...game?.comboforge, gameId: forcedGameId } : game?.comboforge;
  if (!cf?.gameId) {
    if (suggest) console.log(`[${basename(dir)}] no comboforge block — pass --game=<their id>\n`);
    continue;
  }

  console.log(`[${basename(dir)}] → gameId "${cf.gameId}"`);

  if (!gameIds.has(cf.gameId)) {
    check('gameId exists on ComboForge', false, `known ids: ${[...gameIds].join(', ')}`);
    console.log('');
    continue;
  }
  check('gameId exists on ComboForge', true);

  const upstream = await roster(cf.gameId);
  const upstreamIds = new Set(upstream.map((c) => c.id));
  const locals = localCharacters(dir);
  check('local characters.json found', locals.length > 0, `${locals.length} characters`);

  const map = cf.characters ?? {};
  const dead = [];
  const promotable = [];

  for (const c of locals) {
    const suffix = c.id in map ? map[c.id] : c.id.replace(/_/g, '-');
    if (suffix === null) {
      // a null claims "they don't carry this" — verify that is still true
      const found = upstream.find((u) => norm(u.name) === norm(c.name));
      if (found) promotable.push(`${c.id} → ${found.id}`);
      continue;
    }
    if (!upstreamIds.has(`${cf.gameId}-${suffix}`)) dead.push(`${c.id} → ${cf.gameId}-${suffix}`);
  }

  check(
    `every deep link resolves (${locals.length - dead.length - Object.values(map).filter((v) => v === null).length} linked)`,
    dead.length === 0,
    dead.length ? dead.join(', ') : '',
  );
  check(
    'every null is still absent upstream',
    promotable.length === 0,
    promotable.length ? `now on ComboForge, drop the null: ${promotable.join(', ')}` : '',
  );

  if (suggest) {
    const byName = new Map();
    for (const u of upstream) if (!byName.has(norm(u.name))) byName.set(norm(u.name), u.id);
    const lines = [];
    const nulls = [];
    for (const c of locals) {
      const cands = [c.name, ...(c.extra?.aliases ?? []), c.extra?.['full name']].filter(Boolean);
      const hit = cands.map(norm).find((k) => byName.has(k));
      if (!hit) {
        nulls.push(c.id);
        continue;
      }
      const suffix = byName.get(hit).slice(cf.gameId.length + 1);
      if (suffix !== c.id.replace(/_/g, '-')) lines.push(`    ${c.id}: '${suffix}',`);
    }
    console.log('\n  --suggest — paste into app/app.config.ts:\n');
    console.log(`  comboforge: {\n    gameId: '${cf.gameId}',`);
    if (lines.length || nulls.length) {
      console.log('    characters: {');
      for (const l of lines) console.log(`  ${l}`);
      if (nulls.length) {
        console.log('      // no name match upstream — confirm each, then keep as null');
        for (const id of nulls) console.log(`      ${id}: null,`);
      }
      console.log('    },');
    }
    console.log('  },');
  }
  console.log('');
}

console.log(failures ? `✗ ${failures} check(s) failed` : '✓ comboforge cross-link is current');
process.exit(failures ? 1 : 0);
