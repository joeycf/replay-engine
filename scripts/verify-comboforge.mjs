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
 * THE BUDGET: 6 REQUESTS IN ANY 61 SECONDS, ACROSS RUNS. comboforge.gg sits
 * behind a Vercel rate limit of 7 requests per 60 s, and from 2026-11-02 this
 * script was what tripped it: a full run is 9 requests (/api/games plus one
 * roster per game id), and it sent them back to back, then 1 s apart, and was
 * run once per repo in a row. The limiter answers 429 with a challenge, so the
 * live check went dark and five fighters shipped on links nobody had looked
 * at. Told to the owner by ComboForge on 2026-11-06.
 *
 * So every request waits for a slot in a sliding window: at most 6 in any
 * 61 s, one under their limit with a second of margin, which keeps ANY 60 s
 * window they count (sliding or fixed) at 6. The send times are kept in a
 * small file in the OS temp dir, so a second run started straight after the
 * first waits for the first one's window instead of starting a fresh budget.
 * A full run therefore takes about a minute. Do not run two at once.
 *
 * A 429 STOPS THE RUN, with no retry. Under the budget a 429 is never ours to
 * retry: the challenge is still on, or something else on this address spent
 * the minute (a browser on comboforge.gg counts too). The run says UNVERIFIED
 * (exit 2), never "current". And never get past the checkpoint:
 *   - every request names itself (UA below, with a contact), so the owner can
 *     see it and allowlist it;
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
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti } from 'jiti';

const ORIGIN = 'https://comboforge.gg';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Who is asking, and how to reach them. ComboForge may allowlist by this
 *  exact string, so it stays STABLE. */
const UA =
  'ReplayDatabase-ComboForgeVerifier/1.0 (+https://replaydatabase.com; ' +
  'https://github.com/joeycf/replay-engine/blob/main/scripts/verify-comboforge.mjs)';
/** Their limit is 7 per 60 s. Ours is one under it, over a window one second
 *  longer, so no 60 s window of theirs can ever see more than BUDGET. */
const BUDGET = 6;
const WINDOW_MS = 61_000;
/** Never two requests closer than this, inside the budget. */
const MIN_GAP_MS = 2_000;
/** The send log shared by every run on this machine. COMBOFORGE_STATE moves it
 *  (the offline controls use that, so a mock never delays a real run). */
const STATE =
  process.env.COMBOFORGE_STATE || join(tmpdir(), 'replay-database-comboforge-requests.json');

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

/** Send times (epoch ms) inside the current window, this run's and earlier
 *  runs'. An unreadable file reads as empty: it can only make us slower. */
function readSent() {
  try {
    const v = JSON.parse(readFileSync(STATE, 'utf8'));
    return Array.isArray(v) ? v.filter((t) => Number.isFinite(t)) : [];
  } catch {
    return [];
  }
}

/** Wait for a slot, then record the send BEFORE it happens: a request that
 *  fails still spent one of their seven. */
async function takeSlot() {
  for (;;) {
    const now = Date.now();
    const sent = readSent()
      .filter((t) => now - t < WINDOW_MS)
      .sort((a, b) => a - b);
    const last = sent.at(-1);
    const waitGap = last === undefined ? 0 : last + MIN_GAP_MS - now;
    const waitBudget = sent.length >= BUDGET ? sent[sent.length - BUDGET] + WINDOW_MS - now : 0;
    const wait = Math.max(waitGap, waitBudget);
    if (wait <= 0) {
      writeFileSync(STATE, JSON.stringify([...sent, now]));
      return;
    }
    if (wait > MIN_GAP_MS) {
      console.log(
        `  … rate budget: ${sent.length} sent in the last 61 s, waiting ${Math.ceil(wait / 1000)}s`,
      );
    }
    await sleep(wait);
  }
}

const sentThisRun = [];
async function api(path) {
  await takeSlot();
  sentThisRun.push(Date.now());
  const res = await fetch(`${ORIGIN}${path}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  });
  if (res.ok) return res.json();
  const mitigated = res.headers.get('x-vercel-mitigated');
  if (res.status === 429 || mitigated) {
    const asked = retryAfter(res);
    throw new Refused(
      `${path} → HTTP ${res.status}${mitigated ? ` (x-vercel-mitigated: ${mitigated})` : ''}` +
        (asked !== null ? `, Retry-After ${asked}s` : ''),
    );
  }
  throw new Error(`${path} → HTTP ${res.status}`);
}

/** How the run spent the budget, printed at the end of every live run. */
function budgetLine() {
  const t = sentThisRun;
  if (!t.length) return '  0 requests sent';
  let peak = 0;
  for (let i = 0; i < t.length; i++) {
    peak = Math.max(peak, t.filter((x) => x >= t[i] && x < t[i] + 60_000).length);
  }
  const span = Math.round((t.at(-1) - t[0]) / 1000);
  return `  ${t.length} request(s) over ${span}s, at most ${peak} in any 60 s (their limit is 7)`;
}

/** One roster per game id, fetched at most once a run: the fixtures share sf6
 *  with the SF6 repo, and every request is one of their seven. */
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
    console.log(budgetLine());
  } catch (err) {
    if (!(err instanceof Refused)) throw err;
    console.log(
      [
        '',
        `⚠ UNVERIFIED: ${err.message}. Stopped there, no retry.`,
        budgetLine(),
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
