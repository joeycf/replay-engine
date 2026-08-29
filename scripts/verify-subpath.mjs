/**
 * Subpath-resilience probe (PLAN.md §2.3/§11): with the app served under a
 * base path (NUXT_APP_BASE_URL=/sub/), every data fetch, font asset, image and
 * nav link must resolve UNDER the base — an unwrapped absolute path would
 * escape to the root and 404. Records actual network requests to prove it.
 *
 * Two modes:
 *   node scripts/verify-subpath.mjs [origin] [base]        runtime request probe
 *   node scripts/verify-subpath.mjs --artifacts <dir> [base]   build placement gate
 *
 * The --artifacts mode is the assertion recorded as a follow-up in v0.5.1 (see
 * STACK §10): this script probed a RUNNING app and never looked at where the
 * build actually put things, and that gap is what let the subpath artifacts bug
 * ship. <dir> is a nitro vercel-static output root (`.vercel/output`). See
 * checkArtifacts() for the two contracts it enforces.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
// puppeteer is imported lazily, below the --artifacts early exit: the placement
// gate reads a directory and needs no browser, so it stays runnable with plain
// Node in a repo that carries no puppeteer-core.

/**
 * Build-output placement gate. Under a base, EVERYTHING the build emits lives
 * beneath the base prefix — the vercel-static preset suffixes `publicDir` with
 * the base and nitro writes routes de-based beneath it, so anything landing
 * outside is a space confusion (a route queued in the wrong URL space, or a
 * filesystem path that had the base applied twice).
 *
 *   1. No emitted file sits outside `<static>/<base>` — except `404.html` at
 *      the static root, which is the contract (Vercel's 404 lookup ignores the
 *      base, so static-artifacts deliberately writes it there).
 *   2. Every prerendered-route override in config.json serves a path UNDER the
 *      base. The vercel preset builds that map from the raw route strings, so a
 *      route queued in router space writes `{"path": "stats"}` where the file
 *      really serves at `/<base>/stats` — a root-space serving path for a
 *      base-scoped file. This is the output-side fingerprint of a mixed-space
 *      prerender queue, and it is what fails on v0.6.1.
 */
function checkArtifacts(outputDir, base, check) {
  const staticRoot = resolve(outputDir, 'static');
  const prefix = base.replace(/^\/|\/$/g, '');
  const ROOT_ALLOWED = new Set(['404.html']);

  const walk = (dir) =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : [relative(staticRoot, full)];
    });

  const outside = walk(staticRoot).filter(
    (f) => !f.startsWith(`${prefix}/`) && !ROOT_ALLOWED.has(f),
  );
  check(
    `no build artifact outside /${prefix} (404.html at the static root excepted)`,
    outside.length === 0,
    outside.slice(0, 6).join(', ') || 'none',
  );

  const config = JSON.parse(readFileSync(join(outputDir, 'config.json'), 'utf8'));
  const strays = Object.entries(config.overrides ?? {})
    .filter(([, v]) => v?.path !== undefined && !`/${v.path}`.startsWith(`/${prefix}`))
    .map(([k, v]) => `${k} → /${v.path}`);
  check(
    `every prerendered-route override serves under /${prefix}`,
    strays.length === 0,
    strays.slice(0, 6).join(', ') || 'none',
  );
}

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? `: ${detail}` : ''}`);
};

if (process.argv[2] === '--artifacts') {
  const outputDir = process.argv[3];
  if (!outputDir) throw new Error('usage: verify-subpath.mjs --artifacts <output dir> [base]');
  checkArtifacts(outputDir, process.argv[4] ?? '/sub', check);
  console.log(failed ? `\n✗ ${failed} FAILURE(S)` : '\n✓ SUBPATH ARTIFACT PLACEMENT VERIFIED');
  process.exit(failed ? 1 : 0);
}

const { default: puppeteer } = await import('puppeteer-core');

const ORIGIN = process.argv[2] ?? 'http://localhost:3000';
const BASE = process.argv[3] ?? '/sub';

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const requests = [];
const failures404 = [];
page.on('request', (r) => requests.push(new URL(r.url())));
page.on('response', (r) => {
  if (r.status() === 404) failures404.push(new URL(r.url()).pathname);
});

// Browse with the co-occurrence state active — exercises data fetch + filters.
await page.goto(`${ORIGIN}${BASE}/?characters=aegis,bolt&co=1`, {
  waitUntil: 'networkidle0',
});
await new Promise((r) => setTimeout(r, 600));

const cards = await page.$$eval('article', (els) => els.length);
check('filtered grid renders under base (3 same-side cards)', cards === 3, String(cards));

const local = requests.filter((u) => u.origin === ORIGIN);
const dataReqs = local.filter((u) => u.pathname.includes('/data/'));
const escaped = local.filter(
  (u) =>
    !u.pathname.startsWith(`${BASE}/`) &&
    u.pathname !== `${BASE}` &&
    // vite dev-internal endpoints are exempt (dev-server plumbing, not app URLs)
    !u.pathname.startsWith('/_nuxt') &&
    !u.pathname.startsWith('/@') &&
    !u.pathname.startsWith('/__nuxt'),
);

check(
  `all replay-data fetches under ${BASE}/data/`,
  dataReqs.length > 0 && dataReqs.every((u) => u.pathname.startsWith(`${BASE}/data/`)),
  dataReqs.map((u) => u.pathname).join(', '),
);
check(
  'no app request escaped the base path',
  escaped.length === 0,
  escaped
    .map((u) => u.pathname)
    .slice(0, 5)
    .join(', ') || 'none',
);

// Nav links must be base-prefixed (NuxtLink + router base). Since v0.12.0 the
// nav can also carry PARTNER links, which are absolute by nature — so the check
// splits rather than loosens: every internal href must still be base-prefixed,
// and every absolute one must be a partner origin. A hard-coded absolute
// INTERNAL url — the bug this gate exists to catch — still fails, because it
// would not be on the partner list.
const PARTNER_ORIGINS = ['https://comboforge.gg'];
const hrefs = await page.$$eval('header nav a', (as) => as.map((a) => a.getAttribute('href')));
const absolute = hrefs.filter((h) => /^[a-z]+:/i.test(h));
const internal = hrefs.filter((h) => !/^[a-z]+:/i.test(h));
check(
  `nav links prefixed with ${BASE}`,
  internal.length > 0 &&
    internal.every((h) => h.startsWith(`${BASE}/`) || h === BASE || h === `${BASE}/`),
  internal.join(' '),
);
check(
  'absolute nav links are known partner origins',
  absolute.every((h) => PARTNER_ORIGINS.some((o) => h.startsWith(`${o}/`))),
  absolute.join(' ') || 'none',
);

// Data-driven 404s (fixture art intentionally missing) are fine; data/font 404s are not.
const bad404 = failures404.filter((p) => /\/data\/|woff2/.test(p));
check('no 404s for data or fonts', bad404.length === 0, bad404.join(', ') || 'none');

await browser.close();
console.log(failed ? `\n✗ ${failed} FAILURE(S)` : '\n✓ SUBPATH RESILIENCE VERIFIED');
process.exit(failed ? 1 : 0);
