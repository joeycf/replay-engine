/**
 * PLATFORM FRESHNESS — every game's cron, checked from OUTSIDE every game's job.
 *
 * A game's own "Daily data refresh" can only report the mornings it ran. It cannot
 * report the morning it never started (gbvsr sat `queued` with 0 jobs from 2026-10-07),
 * was held before its commit (Tekken's redirect-drift gate held the data 10-12→10-14),
 * was disabled (a public repo's schedules are switched off after 60 days without
 * repository activity — 2XKO's was, 2026-08-07), or deployed a build that is not the
 * commit. And from 10-12 to 10-14 three other games were red BY DESIGN next to the one
 * run that was holding data, so nothing in the run list told a held archive apart from
 * a chore. This script is the outside view. The engine's platform-freshness.yml runs it
 * nightly, and it asks two questions per game that need no cooperation from the game:
 *
 *   1. did a data commit land in the last 26 hours? The signal is the newest commit
 *      touching data/videos.json — the file EVERY refresh rewrites (234 of 234 bot
 *      commits over 30 days; viewCount churn). Not summary.json, which some bot commits
 *      leave untouched, and not summary.json.updated, which is content-derived.
 *   2. does the served summary.json equal the committed one, on the right base path?
 *      Polled like verify:deployed, compared canonically (keys sorted), and refused at
 *      once when the served `game` is another game's id — the deployment at that path
 *      is not this game (NEW-GAME-CHECKLIST 10h). The id, never the slug: Tekken's
 *      served summary says "tekken8" under /tekken/.
 *
 * Plus: each game's data-refresh.yml must be `active` (the state the 60-day rule
 * changes), and the table of games here must agree with the shell's lib/games.ts — a
 * game promoted in the shell with no row here would otherwise go unwatched.
 *
 * A red means exactly one thing: a game is stale, held, disabled or mis-served (or the
 * table above has fallen out of step with the shell). Everything else — the shell file
 * unreadable, this repo nearing its own 60 idle days — is a ::warning, never a red. A
 * by-design red normalising red is the whole motivation.
 *
 * Never fail-fast: every game is checked and every verdict collected, so one morning's
 * table names every stale game and by how much. The ceiling (26 h) and the slot
 * (22:17 UTC) were measured, not chosen — the workflow file's header has the numbers.
 *
 * Overrides, all optional:
 *   PLATFORM_MAX_AGE_HOURS       26   (0 = positive control: every game reads stale)
 *   PLATFORM_TIMEOUT_SEC         180  served-vs-committed poll deadline
 *   PLATFORM_INTERVAL_SEC        20   poll interval (floored at 1 s)
 *   PLATFORM_ACTIVITY_WARN_DAYS  50   warn when the engine's last push is this old
 *   PLATFORM_SUMMARY_URL_<SLUG>       full served URL for one game (the controls)
 *   PLATFORM_GAMES                    comma list of slugs to poll (debugging, and the
 *                                     controls' API budget); list integrity ALWAYS
 *                                     runs over the full table
 *   GITHUB_TOKEN                      optional; 1,000 req/h instead of 60/h per IP
 *
 * Budget per full run: 1 + 8 × 3 = 25 api.github.com calls (git ls-remote and
 * raw.githubusercontent.com are free), 9 raw GETs, 8–72 served GETs.
 *
 * Run: npm run verify:platform
 *      PLATFORM_MAX_AGE_HOURS=0 npm run verify:platform      (the control — must go red)
 *      PLATFORM_GAMES=2xko,tekken npm run verify:platform    (a subset: 1 + 2 × 3 calls)
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── the games ───────────────────────────────────────────────────────────────
// Restated here on purpose: the shell's lib/games.ts says what is LIVE and UPCOMING,
// this says what is WATCHED, and the list-integrity check below makes the two agree.
// `id` is the app.config id the served summary.json carries (Tekken: tekken8), never
// the slug. Adding a game = adding a row (NEW-GAME-CHECKLIST 10m).
const OWNER = 'joeycf';
const APEX = 'https://replaydatabase.com';
const GAMES = [
  { slug: '2xko', id: '2xko', repo: '2xko-replay-database', host: APEX },
  { slug: 'tekken', id: 'tekken8', repo: 'tekken-replay-database', host: APEX },
  { slug: 'sf6', id: 'sf6', repo: 'sf6-replay-database', host: APEX },
  { slug: 'tokon', id: 'tokon', repo: 'tokon-replay-database', host: APEX },
  { slug: 'ffcotw', id: 'ffcotw', repo: 'ffcotw-replay-database', host: APEX },
  { slug: 'ggst', id: 'ggst', repo: 'ggst-replay-database', host: APEX },
  { slug: 'gbvsr', id: 'gbvsr', repo: 'gbvsr-replay-database', host: APEX },
  { slug: 'avatar', id: 'avatar', repo: 'avatar-replay-database', host: APEX },
];

// ── env ─────────────────────────────────────────────────────────────────────
/**
 * THE EMPTY-STRING TRAP. On scheduled runs, and on a default dispatch,
 * `${{ inputs.max_age_hours }}` is "", so PLATFORM_MAX_AGE_HOURS arrives SET TO AN EMPTY
 * STRING, not unset. Number("") is 0 — the positive-control value — so a naive read
 * turns every scheduled run red, and `|| 26` would break the 0 control instead. Unset or
 * empty → the fallback; anything else must be a finite number ≥ 0, or the run exits 1
 * naming the value BEFORE any network call. Every env wired to an input goes through
 * here.
 */
