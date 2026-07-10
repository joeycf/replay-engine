/**
 * End-to-end browser verification against a running server (dev or static).
 * Drives the REAL hydrated client with puppeteer-core + system Chrome:
 *   1. /health → collection counts + active-config echo
 *   2. browse with characters selected → card count (AND semantics)
 *   3. CLICKS the co-occurrence toggle → count narrows + URL gains co=1
 *   4. clicks again → count restores + co removed (URL-sync round-trip)
 *   5. date-range facet via URL → count changes
 *   6. neutral theme spot-check: computed --color-primary + --font-display
 * Usage: node scripts/verify-browser.mjs [baseUrl]   (default http://localhost:3000)
 */
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const cards = (page) => page.$$eval('article', (els) => els.length);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  const t = msg.text();
  if (msg.type() === 'error' && !t.includes('favicon') && !/404.*(webp|img)/.test(t))
    consoleErrors.push(t);
  if (/hydration/i.test(t)) consoleErrors.push(`HYDRATION: ${t}`);
});
page.on('pageerror', (e) => consoleErrors.push(`PAGEERROR: ${e.message}`));

let failures = 0;
const check = (label, actual, expected) => {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? '  ✓' : '  ✗'} ${label}: ${actual}${ok ? '' : ` (expected ${expected})`}`);
};

// -- 1. /health ---------------------------------------------------------------
console.log('\n[1] /health');
await page.goto(`${BASE}/health`, { waitUntil: 'networkidle0' });
await sleep(400);
const tiles = await page.$$eval('.font-black', (els) =>
  els.map((e) => e.textContent.trim()).filter((t) => /^\d+$/.test(t)),
);
check('replays count', tiles[0], '8');
check('characters count', tiles[1], '3');
check('players count', tiles[2], '4');
check('stats.totals.replays', tiles[3], '8');
const health = await page.evaluate(() => document.body.innerText);
check('config name echoed', health.includes('Fixture Arena'), true);
check('charactersPerSide echoed', /charactersPerSide\s*2/.test(health.replace(/\n/g, ' ')), true);
check(
  'coOccurrence echoed true',
  /filters\.coOccurrence\s*true/.test(health.replace(/\n/g, ' ')),
  true,
);

// -- 2..4. browse + REAL co-occurrence toggle click -----------------------------
console.log('\n[2] browse with ?characters=aegis,bolt (AND across sides)');
await page.goto(`${BASE}/?characters=aegis,bolt`, { waitUntil: 'networkidle0' });
await sleep(400);
check('cards with aegis AND bolt anywhere', await cards(page), 6);

console.log('\n[3] click the co-occurrence toggle (narrows to same-side)');
const toggle = await page.$('button[role="switch"]');
check('co-occurrence toggle rendered (gated ON for this game)', !!toggle, true);
await toggle.click();
await sleep(500);
check('cards after toggle ON (aegis+bolt on ONE side)', await cards(page), 3);
check('URL gained co=1', page.url().includes('co=1'), true);

console.log('\n[4] click again (round-trip back to AND)');
await (await page.$('button[role="switch"]')).click();
await sleep(500);
check('cards after toggle OFF', await cards(page), 6);
check('URL dropped co', page.url().includes('co=1'), false);

// -- 5. date facet ---------------------------------------------------------------
console.log('\n[5] date range via URL (?from=2025-03-01)');
await page.goto(`${BASE}/?from=2025-03-01`, { waitUntil: 'networkidle0' });
await sleep(400);
check('cards dated ≥ 2025-03-01', await cards(page), 6);

// -- 6. neutral theme spot-check ---------------------------------------------------
console.log('\n[6] neutral default theme tokens on :root');
const theme = await page.evaluate(() => {
  const s = getComputedStyle(document.documentElement);
  return {
    primary: s.getPropertyValue('--color-primary').trim(),
    display: s.getPropertyValue('--font-display').trim(),
    accentAegis: s.getPropertyValue('--accent-aegis').trim(),
  };
});
check('--color-primary (neutral blue)', theme.primary, '#6fa8ff');
check(
  '--font-display starts with Space Grotesk',
  theme.display.startsWith('"Space Grotesk"'),
  true,
);
check('--accent-aegis injected from GameConfig.accents', theme.accentAegis, '#e0563b');

// -- console health ---------------------------------------------------------------
console.log('\n[console]');
if (consoleErrors.length) {
  failures += 1;
  console.log('  ✗ console errors:', consoleErrors.slice(0, 5));
} else {
  console.log('  ✓ no console errors, no hydration warnings');
}

await browser.close();
console.log(failures ? `\n✗ ${failures} FAILURE(S)` : '\n✓ ALL BROWSER CHECKS PASSED');
process.exit(failures ? 1 : 0);
