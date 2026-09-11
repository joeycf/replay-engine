/**
 * EVENT-CHIP GATE — the badge prints the record's own attribution (v0.13.0).
 *
 * Until v0.13.0 SourceBadge printed exactly one thing: the configured
 * `sourceChannels` name for `Replay.source`. That is wrong for an INDEX source
 * — one token covering many uploaders — where the name on the card ends up
 * being the catalogue that filed the footage rather than the event it is of.
 * `event` and `channelName` are the additive fields that fix it, resolved as
 *
 *     event  →  channelName  →  configured name  →  the raw source id
 *
 * Five failures this gate exists to catch, every one of them silent:
 *
 *   1. AN EMPTY LABEL MUST NOT WIN. `??` would let `event: ''` through and
 *      render a bordered, background-filled chip with no text — a coloured
 *      smudge over the thumbnail that reads as a CSS bug, on exactly the
 *      records nobody spot-checks. The resolution uses `||` for this reason,
 *      and whitespace-only must behave the same way.
 *   2. A LONG LABEL MUST ELLIPSIZE, NOT SHEAR. The card badge is absolutely
 *      positioned inside an `overflow-hidden` thumbnail, so without a
 *      max-width the 46-character tags real catalogues carry get cut mid-word
 *      by the thumbnail's own clipping, with no ellipsis to admit it.
 *   3. THE CONTROL RECORD MUST NOT MOVE. A record with no label has to render
 *      byte-identically to pre-v0.13.0 — same text, same colours, same letter
 *      spacing. If this fails the change is not additive.
 *   4. THE STYLE MUST STAY POSITIONAL. Colour comes from the source's index in
 *      `sourceChannels`, NOT from whether a label is present. Every
 *      event-bearing source on the platform today sits at index >= 2, so a
 *      label at index 0 is the case no consumer exercises — pinned here so the
 *      behaviour is documented rather than discovered.
 *   5. THE BADGE MUST STAY A <span>. Six game e2e suites tell a card badge
 *      from a filter chip purely by tag name, scoping "per-channel chips are
 *      consolidated away" to <button> text. Promote this to a <button> and all
 *      six start reading a card badge as a filter chip and fail — or worse,
 *      pass while asserting nothing.
 *
 * The fixtures carry one labelled record; this gate OVERLAYS them with the
 * whole truth table, builds, probes, and restores in a `finally` — same
 * file-swap shape as verify-segment-records.mjs.
 *
 * Always probes generated output, never the dev server.
 *
 * Run:      node scripts/verify-event-chip.mjs
 * Control:  node scripts/verify-event-chip.mjs --expect-label NOPE   # MUST fail
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
const li = argv.indexOf('--expect-label');
const SHORT_LABEL = 'Neon Invitational';
const expectLabel = li === -1 ? SHORT_LABEL : argv[li + 1];

/** 60 characters — longer than the longest tag measured on the platform (46,
 *  "Pacific Northwest Tourney Exhibition Qualifier"), so the clip is certain. */
const LONG_LABEL = 'Pacific Northwest Tourney Exhibition Qualifier — Losers R2';
const CHANNEL_LABEL = 'Ghost Circuit Uploads';

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

const sides = (a, b) => [
  { player: 'nomad', characters: [a, 'bolt'] },
  { player: 'echo', characters: [b, 'cinder'] },
];

/** The truth table, one record per rung and per trap. `ch-neon` is index 0 in
 *  the fixture config (filled primary), `ch-vault` index 1 (secondary
 *  outline), `ch-ghost` is deliberately NOT configured at all. */
const OVERLAY_REPLAYS = [
  {
    id: 'lbl_short',
    sides: sides('aegis', 'aegis'),
    date: '2025-05-01',
    patch: 'S1',
    source: 'ch-neon',
    event: SHORT_LABEL,
    title: 'A short event label on an index-0 source',
    views: 1200,
  },
  {
    id: 'lbl_long',
    sides: sides('bolt', 'drift'),
    date: '2025-05-02',
    patch: 'S1',
    source: 'ch-vault',
    event: LONG_LABEL,
    title: 'A 60-character event label that must ellipsize',
    views: 1300,
  },
  {
    id: 'lbl_none',
    sides: sides('cinder', 'bolt'),
    date: '2025-05-03',
    patch: 'S1',
    source: 'ch-neon',
    title: 'No label at all — the pre-v0.13.0 path, unchanged',
    views: 1400,
  },
  {
    id: 'lbl_empty',
    sides: sides('drift', 'aegis'),
    date: '2025-05-04',
    patch: 'S1',
    source: 'ch-vault',
    event: '',
    title: 'An empty-string event means NO event, not an empty chip',
    views: 1500,
  },
  {
    id: 'lbl_ws',
    sides: sides('aegis', 'drift'),
    date: '2025-05-05',
    patch: 'S1',
    source: 'ch-neon',
    event: '   ',
    title: 'Whitespace-only is absent too',
    views: 1600,
  },
  {
    id: 'lbl_chan',
    sides: sides('bolt', 'aegis'),
    date: '2025-05-06',
    patch: 'S1',
    source: 'ch-vault',
    channelName: CHANNEL_LABEL,
    title: 'No event, but a real uploader — the second rung',
    views: 1700,
  },
  {
    id: 'lbl_both',
    sides: sides('cinder', 'drift'),
    date: '2025-05-07',
    patch: 'S1',
    source: 'ch-vault',
    event: 'Vault Open 2025',
    channelName: CHANNEL_LABEL,
    title: 'Both set — the event outranks the uploader',
    views: 1800,
  },
  {
    id: 'lbl_unconf',
    sides: sides('drift', 'bolt'),
    date: '2025-05-08',
    patch: 'S1',
    source: 'ch-ghost',
    title: 'An unconfigured source still falls back to its raw id',
    views: 1900,
  },
];

