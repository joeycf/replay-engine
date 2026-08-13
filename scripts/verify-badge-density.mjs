/**
 * BADGE DENSITY GATE — the card at charactersPerSide: 4, on the BUILT bundle.
 *
 * `BrowseCard.vue` has carried an `n >= 4` badge-sizing branch since before any
 * consumer used it, which means it shipped four minor versions unexercised. A
 * 4v4 tag game makes it the common case: eight badges on one card, two runs of
 * four, and the `VS` column has to stay dead-centre between sides that may not
 * be the same length.
 *
 * The fixtures are a 2-per-side game, so this gate OVERLAYS them — a fourth
 * character, `charactersPerSide: 4`, and replays with 4-, 3-, 1- and
 * deliberately asymmetric 4v1 sides — builds, probes, and restores the
 * originals in a `finally`. Same file-swap shape as `verify-override.mjs`.
 *
 * Always probes generated output, never the dev server.
 *
 * Run:      node scripts/verify-badge-density.mjs
 * Control:  node scripts/verify-badge-density.mjs --expect-badges 9   # MUST fail
 *
 * A gate that cannot fail is indistinguishable from one that passes, so the
 * control is not optional — run it once when you touch this file.
 */
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = join(ROOT, 'fixtures/app/app.config.ts');
const CHARACTERS = join(ROOT, 'fixtures/data/characters.json');
const REPLAYS = join(ROOT, 'fixtures/public/data/replays.json');
const OUT = join(ROOT, 'fixtures/.vercel/output/static');

const argv = process.argv.slice(2);
const expectBadges = Number(argv[argv.indexOf('--expect-badges') + 1]) || 8;

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

/** The overlay corpus. Lengths are the point: 4v4, 3v3, 1v1, and an
 *  asymmetric 4v1 — badge size follows the BIGGER side, and `VS` has to hold
 *  the centre when the two sides have very different footprints. */
const OVERLAY_REPLAYS = [
  {
    id: 'rpl_d4x4',
    sides: [
      { player: 'nomad', characters: ['aegis', 'bolt', 'cinder', 'drift'] },
      { player: 'echo', characters: ['drift', 'cinder', 'bolt', 'aegis'] },
    ],
    date: '2025-03-01',
    patch: 'S1',
    source: 'ch-neon',
    title: 'Four on four — the density case',
    views: 4444,
    durationSec: 612,
  },
  {
    id: 'rpl_d3x3',
    sides: [
      { player: 'pilot', characters: ['aegis', 'bolt', 'cinder'] },
      { player: 'sage', characters: ['drift', 'aegis', 'bolt'] },
    ],
    date: '2025-03-02',
    patch: 'S1',
    source: 'ch-vault',
    title: 'Three a side',
    views: 3333,
    durationSec: 480,
  },
  {
    id: 'rpl_d1x1',
    sides: [
      { player: 'nomad', characters: ['drift'] },
      { player: 'sage', characters: ['cinder'] },
    ],
    date: '2025-03-03',
    patch: 'S1',
    source: 'ch-neon',
    title: 'Partial union — one known fighter a side',
    views: 1111,
    durationSec: 240,
  },
  {
    id: 'rpl_d4x1',
    sides: [
      { player: 'echo', characters: ['aegis', 'bolt', 'cinder', 'drift'] },
      { player: 'pilot', characters: ['aegis'] },
    ],
    date: '2025-03-04',
    patch: 'S1',
    source: 'ch-vault',
    title: 'Asymmetric — four against one known',
    views: 2222,
    durationSec: 360,
  },
];

function generate() {
  console.log('  … nuxt generate fixtures (charactersPerSide: 4 overlay)');
  execSync('npx nuxt generate fixtures', { cwd: ROOT, stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
}

async function probe() {
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
  const base = await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
  });

  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome-stable',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  /** Read every card's badge geometry at a given viewport width. */
  const readAt = async (width) => {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900 });
    await page.goto(`${base}/`, { waitUntil: 'load' });
    await page.waitForSelector('[data-replay-id]');
    const out = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-replay-id]')];
      const read = (card) => {
        // the matchup row is the grid holding the centred VS span
        const vs = [...card.querySelectorAll('span')].find(
          (s) => s.textContent.trim() === 'VS' && s.className.includes('font-display'),
        );
        if (!vs) return null;
        const grid = vs.parentElement;
        // badges carry aria-label (the character's name); the HoverTip
        // placeholder span inside them does not, so this counts badges only
        const badges = [...grid.querySelectorAll('span[aria-label]')];
        const cardBox = card.getBoundingClientRect();
        const vsBox = vs.getBoundingClientRect();
        return {
          id: card.getAttribute('data-replay-id'),
          badges: badges.length,
          badgeWidth: badges.length ? Math.round(badges[0].getBoundingClientRect().width) : 0,
          vsOffset: Math.abs(vsBox.left + vsBox.width / 2 - (cardBox.left + cardBox.width / 2)),
          gridOverflow: grid.scrollWidth - grid.clientWidth,
        };
      };
      return {
        cards: cards.map(read).filter(Boolean),
        docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    await page.close();
    return out;
  };

  const wide = await readAt(1440);
  const phone = await readAt(375);
  await browser.close();
  server.close();
  return { wide, phone };
}

