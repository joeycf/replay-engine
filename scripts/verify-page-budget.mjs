/**
 * PAGE-BUDGET GATE — the prerendered player page is the unit of storage.
 *
 * Every game writes one HTML file per player, and Vercel keeps a complete,
 * uncompressed copy of every retained build, so a byte added to the player page
 * shell is multiplied by ~16.5k pages and again by every build in the retention
 * window. v0.16.0 cut that shell from ~19–22 KB to ~11–14 KB (PLAN.md, the
 * long-tail measurement of 2026-09-28). This holds the line, and names the
 * regression by the thing that grew rather than by a total:
 *
 *   - bytes: the median one-replay page under its ceiling (the sensitive one —
 *     that page is almost pure shell), and every player page under its max;
 *   - skeletons: the fallback grid holds min(4, matches) cards, matches being
 *     the count the page itself shows (data-testid="player-matches");
 *   - no inline <style> at all — component CSS is linked (features.inlineStyles
 *     off) and the accents live in the entry stylesheet (modules/accents-css.ts);
 *   - WebSite + Organization JSON-LD on the home page, and on no player page;
 *   - no twitter:title / twitter:description / twitter:image (og:* covers them).
 *
 * Run it against the engine's fixtures, and against a game's build before its
 * pin push, like verify:subpath:
 *   node scripts/verify-page-budget.mjs fixtures/.vercel/output/static
 *   node scripts/verify-page-budget.mjs ../ggst-replay-database/.vercel/output/static
 *   node scripts/verify-page-budget.mjs <static> --tail-median-max=N --tail-max=N --page-max=N
 * Ceilings default per game (BUDGETS below, keyed by base) and fall back to
 * DEFAULT for a base it does not know.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? Number(a.slice(name.length + 3)) : undefined;
};
const staticRoot = args.find((a) => !a.startsWith('--'));
if (!staticRoot || !existsSync(staticRoot)) {
  console.error(
    'usage: node scripts/verify-page-budget.mjs <static-dir> [--tail-median-max=N] [--tail-max=N] [--page-max=N]',
  );
  process.exit(2);
}

// The prerendered index.html marks the base directory: the static root under a
// root deployment, <static>/<base>/ under a subpath one. Never hardcode it.
const baseDir = existsSync(join(staticRoot, 'players'))
  ? staticRoot
  : readdirSync(staticRoot)
      .map((d) => join(staticRoot, d))
      .find((d) => statSync(d).isDirectory() && existsSync(join(d, 'players')));
if (!baseDir) {
  console.error(`✖ no players/ directory under ${staticRoot} — is this a generated build?`);
  process.exit(2);
}
const base =
  baseDir === staticRoot ? '/' : `/${baseDir.slice(staticRoot.length).replace(/^\/+/, '')}`;

/* Ceilings in bytes, from the v0.16.0 builds of 2026-09-28. `tailMedian` is the
   sensitive one: a one-replay page is almost pure shell, so its median moves by
   exactly what the shell gains, and it sits 5% over today's. The two max
   ceilings sit ~8% over today's largest page and catch the outlier. 2XKO and
   Tōkon run larger heroes (duo pairings, four-character sides). Change a row
   deliberately, with a measurement, never to turn a red run green. */
const BUDGETS = {
  '/2xko': { tailMedian: 14100, tailMax: 14800, pageMax: 26300 },
  '/tekken': { tailMedian: 11400, tailMax: 12100, pageMax: 18700 },
  '/sf6': { tailMedian: 11400, tailMax: 12000, pageMax: 18800 },
  '/tokon': { tailMedian: 15050, tailMax: 16800, pageMax: 18800 },
  '/ffcotw': { tailMedian: 11750, tailMax: 12500, pageMax: 18900 },
  '/ggst': { tailMedian: 11650, tailMax: 13000, pageMax: 18800 },
  '/avatar': { tailMedian: 11700, tailMax: 12300, pageMax: 17300 },
};
// A base with no row (the fixtures app, a new game before its first
// measurement) is held to the loosest shipped game until it gets one.
const DEFAULT = { tailMedian: 15050, tailMax: 16800, pageMax: 26300 };
const row = BUDGETS[base] ?? DEFAULT;
const ceiling = {
  tailMedian: flag('tail-median-max') ?? row.tailMedian,
  tail: flag('tail-max') ?? row.tailMax,
  page: flag('page-max') ?? row.pageMax,
};