function numberEnv(name, fallback, unit) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`✖ ${name}="${raw}" is not a number of ${unit}`);
    process.exit(1);
  }
  return n;
}

const MAX_AGE_HOURS = numberEnv('PLATFORM_MAX_AGE_HOURS', 26, 'hours');
const TIMEOUT_SEC = numberEnv('PLATFORM_TIMEOUT_SEC', 180, 'seconds');
const INTERVAL_SEC = numberEnv('PLATFORM_INTERVAL_SEC', 20, 'seconds');
const ACTIVITY_WARN_DAYS = numberEnv('PLATFORM_ACTIVITY_WARN_DAYS', 50, 'days');
// Never a tight loop against the edge: an interval of 0 still waits a second.
const INTERVAL_MS = Math.max(1, INTERVAL_SEC) * 1000;

// PLATFORM_GAMES narrows what is POLLED (unset or empty = every row). The list-integrity
// check always runs over the full table, so a subset cannot hide a missing row.
const wanted = (process.env.PLATFORM_GAMES ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
for (const slug of wanted) {
  if (!GAMES.some((g) => g.slug === slug)) {
    console.error(
      `✖ PLATFORM_GAMES names "${slug}", which has no row (rows: ${GAMES.map((g) => g.slug).join(', ')})`,
    );
    process.exit(1);
  }
}
const polled = wanted.length ? GAMES.filter((g) => wanted.includes(g.slug)) : GAMES;

// ── http ────────────────────────────────────────────────────────────────────
const UA = 'replay-database-platform-freshness';
const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';
const SHELL_GAMES_TS = `${RAW}/${OWNER}/replay-database-shell/main/lib/games.ts`;
const FETCH_TIMEOUT_MS = 15_000;

/** One GET. A thrown network error (DNS, reset, the 15 s timeout) reads as status 0. */
async function get(url, init = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return { status: res.status, text: await res.text(), headers: res.headers };
  } catch (err) {
    return { status: 0, text: '', headers: new Headers(), error: err?.message ?? String(err) };
  }
}
const asJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
const httpLabel = (res) => (res.status ? `HTTP ${res.status}` : `network: ${res.error}`);

// api.github.com: ≥ 1 s between calls, the token when there is one, and on a 401/403
// with the token one retry WITHOUT it (these are public repos; a token scoped to this
// repo may not be honoured on another's Actions endpoints) — unauthenticated from then
// on. The last x-ratelimit-remaining / -reset seen go in the footer.
let token = process.env.GITHUB_TOKEN ?? '';
const hadToken = token !== '';
const rate = { calls: 0, remaining: null, reset: null };
let lastApiCall = 0;

async function apiGet(path, headers) {
  const wait = lastApiCall + 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  lastApiCall = Date.now();
  rate.calls += 1;
  const res = await get(`${API}${path}`, { headers });
  const remaining = res.headers.get('x-ratelimit-remaining');
  const reset = res.headers.get('x-ratelimit-reset');
  if (remaining !== null) rate.remaining = Number(remaining);
  if (reset !== null) rate.reset = Number(reset);
  return res;
}

