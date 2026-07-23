/**
 * PATCH-GROUPS UI GATE (GameConfig.patchGroups, v0.6.0) — built bundle.
 *
 * The default fixtures stay UNGROUPED (their untouched test-filters +
 * verify-phase2 runs are the byte-stability evidence for non-declaring apps).
 * This gate overlays the fixtures — app.config gains patchGroups, replays get
 * child/era/unknown tokens (verify-override.mjs file-swap model, restored in
 * `finally`) — generates, and click-drives the grouped facet: legacy parent
 * deep links, whole-era parent toggle, expander dropdown, child toggles with
 * canonical URL collapse, tri-state aria, ActiveChips pills, modal
 * "era · patch" meta, era-compact cards, drawer sections, clear-all.
 *
 * Overlay token map (from the 10 fixture replays, in file order):
 *   S1 (4): 1.1 / 1.2 / S1 (era token — "patch unknown") / 1.1
 *   S2 (6): 2.1 / 2.2 / 2.1 / 2.2 / 2.1 / 9.9 (unknown → trailing chip)
 * So: ?patch=S1 → 4 · ?patch=1.1 → 2 · ?patch=1.2 → 1 · ?patch=S2 → 5
 *     ?patch=2.1 → 3 · ?patch=2.2 → 2 · ?patch=9.9 → 1
 *
 * Run: node scripts/verify-patch-groups.mjs   (one fixture build, ~min)
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP_CONFIG = join(ROOT, 'fixtures/app/app.config.ts');
const REPLAYS = join(ROOT, 'fixtures/public/data/replays.json');
const OUT = join(ROOT, 'fixtures/.vercel/output/static');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.ico': 'image/x-icon',
};

const GROUPS_SNIPPET = `    patchGroups: [
      { id: 'S1', children: [{ id: '1.1' }, { id: '1.2', note: 'DLC drop' }] },
      { id: 'S2', children: [{ id: '2.1' }, { id: '2.2' }] },
    ],
`;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const originalConfig = readFileSync(APP_CONFIG, 'utf8');
const originalReplays = readFileSync(REPLAYS, 'utf8');
const ANCHOR = '  } satisfies GameConfig,';
if (!originalConfig.includes(ANCHOR)) {
  console.error('✗ fixtures/app/app.config.ts anchor not found — update this script');
  process.exit(1);
}

// overlay: retokenize per-era in file order (see header map)
const S1_TOKENS = ['1.1', '1.2', 'S1', '1.1'];
const S2_TOKENS = ['2.1', '2.2', '2.1', '2.2', '2.1', '9.9'];
const replays = JSON.parse(originalReplays);
let i1 = 0;
let i2 = 0;
for (const r of replays) {
  if (r.patch === 'S1') r.patch = S1_TOKENS[i1++] ?? '1.1';
  else if (r.patch === 'S2') r.patch = S2_TOKENS[i2++] ?? '2.1';
}

try {
  writeFileSync(APP_CONFIG, originalConfig.replace(ANCHOR, GROUPS_SNIPPET + ANCHOR));
  writeFileSync(REPLAYS, JSON.stringify(replays, null, 2) + '\n');
  console.log('  … nuxt generate fixtures (patchGroups overlay)');
  execSync('npx nuxt generate fixtures', { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });

  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const candidates = [join(OUT, path), join(OUT, path, 'index.html'), join(OUT, '404.html')];
    for (const file of candidates) {
      if (existsSync(file) && extname(file)) {
        res.writeHead(file.endsWith('404.html') ? 404 : 200, {
          'content-type': MIME[extname(file)] ?? 'application/octet-stream',
        });
        res.end(readFileSync(file));
        return;
      }
    }
    res.writeHead(404).end();
  });
  const BASE = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900 });
  await page.setCacheEnabled(false);
  const cards = () => page.$$eval('[data-replay-id]', (els) => els.length);
  const aria = (sel) => page.$eval(sel, (el) => el.getAttribute('aria-pressed'));
  const pillLabels = () =>
    page.$$eval('button[aria-label^="Remove filter"]', (els) =>
      els.map((e) => e.textContent?.replace('✕', '').trim()),
    );

  console.log('\n[1] grouped chip row renders');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(500);
  check('parent chips render', !!(await page.$('[data-testid="patch-group-S1"]')));
  check(
    'unknown token renders as a trailing plain chip',
    await page.$$eval('button', (els) => els.some((e) => e.textContent?.trim() === '9.9')),
  );

  console.log('\n[2] legacy parent deep link');
  await page.goto(`${BASE}/?patch=S1`, { waitUntil: 'networkidle0' });
  await sleep(500);
  check('?patch=S1 → 4 (incl. the era-token replay)', (await cards()) === 4, String(await cards()));
  check('parent aria-pressed=true', (await aria('[data-testid="patch-group-S1"]')) === 'true');

  console.log('\n[3] parent toggle = whole era');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(400);
  await page.click('[data-testid="patch-group-S2"]');
  await sleep(400);
  check('URL collapses to patch=S2', page.url().includes('patch=S2'));
  check('era count 5', (await cards()) === 5, String(await cards()));

  console.log('\n[4] expander + child toggle → canonical partial URL');
  await page.click('[data-testid="patch-group-S2-expander"]');
  await sleep(250);
  check('dropdown opens', !!(await page.$('[data-testid="patch-group-menu"]')));
  await page.click('[data-testid="patch-child-2.1"]');
  await sleep(400);
  check('URL lists children only (patch=2.2)', new URL(page.url()).searchParams.get('patch') === '2.2');
  check('partial count 2', (await cards()) === 2, String(await cards()));
  check('parent aria-pressed=mixed', (await aria('[data-testid="patch-group-S2"]')) === 'mixed');
  check(
    'parent shows n/m count',
    await page.$eval('[data-testid="patch-group-S2"]', (el) => /1\/2/.test(el.textContent ?? '')),
  );
  check('child pill in ActiveChips, no parent pill', (await pillLabels()).join(',') === '2.2');

  console.log('\n[5] re-completing the era collapses back to the parent token');
  await page.click('[data-testid="patch-child-2.1"]');
  await sleep(400);
  check('URL back to patch=S2', new URL(page.url()).searchParams.get('patch') === 'S2');
  check('one parent pill', (await pillLabels()).join(',') === 'S2');
  check('parent aria-pressed=true', (await aria('[data-testid="patch-group-S2"]')) === 'true');

  console.log('\n[6] mixed + redundant token URLs');
  await page.goto(`${BASE}/?patch=S1,2.1`, { waitUntil: 'networkidle0' });
  await sleep(500);
  check('mixed parent+child → 7', (await cards()) === 7, String(await cards()));
  check('S1 true / S2 mixed', (await aria('[data-testid="patch-group-S1"]')) === 'true' && (await aria('[data-testid="patch-group-S2"]')) === 'mixed');
  await page.goto(`${BASE}/?patch=S2,2.1`, { waitUntil: 'networkidle0' });
  await sleep(500);
  check('redundant parent+child link → era count 5', (await cards()) === 5, String(await cards()));

  console.log('\n[7] modal era·patch meta + era-compact cards');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(400);
  const cardText = await page.$eval('[data-replay-id="rpl_0001"]', (el) => el.innerText);
  check('card shows era, not the child token', cardText.includes('S1') && !cardText.includes('1.1'));
  await page.click('[data-replay-id="rpl_0001"]');
  await sleep(600);
  const modalText = await page.$eval('[role="dialog"][aria-modal="true"]', (el) => el.innerText);
  check('modal meta reads "S1 · 1.1"', /S1 · 1\.1/.test(modalText));
  await page.keyboard.press('Escape');
  await sleep(300);

  console.log('\n[8] mobile drawer sections');
  await page.setViewport({ width: 390, height: 844 });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await sleep(400);
  await page.click('button[aria-label="Open filters"]');
  await sleep(500);
  check('era section renders', !!(await page.$('[data-testid="patch-section-S1"]')));
  await page.click('[data-testid="patch-section-S1"] button[aria-label="S1 patches"]');
  await sleep(300);
  const childChip = await page.$$eval('[data-testid="patch-section-S1"] button', (els) =>
    els.some((e) => e.textContent?.trim().startsWith('1.2')),
  );
  check('section expands to child chips', childChip);
  await page.$$eval('[data-testid="patch-section-S1"] button', (els) => {
    els.find((e) => e.textContent?.trim().startsWith('S1'))?.click();
  });
  await sleep(400);
  const showBtn = await page.$$eval('[role="dialog"][aria-label="Filters"] button', (els) =>
    els.map((e) => e.textContent?.trim() ?? '').find((t) => t.startsWith('Show')),
  );
  check('parent toggle → Show 4 replays', /Show 4 replays/.test(showBtn ?? ''), showBtn);
  await page.setViewport({ width: 1360, height: 900 });

  console.log('\n[9] clear-all');
  await page.goto(`${BASE}/?patch=S2,1.1`, { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.$$eval('button', (els) => {
    els.find((e) => e.textContent?.trim() === 'Clear all')?.click();
  });
  await sleep(400);
  check('patch param cleared', !new URL(page.url()).searchParams.has('patch'));
  check('all 10 back', (await cards()) === 10, String(await cards()));

  await browser.close();
  server.close();
} finally {
  writeFileSync(APP_CONFIG, originalConfig);
  writeFileSync(REPLAYS, originalReplays);
}

console.log(
  failures ? `\n✗ ${failures} FAILURE(S)` : '\n✓ PATCH-GROUPS UI CONTRACT HOLDS (built bundle)',
);
process.exit(failures ? 1 : 0);
