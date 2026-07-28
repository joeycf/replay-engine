// Vercel Web Analytics + Speed Insights, wired for the subpath topology.
//
// Replaces BOTH the bare `@vercel/analytics` Nuxt module (nuxt.config modules)
// and the old speed-insights.client.ts. Neither could stay: the module accepts
// no options at all, and both SDKs' Nuxt wrappers report a path that is wrong
// behind the shell.
//
// Two INDEPENDENT bugs this fixes, found 2026-07-27 after ~10 days of blind
// deploys (PLAN.md Phase-7 retro). Both had to be fixed together — fixing
// either alone still yields unusable data:
//
// 1. DEAD ENDPOINTS. Vercel's build bakes a per-project obfuscated path into
//    every bundle (VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG, e.g.
//    "41a6d9d2116e7933/script.js"). Those paths exist ONLY on the project's own
//    host. Proxied onto the apex by the shell's rewrite they 404, so all three
//    games reported NOTHING — dropped, not misattributed, both SDKs. The seed
//    changes on every build, so nothing can be hardcoded; the cure is explicit
//    endpoints, which win because loadProps() spreads the baked config FIRST
//    and explicit props last.
//
//    Web Analytics needs all THREE per-type endpoints, not just one: the served
//    script resolves `e[`${t}Endpoint`] || ("endpoint" in e ? … : default)`, so
//    a lone `endpoint` still loses to the baked per-type values.
//
// 2. BASE-STRIPPED PATHS. Both SDKs' Nuxt wrappers report vue-router's
//    `route.path`, which has app.baseURL removed — /2xko/stats arrives as
//    /stats and collides with Tekken's /stats in whichever dashboard receives
//    it. So the wrappers are bypassed for the generic injectors (both packages
//    export computeRoute + their injector from the package root) and every
//    reported route/path goes back through withBase(). For the shell, whose
//    base is '/', withBase is the identity — this plugin changes nothing there.
//
// Endpoints come from GameConfig.observability, never hardcoded here, and are
// overridden ONLY when they can actually be wrong:
//
//   base '/'        → no override. The app is served from its own origin, so
//                     the baked path already resolves, and keeping it preserves
//                     Vercel's ad-blocker resistance (the whole point of the
//                     obfuscated seed). This is the shell and the fixtures app.
//   base '/<slug>/' → override. Defaults to the stable un-obfuscated paths,
//                     which are served by whichever project owns the DOMAIN —
//                     behind the shell that is always the shell, so the default
//                     pools every game into the shell's dashboard, now keyed by
//                     correct /<slug>/… paths.
//   explicit config → always wins. A game sets `insights` to a per-game proxy
//                     prefix (matching a `/<slug>-insights/:path*` rewrite in
//                     the shell's vercel.json) to send Web Analytics to its OWN
//                     project.
//
// Speed Insights deliberately has no per-game override in use: it is
// single-project on the Hobby plan, so its beacons must land on whichever
// project has the feature enabled.
//
// Client-only (.client.ts): nothing enters the prerendered HTML, the scripts
// attach in the browser. Both SDKs are dev-inert and no-op off Vercel.
import { computeRoute, inject, pageview } from '@vercel/analytics';
import {
  computeRoute as computeVitalsRoute,
  injectSpeedInsights,
} from '@vercel/speed-insights';
import { withBase } from 'ufo';

/** Served by whoever owns the domain. Verified live: 200 on the apex. */
const DEFAULT_INSIGHTS = '/_vercel/insights';
const DEFAULT_SPEED_INSIGHTS = '/_vercel/speed-insights';

/** The per-project obfuscated endpoints Vercel bakes into the build. Read the
 *  same way the SDKs' own wrappers read it, try/catch included — it is absent
 *  off-Vercel and in dev. Passed straight through when this app is NOT proxied,
 *  so a root-based consumer keeps Vercel's default: the obfuscated path is the
 *  ad-blocker-resistant one, and on its own origin it is already correct. */
function bakedConfig(): string | undefined {
  try {
    return (import.meta.env as unknown as Record<string, string | undefined>)
      .VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG;
  } catch {
    return undefined;
  }
}

/** sampleRate 0.5 — Hobby projects have a monthly event cap and these niche
 *  sites spike on tournament weekends; reporting half the page views keeps
 *  Core Web Vitals statistics sound while staying under the cap. */
const VITALS_SAMPLE_RATE = 0.5;

type RouteLike = { path: string; params: Record<string, string | string[]> };

export default defineNuxtPlugin(() => {
  const base = useRuntimeConfig().app.baseURL;
  const observability = useGame().observability ?? {};

  // Override the baked endpoints ONLY when they can actually be wrong: under a
  // base the app is proxied onto someone else's origin, where the per-project
  // path 404s. A root-based consumer (the shell, the fixtures app, any
  // standalone game) is served from its OWN origin, so the baked path already
  // resolves — and keeping it preserves Vercel's ad-blocker resistance, which
  // the stable /_vercel/… path does not have. An explicit config always wins.
  const proxied = base !== '/';
  const trim = (p: string) => p.replace(/\/+$/, '');
  const insights = observability.insights
    ? trim(observability.insights)
    : proxied
      ? DEFAULT_INSIGHTS
      : null;
  const speedInsights = observability.speedInsights
    ? trim(observability.speedInsights)
    : proxied
      ? DEFAULT_SPEED_INSIGHTS
      : null;
  const baked = bakedConfig();

  const router = useRouter();
  const route = useRoute();

  /** Router paths are base-STRIPPED; every reported value goes back through
   *  withBase so /stats reports as /2xko/stats, not as Tekken's /stats. */
  const reportedPath = (to: RouteLike) => withBase(to.path, base);
  const reportedRoute = (to: RouteLike, compute: typeof computeRoute) =>
    withBase(compute(to.path, to.params) ?? to.path, base);

  // ── Web Analytics ─────────────────────────────────────────────────────────
  // disableAutoTrack: the script's own listener would report the raw,
  // base-stripped pathname; pageviews are sent below instead, base-prefixed.
  onNuxtReady(() => {
    inject(
      {
        framework: 'nuxt',
        disableAutoTrack: true,
        // All THREE per-type keys, never a lone `endpoint`: the served script
        // resolves `e[`${t}Endpoint`]` first, so the baked per-type values
        // would otherwise still win.
        ...(insights && {
          scriptSrc: `${insights}/script.js`,
          viewEndpoint: `${insights}/view`,
          eventEndpoint: `${insights}/event`,
          sessionEndpoint: `${insights}/session`,
        }),
      },
      baked,
    );
    pageview({ route: reportedRoute(route, computeRoute), path: reportedPath(route) });
  });
  router.afterEach((to) => {
    pageview({ route: reportedRoute(to, computeRoute), path: reportedPath(to) });
  });

  // ── Speed Insights ────────────────────────────────────────────────────────
  const vitals = injectSpeedInsights(
    {
      framework: 'nuxt',
      sampleRate: VITALS_SAMPLE_RATE,
      route: reportedRoute(route, computeVitalsRoute),
      ...(speedInsights && {
        scriptSrc: `${speedInsights}/script.js`,
        endpoint: `${speedInsights}/vitals`,
      }),
    },
    baked,
  );
  router.afterEach((to) => {
    vitals?.setRoute(reportedRoute(to, computeVitalsRoute));
  });
});