async function github(path) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': UA };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res = await apiGet(path, headers);
  if (token && (res.status === 401 || res.status === 403)) {
    console.log(
      `  · ${httpLabel(res)} with the token on ${path} — retrying without it, and staying unauthenticated`,
    );
    token = '';
    delete headers.Authorization;
    res = await apiGet(path, headers);
  }
  if (res.status !== 200) return { ok: false, label: `api unreadable (${httpLabel(res)})` };
  const json = asJson(res.text);
  if (json === undefined) return { ok: false, label: 'api unreadable (not JSON)' };
  return { ok: true, json };
}

/** HEAD of main through git, which costs no API quota. */
function headOfMain(repo) {
  try {
    const out = execFileSync(
      'git',
      ['ls-remote', `https://github.com/${OWNER}/${repo}.git`, 'refs/heads/main'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000 },
    );
    return /^([0-9a-f]{40})\t/m.exec(out)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────
/** Recursively key-sorted JSON, so two files that differ only in key order are equal. */
const sortKeys = (v) =>
  Array.isArray(v)
    ? v.map(sortKeys)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sortKeys(v[k])]),
        )
      : v;
const canon = (v) => JSON.stringify(sortKeys(v));
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const hours = (iso) => (Date.now() - Date.parse(iso)) / 3_600_000;
const days = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
const minute = (iso) => (iso ? `${iso.slice(0, 16)}Z` : '—'); // 2026-10-16T11:27Z
const short = (iso) => (iso ? `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z` : '—'); // 10-16 11:27Z
const day = (iso) => (iso ? iso.slice(0, 10) : '—');
const mmdd = (iso) => (iso ? iso.slice(5, 10) : '—');
const hhmm = (epoch) => `${new Date(epoch * 1000).toISOString().slice(11, 16)}Z`;

const warnings = [];
const warn = (text) => {
  warnings.push(text);
  console.log(`::warning title=Platform freshness::${text}`);
};
const ok = (text) => console.log(`  ✓ ${text}`);

// ── per game ────────────────────────────────────────────────────────────────
/**
 * Poll the served summary.json until it equals the committed one, or the deadline.
 * `?_cb=` + no-store + no-cache, as verify:deployed sends them. A served `game` that
 * is not this game's id ends the poll at once: no deploy can make that true.
 */
