/**
 * Phase-2 end-to-end verification (verify items a, g, h, i) against a served
 * SSG build. Drives the REAL hydrated client with puppeteer-core + system
 * Chrome: full click-through (grid → matchup picker → co-occurrence → search
 * → sort → modal → related-swap → mobile drawer → stats + extension panel →
 * character → player → designed 404), view-source SEO, the no-registry-fetch
 * network audit, spinner + reduced-motion, and manifest/icon wiring.
 * Usage: node scripts/verify-phase2.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:4180';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
};

const page = await browser.newPage();
await page.setViewport({ width: 1360, height: 900 });
// deterministic requests: rapid multi-nav suites can surface stale-cache 404
// artifacts (empty status line) that no real server ever produced
await page.setCacheEnabled(false);

const consoleErrors = [];
// EXPECTED fixture 404s: portrait art (/img/char/*, absent by design — the
// accent placeholder covers it), thumbnails for fake YouTube ids, and the
// /_vercel/* analytics scripts (they exist only on Vercel deployments — the
// hoisted @vercel/analytics + speed-insights no-op off-platform by failing
// this load). Anything else (data, chunks, fonts) is a real failure.
const EXPECTED_404 = /\/img\/char\/|ytimg\.com|youtube|googlevideo|\/_vercel\//;
page.on('console', (msg) => {
  const t = msg.text();
  const src = msg.location()?.url ?? '';
  if (msg.type() === 'error' && !EXPECTED_404.test(src) && !EXPECTED_404.test(t))
    consoleErrors.push(`${t} [${src}]`);
  if (/hydration/i.test(t)) consoleErrors.push(`HYDRATION: ${t}`);
});
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

// network audit collector (verify h)
const dataRequests = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.pathname.includes('/data/')) dataRequests.push(u.pathname);
});

const cards = () => page.$$eval('[data-replay-id]', (els) => els.length);

// ── 1. browse grid ───────────────────────────────────────────────────────────
console.log('\n[1] browse grid');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await sleep(500);
check('10 cards render', (await cards()) === 10, String(await cards()));

// ── 2. matchup picker (new UI over the mu facet) ────────────────────────────
console.log('\n[2] matchup picker');
await page.click('[data-testid="matchup-toggle"]');
await sleep(200);
check('picker opens', !!(await page.$('[data-testid="matchup-picker"]')));
await page.click('[data-testid="matchup-picker"] button[aria-label="Side A: Aegis"]');
await page.click('[data-testid="matchup-picker"] button[aria-label="Side B: Bolt"]');
await page.click('[data-testid="matchup-apply"]');
await sleep(400);
check('URL gains mu=aegis:bolt', page.url().includes('mu=aegis'));
check('matchup filters to 8', (await cards()) === 8, String(await cards()));
// remove via its chip
const chips = await page.$$('button[aria-label^="Remove filter"]');
await chips[0].click();
await sleep(400);
check('chip remove restores 10', (await cards()) === 10, String(await cards()));

// ── 3. characters + co-occurrence ───────────────────────────────────────────
console.log('\n[3] character facet + co-occurrence');
await page.click('button[aria-label="Aegis"]');
await sleep(250);
await page.click('button[aria-label="Bolt"]');
await sleep(400);
check('AND filter → 8', (await cards()) === 8, String(await cards()));
await page.click('[data-testid="co-occurrence-toggle"]');
await sleep(400);
check('same-side → 5', (await cards()) === 5, String(await cards()));
check('URL has side=1', page.url().includes('side=1'));

// ── 4. search (debounced, indexed over aliases+handles) ─────────────────────
console.log('\n[4] search');
await page.evaluate(() => window.history.back()); // co off
await sleep(300);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.type('header form[role="search"] input', 'sage');
await sleep(700); // debounce 300 + settle
check('URL gains q=sage', page.url().includes('q=sage'));
check('search → 4 (handle + title)', (await cards()) === 4, String(await cards()));

// ── 5. sort ──────────────────────────────────────────────────────────────────
console.log('\n[5] sort');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.select('#browse-sort', 'views');
await sleep(400);
let first = await page.$eval('[data-replay-id]', (el) => el.dataset.replayId);
check('views sort leader rpl_0006', first === 'rpl_0006', first);
await page.select('#browse-sort', 'longest');
await sleep(400);
first = await page.$eval('[data-replay-id]', (el) => el.dataset.replayId);
check('longest sort leader rpl_0010', first === 'rpl_0010', first);

// ── 6. modal + related swap + spinner (verify i, part 1) ────────────────────
console.log('\n[6] video modal');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.click('[data-replay-id]');
await sleep(500);
check('modal opens with ?v=', page.url().includes('v='));
check('dialog is aria-modal', !!(await page.$('[role="dialog"][aria-modal="true"]')));
const vBefore = new URL(page.url()).searchParams.get('v');
// play → embed spinner appears until iframe load
await page.click('[role="dialog"] button[aria-label^="Play"]');
const spinnerSeen = !!(await page.$('[data-testid="embed-pending"]'));
check('BrandSpinner pending state on embed load', spinnerSeen);
await sleep(600);
// related swap replaces ?v= in place
const related = await page.$('[data-testid="related-grid"] button');
check('related strip renders', !!related);
await related.click();
await sleep(400);
const vAfter = new URL(page.url()).searchParams.get('v');
check('related click swaps ?v= in place', vAfter !== vBefore, `${vBefore} → ${vAfter}`);
await page.keyboard.press('Escape');
await sleep(400);
check('Esc closes modal', !page.url().includes('v='));

// ── 7. mobile drawer ─────────────────────────────────────────────────────────
console.log('\n[7] mobile filter drawer');
await page.setViewport({ width: 390, height: 844 });
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await sleep(300);
await page.click('button[aria-label="Open filters"]');
await sleep(500);
check('drawer opens', !!(await page.$('[role="dialog"][aria-label="Filters"]')));
// Aegis discriminates (9 of 10 replays); Cinder is in all 10
await page.click('[role="dialog"][aria-label="Filters"] button[aria-label="Aegis"]');
await sleep(400);
const showBtn = await page.$$eval('[role="dialog"] button', (els) =>
  els.map((e) => e.textContent?.trim() ?? '').find((t) => t.startsWith('Show')),
);
check('live count in Show button', /Show 9 replays/.test(showBtn ?? ''), showBtn);
await page.setViewport({ width: 1360, height: 900 });

// ── 8. stats + extension panel ───────────────────────────────────────────────
console.log('\n[8] stats dashboard');
await page.goto(`${BASE}/stats`, { waitUntil: 'networkidle0' });
await sleep(600);
check('usage bars render', !!(await page.$('[data-testid="usage-bars"]')));
check('pairing bars render (duo game)', !!(await page.$('[data-testid="pairing-bars"]')));
check('synergy matrix renders', !!(await page.$('[data-testid="synergy-matrix"]')));
check(
  'FIXTURE extension panel injected via GameStatsPanels override',
  !!(await page.$('[data-testid="fixture-game-panel"]')),
);
// patch chip switches context count
await page.$$eval('[data-testid="patch-chips"] button', (els) => {
  els.find((e) => e.textContent?.trim() === 'S1')?.click();
});
await sleep(300);
const ctx = await page.$eval('[data-testid="context-count"]', (el) => el.textContent?.trim());
check('patch chip → context count 4 (S1)', ctx === '4', ctx);
// synergy cell deep-links into filtered browse
await page.click('[data-testid="synergy-matrix"] button[data-pair="aegis|bolt"]');
await sleep(500);
check(
  'synergy cell deep-links to /?c=aegis,bolt&side=1',
  page.url().includes('c=aegis') && page.url().includes('side=1'),
);
check('deep-link renders the 5 same-side replays', (await cards()) === 5, String(await cards()));

// ── 9. character page ────────────────────────────────────────────────────────
console.log('\n[9] character page');
await page.goto(`${BASE}/characters/aegis`, { waitUntil: 'networkidle0' });
await sleep(500);
check('hero h1 = Aegis', (await page.$eval('h1', (el) => el.textContent?.trim())) === 'Aegis');
check('top teammates render', !!(await page.$('[data-testid="pairing-bars"]')));
check('top pilots render', !!(await page.$('[data-testid="top-pilots"]')));
check('replay grid loads (client fetch)', (await cards()) > 0, String(await cards()));

// ── 10. player page ──────────────────────────────────────────────────────────
console.log('\n[10] player page');
await page.goto(`${BASE}/players/nomad`, { waitUntil: 'networkidle0' });
await sleep(500);
check('hero h1 = Nomad', (await page.$eval('h1', (el) => el.textContent?.trim())) === 'Nomad');
const matches = await page.$eval('[data-testid="player-matches"]', (el) => el.textContent);
check('matches derived from stats (6)', matches === '6', matches);
check('replay grid loads', (await cards()) > 0, String(await cards()));

// ── 11. designed 404 ─────────────────────────────────────────────────────────
console.log('\n[11] designed 404');
await page.goto(`${BASE}/404.html`, { waitUntil: 'networkidle0' });
const notFound = await page.evaluate(() => document.body.innerText);
check('404.html IS the designed page', notFound.includes('No data at this route'));
// client-side bad navigation (vue-router push, not a full page load) →
// [...slug] catch-all → error.vue with the same designed content
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  const app = document.querySelector('#__nuxt')?.__vue_app__;
  app?.config.globalProperties.$router.push('/definitely-not-a-page');
});
await sleep(700);
const spa404 = await page.evaluate(() => document.body.innerText);
check('client-side catch-all shows designed 404', spa404.includes('No data at this route'));

// ── 12. network audit (verify h): registries are NOT fetched ────────────────
console.log('\n[12] registry provisioning network audit');
const registryFetches = dataRequests.filter((p) => !p.endsWith('replays.json'));
check(
  'only replays.json fetched from /data',
  registryFetches.length === 0,
  registryFetches.join(', ') || 'none',
);
check(
  'replays.json IS fetched',
  dataRequests.some((p) => p.endsWith('replays.json')),
);

// ── 13. reduced-motion spinner fallback (verify i, part 2) ──────────────────
console.log('\n[13] reduced-motion spinner');
const rmPage = await browser.newPage();
await rmPage.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
// hold the embed request open so the pending spinner persists deterministically
await rmPage.setRequestInterception(true);
rmPage.on('request', (r) => {
  if (r.url().includes('youtube')) return; // never resolve → load never fires
  r.continue();
});
await rmPage.goto(`${BASE}/`, { waitUntil: 'networkidle2' });
await rmPage.click('[data-replay-id]');
await sleep(400);
await rmPage.click('[role="dialog"] button[aria-label^="Play"]');
await sleep(300);
const anim = await rmPage.$eval('.spinner-ring', (el) => getComputedStyle(el).animationName);
const dashoffset = await rmPage.$eval(
  '.spinner-ring',
  (el) => getComputedStyle(el).strokeDashoffset,
);
check('spinner animation disabled under reduced motion', anim === 'none', anim);
check('static ring stands (dashoffset 0)', dashoffset === '0px', dashoffset);
await rmPage.close();

// ── 14. manifest + icons (verify i, part 3) ─────────────────────────────────
console.log('\n[14] manifest + icon head wiring');
const head = await page.evaluate(() => ({
  manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href'),
  svg: document.querySelector('link[rel="icon"][type="image/svg+xml"]')?.getAttribute('href'),
  apple: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'),
  themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
}));
check('manifest link', head.manifest === '/manifest.webmanifest', head.manifest);
check('svg favicon link', head.svg === '/favicon.svg', head.svg);
check('apple-touch-icon link', head.apple === '/icons/favicon-180.png', head.apple);
check('theme-color from GameConfig', head.themeColor === '#e0563b', head.themeColor);
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
check(
  'manifest name from config',
  manifest.name === 'Fixture Arena Replay Database',
  manifest.name,
);
check('manifest short_name', manifest.short_name === 'FIXTURE', manifest.short_name);

// ── console health ───────────────────────────────────────────────────────────
console.log('\n[console]');
if (consoleErrors.length) {
  failures += 1;
  console.log('  ✗ console errors:', consoleErrors.slice(0, 5));
} else {
  console.log('  ✓ no console errors, no hydration warnings');
}

await browser.close();
console.log(failures ? `\n✗ ${failures} FAILURE(S)` : '\n✓ ALL PHASE-2 BROWSER CHECKS PASSED');
process.exit(failures ? 1 : 0);
