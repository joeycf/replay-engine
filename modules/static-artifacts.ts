import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { defineNuxtModule } from 'nuxt/kit';
import { joinURL, withBase, withoutLeadingSlash } from 'ufo';
import { loadMergedGameConfig } from '../lib/game-config';

/**
 * STATIC BUILD ARTIFACTS — everything the shipped 2XKO build produced with a
 * `build:before` hook + a postgenerate script, folded INTO the engine so games
 * inherit it with zero per-app scripting (Phase 2 items 7 + 8 + branding):
 *
 *  • sitemap.xml — from the ACTUAL prerendered public route list (collected
 *    via nitro's prerender:route hook), base-prefixed, /health + /not-found +
 *    host fallbacks excluded. Written under the base dir.
 *  • robots.txt — allow-all + the excluded routes, Sitemap: absolute URL.
 *    Written at the output root (correct for root deployments; in subpath mode
 *    the SHELL owns the domain's robots.txt — Phase 5).
 *  • manifest.webmanifest — name/short_name/colors from GameConfig
 *    (+ engine umbrella defaults), base-correct icon URLs. Build-time emit
 *    (simplest thing that works on a static host — verified in the output).
 *  • 404.html ← the prerendered /not-found page (the designed 404), replacing
 *    nitro's SPA-fallback shell. Content-checked against the NotFoundContent
 *    marker string so a silent regression fails the build.
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
        const baseDir = join(publicDir, withoutLeadingSlash(withBase('/', base)));
        mkdirSync(baseDir, { recursive: true });

        // ── excluded routes (base-prefixed like the collected list) ────────
        const excluded = new Set(
          ['/health', '/not-found', '/200.html', '/404.html'].map((r) => withBase(r, base)),
        );
        const publicRoutes = [...new Set(prerendered)]
          // path routes only: crawled ?query deep-links (filtered Browse views)
          // are duplicate content and would need XML-escaping — not sitemap
          // material (the shipped build listed entity routes only)
          .filter(
            (r) => !excluded.has(r) && !r.includes('?') && r !== '/200.html' && r !== '/404.html',
          )
          .sort();

        // ── sitemap.xml ─────────────────────────────────────────────────────
        const today = new Date().toISOString().slice(0, 10);
        const sitemap =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          publicRoutes
            .map((r) => `  <url><loc>${site}${r}</loc><lastmod>${today}</lastmod></url>`)
            .join('\n') +
          `\n</urlset>\n`;
        writeFileSync(join(baseDir, 'sitemap.xml'), sitemap);

        // ── robots.txt (output root; shell owns it in subpath mode) ────────
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
          join(baseDir, 'manifest.webmanifest'),
          `${JSON.stringify(manifest, null, 2)}\n`,
        );

        // ── 404.html ← prerendered /not-found (the designed 404) ───────────
        const notFoundSrc = join(
          publicDir,
          withoutLeadingSlash(withBase('/not-found', base)),
          'index.html',
        );
        const notFoundDst = join(publicDir, '404.html');
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