async function pollServed(game, committed, head7) {
  const base =
    process.env[`PLATFORM_SUMMARY_URL_${game.slug.toUpperCase()}`] ||
    `${game.host}/${game.slug}/data/summary.json`;
  const want = canon(committed);
  const started = Date.now();
  const deadline = started + TIMEOUT_SEC * 1000;
  let polls = 0;
  let last;
  // Polls at started + 0, INTERVAL, 2·INTERVAL, … while that is within the deadline, so
  // the last poll lands AT the deadline (10 polls at the defaults) and a verdict of
  // "differs" or "unreadable" is only ever given after it.
  for (;;) {
    const due = started + polls * INTERVAL_MS;
    if (due > deadline) break;
    const wait = due - Date.now();
    if (wait > 0) await sleep(wait);
    polls += 1;
    const res = await get(`${base}${base.includes('?') ? '&' : '?'}_cb=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache', 'User-Agent': UA },
    });
    const json = res.status === 200 ? asJson(res.text) : undefined;
    last = { res, json };
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (isObject(json)) {
      if (json.game !== game.id) {
        return {
          kind: 'wrong-game',
          served: json,
          cell: `game ${JSON.stringify(json.game)} ≠ ${game.id}`,
          detail: `served summary.json says game ${JSON.stringify(json.game)}, not ${game.id} — the deployment at ${base} is not this game (checklist 10h); not polled further`,
        };
      }
      if (canon(json) === want) {
        const note = `${polls} poll${polls === 1 ? '' : 's'}, ${elapsed} s`;
        return { kind: 'equal', served: json, cell: `equal (${note})`, note };
      }
    }
  }
  const waited = `${TIMEOUT_SEC} s, ${polls} poll${polls === 1 ? '' : 's'}`;
  if (!isObject(last.json)) {
    const why = last.res.status === 200 ? 'not JSON' : httpLabel(last.res);
    return {
      kind: 'unreadable',
      served: null,
      cell: `unreadable (${why})`,
      detail: `served summary.json unreadable (${why}) at the deadline (${waited}) — ${base}`,
    };
  }
  return {
    kind: 'differs',
    served: last.json,
    cell: `DIFFERS after ${waited}`,
    short: `served ≠ committed ${head7}`,
    detail: `served summary.json ≠ committed ${head7} after ${waited} — served updated ${last.json.updated ?? '—'}, committed updated ${committed.updated ?? '—'}`,
  };
}

async function checkGame(game) {
  console.log(`[${game.slug}]`);
  const row = {
    slug: game.slug,
    reds: [], // { cell, short, detail }
    commit: '—',
    age: '—',
    served: '—',
    engine: '— · —',
    refresh: '—',
  };
  const red = (cell, detail, shortText = cell) => {
    const entry = { cell, short: shortText, detail };
    row.reds.push(entry);
    console.log(`  ✗ ${detail}`);
    return entry;
  };

  // 1. HEAD of main — git, no quota.
  const head = headOfMain(game.repo);
  const head7 = head?.slice(0, 7) ?? '—';
  if (!head) red('HEAD of main unreadable', `git ls-remote ${game.repo} refs/heads/main failed`);
  else ok(`HEAD of main ${head7}`);

  // 2. Newest commit touching data/videos.json — the daily signal.
  let stale = null;
  if (head) {
    const r = await github(
      `/repos/${OWNER}/${game.repo}/commits?path=data/videos.json&sha=${head}&per_page=1`,
    );
    const c = r.ok ? r.json[0] : undefined;
    if (!r.ok) red(r.label, `newest data commit: ${r.label}`);
    else if (!c) red('no data commit', `no commit on main touches data/videos.json`);
    else {
      const sha7 = c.sha.slice(0, 7);
      const date = c.commit.committer.date;
      const age = hours(date);
      row.commit = `${sha7} · ${short(date)}`;
      row.age = `${age.toFixed(1)} h`;
      if (age > MAX_AGE_HOURS) {
        const over = age - MAX_AGE_HOURS;
        stale = red(
          `stale by ${over.toFixed(1)} h`,
          `data is ${age.toFixed(1)} h old (ceiling ${MAX_AGE_HOURS} h, over by ${over.toFixed(1)} h) — newest data commit ${sha7} ${minute(date)}`,
          `stale by ${over.toFixed(1)} h (${age.toFixed(1)} h, ceiling ${MAX_AGE_HOURS} h)`,
        );
      } else {
        ok(
          `newest data commit ${sha7} · ${minute(date)} · ${age.toFixed(1)} h old (ceiling ${MAX_AGE_HOURS} h)`,
        );
      }
    }
  }

  // 3 + 4. Committed summary.json at HEAD (SHA-pinned — the `main` URL is cached 300 s),
  //        then the served one, polled until equal.
  if (head) {
    const raw = await get(`${RAW}/${OWNER}/${game.repo}/${head}/data/summary.json`, {
      headers: { 'User-Agent': UA },
    });
    const committed = raw.status === 200 ? asJson(raw.text) : undefined;
    if (!isObject(committed)) {
      const why = raw.status === 200 ? 'not JSON' : httpLabel(raw);
      red(
        `committed summary.json unreadable (${why})`,
        `committed summary.json at ${head7} unreadable (${why})`,
      );
    } else {
      const s = await pollServed(game, committed, head7);
      row.served = s.cell;
      row.engine = `${committed.engine ?? '—'} · ${s.served?.engine ?? '—'}`;
      if (s.kind === 'equal')
        ok(`served summary.json equals committed ${head7} (${s.note}) · engine ${row.engine}`);
      else red(s.cell, s.detail, s.short ?? s.cell);
    }
  }

  // 5. The schedule's state (the 60-day rule's lever), plus the latest run for the log.
  const wf = await github(`/repos/${OWNER}/${game.repo}/actions/workflows/data-refresh.yml`);
  const runs = await github(
    `/repos/${OWNER}/${game.repo}/actions/workflows/data-refresh.yml/runs?per_page=1`,
  );
  const run = runs.ok ? runs.json.workflow_runs?.[0] : undefined;
  let latestRun = runs.label; // the table cell: "success 10-16"
  let latestRunLong = runs.label; // the prose: "success (2026-10-16)"
  if (run) {
    latestRun = `${run.conclusion ?? run.status} ${mmdd(run.created_at)}`;
    latestRunLong = `${run.conclusion ?? run.status} (${day(run.created_at)})`;
  } else if (runs.ok) latestRun = latestRunLong = 'no runs';
  if (stale) stale.detail += `; last "Daily data refresh": ${latestRunLong}`;
  if (!wf.ok) {
    row.refresh = `${wf.label} · ${latestRun}`;
    red(wf.label, `daily refresh state: ${wf.label}`);
  } else {
    row.refresh = `${wf.json.state} · ${latestRun}`;
    if (wf.json.state !== 'active') {
      red(
        `daily refresh ${wf.json.state}`,
        `data-refresh.yml is ${wf.json.state}, not active — re-enable it in the repo's Actions tab; latest run ${latestRunLong}`,
      );
    } else ok(`daily refresh active · latest run ${latestRunLong}`);
  }

  return row;
}

