/**
 * SEGMENT-RECORD GATE — a record that is a SLICE of a longer video (v0.10.0).
 *
 * Until v0.10.0 `Replay.id` WAS the YouTube id, and four places interpolated it
 * straight into a YouTube URL. 2XKO's Replay Theater intake breaks that: it
 * indexes matches inside longform tournament VODs, so ~16 records share one
 * video and their ids are `${videoId}@${startSeconds}`. `videoId` and
 * `startSeconds` are the additive fields that make those records first-class.
 *
 * Three failures this gate exists to catch, all of which are quiet:
 *
 *   1. THE COMPOSITE ID MUST SURVIVE `?v=`. Open state is a query param and
 *      byId() is plain string equality, so if vue-router percent-encodes `@` on
 *      write and the value comes back decoded (or vice versa) the modal simply
 *      never opens. Nothing throws. If this assertion fails, the separator is
 *      wrong — `~` is the fallback: RFC 3986 unreserved, never encoded, and
 *      outside YouTube's [A-Za-z0-9_-] id alphabet.
 *   2. THE DERIVED THUMBNAIL MUST USE `videoId`. Deriving from a composite id
 *      404s, and @error hides a dead thumbnail behind the striped placeholder —
 *      it reads as a design choice, not a bug.
 *   3. SWAPPING BETWEEN TWO SETS OF THE SAME VOD MUST REMOUNT THE PLAYER.
 *      LiteYouTube resets on prop change; before v0.10.0 it watched `videoId`
 *      alone, which is UNCHANGED between two segments of one VOD. The iframe
 *      would survive the swap and the viewer would sit at the previous match's
 *      offset believing they were watching the one they clicked.
 *
 * The fixtures are whole-video records, so this gate OVERLAYS them with a
 * segment pair plus one plain record (the control that the pre-v0.10.0 path is
 * untouched), builds, probes, and restores in a `finally` — same file-swap
 * shape as verify-badge-density.mjs.
 *
 * Always probes generated output, never the dev server.
 *
 * Run:      node scripts/verify-segment-records.mjs
 * Control:  node scripts/verify-segment-records.mjs --expect-start 999   # MUST fail
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
const REPLAYS = join(ROOT, 'fixtures/public/data/replays.json');
const OUT = join(ROOT, 'fixtures/.vercel/output/static');

const argv = process.argv.slice(2);
const i = argv.indexOf('--expect-start');
const expectStart = i === -1 ? 742 : Number(argv[i + 1]);

const VOD = 'fxvodalpha1'; // 11 chars, YouTube-id shaped
const SEG_TOP = `${VOD}@0`;
const SEG_MID = `${VOD}@742`;
const PLAIN = 'rpl_plain01';

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

/** Two segments of ONE video plus one whole-video record. The segments share
 *  sides deliberately: related-replay ranking is signature-first, so they rank
 *  as each other's top related tile, which is what makes the swap probe a real
 *  user path rather than a synthetic navigation. */
const OVERLAY_REPLAYS = [
  {
    id: SEG_TOP,
    videoId: VOD,
    startSeconds: 0,
    sides: [
      { player: 'nomad', characters: ['aegis', 'bolt'] },
      { player: 'echo', characters: ['aegis', 'cinder'] },
    ],
    date: '2025-05-01',
    patch: 'S1',
    source: 'ch-neon',
    title: 'Segment at the top of the VOD — winners round 1',
    views: 1200,
  },
  {
    id: SEG_MID,
    videoId: VOD,
    startSeconds: 742,
    sides: [
      { player: 'nomad', characters: ['aegis', 'bolt'] },
      { player: 'echo', characters: ['aegis', 'cinder'] },
    ],
    date: '2025-05-02',
    patch: 'S1',
    source: 'ch-neon',
    title: 'Segment 742s into the same VOD — winners final',
    views: 1300,
  },
  {
    id: PLAIN,
    sides: [
      { player: 'pilot', characters: ['bolt', 'cinder'] },
      { player: 'sage', characters: ['aegis', 'drift'] },
    ],
    date: '2025-05-03',
    patch: 'S1',
    source: 'ch-vault',
    title: 'Whole-video record — the pre-v0.10.0 path, unchanged',
    views: 1400,
    durationSec: 512,
  },
];