function generate() {
  console.log('  … nuxt generate fixtures (event-chip overlay)');
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
  await page.goto(`${base}/`, { waitUntil: 'load' });
  await page.waitForSelector('[data-replay-id]');

  /** One read per card: text, tag name, the geometry that proves truncation,
   *  the computed styles that prove the positional treatment survived, and the
   *  thumbnail's own right edge to prove the chip stayed inside it. */
  const cards = await page.evaluate(() => {
    const out = {};
    for (const card of document.querySelectorAll('[data-replay-id]')) {
      const badge = card.querySelector('span.cut-bl-md');
      if (!badge) continue;
      const cs = getComputedStyle(badge);
      const thumb = badge.parentElement;
      out[card.getAttribute('data-replay-id')] = {
        tag: badge.tagName,
        text: (badge.textContent ?? '').trim(),
        title: badge.getAttribute('title'),
        scrollWidth: badge.scrollWidth,
        clientWidth: badge.clientWidth,
        textOverflow: cs.textOverflow,
        letterSpacing: cs.letterSpacing,
        background: cs.backgroundColor,
        border: cs.borderTopColor,
        right: Math.round(badge.getBoundingClientRect().right),
        thumbRight: Math.round(thumb.getBoundingClientRect().right),
      };
    }
    return out;
  });

  /** The modal's desktop top bar — a wider cap, and the meta line beside it
   *  must survive (the flex-shrink regression). */
  const openModal = async (id, width) => {
    await page.setViewport({ width, height: 1000 });
    await page.goto(`${base}/?v=${encodeURIComponent(id)}`, { waitUntil: 'load' });
    await page.waitForSelector('[role="dialog"]');
    return page.evaluate(() => {
      const vis = (el) => !!el && el.getBoundingClientRect().width > 0;
      const panel = document.querySelector('[role="dialog"]');
      const badge = [...panel.querySelectorAll('span.cut-bl-md')].find(vis);
      const meta = [...panel.querySelectorAll('span.font-mono')].find(vis);
      return {
        tag: badge?.tagName ?? null,
        text: (badge?.textContent ?? '').trim(),
        title: badge?.getAttribute('title') ?? null,
        badgeWidth: badge ? Math.round(badge.getBoundingClientRect().width) : 0,
        panelWidth: Math.round(panel.getBoundingClientRect().width),
        metaVisible: !!meta && (meta.textContent ?? '').trim().length > 0,
        overflowsPanel: badge
          ? badge.getBoundingClientRect().right > panel.getBoundingClientRect().right + 1
          : false,
      };
    });
  };

  const modalDesktop = await openModal('lbl_long', 1440);
  const modalMobile = await openModal('lbl_long', 390);

  await browser.close();
  server.close();
  return { cards, modalDesktop, modalMobile };
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
  const c = r.cards;

  console.log('[chain] event → channelName → configured name → raw id');
  check(
    `lbl_short prints its event`,
    c.lbl_short?.text === expectLabel,
    c.lbl_short?.text ?? 'NO BADGE',
  );
  check(
    `lbl_chan prints its uploader`,
    c.lbl_chan?.text === CHANNEL_LABEL,
    c.lbl_chan?.text ?? 'NO BADGE',
  );
  check(
    `lbl_both prefers the event over the uploader`,
    c.lbl_both?.text === 'Vault Open 2025',
    c.lbl_both?.text ?? 'NO BADGE',
  );
  check(
    `lbl_none prints the configured name`,
    c.lbl_none?.text === 'Neon Archives',
    c.lbl_none?.text ?? 'NO BADGE',
  );
  check(
    `lbl_unconf falls back to the raw source id`,
    c.lbl_unconf?.text === 'ch-ghost',
    c.lbl_unconf?.text ?? 'NO BADGE',
  );

  console.log('[empty] an empty or blank label means ABSENT, never an empty chip');
  check(
    `lbl_empty prints the configured name`,
    c.lbl_empty?.text === 'The Vault',
    `"${c.lbl_empty?.text}"`,
  );
  check(
    `lbl_ws prints the configured name`,
    c.lbl_ws?.text === 'Neon Archives',
    `"${c.lbl_ws?.text}"`,
  );
  check(
    'no badge anywhere renders empty text',
    Object.values(c).every((b) => b.text.length > 0),
    `${Object.keys(c).length} badges, all non-empty`,
  );

  console.log('[span] the tag name six game e2e suites depend on');
  check(
    'every card badge is a <span>',
    Object.values(c).every((b) => b.tag === 'SPAN'),
    [...new Set(Object.values(c).map((b) => b.tag))].join(', '),
  );
  check('the modal badge is a <span>', r.modalDesktop.tag === 'SPAN', String(r.modalDesktop.tag));

  console.log('[truncation] a long label ellipsizes inside the thumbnail');
  check(
    'lbl_long is clipped (scrollWidth > clientWidth)',
    (c.lbl_long?.scrollWidth ?? 0) > (c.lbl_long?.clientWidth ?? 0),
    `${c.lbl_long?.scrollWidth} > ${c.lbl_long?.clientWidth}`,
  );
  check(
    'lbl_long resolves text-overflow: ellipsis',
    c.lbl_long?.textOverflow === 'ellipsis',
    c.lbl_long?.textOverflow ?? 'none',
  );
  check(
    'lbl_long stays inside its thumbnail',
    (c.lbl_long?.right ?? 1) <= (c.lbl_long?.thumbRight ?? 0),
    `badge ${c.lbl_long?.right} <= thumb ${c.lbl_long?.thumbRight}`,
  );
  check(
    'a short label does NOT truncate',
    c.lbl_short?.scrollWidth === c.lbl_short?.clientWidth,
    `${c.lbl_short?.scrollWidth} === ${c.lbl_short?.clientWidth}`,
  );
  check(
    'an unlabelled badge does NOT truncate',
    c.lbl_none?.scrollWidth === c.lbl_none?.clientWidth,
    `${c.lbl_none?.scrollWidth} === ${c.lbl_none?.clientWidth}`,
  );

  console.log('[control] the unlabelled path is untouched, and the style stays positional');
  check(
    'lbl_none keeps the .1em tracking',
    c.lbl_none?.letterSpacing !== c.lbl_short?.letterSpacing,
    `unlabelled ${c.lbl_none?.letterSpacing} vs labelled ${c.lbl_short?.letterSpacing}`,
  );
  check(
    'a label at index 0 keeps the filled-primary treatment',
    c.lbl_short?.background === c.lbl_none?.background &&
      c.lbl_short?.border === c.lbl_none?.border,
    `${c.lbl_short?.background} / ${c.lbl_none?.background}`,
  );
  check(
    'index 1 differs from index 0 (the palette still keys on position)',
    c.lbl_chan?.background !== c.lbl_none?.background,
    `${c.lbl_chan?.background} vs ${c.lbl_none?.background}`,
  );
  check(
    'lbl_unconf (index -1) wears the index-0 treatment, as before',
    c.lbl_unconf?.background === c.lbl_none?.background,
    c.lbl_unconf?.background ?? 'none',
  );

  console.log('[tooltip] the source name survives the label that replaced it');
  check(
    'a labelled badge carries the full text AND its source',
    c.lbl_long?.title === `${LONG_LABEL} · The Vault`,
    c.lbl_long?.title ?? 'NO TITLE',
  );
  check(
    'event + uploader + source all reach the tooltip',
    c.lbl_both?.title === `Vault Open 2025 · ${CHANNEL_LABEL} · The Vault`,
    c.lbl_both?.title ?? 'NO TITLE',
  );
  check(
    'an uploader label does not repeat itself',
    c.lbl_chan?.title === `${CHANNEL_LABEL} · The Vault`,
    c.lbl_chan?.title ?? 'NO TITLE',
  );
  check(
    'an unlabelled badge carries NO tooltip',
    c.lbl_none?.title === null,
    String(c.lbl_none?.title),
  );

  console.log('[modal] a wider cap, and the meta line beside it survives');
  check(
    'desktop modal badge prints the label',
    r.modalDesktop.text === LONG_LABEL || r.modalDesktop.text.startsWith(LONG_LABEL.slice(0, 20)),
    r.modalDesktop.text,
  );
  check(
    'desktop modal shows MORE than the card did',
    r.modalDesktop.badgeWidth > (c.lbl_long?.clientWidth ?? 0),
    `modal ${r.modalDesktop.badgeWidth}px > card ${c.lbl_long?.clientWidth}px`,
  );
  check(
    'desktop modal meta line is still rendered',
    r.modalDesktop.metaVisible === true,
    String(r.modalDesktop.metaVisible),
  );
  check(
    'desktop modal badge stays inside the panel',
    r.modalDesktop.overflowsPanel === false,
    `panel ${r.modalDesktop.panelWidth}px`,
  );
  check(
    'mobile modal badge stays inside the panel',
    r.modalMobile.overflowsPanel === false,
    `panel ${r.modalMobile.panelWidth}px, badge ${r.modalMobile.badgeWidth}px`,
  );
} finally {
  writeFileSync(REPLAYS, originalReplays);
}

console.log(
  failures
    ? `\n✗ ${failures} FAILURE(S)`
    : '\n✓ EVENT CHIP HOLDS (chain, empty-label trap, <span>, truncation, positional style, tooltip, modal)',
);
process.exit(failures ? 1 : 0);