let failures = 0;
const check = (label, ok, actual) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}`);
};

const originals = {
  config: readFileSync(CONFIG, 'utf8'),
  characters: readFileSync(CHARACTERS, 'utf8'),
  replays: readFileSync(REPLAYS, 'utf8'),
};

if (!originals.config.includes('charactersPerSide: 2')) {
  console.error('✗ fixtures/app/app.config.ts is not the committed 2-per-side fixture');
  process.exit(1);
}

try {
  // ---- overlay -----------------------------------------------------------
  writeFileSync(
    CONFIG,
    originals.config
      .replace('charactersPerSide: 2', 'charactersPerSide: 4')
      .replace("cinder: '#c74bd8',", "cinder: '#c74bd8',\n      drift: '#4bd8a0',"),
  );
  const chars = JSON.parse(originals.characters);
  chars.push({
    id: 'drift',
    name: 'Drift',
    imgPortrait: '/img/char/drift.webp',
    accent: '#4bd8a0',
    extra: { archetype: 'Tag', origin: 'Slipstream', aliases: ['dr', 'slip'] },
  });
  writeFileSync(CHARACTERS, `${JSON.stringify(chars, null, 2)}\n`);
  writeFileSync(REPLAYS, `${JSON.stringify(OVERLAY_REPLAYS, null, 2)}\n`);

  generate();
  const { wide, phone } = await probe();

  // ---- assertions --------------------------------------------------------
  console.log(`[1440px] eight badges, sized by the n >= 4 branch, VS holding centre`);
  const full = wide.cards.find((c) => c.id === 'rpl_d4x4');
  check('4v4 card found', !!full, full ? full.id : 'MISSING');
  check(
    `4v4 renders ${expectBadges} badges`,
    full?.badges === expectBadges,
    `${full?.badges} badges`,
  );
  check(
    'badge sizing took the n >= 4 branch (21px)',
    full?.badgeWidth === 21,
    `${full?.badgeWidth}px`,
  );
  check(
    'VS centred on the 4v4 card (±2px)',
    full?.vsOffset <= 2,
    `${full?.vsOffset.toFixed(2)}px off`,
  );

  const asym = wide.cards.find((c) => c.id === 'rpl_d4x1');
  check('4v1 renders 5 badges', asym?.badges === 5, `${asym?.badges} badges`);
  check(
    'VS still centred when sides are asymmetric (±2px)',
    asym?.vsOffset <= 2,
    `${asym?.vsOffset.toFixed(2)}px off`,
  );
  check(
    '4v1 takes the bigger side’s sizing (21px)',
    asym?.badgeWidth === 21,
    `${asym?.badgeWidth}px`,
  );

  const three = wide.cards.find((c) => c.id === 'rpl_d3x3');
  check('3v3 takes the n === 3 branch (24px)', three?.badgeWidth === 24, `${three?.badgeWidth}px`);
  const one = wide.cards.find((c) => c.id === 'rpl_d1x1');
  check('partial 1-character side still renders', one?.badges === 2, `${one?.badges} badges`);

  console.log('[375px] eight badges must wrap, not overflow');
  const fullPhone = phone.cards.find((c) => c.id === 'rpl_d4x4');
  check(
    `4v4 still renders ${expectBadges} badges at 375px`,
    fullPhone?.badges === expectBadges,
    `${fullPhone?.badges} badges`,
  );
  check(
    'matchup row does not scroll horizontally',
    fullPhone?.gridOverflow <= 0,
    `${fullPhone?.gridOverflow}px`,
  );
  check('page does not scroll horizontally', phone.docOverflow <= 0, `${phone.docOverflow}px`);
} finally {
  writeFileSync(CONFIG, originals.config);
  writeFileSync(CHARACTERS, originals.characters);
  writeFileSync(REPLAYS, originals.replays);
}

console.log(
  failures
    ? `\n✗ ${failures} FAILURE(S)`
    : '\n✓ BADGE DENSITY HOLDS AT charactersPerSide: 4 (built bundle, 1440px + 375px)',
);
process.exit(failures ? 1 : 0);
