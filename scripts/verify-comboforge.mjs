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
 * WHEN COMBOFORGE ANSWERS 429. Since 2026-11-02 comboforge.gg puts a Vercel
 * checkpoint in front of these requests, so the live check could not run and
 * five fighters went out on links nobody had looked at. Two answers, and
 * neither is to get past the checkpoint:
 *   - every request names itself (UA below, with a contact) so the owner can
 *     allowlist it, and a 429 is honoured: Retry-After, two retries, then the
 *     run stops and says UNVERIFIED (exit 2), never "current" and never a
 *     hammering loop;
 *   - `--from <file>` asserts the config against a HAND check instead: a person
 *     opened each page in a browser and wrote down what it showed, with the date
 *     and their name. No network at all. scripts/comboforge-verified.json is the
 *     committed record. A hand entry is evidence for the day it was taken, so
 *     the live check supersedes it whenever it can run.
 *
 * Run: node scripts/verify-comboforge.mjs             (engine fixtures + siblings)
 *      node scripts/verify-comboforge.mjs ../sf6-replay-database
 *      node scripts/verify-comboforge.mjs --suggest ../tekken-replay-database
 *      node scripts/verify-comboforge.mjs --suggest --game=tekken8 ../tekken-replay-database
 *      node scripts/verify-comboforge.mjs --from scripts/comboforge-verified.json
 *
 * Exit: 0 current · 1 a check failed · 2 UNVERIFIED (ComboForge refused us).
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

/** Who is asking, and how to reach them. ComboForge allowlists by this string,
 *  so it stays STABLE: change the version only when the request pattern does. */
const UA =
  'ReplayDatabase-ComboForgeVerifier/1.0 (+https://replaydatabase.com; ' +
  'https://github.com/joeycf/replay-engine/blob/main/scripts/verify-comboforge.mjs)';
/** Retries after a 429, and the most we will wait for one Retry-After. */
const RETRIES = 2;
const MAX_WAIT_S = 60;
/** A gap between ordinary requests, so a run never bursts. */
const PAUSE_MS = 1000;

const args = process.argv.slice(2);
const suggest = args.includes('--suggest');
const fromIdx = args.indexOf('--from');
const fromFile = fromIdx >= 0 ? args[fromIdx + 1] : undefined;
if (fromIdx >= 0 && !fromFile) {
  console.error('--from needs a file: --from scripts/comboforge-verified.json');
  process.exit(1);
}
/** --game=<their id> supplies the gameId for a repo that has no block yet, so
 *  --suggest can bootstrap one from nothing. */
const forcedGameId = args.find((a) => a.startsWith('--game='))?.slice('--game='.length);
const paths = args.filter((a, i) => !a.startsWith('--') && !(fromIdx >= 0 && i === fromIdx + 1));

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