const failures = [];
const fail = (what, file) => failures.push({ what, file });
const rel = (f) => f.slice(baseDir.length + 1);

// ── the home page carries the site-wide JSON-LD, once ────────────────────────
const home = readFileSync(join(baseDir, 'index.html'), 'utf8');
for (const type of ['WebSite', 'Organization']) {
  if (!home.includes(`"@type":"${type}"`)) fail(`home page has no ${type} JSON-LD`, 'index.html');
}

// ── every player page ────────────────────────────────────────────────────────
const dir = join(baseDir, 'players');
const pages = readdirSync(dir)
  .map((d) => join(dir, d, 'index.html'))
  .filter((f) => existsSync(f));
const sizes = { tail: [], page: [] };
for (const file of pages) {
  const html = readFileSync(file, 'utf8');
  const bytes = Buffer.byteLength(html);
  const m = html.match(/data-testid="player-matches"[^>]*>([\d,]+)</);
  if (!m) {
    fail('no data-testid="player-matches" count', rel(file));
    continue;
  }
  const matches = Number(m[1].replace(/,/g, ''));
  const kind = matches === 1 ? 'tail' : 'page';
  sizes[kind].push(bytes);
  if (bytes > ceiling[kind])
    fail(`${bytes} B over the ${kind} ceiling of ${ceiling[kind]} B`, rel(file));
  const cards = html.split('class="skel-card"').length - 1;
  const want = Math.min(4, Math.max(1, matches));
  if (cards !== want)
    fail(`${cards} skeleton card(s) for ${matches} match(es), want ${want}`, rel(file));
  if (/<style[\s>]/.test(html))
    fail('inline <style> (component CSS or accents re-inlined)', rel(file));
  if (/"@type":"(WebSite|Organization)"/.test(html))
    fail('site-wide JSON-LD on a player page', rel(file));
  if (/name="twitter:(title|description|image)"/.test(html))
    fail('twitter:* duplicate of og:*', rel(file));
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
if (sizes.tail.length && median(sizes.tail) > ceiling.tailMedian) {
  fail(
    `one-replay median ${median(sizes.tail)} B over its ceiling of ${ceiling.tailMedian} B — the shell grew`,
    'players/*',
  );
}

const stat = (xs) => {
  if (!xs.length) return 'none';
  const s = [...xs].sort((a, b) => a - b);
  return `${s.length} pages, median ${s[Math.floor(s.length / 2)]} B, max ${s[s.length - 1]} B`;
};
console.log(`page budget — ${base} (${pages.length} player pages)`);
console.log(
  `  one-replay:  ${stat(sizes.tail)}  (ceilings: median ${ceiling.tailMedian} B, max ${ceiling.tail} B)`,
);
console.log(`  the rest:    ${stat(sizes.page)}  (ceiling ${ceiling.page} B)`);

if (failures.length) {
  const byWhat = new Map();
  for (const f of failures) {
    const key = f.what
      .replace(/^\d+ B over/, 'over')
      .replace(/^\d+ skeleton card\(s\) for \d+ match\(es\), want \d/, 'wrong skeleton count');
    byWhat.set(key, [...(byWhat.get(key) ?? []), f]);
  }
  console.error(`\n✖ ${failures.length} failure(s):`);
  for (const [, fs] of byWhat) {
    console.error(`  ${fs.length} × ${fs[0].what}`);
    for (const f of fs.slice(0, 3))
      console.error(`      ${f.file}${f === fs[0] ? '' : `  (${f.what})`}`);
    if (fs.length > 3) console.error(`      … and ${fs.length - 3} more`);
  }
  process.exit(1);
}
console.log('✓ every player page is within budget and shaped as v0.16.0 ships it');