function generate() {
  console.log('  … nuxt generate fixtures (segment-record overlay)');
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

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });

  /** Card-level reads from the Browse grid. */
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-replay-id]');
  const cards = await page.evaluate(() =>
    [...document.querySelectorAll('[data-replay-id]')].map((el) => ({
      id: el.getAttribute('data-replay-id'),
      thumb: el.querySelector('img')?.getAttribute('src') ?? null,
    })),
  );

  /** Open one record and read everything the player exposes. */
  const openAndPlay = async (id) => {
    await page.goto(`${base}/?v=${encodeURIComponent(id)}`, { waitUntil: 'load' });
    const opened = await page
      .waitForSelector('button[aria-label^="Play — "]', { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (!opened) return { opened: false };
    await page.click('button[aria-label^="Play — "]');
    await page.waitForSelector('iframe[src*="youtube-nocookie"]', { timeout: 8000 });
    return {
      opened: true,
      embed: await page.$eval('iframe[src*="youtube-nocookie"]', (el) => el.getAttribute('src')),
      watch: await page.$eval('a[href*="youtube.com/watch"]', (el) => el.getAttribute('href')),
    };
  };

  const segMid = await openAndPlay(SEG_MID);
  const segTop = await openAndPlay(SEG_TOP);
  const plain = await openAndPlay(PLAIN);

  /** THE SWAP PROBE. Sitting on SEG_TOP with the iframe mounted, click the
   *  related tile for SEG_MID — videoId does not change, only `start` does. */
  await page.goto(`${base}/?v=${encodeURIComponent(SEG_TOP)}`, { waitUntil: 'load' });
  await page.waitForSelector('button[aria-label^="Play — "]');
  await page.click('button[aria-label^="Play — "]');
  await page.waitForSelector('iframe[src*="youtube-nocookie"]');
  const beforeSwap = await page.$eval('iframe[src*="youtube-nocookie"]', (el) =>
    el.getAttribute('src'),
  );
  await page.waitForSelector('[data-testid="related-grid"]');
  const swapped = await page.evaluate((title) => {
    const btn = [...document.querySelectorAll('[data-testid="related-grid"] button')].find(
      (b) => b.getAttribute('aria-label') === title,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, OVERLAY_REPLAYS[1].title);
  await new Promise((r) => setTimeout(r, 600));
  const afterSwap = await page.evaluate(() => ({
    iframes: document.querySelectorAll('iframe[src*="youtube-nocookie"]').length,
    hasFacade: !!document.querySelector('button[aria-label^="Play — "]'),
  }));
  let afterSwapEmbed = null;
  if (afterSwap.hasFacade) {
    await page.click('button[aria-label^="Play — "]');
    await page.waitForSelector('iframe[src*="youtube-nocookie"]', { timeout: 8000 });
    afterSwapEmbed = await page.$eval('iframe[src*="youtube-nocookie"]', (el) =>
      el.getAttribute('src'),
    );
  }

  await browser.close();
  server.close();
  return { cards, segMid, segTop, plain, beforeSwap, swapped, afterSwap, afterSwapEmbed };
}

let failures = 0;
const check = (label, ok, actual) => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? '✓' : '✗'} ${label}: ${actual}`);
};

const originalReplays = readFileSync(REPLAYS, 'utf8');

try {
  writeFileSync(REPLAYS, `${JSON.stringify(OVERLAY_REPLAYS, null, 2)}\n`);
  generate();
  const r = await probe();

  console.log('[grid] a composite id reaches the DOM, and the thumb comes off videoId');
  const card = r.cards.find((c) => c.id === SEG_MID);
  check(`card [data-replay-id="${SEG_MID}"] rendered`, !!card, card ? card.id : 'MISSING');
  check(
    'derived thumbnail keys on videoId, not the record id',
    !!card?.thumb?.includes(`/vi/${VOD}/`) && !card?.thumb?.includes('@'),
    card?.thumb ?? 'no img',
  );
  const plainCard = r.cards.find((c) => c.id === PLAIN);
  check(
    'whole-video record still derives its thumb from id',
    !!plainCard?.thumb?.includes(`/vi/${PLAIN}/`),
    plainCard?.thumb ?? 'no img',
  );

  console.log('[?v=] the composite id round-trips through the query param');
  check('modal opened from ?v=<videoId>@<start>', r.segMid.opened === true, String(r.segMid.opened));

  console.log('[player] the offset reaches the embed and the watch link');
  check(
    `embed carries start=${expectStart}`,
    r.segMid.embed === `https://www.youtube-nocookie.com/embed/${VOD}?autoplay=1&rel=0&start=${expectStart}`,
    r.segMid.embed ?? 'no iframe',
  );
  check(
    'watch link carries the video id and &t=',
    r.segMid.watch === `https://www.youtube.com/watch?v=${VOD}&t=742s`,
    r.segMid.watch ?? 'no link',
  );
  check(
    'startSeconds 0 emits NO start param',
    r.segTop.embed === `https://www.youtube-nocookie.com/embed/${VOD}?autoplay=1&rel=0`,
    r.segTop.embed ?? 'no iframe',
  );
  check(
    'startSeconds 0 emits NO &t=',
    r.segTop.watch === `https://www.youtube.com/watch?v=${VOD}`,
    r.segTop.watch ?? 'no link',
  );

  console.log('[control] the whole-video path is byte-identical to pre-v0.10.0');
  check(
    'plain record embeds its id with no start',
    r.plain.embed === `https://www.youtube-nocookie.com/embed/${PLAIN}?autoplay=1&rel=0`,
    r.plain.embed ?? 'no iframe',
  );
  check(
    'plain record watch link has no &t=',
    r.plain.watch === `https://www.youtube.com/watch?v=${PLAIN}`,
    r.plain.watch ?? 'no link',
  );

  console.log('[swap] two segments of ONE video — the player must remount');
  check('related tile for the sibling segment was clickable', r.swapped === true, String(r.swapped));
  check(
    'iframe was torn down on swap (videoId unchanged, start changed)',
    r.afterSwap.iframes === 0 && r.afterSwap.hasFacade === true,
    `${r.afterSwap.iframes} iframe(s), facade ${r.afterSwap.hasFacade ? 'back' : 'gone'}`,
  );
  check(
    'replaying after the swap starts at the NEW offset',
    r.afterSwapEmbed ===
      `https://www.youtube-nocookie.com/embed/${VOD}?autoplay=1&rel=0&start=${expectStart}`,
    `${r.beforeSwap} → ${r.afterSwapEmbed}`,
  );
} finally {
  writeFileSync(REPLAYS, originalReplays);
}

console.log(
  failures
    ? `\n✗ ${failures} FAILURE(S)`
    : '\n✓ SEGMENT RECORDS HOLD (composite id, videoId-derived thumb, offset playback, swap remount)',
);
process.exit(failures ? 1 : 0);
