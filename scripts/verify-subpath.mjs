/**
 * Subpath-resilience probe (PLAN.md §2.3/§11): with the app served under a
 * base path (NUXT_APP_BASE_URL=/sub/), every data fetch, font asset, image and
 * nav link must resolve UNDER the base — an unwrapped absolute path would
 * escape to the root and 404. Records actual network requests to prove it.
 * Usage: node scripts/verify-subpath.mjs [origin] [base]
 */
import puppeteer from 'puppeteer-core';

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

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}${detail ? `: ${detail}` : ''}`);
};

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

// Nav links must be base-prefixed (NuxtLink + router base).
const hrefs = await page.$$eval('header nav a', (as) => as.map((a) => a.getAttribute('href')));
check(
  `nav links prefixed with ${BASE}`,
  hrefs.length > 0 &&
    hrefs.every((h) => h.startsWith(`${BASE}/`) || h === BASE || h === `${BASE}/`),
  hrefs.join(' '),
);

// Data-driven 404s (fixture art intentionally missing) are fine; data/font 404s are not.
const bad404 = failures404.filter((p) => /\/data\/|woff2/.test(p));
check('no 404s for data or fonts', bad404.length === 0, bad404.join(', ') || 'none');

await browser.close();
console.log(failed ? `\n✗ ${failed} FAILURE(S)` : '\n✓ SUBPATH RESILIENCE VERIFIED');
process.exit(failed ? 1 : 0);
