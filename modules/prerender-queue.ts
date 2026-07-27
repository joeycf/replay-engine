import { defineNuxtModule } from 'nuxt/kit';
import { withLeadingSlash, withoutBase } from 'ufo';

/**
 * PRERENDER QUEUE NORMALIZATION — one logical route renders exactly once.
 *
 * Nitro's prerender queue is a plain `Set<string>` deduped by EXACT STRING, but
 * routes enter it in two different URL spaces and two different query forms, so
 * the same logical page is queued under several spellings and rendered several
 * times. Where each spelling comes from:
 *
 *   • base-prefixed, no query — the engine's own seeds ('/', '/health',
 *     '/not-found') and each game's entity seeds, both joinURL'd onto
 *     app.baseURL, plus every crawled <a href> (document space is prefixed).
 *   • ROUTER space, no query — nuxt's pages plugin
 *     (pages/runtime/plugins/prerender.server.ts) walks the ROUTER's own route
 *     table and re-enqueues it through `prerenderRoutes()`, i.e. de-based, as
 *     an `x-nitro-prerender` response header on the first page rendered.
 *   • base-prefixed WITH a `?<buildId>` cache-buster — the payload <link> that
 *     @nuxt/nitro-server renders into every page's head
 *     (joinURL(baseURL, url, '_payload.json') + '?' + buildId), harvested by
 *     nitro's link crawler.
 *   • ROUTER space, no query — the payload hint the same renderer appends as
 *     `x-nitro-prerender`, built from the DE-BASED ssrContext.url.
 *
 * So under a subpath base every page is queued twice and every payload twice.
 * That is not merely wasteful, it is the intermittent build failure: the two
 * payload twins render the same route concurrently, and whichever loses the
 * race 500s — `failOnError` then kills the whole build. Six consecutive 2XKO
 * production builds died exactly this way (victims: /health's payload ×3,
 * /not-found's payload ×3), always on the `?<buildId>` spelling.
 *
 * The `?<buildId>` spelling cannot even produce an artifact: nitro's
 * `canWriteToDisk` refuses any route containing '?', so that render is
 * discarded ("(skipped)" in the build log) after paying full price for it. It
 * exists solely as a coin-flip chance to fail the build.
 *
 * TWO RULES, applied before a single route is fetched:
 *
 *   A. A `_payload.json` / `_payload.js` route keeps its path and drops the
 *      query. The cache-buster is for the BROWSER; the renderer strips it
 *      (`ssrContext.url.replace(/\?.*$/, '')`) and nitro can never write it.
 *      This collapses the two payload twins onto one string.
 *   B. Routes are deduped on their LOGICAL key — `withoutBase(path) + search`,
 *      the same de-basing nitro applies when it computes `fileName`. The first
 *      spelling to claim a key is the one that renders; later spellings of the
 *      same logical route are dropped.
 *
 * Rule B keeps the BASE-PREFIXED spelling in practice, because the seed set is
 * normalized before rendering starts and every seed is base-prefixed — the
 * router-space twins arrive later, mid-crawl, and lose. That is the spelling
 * nitro's write pipeline wants: the static presets suffix `publicDir` with the
 * base (`vercel-static` → `.vercel/output/static/{{ baseURL }}`) and then write
 * routes DE-based beneath it, so a base-prefixed route round-trips to exactly
 * the right file — and `canPrerender`'s public-asset filter compares against
 * base-prefixed `publicAssets` baseURLs, which a router-space spelling would
 * slip past. (Router space also silently corrupts the vercel preset's
 * `overrides` map, whose keys are de-based fileNames and whose values are the
 * raw route: the router-space twin of /stats overwrote the correct entry with
 * `{"path": "stats"}`.)
 *
 * WHY `prerender:routes` AND NOT `prerender:route`: `prerender:route` fires
 * after a route has already been fetched — far too late to prevent the render.
 * `prerender:routes` fires once, with the live Set nitro will iterate, before
 * the prerenderer is even built. Crawled links and header hints are added to
 * that SAME Set instance later, from inside `generateRoute`, with no hook of
 * their own — so the queue's own `add` is the only interception point that
 * covers discoveries, and taking it here makes the outcome deterministic
 * rather than dependent on which twin wins a race.
 *
 * At base '/' rule B is an identity (`withoutBase` no-ops on an empty base) and
 * no page twins exist, but rule A still fires: root builds shed the same
 * ~1 render-per-page of discarded payload work, with byte-identical output.
 *
 * Sibling of modules/static-artifacts.ts, which normalizes the same mixed-space
 * queue on the way OUT (its view of what was rendered). This normalizes the
 * queue itself, so both now agree by construction.
 */

const PAYLOAD_ROUTE_RE = /\/_payload\.(?:json|js)$/;

export default defineNuxtModule({
  meta: { name: 'replay-engine:prerender-queue' },
  setup(_options, nuxt) {
    // prerendering only happens on a generated build
    if (nuxt.options.dev) return;

    nuxt.hook('nitro:init', (nitro) => {
      nitro.hooks.hook('prerender:routes', (routes) => {
        // nitro.options.baseURL — NOT nuxt.options.app.baseURL — because this
        // must key routes exactly the way generateRoute() de-bases them.
        const base = nitro.options.baseURL || '/';
        const claimed = new Map<string, string>();
        const suppressed = new Set<string>();

        const split = (route: string) => {
          const q = route.indexOf('?');
          return q === -1
            ? { path: route, search: '' }
            : { path: route.slice(0, q), search: route.slice(q) };
        };

        /** Rule A: drop a payload route's cache-buster query. */
        const normalize = (route: string) => {
          const { path, search } = split(route);
          return PAYLOAD_ROUTE_RE.test(path) ? path : path + search;
        };

        /** Rule B: the base-independent identity of a route. */
        const logicalKey = (route: string) => {
          const { path, search } = split(route);
          return withLeadingSlash(withoutBase(path, base)) + search;
        };

        /** Returns the spelling to queue, or null if a twin already holds it. */
        const claim = (route: string) => {
          const normalized = normalize(route);
          const key = logicalKey(normalized);
          const held = claimed.get(key);
          if (held !== undefined) {
            // Record the DISTINCT alternate spellings suppressed — one per
            // render this saved. Counting calls instead would inflate the
            // number: the crawler re-offers a link from every page carrying
            // it, and nitro's own `canPrerender` cannot filter a spelling it
            // never dispatched.
            if (held !== route) suppressed.add(route);
            return null;
          }
          claimed.set(key, normalized);
          return normalized;
        };

        // Bound BEFORE the override so re-entry is impossible.
        const rawAdd = Set.prototype.add.bind(routes);

        const seeds = [...routes];
        routes.clear();
        for (const seed of seeds) {
          const kept = claim(seed);
          if (kept) rawAdd(kept);
        }

        // Every later discovery — crawled <a href>s and x-nitro-prerender
        // hints — lands here, because generateRoute() adds them to this very
        // Set. Synchronous, so a twin pair from one page's links is always
        // resolved before either can be dispatched.
        routes.add = (route: string) => {
          const kept = claim(route);
          if (kept) rawAdd(kept);
          return routes;
        };

        nitro.hooks.hook('prerender:done', () => {
          console.log(
            `✓ prerender queue: ${claimed.size} logical routes, ` +
              `${suppressed.size} duplicate spellings collapsed`,
          );
        });
      });
    });
  },
});
