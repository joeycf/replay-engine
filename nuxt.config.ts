import { fileURLToPath } from 'node:url';
import { joinURL } from 'ufo';
import tailwindcss from '@tailwindcss/vite';

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

    // Seed prerender routes under the FINAL resolved base path. A static
    // `routes: ['/']` list would 404 when a game builds at '/2xko' (explicit
    // prerender entries are not auto-prefixed); resolving from
    // nuxt.options.app.baseURL keeps the engine base-path-safe (PLAN.md §2.3).
    // Same mechanism Nuxt core uses for its own seeds (nitro:init →
    // nitro.options.prerender.routes). '/' is the crawl seed; '/health' isn't
    // nav-linked, so it's listed explicitly.
    function enginePrerenderSeeds(_options, nuxt) {
      nuxt.hook('nitro:init', (nitro) => {
        for (const route of ['/', '/health']) {
          nitro.options.prerender.routes.push(joinURL(nuxt.options.app.baseURL, route));
        }
      });
    },
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
