/**
 * INDEXING GATE (v0.18.0) — what a generated build tells a crawler to index.
 *
 * Search Console measured the pre-v0.18.0 output: ~19k sitemap URLs across the
 * platform, three quarters of them player pages with four or fewer replays and
 * ~88 words of shell, and Browse pages whose HTML said "Loading replays…".
 * Google's answer was 3,702 pages in "Crawled – currently not indexed" and an
 * indexed count that fell from ~4,000 to 381 in September 2026. This holds the
 * v0.18.0 shape:
 *
 *   - a player page under GameConfig.seo.indexMinReplays carries
 *     <meta name="robots" content="noindex,follow">, and NO noindexed page is in
 *     the sitemap; every other prerendered page IS (health/not-found/dev aside);
 *   - the Browse page prerenders the recent-replays list (data-testid=
 *     "recent-replays") with at least one entry, and no "Loading replays…";
 *   - the skeleton cover over that list (v0.18.1) is switched on ONLY by a
 *     script: the prerendered <html> never carries rdb-js, the cover is
 *     aria-hidden and holds no text, and its head script is present;
 *   - <lastmod> is per-URL data, not one build date, when the app has a
 *     replays.json (more than one distinct value);
 *   - no <loc> ends with a slash (the shell 308s those).
 *
 * Run it against the engine's fixtures, and against a game's build before its
 * pin push, like verify:page-budget:
 *   node scripts/verify-indexing.mjs fixtures/.vercel/output/static
 *   node scripts/verify-indexing.mjs ../ggst-replay-database/.vercel/output/static
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const staticRoot = process.argv[2];
if (!staticRoot || !existsSync(staticRoot)) {
  console.error('usage: node scripts/verify-indexing.mjs <static-dir>');
  process.exit(2);
}

// the base directory holds players/ and sitemap.xml (see verify-page-budget)
const baseDir = existsSync(join(staticRoot, 'players'))
  ? staticRoot
  : readdirSync(staticRoot)
      .map((d) => join(staticRoot, d))
      .find((d) => statSync(d).isDirectory() && existsSync(join(d, 'players')));
if (!baseDir || !existsSync(join(baseDir, 'sitemap.xml'))) {
  console.error(`✖ no players/ + sitemap.xml under ${staticRoot} — is this a generated build?`);
  process.exit(2);
}

const failures = [];
const fail = (what, file = '') => failures.push(`${what}${file ? `  (${file})` : ''}`);

// ── sitemap ──────────────────────────────────────────────────────────────────
const sitemap = readFileSync(join(baseDir, 'sitemap.xml'), 'utf8');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const lastmods = new Set([...sitemap.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]));
const sitemapLine = sitemap.match(/<url><loc>([^<]+)<\/loc>/)?.[1] ?? '';
const origin = sitemapLine.match(/^https?:\/\/[^/]+/)?.[0] ?? '';
// the base in URL space: what precedes the router path in every <loc>
const base = relative(staticRoot, baseDir).replace(/\\/g, '/');
const prefix = `${origin}${base ? `/${base}` : ''}`;
const inSitemap = new Set(
  locs.map((l) => {
    const p = l.startsWith(prefix) ? l.slice(prefix.length) : l;
    return p === '' ? '/' : p;
  }),
);
for (const l of locs)
  if (l.length > prefix.length + 1 && l.endsWith('/')) fail('loc ends with /', l);
if (!locs.length) fail('sitemap has no <loc>');

// ── every prerendered page ───────────────────────────────────────────────────
const SKIP = new Set(['/health', '/not-found', '/200.html', '/404.html']);
const pages = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '_nuxt' || name === 'data' || name === 'dev') continue;
      walk(p);
    } else if (name === 'index.html') {
      pages.push(p);
    }
  }
};
walk(baseDir);

const routeOf = (file) => {
  const rel = relative(baseDir, file)
    .replace(/\\/g, '/')
    .replace(/\/?index\.html$/, '');
  return rel ? `/${rel}` : '/';
};
const ROBOTS = /<meta\b[^>]*\bname="robots"[^>]*>/;
let noindexed = 0;
let indexable = 0;
for (const file of pages) {
  const route = routeOf(file);
  if (SKIP.has(route) || route.startsWith('/dev')) continue;
  const html = readFileSync(file, 'utf8');
  const tag = html.match(ROBOTS)?.[0];
  const hidden = !!tag && /noindex/.test(tag);
  if (hidden) {
    noindexed++;
    if (inSitemap.has(route)) fail('noindexed page is in the sitemap', route);
    if (!/noindex,\s*follow/.test(tag)) fail('noindex without follow', route);
  } else {
    indexable++;
    if (!inSitemap.has(route)) fail('indexable page missing from the sitemap', route);
  }
}
if (inSitemap.size !== indexable) {
  fail(`sitemap lists ${inSitemap.size} urls but the build has ${indexable} indexable pages`);
}

// ── the Browse page carries real replay text ─────────────────────────────────
const home = readFileSync(join(baseDir, 'index.html'), 'utf8');
const hasReplays =
  existsSync(join(baseDir, 'data', 'replays.json')) &&
  JSON.parse(readFileSync(join(baseDir, 'data', 'replays.json'), 'utf8')).length > 0;
if (hasReplays) {
  const list = home.match(/<ol[^>]*data-testid="recent-replays"[\s\S]*?<\/ol>/)?.[0];
  if (!list) fail('Browse page has no recent-replays list', 'index.html');
  else if (!/<li\b/.test(list)) fail('recent-replays list is empty', 'index.html');
  if (home.includes('Loading replays'))
    fail('Browse page still says "Loading replays…"', 'index.html');
  if (!/<h1\b/.test(home)) fail('Browse page has no <h1>', 'index.html');
  // the cover (v0.18.1): a crawler that doesn't run JS must read the list
  // uncovered, so the class that shows the cover may only come from a script
  if (/rdb-js/.test(home.match(/<html\b[^>]*>/)?.[0] ?? ''))
    fail(
      '<html> is prerendered with rdb-js — the cover would be up for every crawler',
      'index.html',
    );
  const cover = divBlock(home, home.search(/<div[^>]*class="[^"]*\brecent-cover\b/));
  if (!cover) fail('Browse page has no recent-cover', 'index.html');
  else {
    if (!/^<div[^>]*aria-hidden="true"/.test(cover))
      fail('recent-cover is not aria-hidden', 'index.html');
    const text = cover
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (text) fail(`recent-cover holds text ("${text.slice(0, 40)}")`, 'index.html');
    if (!home.includes("classList.add('rdb-js')"))
      fail('recent-cover without the head script that turns it on', 'index.html');
  }
  if (lastmods.size < 2 && locs.length > 2) {
    fail(`every <lastmod> is the same value (${[...lastmods][0]}) — not per-URL data`);
  }
}

/** The outer <div …>…</div> starting at `at`, nesting counted; '' if none. */
function divBlock(html, at) {
  if (at < 0) return '';
  const tag = /<div\b|<\/div>/g;
  tag.lastIndex = at;
  let depth = 0;
  for (let m; (m = tag.exec(html));) {
    depth += m[0] === '</div>' ? -1 : 1;
    if (depth === 0) return html.slice(at, tag.lastIndex);
  }
  return '';
}

console.log(
  `indexing — ${base ? `/${base}` : '/'}: ${indexable} indexable + ${noindexed} noindexed pages, ` +
    `${locs.length} sitemap urls, ${lastmods.size} distinct lastmod` +
    (hasReplays ? '' : ' (no replays.json: recent list + lastmod checks skipped)'),
);
if (failures.length) {
  console.error(`\n✖ ${failures.length} failure(s):`);
  const seen = new Map();
  for (const f of failures) {
    const key = f.replace(/\s+\(.*\)$/, '');
    seen.set(key, [...(seen.get(key) ?? []), f]);
  }
  for (const [key, fs] of seen) {
    console.error(`  ${fs.length} × ${key}`);
    for (const f of fs.slice(0, 3)) console.error(`      ${f}`);
    if (fs.length > 3) console.error(`      … and ${fs.length - 3} more`);
  }
  process.exit(1);
}
console.log(
  '✓ noindex and sitemap agree, Browse carries replay text under a script-gated cover, lastmod is per-URL',
);
