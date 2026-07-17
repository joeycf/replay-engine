import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineNuxtModule } from 'nuxt/kit';
import { joinURL, withBase, withLeadingSlash, withoutBase } from 'ufo';
import { loadMergedGameConfig } from '../lib/game-config';

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

    nuxt.hook('nitro:init', (nitro) => {
      const prerendered: string[] = [];

      nitro.hooks.hook('prerender:route', (route) => {
        if (route.error) return;
        if (!route.fileName?.endsWith('.html')) return;
        prerendered.push(route.route);
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
        const excluded = new Set(['/health', '/not-found', '/200.html', '/404.html']);
        const publicRoutes = [
          ...new Set(prerendered.map((r) => withLeadingSlash(withoutBase(r, base)))),
        ]
          // path routes only: crawled ?query deep-links (filtered Browse views)
          // are duplicate content and would need XML-escaping — not sitemap
          // material (the shipped build listed entity routes only)
          .filter((r) => !excluded.has(r) && !r.includes('?'))
          .sort();

        // ── sitemap.xml (locs re-enter URL space: site + withBase) ──────────
        const today = new Date().toISOString().slice(0, 10);
        const sitemap =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          publicRoutes
            .map(
              (r) =>
                `  <url><loc>${site}${withBase(r, base)}</loc><lastmod>${today}</lastmod></url>`,
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
          icons: [
            // no dedicated maskable asset exists yet (flagged) — 'any' only
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
          `✓ static artifacts: sitemap (${publicRoutes.length} urls) + robots.txt + ` +
            `manifest.webmanifest + designed 404.html`,
        );
      });
    });
  },
});