// ── list integrity: the table above vs the shell's lib/games.ts ─────────────
/**
 * One raw GET of the shell's games.ts at main. The `export const GAMES` and
 * `export const UPCOMING` blocks are cut as TEXT (to the next top-level `export`), and
 * every `slug: '<x>'` and `summaryUrl: '/<x>/data/summary.json'` in each is read.
 * Unreadable → a warning, never a red (a network blip must not be a red).
 */
async function listIntegrity() {
  const res = await get(SHELL_GAMES_TS, { headers: { 'User-Agent': UA } });
  if (res.status !== 200) {
    warn(`shell lib/games.ts unreadable (${httpLabel(res)}) — list integrity not checked`);
    return [];
  }
  const block = (name) => {
    const at = res.text.indexOf(`export const ${name}`);
    if (at < 0) return null;
    const rest = res.text.slice(at + `export const ${name}`.length);
    const next = /^export\b/m.exec(rest);
    return next ? rest.slice(0, next.index) : rest;
  };
  const slugsIn = (text) => [...text.matchAll(/\bslug:\s*'([^']+)'/g)].map((m) => m[1]);
  const urlSlugsIn = (text) =>
    [...text.matchAll(/\bsummaryUrl:\s*'\/([^'/]+)\/data\/summary\.json'/g)].map((m) => m[1]);
  const live = block('GAMES');
  const upcoming = block('UPCOMING');
  if (live === null || upcoming === null) {
    warn(
      `shell lib/games.ts has no \`export const ${live === null ? 'GAMES' : 'UPCOMING'}\` block — list integrity not checked (update the extractor)`,
    );
    return [];
  }
  const liveSlugs = slugsIn(live);
  const liveUrls = urlSlugsIn(live);
  const upcomingSlugs = slugsIn(upcoming);
  if (liveUrls.length === 0) {
    warn(
      'shell lib/games.ts: no summaryUrl found in GAMES — list integrity not checked (update the extractor)',
    );
    return [];
  }

  const problems = []; // { slug, text }
  for (const slug of liveUrls) {
    if (!GAMES.some((g) => g.slug === slug))
      problems.push({ slug, text: `shell lists /${slug}/ with no freshness row` });
  }
  for (const g of GAMES) {
    const isLive = liveSlugs.includes(g.slug);
    if (!isLive && !upcomingSlugs.includes(g.slug)) {
      problems.push({
        slug: g.slug,
        text: `${g.slug} is in neither GAMES nor UPCOMING in the shell — removed deliberately? drop the row`,
      });
    }
    if (isLive && g.host !== APEX) {
      problems.push({
        slug: g.slug,
        text: `${g.slug} is live in the shell but checked on ${g.host} — drop the host override`,
      });
    }
  }

  console.log('[list integrity]');
  console.log(
    `  · shell GAMES: ${liveSlugs.join(', ')} · UPCOMING: ${upcomingSlugs.join(', ') || '—'}`,
  );
  if (problems.length === 0)
    ok(`every shell summaryUrl has a row, every row is listed, every live row is on ${APEX}`);
  for (const p of problems) console.log(`  ✗ ${p.text}`);
  return problems;
}

// ── the engine's own 60-day clock ───────────────────────────────────────────
// A public repo's schedules — this one's included — are disabled after 60 days without
// activity. Read FIRST, while the token (if any) is still in play. A warning, never a
// red: a red here must keep its one meaning.
async function enginePushed() {
  const r = await github(`/repos/${OWNER}/replay-engine`);
  if (!r.ok) {
    warn(`replay-engine pushed_at unreadable (${r.label}) — the 60-day idle check did not run`);
    return null;
  }
  const d = days(r.json.pushed_at);
  if (d >= ACTIVITY_WARN_DAYS) {
    warn(
      `replay-engine was last pushed ${d} days ago — GitHub disables this schedule at 60. Land any commit.`,
    );
  }
  return d;
}

