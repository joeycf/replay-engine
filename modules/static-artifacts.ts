import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineNuxtModule } from 'nuxt/kit';
import { joinURL, withBase, withLeadingSlash, withoutBase } from 'ufo';
import { characterSegment, loadMergedGameConfig } from '../lib/game-config';
import { loadReplayIndex } from '../lib/replay-index';

/**
 * STATIC BUILD ARTIFACTS — everything the shipped 2XKO build produced with a
 * `build:before` hook + a postgenerate script, folded INTO the engine so games
 * inherit it with zero per-app scripting (Phase 2 items 7 + 8 + branding):
 *
 *  • sitemap.xml — from the ACTUAL prerendered public route list (collected
 *    via nitro's prerender:route hook, whose route strings are MIXED-SPACE —
 *    normalized to router space in here), /health + /not-found + host
 *    fallbacks excluded, locs re-based with withBase(). Written into
 *    publicDir (see below), so it serves at <base>/sitemap.xml.
 *    v0.18.0: a page whose rendered HTML carries a robots noindex meta is left
 *    out too (the player page sets one below GameConfig.seo.indexMinReplays;
 *    the hook has the HTML in `route.contents`, so the sitemap excludes exactly
 *    what the page declares and no count logic is repeated here), and
 *    <lastmod> is the date of the newest replay that URL shows, from
 *    lib/replay-index.ts — not the build date, which every URL claimed on
 *    every daily rebuild. No robots.txt Disallow for noindexed pages: a
 *    noindex is only honoured on a page the crawler is allowed to fetch.
 *  • robots.txt — allow-all + the excluded routes, Sitemap: absolute URL.
 *    Written into publicDir (serves at <base>/robots.txt — correct for root
 *    deployments; in subpath mode the SHELL owns the domain's robots.txt and
 *    this one is inert — Phase 5).
 *  • manifest.webmanifest — name/short_name/colors from GameConfig
 *    (+ engine umbrella defaults), base-correct icon URLs. Build-time emit
 *    (simplest thing that works on a static host — verified in the output).
 *  • 404.html ← the prerendered /not-found page (the designed 404), replacing
 *    nitro's SPA-fallback shell. Content-checked against the NotFoundContent
 *    marker string so a silent regression fails the build. Written at the
 *    STATIC ROOT (not publicDir): Vercel serves <static root>/404.html for
 *    unmatched paths — nitro's config.json adds no 404 route of its own.
 *
 * FILESYSTEM vs URL paths (the Phase-5 subpath finding — the two must not be
 * conflated): nitro's static presets template output.publicDir WITH the base
 * suffix (vercel-static → `.vercel/output/static/{{ baseURL }}`) and write
 * prerendered routes DE-BASED beneath it. So publicDir already IS the base
 * directory — re-applying withBase() to a filesystem path doubles the base
 * (static/tekken/tekken/…, a hard build failure under any subpath base;
 * empirically reproduced on the Tekken /tekken/ flip). URL strings (sitemap
 * <loc>s, robots' Sitemap line, manifest start_url/scope/icons) still carry
 * withBase() — they live in URL space, where the base is real.
 *
 * GameConfig at BUILD time: resolved via loadMergedGameConfig (shared with the
 * engineCharacterRoutes remapper in nuxt.config — see modules/game-config.ts
 * for why app.config.ts must be re-merged by hand).
 */