/** ComboForge refused the request (429, or its checkpoint) after backing off. */
class Refused extends Error {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seconds a Retry-After asks for (delta or HTTP date), or null. */
function retryAfter(res) {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, n);
  const t = Date.parse(h);
  return Number.isNaN(t) ? null : Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

let requests = 0;
async function api(path) {
  for (let attempt = 0; ; attempt++) {
    if (requests++ > 0) await sleep(PAUSE_MS);
    const res = await fetch(`${ORIGIN}${path}`, {
      headers: { 'user-agent': UA, accept: 'application/json' },
    });
    if (res.ok) return res.json();
    const mitigated = res.headers.get('x-vercel-mitigated');
    if (res.status !== 429 && !mitigated) throw new Error(`${path} → HTTP ${res.status}`);
    // Honour the 429. A CHALLENGE (x-vercel-mitigated: challenge) wants a
    // browser, and no amount of waiting turns a script into one, so it stops on
    // the first answer: one request, not three. A plain rate limit waits for
    // Retry-After (or 15 s, then 45 s) and tries twice more. Either way the run
    // ends by saying UNVERIFIED, never by trying harder.
    const asked = retryAfter(res);
    const what = `HTTP ${res.status}${mitigated ? ` (x-vercel-mitigated: ${mitigated})` : ''}`;
    if (mitigated || attempt >= RETRIES || (asked !== null && asked > MAX_WAIT_S)) {
      throw new Refused(`${path} → ${what} after ${attempt + 1} attempt(s)`);
    }
    const wait = asked ?? 15 * 3 ** attempt; // 15 s, then 45 s
    console.log(`  … ${path} → ${what}; waiting ${wait}s (Retry-After ${asked ?? 'absent'})`);
    await sleep(wait * 1000);
  }
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

/** The href the engine's useComboForge() would emit for one character: a deep
 *  link, or null for the hub fallback. Mirrors app/composables/useComboForge.ts
 *  so the hand check is asserted against what a visitor actually gets. */
function emitted(cf, characterId) {
  const map = cf.characters ?? {};
  const suffix = characterId in map ? map[characterId] : characterId.replace(/_/g, '-');
  if (!suffix) return null;
  const hub = `${ORIGIN}/browse?gameId=${encodeURIComponent(cf.gameId)}`;
  return `${hub}&characterId=${encodeURIComponent(`${cf.gameId}-${suffix}`)}`;
}

// ── --from: a hand check, asserted against the config ───────────────────────
async function fromHand(file) {
  const path = file.startsWith('/') ? file : join(process.cwd(), file);
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  const entries = Array.isArray(doc) ? doc : doc.entries;
  console.log(`comboforge cross-link — HAND CHECK from ${basename(path)} (no network)\n`);
  if (!Array.isArray(entries)) {
    check('the file holds an `entries` array', false, typeof entries);
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  const bad = entries.filter(
    (e) =>
      typeof e?.game !== 'string' ||
      typeof e?.fighter !== 'string' ||
      !(e.url === null || (typeof e.url === 'string' && e.url.startsWith(`${ORIGIN}/`))) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(e.checked ?? '') ||
      e.checked > today ||
      !String(e.by ?? '').trim(),
  );
  check(
    `every entry has game, fighter, url (a ${ORIGIN} URL or null), checked (a past date) and by`,
    bad.length === 0,
    bad.map((e) => `${e?.game}/${e?.fighter}`).join(', '),
  );

  const seen = new Set();
  for (const dir of targets) {
    const game = await loadGame(dir);
    const cf = game?.comboforge;
    if (!cf?.gameId) continue;
    const mine = entries.filter((e) => e?.game === cf.gameId);
    if (!mine.length) continue; // nothing checked by hand for this game
    const locals = localCharacters(dir);
    console.log(`[${basename(dir)}] → gameId "${cf.gameId}"`);
    const localIds = new Set(locals.map((c) => c.id));
    const wrong = [];
    for (const e of mine) {
      seen.add(e);
      if (!localIds.has(e.fighter)) {
        wrong.push(`${e.fighter}: not in characters.json (a stale or mistyped entry)`);
        continue;
      }
      const got = emitted(cf, e.fighter);
      if (got === e.url) continue;
      if (e.url === null) {
        wrong.push(
          `${e.fighter}: config deep-links ${got}, the hand check found no page — set it to null`,
        );
      } else {
        const id = new URL(e.url).searchParams.get('characterId') ?? '?';
        const suffix = id.startsWith(`${cf.gameId}-`) ? id.slice(cf.gameId.length + 1) : id;
        wrong.push(
          `${e.fighter}: config emits ${got ?? 'the hub (null)'}, the hand check found ${e.url} — ` +
            `set characters['${e.fighter}'] to '${suffix}'`,
        );
      }
    }
    check(
      `${mine.length} hand-checked link(s) match what the site emits`,
      wrong.length === 0,
      wrong.join('; '),
    );
    for (const e of mine) {
      console.log(
        `      ${e.fighter.padEnd(18)} ${e.url ?? 'null (hub)'}  — ${e.checked}, ${e.by}`,
      );
    }
    const unchecked = locals.filter((c) => !mine.some((e) => e.fighter === c.id)).length;
    if (unchecked) console.log(`    (${unchecked} other character(s) not in this hand check)`);
    console.log('');
  }
  const orphans = entries.filter((e) => e && !seen.has(e) && typeof e.game === 'string');
  if (!paths.length) {
    check(
      'every entry belongs to a game that has a comboforge block',
      orphans.length === 0,
      orphans.map((e) => `${e.game}/${e.fighter}`).join(', '),
    );
  }
}

// ── the live check ──────────────────────────────────────────────────────────
async function live() {
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
}

if (fromFile) {
  await fromHand(fromFile);
} else {
  try {
    await live();
  } catch (err) {
    if (!(err instanceof Refused)) throw err;
    console.log(
      [
        '',
        `⚠ UNVERIFIED: ${err.message}.`,
        `  ComboForge did not let this run read its rosters, so nothing above is a verdict.`,
        `  Sent as: ${UA}`,
        `  Record a browser check instead: --from scripts/comboforge-verified.json`,
      ].join('\n'),
    );
    process.exit(2);
  }
}

console.log(
  failures
    ? `✗ ${failures} check(s) failed`
    : fromFile
      ? '✓ the config emits what the hand check found (evidence as of each entry date)'
      : '✓ comboforge cross-link is current',
);
process.exit(failures ? 1 : 0);