/** The cron this checkout schedules, for the footer (absent when run from a copy). */
function scheduledCron() {
  try {
    const yml = readFileSync(join(ROOT, '.github/workflows/platform-freshness.yml'), 'utf8');
    return /^\s*-\s*cron:\s*'([^']+)'/m.exec(yml)?.[1] ?? null;
  } catch {
    return null;
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
console.log(
  `platform freshness — ceiling ${MAX_AGE_HOURS} h · poll ${TIMEOUT_SEC} s every ${INTERVAL_MS / 1000} s · ${polled.length} of ${GAMES.length} games · ${hadToken ? 'GITHUB_TOKEN set' : 'unauthenticated (60 req/h per IP)'}\n`,
);

const pushedDays = await enginePushed();
const rows = [];
for (const game of polled) rows.push(await checkGame(game));
const listProblems = await listIntegrity();

const stamp = `${new Date().toISOString().slice(0, 16).replace('T', ' ')}Z`;
const cron = scheduledCron();
const footer = [
  pushedDays === null
    ? 'Engine pushed: unreadable'
    : `Engine pushed ${pushedDays} day${pushedDays === 1 ? '' : 's'} ago (this schedule${cron ? `, cron '${cron}',` : ''} is disabled at 60)`,
  `${rate.calls} API call${rate.calls === 1 ? '' : 's'}`,
  `${rate.remaining ?? '?'} remaining${rate.reset ? ` (resets ${hhmm(rate.reset)})` : ''}`,
  hadToken
    ? token
      ? 'token'
      : 'token dropped after 401/403 → unauthenticated'
    : 'unauthenticated',
].join(' · ');

const md = [
  `## Platform freshness — ${stamp} · ceiling ${MAX_AGE_HOURS} h`,
  '',
  '| game | newest data commit | age | served summary.json | engine (committed · served) | daily refresh | status |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.slug} | ${r.commit} | ${r.age} | ${r.served} | ${r.engine} | ${r.refresh} | ${
        r.reds.length ? `✗ ${r.reds.map((x) => x.cell).join(' · ')}` : '✓'
      } |`,
  ),
  ...(polled.length < GAMES.length
    ? ['', `Polled ${polled.length} of ${GAMES.length} games (PLATFORM_GAMES=${wanted.join(',')}).`]
    : []),
  ...(listProblems.length ? ['', ...listProblems.map((p) => `- ✗ list integrity: ${p.text}`)] : []),
  ...(warnings.length ? ['', ...warnings.map((w) => `- ⚠ ${w}`)] : []),
  '',
  footer,
];
console.log(`\n${md.join('\n')}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n\n`);
}

const redRows = rows.filter((r) => r.reds.length);
if (redRows.length || listProblems.length) {
  if (redRows.length) {
    console.error(
      `✖ PLATFORM FRESHNESS — ${redRows.length} of ${rows.length} games are not fresh.`,
    );
    for (const r of redRows) {
      console.error(`  ${r.slug.padEnd(8)} ${r.reds.map((x) => x.detail).join('; ')}`);
    }
  }
  if (listProblems.length) {
    console.error(
      `✖ PLATFORM FRESHNESS — the game table disagrees with the shell's lib/games.ts (${listProblems.length}).`,
    );
    for (const p of listProblems) console.error(`  ${p.slug.padEnd(8)} ${p.text}`);
  }
  const named = [
    ...redRows.map((r) => `${r.slug} ${r.reds.map((x) => x.short).join(', ')}`),
    ...listProblems.map((p) => `${p.slug} ${p.text}`),
  ];
  // The annotation names every red game; the exit code is what fails the step.
  console.log(`::error title=Platform freshness::${named.join('; ')}`);
  process.exit(1);
}
console.log(
  `✓ Platform freshness — ${rows.length} of ${rows.length} fresh (ceiling ${MAX_AGE_HOURS} h${
    polled.length < GAMES.length ? `; ${polled.length} of ${GAMES.length} games polled` : ''
  })`,
);
