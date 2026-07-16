import { fileURLToPath } from 'node:url';
import { joinURL } from 'ufo';
import tailwindcss from '@tailwindcss/vite';
import { characterSegment, loadMergedGameConfig } from './lib/game-config';

// The base configuration for the `replay-engine` Nuxt LAYER. Consuming game
// apps `extends` a pinned tag of this repo and inherit everything here; the
// engine also runs standalone (see the /fixtures dev-app) for its own dev.
export default defineNuxtConfig({
  // Names this layer for clearer devtools/error output when extended.
  $meta: { name: 'replay-engine' },

  compatibilityDate: '2025-07-01',

  // ---- Base-path awareness (PLAN.md §2.3) ---------------------------------
  // Defaults to '/'. A consuming game runs correctly at '/' or under '/2xko'
  // purely by changing app.baseURL — in its own nuxt.config or via the
  // NUXT_APP_BASE_URL env var at BUILD time (read here explicitly: on its own
  // the env var only overrides *runtime* config, which desyncs the router from
  // build-time asset paths and prerender seeds under SSG). Every absolute
  // asset/data path in the engine goes through withBase() or <NuxtLink>, so the
  // subpath-vs-subdomain routing decision stays a config flip.
  app: {
    baseURL: process.env.NUXT_APP_BASE_URL || '/',
  },

  // Canonical origin for SEO/OG/sitemap URLs. NUXT_PUBLIC_SITE_URL (set per
  // Vercel project) wins at build/runtime; empty ⇒ engine composables fall
  // back to GameConfig.siteUrl.
  runtimeConfig: {
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || '',
    },
  },

  // ---- SSG + Vercel static output (PLAN.md §0 / §9), inherited by apps -----
  nitro: {
    preset: 'vercel-static',
    prerender: {
      crawlLinks: true,
    },
  },

  modules: [
    // Canonical shared lint tooling (STACK.md): generates the project-aware
    // flat config into .nuxt/eslint.config.mjs on `nuxt prepare`. Consuming
    // game apps inherit this module, so every repo lints under the same rules.
    '@nuxt/eslint',

    // Vercel Web Analytics — no-ops off-Vercel/in dev. Hoisted engine-wide so
    // games drop their local copies in Phase 3 (paired with the
    // speed-insights.client.ts plugin).
    '@vercel/analytics',

    // Seed prerender routes under the FINAL resolved base path. A static
    // `routes: ['/']` list would 404 when a game builds at '/2xko' (explicit
    // prerender entries are not auto-prefixed); resolving from
    // nuxt.options.app.baseURL keeps the engine base-path-safe (PLAN.md §2.3).
    // Same mechanism Nuxt core uses for its own seeds (nitro:init →
    // nitro.options.prerender.routes). '/' is the crawl seed; '/health' and
    // '/not-found' aren't nav-linked, so they're listed explicitly
    // (/not-found also feeds the static-artifacts 404.html copy).
    function enginePrerenderSeeds(_options, nuxt) {
      nuxt.hook('nitro:init', (nitro) => {
        for (const route of ['/', '/health', '/not-found']) {
          nitro.options.prerender.routes.push(joinURL(nuxt.options.app.baseURL, route));
        }
      });
    },

    // Remap the characters section's URL segment when the game configures one
    // (GameConfig.characterRouteSegment, additive v0.2.0): /characters/* pages
    // are renamed at route-registration time so 2XKO's indexed /champions/*
    // URLs survive the layer refactor with no page-file duplication. Engine
    // links resolve through useGameTerms().characterPath, so nav, roster
    // cards, and JSON-LD follow the same segment.
    function engineCharacterRoutes(_options: unknown, nuxt: import('nuxt/schema').Nuxt) {
      nuxt.hook('pages:extend', async (pages) => {
        const segment = characterSegment(await loadMergedGameConfig(nuxt));
        if (segment === 'characters') return;
        for (const page of pages) {
          if (page.path === '/characters' || page.path.startsWith('/characters/')) {
            page.path = page.path.replace(/^\/characters/, `/${segment}`);
          }
        }
      });
    },

    // Build artifacts every game inherits: sitemap.xml from the real prerender
    // list, robots.txt, manifest.webmanifest from GameConfig, and the designed
    // 404.html (prerendered /not-found copied over nitro's SPA fallback).
    // Absolute path so the module resolves when this config runs as a layer.
    fileURLToPath(new URL('./modules/static-artifacts.ts', import.meta.url)),
  ],

  // ---- Tailwind v4 (CSS-first) via the official first-party Vite plugin ----
  // NOTE: the community @nuxtjs/tailwindcss@6 is pinned to Tailwind v3
  // (`tailwindcss: ~3.4.17`) and cannot express the CSS-first `@theme` override
  // architecture this engine's theming depends on (PLAN.md §4b). We therefore
  // use @tailwindcss/vite + Tailwind v4 directly. Registered via a hook so it
  // reliably applies when this config is loaded as an extended layer.
  hooks: {
    'vite:extendConfig'(viteConfig) {
      // Nuxt types `plugins` as readonly here; vite's own UserConfig is the
      // honest mutable shape for this extension point.
      const cfg = viteConfig as import('vite').UserConfig;
      cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
    },
  },

  // Engine CSS entry: Tailwind + the two-tier tokens. Absolute path (computed
  // from this file) so it resolves no matter which rootDir builds the layer.
  css: [fileURLToPath(new URL('./tailwind/index.css', import.meta.url))],

  // ---- Layer-safe alias (PLAN.md §11) -------------------------------------
  // Engine files must NOT import their own code/types via ~~/ — under a
  // consuming app, ~~ resolves to the *app's* rootDir, not the engine's.
  // `@engine/*` is pinned to this layer's directory, computed from this file,
  // so it always points at the engine wherever it is installed.
  alias: {
    '@engine': fileURLToPath(new URL('.', import.meta.url)).replace(/\/$/, ''),
  },

  typescript: {
    // Typecheck is run explicitly via `npm run typecheck` (vue-tsc), not inline.
    typeCheck: false,
  },

  devtools: { enabled: true },
});
