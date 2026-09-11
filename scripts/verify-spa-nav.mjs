/**
 * CLIENT-SIDE NAVIGATION GATE — route-to-route nav on the BUILT output, in a
 * real browser, with `experimental.payloadExtraction` off (v0.13.1).
 *
 * Turning payload extraction off removes the per-route `_payload.json` that
 * Nuxt's client router had been fetching on navigation. The risk is narrow and
 * total: if anything still reaches for a payload, it now 404s, and the failure
 * shows up only on a SECOND route — the first page is prerendered HTML and
 * looks perfect either way.
 *
 * Nothing else covered this. The apps' e2e suites reach every route with a full
 * `page.goto` (see tekken scripts/e2e.ts `gotoIdle`), and their `page.click`
 * calls drive in-page filter controls, not route changes — so a broken
 * client-side router would have passed the entire battery.
 *
 * Walks character page -> player page -> back, and asserts the marker planted
 * on `window` survives both hops: if the document reloaded, the router fell
 * back to a full navigation and the SPA contract is broken even though the
 * page still renders.
 *
 * Run:      node scripts/verify-spa-nav.mjs <static dir> [base]
 * Control:  run it against any pre-v0.13.1 output — `no _payload.* requested`
 *           MUST fail there (the preload link fires on first load).
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = process.argv[2];
const BASE = process.argv[3] ?? '';
if (!ROOT) throw new Error('usage: verify-spa-nav.mjs <static dir> [base]');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};

const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let file = join(ROOT, p);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file) && existsSync(`${file}.html`)) file += '.html';
  if (!existsSync(file)) {
    res.writeHead(404);
    return res.end('not found');
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
const origin = await new Promise((r) =>
  server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${server.address().port}`)),
);

let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
};

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await browser.newPage();

const requests = [];
const errors4xx = [];
page.on('request', (r) => requests.push(new URL(r.url()).pathname));
page.on('response', (r) => {
  if (r.status() >= 400) errors4xx.push(`${r.status()} ${new URL(r.url()).pathname}`);
});

// Discover the entity routes rather than hardcoding fixture slugs, so this
// gate runs unchanged against a real game build (`... <static> /ggst`) where
// the roster segment may also be renamed — Tokon files its roster at
// /fighters/, so fall back to whatever the index page actually links to.
let rosterFound = false;
for (const segment of ['/characters', '/fighters']) {
  const res = await page.goto(`${origin}${BASE}${segment}`, { waitUntil: 'networkidle0' });
  if (res && res.status() < 400) {
    rosterFound = true;
    break;
  }
}
check('roster index resolves', rosterFound, rosterFound ? '' : 'neither /characters nor /fighters');
const charHref = await page.$$eval('a[href]', (as) => {
  const a = as.find((x) => /\/(?:characters|fighters)\/[^/]+$/.test(x.getAttribute('href') ?? ''));
  return a ? a.getAttribute('href') : null;
});
check('roster index links to a character', !!charHref, charHref ?? 'none');
if (!charHref) {
  await browser.close();
  server.close();
  process.exit(1);
}

await page.goto(`${origin}${charHref}`, { waitUntil: 'networkidle0' });
const charH1 = await page.$eval('h1', (e) => e.textContent.trim()).catch(() => null);
check('character page rendered', !!charH1, charH1 ?? 'no h1');
await page.evaluate(() => {
  window.__spaMarker = 'alive';
});

const playerHref = await page.$$eval('a[href*="/players/"]', (as) => {
  const a = as.find((x) => /\/players\/[^/]+$/.test(x.getAttribute('href')));
  return a ? a.getAttribute('href') : null;
});
check('character page links to a player', !!playerHref, playerHref ?? 'none');
if (!playerHref) {
  await browser.close();
  server.close();
  process.exit(1);
}

await Promise.all([
  page.waitForFunction(() => location.pathname.includes('/players/'), { timeout: 10_000 }),
  page.click(`a[href="${playerHref}"]`),
]);
await new Promise((r) => setTimeout(r, 500));

const markerForward = await page.evaluate(() => window.__spaMarker);
check(
  'forward nav stayed client-side (document not reloaded)',
  markerForward === 'alive',
  markerForward === 'alive' ? '' : 'marker lost → full document navigation',
);
const playerH1 = await page.$eval('h1', (e) => e.textContent.trim()).catch(() => null);
check('player page rendered after client-side nav', !!playerH1, playerH1 ?? 'no h1');
check(
  'player page carries its replay count',
  (await page.$('[data-testid="player-matches"]')) !== null,
);

await page.goBack({ waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 400));
const backH1 = await page.$eval('h1', (e) => e.textContent.trim()).catch(() => null);
check(
  'back returns to the character page',
  backH1 === charH1,
  backH1 === charH1 ? '' : `got ${backH1}, expected ${charH1}`,
);
const markerBack = await page.evaluate(() => window.__spaMarker);
check(
  'back stayed client-side',
  markerBack === 'alive',
  markerBack === 'alive' ? '' : 'marker lost → full document navigation',
);

// The contract this gate exists for: payload extraction is off, so nothing may
// reach for a payload in EITHER direction.
const payloadReqs = requests.filter((p) => p.includes('_payload'));
check(
  'no _payload.* requested at any point',
  payloadReqs.length === 0,
  payloadReqs.slice(0, 3).join(', ') || 'none',
);

// Scoped by ALLOWLIST, not by path-denylist, so this stays a real gate: what a
// payload/router change can break is documents, JS chunks, CSS, fonts and data
// JSON, and every one of those still fails here. Two classes are deliberately
// out of scope — images, whose availability is data-driven (fixture art is
// intentionally absent, and verify-shell.mjs polices real art on the apex), and
// /_vercel/* analytics scripts, which the Vercel build injects but only
// Vercel's infra serves, so they 404 on any local static server, on every
// build, before and after this change.
const POLICED = /\.(?:js|mjs|css|json|woff2?)$/;
const realFailures = errors4xx.filter((e) => {
  const path = e.slice(e.indexOf(' ') + 1);
  // Analytics is served by infra, never by the static build: Vercel's own
  // /_vercel/* endpoints, and the shell's /<game>-insights/* rewrite that
  // proxies them onto the apex (see replay-database-shell vercel.json). Both
  // 404 against a local static server on every build, before and after this
  // change.
  if (path.startsWith('/_vercel/') || /^\/[a-z0-9-]+-insights\//.test(path)) return false;
  const last = path.split('/').pop() ?? '';
  // extensionless == a document route; those must always resolve
  return POLICED.test(path) || !last.includes('.');
});
check(
  'no 404 for documents, chunks, CSS, fonts or data',
  realFailures.length === 0,
  realFailures.slice(0, 5).join(', ') || 'none',
);

await browser.close();
server.close();
console.log(failed ? `\n✗ ${failed} FAILURE(S)` : '\n✓ CLIENT-SIDE NAVIGATION VERIFIED');
process.exit(failed ? 1 : 0);