export default defineNuxtModule({
  meta: { name: 'replay-engine:static-artifacts' },
  setup(_options, nuxt) {
    // build artifacts only make sense for a generated site
    if (nuxt.options.dev) return;

    const NOT_FOUND_MARKER = 'No data at this route';
    const ROBOTS_META = /<meta\b[^>]*\bname="robots"[^>]*>/;
    const isNoindexed = (html: string | undefined): boolean => {
      const tag = html?.match(ROBOTS_META)?.[0];
      return !!tag && /noindex/.test(tag);
    };

    nuxt.hook('nitro:init', (nitro) => {
      const prerendered: string[] = [];
      const noindexed: string[] = [];

      nitro.hooks.hook('prerender:route', (route) => {
        if (route.error) return;
        if (!route.fileName?.endsWith('.html')) return;
        prerendered.push(route.route);
        // `contents` is the rendered HTML (a getter over nitro's buffer)
        if (isNoindexed(route.contents)) noindexed.push(route.route);
      });

      nitro.hooks.hook('prerender:done', async () => {
        const publicDir = nitro.options.output.publicDir;
        const base = nuxt.options.app.baseURL || '/';
        const game = await loadMergedGameConfig(nuxt);
        if (!game) {
          console.warn('[static-artifacts] no GameConfig resolved — skipping artifacts');
          return;
        }

        const brand = game.slug ? `${game.name} Replay Database` : game.name;
        const site = (process.env.NUXT_PUBLIC_SITE_URL || game.siteUrl).replace(/\/$/, '');
        // publicDir is ALREADY the base directory (nitro suffixes the preset's
        // publicDir with baseURL; routes are written de-based beneath it — see
        // the header). The static ROOT (where Vercel looks for 404.html) is
        // publicDir minus the base segments; at base '/' the two coincide.
        const baseSegments = base.split('/').filter(Boolean);
        const staticRoot = baseSegments.length
          ? resolve(publicDir, ...baseSegments.map(() => '..'))
          : publicDir;
        mkdirSync(publicDir, { recursive: true });

        // ── normalize the collected list to ROUTER SPACE ───────────────────
        // nitro's prerender queue is MIXED-SPACE: route.route keeps whatever
        // form a route ENTERED in — module seeds arrive base-prefixed, crawled
        // <a href>s are document-space (prefixed), while the x-nitro-prerender
        // header routes (payload/manifest plumbing) are router-space. Only
        // fileName is uniformly de-based (nitro core generateRoute). So the
        // same page can be collected in both forms; de-base BEFORE dedupe or a
        // subpath build emits duplicate <loc>s and the exclusion set misses
        // the prefixed forms (verified on the /sub/ and /tekken/ builds).
        const toRouterSpace = (r: string) => withLeadingSlash(withoutBase(r, base));
        const excluded = new Set(['/health', '/not-found', '/200.html', '/404.html']);
        const hidden = new Set(noindexed.map(toRouterSpace));
        const publicRoutes = [...new Set(prerendered.map(toRouterSpace))]
          // path routes only: crawled ?query deep-links (filtered Browse views)
          // are duplicate content and would need XML-escaping — not sitemap
          // material (the shipped build listed entity routes only). A page
          // that declares itself noindex is not sitemap material either.
          .filter((r) => !excluded.has(r) && !r.includes('?') && !hidden.has(r))
          .sort();

        // ── sitemap.xml (locs re-enter URL space: site + withBase) ──────────
        // <lastmod> per URL from the replay data: a player or character page
        // changed when its newest replay landed; every other page (Browse,
        // stats, the indexes) when the newest replay of all did. The build
        // date is the fallback only when there is no replays.json at all.
        const today = new Date().toISOString().slice(0, 10);
        const index = loadReplayIndex(nuxt);
        const segment = characterSegment(game);
        const decode = (s: string) => {
          try {
            return decodeURIComponent(s);
          } catch {
            return s;
          }
        };
        const lastmod = (r: string): string => {
          const player = r.match(/^\/players\/(.+)$/);
          if (player) return index.latestByPlayer[decode(player[1]!)] ?? index.latest ?? today;
          const character = r.startsWith(`/${segment}/`) ? r.slice(segment.length + 2) : '';
          if (character) {
            return index.latestByCharacter[decode(character)] ?? index.latest ?? today;
          }
          return index.latest ?? today;
        };
        // for the log: the pages that opted out, not /health and /not-found
        const noindexedPages = [...hidden].filter((r) => !excluded.has(r)).length;
        const sitemap =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          publicRoutes
            .map(
              (r) =>
                `  <url><loc>${site}${withBase(r, base)}</loc><lastmod>${lastmod(r)}</lastmod></url>`,
            )
            .join('\n') +
          `\n</urlset>\n`;
        writeFileSync(join(publicDir, 'sitemap.xml'), sitemap);

        // ── robots.txt (<base>/robots.txt; shell owns the domain's in subpath
        //    mode) ─────────────────────────────────────────────────────────────
        writeFileSync(
          join(publicDir, 'robots.txt'),
          `User-agent: *\nAllow: /\nDisallow: ${withBase('/health', base)}\n` +
            `Disallow: ${withBase('/not-found', base)}\n\n` +
            `Sitemap: ${site}${withBase('/sitemap.xml', base)}\n`,
        );

        // ── manifest.webmanifest ────────────────────────────────────────────
        const manifest = {
          name: brand,
          short_name: game.shortName || 'ReplayDB',
          start_url: withBase('/', base),
          scope: withBase('/', base),
          display: 'standalone',
          background_color: game.manifest?.backgroundColor ?? '#0a0b0f',
          theme_color: game.manifest?.themeColor ?? '#17cfc8',
          // Every src goes through joinURL(base, …) — an absolute path here
          // escapes the subpath and the icon 404s on every game behind the
          // shell. scripts/verify-subpath.mjs --artifacts is the gate.
          icons: [
            {
              src: joinURL(base, '/icons/favicon-180.png'),
              sizes: '180x180',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: joinURL(base, '/icons/favicon-512.png'),
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            // MASKABLE variants (v0.6.4). Separate assets, not the same files
            // relabelled: a maskable icon is cropped to a platform-chosen shape,
            // so it needs an opaque ground and its artwork inside the safe
            // circle (radius 40% of the canvas). The favicons are transparent
            // and their mark sits exactly ON that boundary, so declaring them
            // `maskable` would ship a logo that bleeds into the mask on Android.
            // These are flattened onto the manifest's own background_color and
            // scaled to 83%, putting the corner at radius 33 of 40.
            {
              src: joinURL(base, '/icons/maskable-192.png'),
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: joinURL(base, '/icons/maskable-512.png'),
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        };
        writeFileSync(
          join(publicDir, 'manifest.webmanifest'),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );

        // ── 404.html ← prerendered /not-found (the designed 404) ───────────
        // Source: the de-based route file under publicDir. Destination: the
        // STATIC ROOT — Vercel's 404 lookup ignores the base entirely.
        const notFoundSrc = join(publicDir, 'not-found', 'index.html');
        const notFoundDst = join(staticRoot, '404.html');
        if (!existsSync(notFoundSrc)) {
          throw new Error(`[static-artifacts] missing prerendered /not-found at ${notFoundSrc}`);
        }
        mkdirSync(dirname(notFoundDst), { recursive: true });
        copyFileSync(notFoundSrc, notFoundDst);
        if (!readFileSync(notFoundDst, 'utf8').includes(NOT_FOUND_MARKER)) {
          throw new Error(
            `[static-artifacts] 404.html does not contain the designed not-found page ` +
              `(marker "${NOT_FOUND_MARKER}")`,
          );
        }

        console.log(
          `✓ static artifacts: sitemap (${publicRoutes.length} urls, ${noindexedPages} noindexed ` +
            `pages left out, lastmod from ${index.total ? `${index.total} replays` : 'the build date'}) ` +
            `+ robots.txt + manifest.webmanifest + designed 404.html`,
        );
      });
    });
  },
});
