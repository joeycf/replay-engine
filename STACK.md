# STACK.md — the canonical stack reference

The **as-built, locked stack** of `replay-engine`, and the stack contract for every repo
that consumes it: `tekken-replay-database`, `replaydatabase-shell`, and the
`2xko-replay-database` modernization (PLAN §0/§6.3a). Where `PLAN.md` and this file differ
on stack details — versions, file locations, delivery mechanisms — **this file wins**
(PLAN §5 says the same). Architecture, phases, and product decisions stay in `PLAN.md`.

Update this file in the same commit as any dependency bump or convention change.

---

## 1. Locked stack

Verified working together on **Node v24.16.0 / npm 11.13.0** (WSL2 Linux). Exact resolved
versions from `package-lock.json` (ranges in `package.json` are caret; the lockfile pins
builds; this table records the tested truth):

### Runtime `dependencies`

Kept deliberately minimal — git-layer consumers install these, so nothing dev-shaped
belongs here.

| Package                  | Version | Role                                                                                                                                              |
| ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwindcss`            | 4.3.2   | Tailwind **v4**, CSS-first `@theme` (the theming foundation)                                                                                      |
| `@tailwindcss/vite`      | 4.3.2   | Official first-party Vite plugin — the ONLY Tailwind module                                                                                       |
| `ufo`                    | 1.6.4   | `withBase` / `joinURL` — every absolute URL goes through it                                                                                       |
| `animejs`                | 4.5.0   | Chart reveals (v4 **named-export** API: `import { animate, stagger }` — never the v3 default import); dynamically imported so it stays out of SSR |
| `@vercel/analytics`      | 2.0.1   | Web analytics Nuxt module, hoisted engine-wide (no-ops off-Vercel)                                                                                |
| `@vercel/speed-insights` | 2.0.0   | CWV reporting via the engine's client plugin (sampleRate 0.5)                                                                                     |

The two `@vercel/*` packages peer-declare `vue-router ^4` while Nuxt 4 ships v5 (runtime
compatible — the live 2XKO deployment proves it). The engine's `package.json` carries an
`overrides` block pinning their `vue-router` peer to `^5`; **overrides don't propagate**,
so every consuming repo replicates those 6 lines (part of the §1 replication contract).

### `devDependencies`

| Package                               | Version | Role                                                                                                                                                                                             |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `nuxt`                                | 4.4.8   | Framework (also `peerDependencies: nuxt ^4.0.0`)                                                                                                                                                 |
| `typescript`                          | 5.9.3   | Compiler                                                                                                                                                                                         |
| `vue-tsc`                             | 3.3.7   | Template-aware typecheck (`nuxt typecheck`); `^3.3.6` aligns with the live 2XKO repo so the Phase-3 modernization never downgrades it a major                                                    |
| `@types/node`                         | 24.13.3 | Required — without it the generated `tsconfig.node.json` has empty `types` and `node:*` imports fail. Pinned `^24` to match the tested Node 24 runtime (types a major ahead permit phantom APIs) |
| `@nuxt/eslint`                        | 1.16.0  | ESLint module — generates project-aware flat config on `nuxt prepare`                                                                                                                            |
| `eslint`                              | 10.6.0  | Linter (flat config)                                                                                                                                                                             |
| `eslint-config-prettier`              | 10.1.8  | Appended **last** — Prettier owns formatting                                                                                                                                                     |
| `prettier`                            | 3.9.5   | Formatter (`.prettierrc`: semi, single-quote, trailing-comma all, width 100, single-attr-per-line)                                                                                               |
| `@fontsource-variable/space-grotesk`  | 5.2.10  | Neutral display face source (see §2 fonts)                                                                                                                                                       |
| `@fontsource-variable/inter`          | 5.2.8   | Neutral UI face source                                                                                                                                                                           |
| `@fontsource-variable/jetbrains-mono` | 5.2.8   | Neutral mono face source                                                                                                                                                                         |
| `puppeteer-core`                      | 25.3.0  | Browser verification suites (drives system Chrome; no bundled browser)                                                                                                                           |

**Not in the stack, on purpose:** Pinia (PLAN §0), `@nuxtjs/tailwindcss` (v3-locked — see
§4), `@nuxtjs/google-fonts` (replaced by fontsource/Vite assets), any test framework
beyond the node-driven scripts (revisit when Phase 2 grows real component logic).

### Version policy

- Game repos align to these versions when they adopt the engine (2XKO modernization
  explicitly rides this table, PLAN §6.3a).
- Bumps happen in the engine first and get verified by `typecheck`, `lint`,
  `test:filters`, and the browser suites, then propagate to games via the engine pin bump.

### Node version policy

- **Runtime = the newest major that is both Active LTS and available for Vercel builds**
  (currently **24**; `engines.node: ">=24 <25"` in package.json).
- **`.nvmrc` holds the bare major (`24`)** and is replicated in all four repos (engine,
  shell, both games) — part of the §1 replication contract. Major only, deliberately: it
  mirrors the `engines.node` range and the game workflows' `node-version: 24`, so a patch
  release can never put the file out of step with the artifacts it tracks. `nvm use`
  resolves it to the newest installed 24.x (v24.16.0 as tested above).
- `@types/node` always tracks the runtime major (types a major ahead permit phantom APIs).
- Bumps happen engine-first with the `engines.node` field updated and the full gate
  battery re-verified (positive controls included), then propagate via the engine pin.
  A Node major bump touches **`engines.node` + `.nvmrc` in every repo**, plus
  `node-version` in the two game repos' `.github/workflows/data-refresh.yml` (the engine
  and shell ship no workflows).

---

## 2. Delivery mechanisms (how each piece is wired)

### Tailwind v4 — via `@tailwindcss/vite` through a `vite:extendConfig` hook

`@nuxtjs/tailwindcss@6` (latest) pins `tailwindcss ~3.4.17` and **cannot run v4** or its
CSS-first `@theme`; the override architecture (games shadow engine tokens) requires v4.
(`@theme` is engine-internal: it compiles only inside the engine's own CSS graph below.
App theme files shadow with plain unlayered `:root`, never `@theme` — §5.13.)
The engine registers the official Vite plugin in `nuxt.config.ts`:

```ts
hooks: {
  'vite:extendConfig'(viteConfig) {
    const cfg = viteConfig as import('vite').UserConfig; // Nuxt types plugins readonly
    cfg.plugins = [...(cfg.plugins ?? []), tailwindcss()];
  },
},
```

The hook (rather than a `vite.plugins` array entry) survives layer merging — consuming
apps inherit it and must **not** add any Tailwind module themselves. CSS entry:
`tailwind/index.css` (`@import 'tailwindcss'` → `@source '../app'` → `structural.css` →
`theme-default.css`), registered with an absolute path computed from the engine's
`import.meta.url` so it resolves from any rootDir.

### Fonts — committed, Vite-processed assets (never `public/` URLs)

- **Engine (neutral faces):** `woff2` + OFL licenses **committed** in `tailwind/fonts/`,
  referenced from `theme-default.css` with **relative** `url()`s → Vite emits hashed,
  base-path-safe assets. Committed because git-layer consumers prune the engine's
  devDependencies (§5) — an install-time copy from `@fontsource-*` would leave consumers
  without fonts and break their builds. Refresh deliberately via `npm run fonts:update`.
- **Game apps:** normal npm installs, so they may either depend on `@fontsource-*`
  packages directly and import them in `app/assets/theme.css`, or commit `woff2` next to
  the CSS the same way — both are Vite-processed. What they must never do: reference
  fonts as absolute `/fonts/*` from `public/` (§5, CSS `url()` constraint).

### Registry provisioning (PLAN §2.4 as amended — landed in Phase 2)

- **API:** a game app statically imports its small registries and calls
  `provideRegistries({ characters, players, stats })` (engine util, auto-imported)
  from a normal app plugin (`app/plugins/registries.ts`). Arrays or id-keyed records
  both accepted; the holder is module-scope (registries are constant per app).
- Engine composables (`useCharacters` / `usePlayers` / `useStats`) consume
  **provided-first** and fall back to a client fetch of `/data/*.json` only when nothing
  was provided. `useReplays()` is ALWAYS `server:false` from `public/data/replays.json`.
- Provided data is synchronously available during SSR/prerender → registry pages emit
  real HTML with data-derived titles (the SEO requirement), with no payload
  serialization and no hydration drift (client bundles the identical import).
- Pure-core semantics unit-tested in `scripts/test-registry.mjs`; `/health` shows each
  collection's provisioning path. The fixtures app provisions exactly like a real game.

### Game-panel extension slots (PLAN §11 "game-specific stat systems")

- The engine ships **empty** `GameStatsPanels.vue` (stats page; receives `patch`) and
  `GameCharacterPanels.vue` (character page; receives `characterId`). A game injects its
  own panels by shipping components at the SAME path — Nuxt layer precedence resolves the
  app's copy over the engine's. No registry, no config: the override mechanism already
  used for per-game flourishes (PLAN §4b). Fixtures prove it with a dummy panel; 2XKO's
  fuse panels are the first real consumers (Phase 3).

### Static build artifacts (modules/static-artifacts.ts)

- Every generated site inherits: `sitemap.xml` (from the ACTUAL prerendered route list,
  path routes only, `/health` + `/not-found` excluded, base-prefixed), `robots.txt`,
  `manifest.webmanifest` (GameConfig name/short_name/colors + base-correct icons), and
  the **designed 404** — the prerendered `/not-found` page copied over nitro's SPA
  fallback `404.html`, content-checked against the NotFoundContent marker ("No data at
  this route") so a silent regression fails the build. Zero per-app scripting (replaces
  the shipped repo's `build:before` sitemap hook + postgenerate script).

### TypeScript — canonical base + two-root project-references typecheck

- `tsconfig.base.json` — the canonical strictness baseline (`strict`,
  `forceConsistentCasingInFileNames`, `skipLibCheck`, `noEmit`). Game repos replicate or
  extend it; the engine's copy is canonical.
- Root `tsconfig.json` and `fixtures/tsconfig.json` extend the base and hold **only**
  project references to the Nuxt-4 generated contexts (`.nuxt/tsconfig.{app,node,shared}.json`).
- `npm run typecheck` = `nuxt prepare && nuxt typecheck && nuxt typecheck fixtures` —
  the second root re-checks all engine code **as consumed through the layer** (the same
  shape every game gets). Game repos run the same pattern against their own root.

### Lint / format — `@nuxt/eslint` flat config + Prettier

- `'@nuxt/eslint'` is in the **engine's** `modules`, so every consuming app inherits it;
  each repo's `nuxt prepare` generates its project-aware `./.nuxt/eslint.config.mjs`.
- Repo-root `eslint.config.mjs` = `withNuxt(…overrides, eslintConfigPrettier)` with
  `eslint-config-prettier` **last**. ESLint owns correctness; Prettier owns formatting
  (no stylistic ESLint rules). What consuming repos replicate is that **shape**, not the
  bytes: the overrides in the middle are legitimately per-repo (the engine declares
  browser globals for its Puppeteer scripts and ignores `fixtures/` build dirs; the games
  ignore `raw/`, `cache/`, `data/`, `design/`; the shell needs none and is a bare
  `withNuxt(eslintConfigPrettier)`). `verify:replication` therefore checks the shape —
  prettier imported, `withNuxt(…)` exported, `eslintConfigPrettier` last — and would
  false-positive on all four repos if it compared bytes.
- `.prettierrc`: `{ semi: true, singleQuote: true, trailingComma: "all", printWidth: 100, singleAttributePerLine: true }`.
  `.prettierignore` excludes generated output, binaries, `public/`, `design/`, and
  **`PLAN.md`** (hand-authored; never machine-reflowed).
- Convention surfaced by lint: `vue/multi-word-component-names` is enforced — brand
  components use the `Brand*` prefix (`BrandWordmark`; Phase 2 adds `BrandMark`,
  `BrandSpinner`, `BrandLogo` per PLAN §5).
- **SFC authoring order (set 2026-07-18):** every `.vue` file is **template-first** —
  `<template>` → `<script setup lang="ts">` → `<style scoped>`. `singleAttributePerLine`
  then breaks every multi-attribute tag one-attribute-per-line (single/no-attribute tags
  stay inline). Applied engine-wide; **consuming repos replicate `.prettierrc` and this
  block order verbatim** so cross-repo diffs stay clean.

### Enforcing the replication contract

Everything §1 and §2 call "replicated" lives in each consuming repo's own copy, which the
layer cannot reach — so it drifts silently and stays broken until someone notices by hand
(v0.5.2's `.prettierrc` flag reached the shell but neither game, §11).
**`npm run verify:replication`** (`scripts/verify-replication.mjs`) is the gate: it
discovers sibling repos whose `nuxt.config.ts` extends the engine — so a new game is
covered the day it appears — and checks each invariant the contract actually names:

| rule                 | check                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `.prettierrc`        | deep-equal (genuinely verbatim — it decides formatting)                       |
| `.nvmrc`             | equal                                                                         |
| `engines.node`       | equal                                                                         |
| `overrides`          | deep-equal (the `vue-router ^5` peer pin — overrides never propagate)         |
| `tsconfig.base.json` | consumer `compilerOptions` ⊇ the engine's ("replicate **or extend**")         |
| `eslint.config.mjs`  | structural — `withNuxt(…)` with `eslintConfigPrettier` **last**               |
| layer modules        | packages the engine declares in `modules` present in consumer devDeps (§5.10) |
| SFC block order      | every `.vue` file is template-first                                           |

Not byte-equality where the contract doesn't mean it: each repo legitimately ignores its
own build dirs and declares its own globals, so `eslint.config.mjs` is checked for shape,
not sameness. Run it before cutting an engine tag and after adopting one.

### Scripts (the canonical set)

| Script                                   | What it does                                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dev` / `build` / `generate` / `preview` | Run against **`fixtures/`** — the thin consuming app (`extends: ['..']`)                                                              |
| `typecheck`                              | Two-root `vue-tsc` check (see above)                                                                                                  |
| `lint` / `lint:fix`                      | `nuxt prepare && eslint .` (prepare guarantees the generated config exists)                                                           |
| `format` / `format:check`                | Prettier across the repo                                                                                                              |
| `test:filters`                           | Pure-logic filter semantics (facets, search, sort) against the fixture dataset                                                        |
| `test:registry`                          | Registry-provisioning store semantics incl. the fetch-fallback (unprovided) state                                                     |
| `verify:replication`                     | The §1/§2 replication contract across every sibling consuming repo (see below)                                                        |
| `fonts:update`                           | Refresh committed neutral fonts from `@fontsource-*`                                                                                  |
| `scripts/fixtures-data.mjs`              | Derives fixture stats.json from replays (pipeline parity); `--1v1` emits the rank-ladder variant                                      |
| `scripts/verify-phase2.mjs`              | Full ported-UI click-through (47 checks: filters/matchup/search/sort/modal/drawer/stats/404/SEO/network/reduced-motion/manifest)      |
| `scripts/verify-browser.mjs`             | Phase-1 hydrated-client suite (counts, toggle clicks, theme/accent tokens)                                                            |
| `scripts/verify-subpath.mjs`             | Base-path resilience probe — asserts no request escapes the base                                                                      |
| `scripts/verify-override.mjs`            | Theme-override gate on the BUILT fixture bundle, both directions (`:root` override wins / removal → umbrella) + raw-`@theme` tripwire |

SSG: `nitro.preset = 'vercel-static'`, `prerender.crawlLinks = true`; output lands in
`fixtures/.vercel/output/static` (games: their own `.vercel/output`).

---

## 3. Nuxt 4 layout conventions

- **`app/` is the srcDir.** `app.config.ts` lives at **`app/app.config.ts`** — a
  root-level `app.config.ts` is **silently ignored** (verify pickup via the import in
  `.nuxt/app.config.mjs`). PLAN §5 trees reflect this; older Nuxt-3-style diagrams do not.
- **Layer anatomy:** `$meta.name: 'replay-engine'`; the `@engine` alias pinned via
  `fileURLToPath(new URL('.', import.meta.url))` so engine code never self-references
  through `~~/` (which resolves to the _consumer's_ rootDir under a layer); CSS entry by
  absolute path for the same reason. Engine-internal imports (composables/utils/types,
  including cross-`app/` type imports) go through **`@engine/…`** (e.g.
  `@engine/app/composables/useStatsRows`) — never relative `../` or `@`/`~`, which
  mis-resolve to the consumer's srcDir under a layer.
- **`fixtures/` is a real consuming app**, not a data-copy step: its own
  `fixtures/app/app.config.ts` (`charactersPerSide: 2`, `coOccurrence: true`) merges over
  the engine default (`1`, `false`) through the exact mechanism a game uses. Engine dev is
  therefore always exercising the layer contract.
- **`public/` is inherited** by consumers (favicon + icon set ship from the engine; a game
  overrides by shipping the same filenames). Verified for the **local-path** layer
  (`ENGINE_PATH` / `extends: ['..']`); the **remote** (`github:`) layer case gets
  re-verified on the Phase 3 preview deploy before it's relied on in prod.
- **Data flow (Phase-1 as-built):** all collections client-fetched (`server: false`)
  through `useDataUrl()` → `withBase()`. Per updated PLAN §2.4, Phase 2 adds the registry
  **provisioning API** (bundled registries for prerendered SEO); the client fetch then
  remains as the standalone/fixture fallback. Client-only result subtrees sit inside
  `<ClientOnly>` (see §5, hydration).

---

## 4. Why not `@nuxtjs/tailwindcss` (and other rejections)

- **`@nuxtjs/tailwindcss@6.14`** ships `tailwindcss ~3.4.17`. Tailwind v3 has no CSS-first
  `@theme`, so game re-skins by CSS shadowing would be impossible. Rejected; do not add it
  to any repo in the platform (the 2XKO modernization removes it).
- **`@nuxtjs/google-fonts`** — replaced by fontsource/committed Vite assets (no gstatic,
  base-path-safe, no runtime module).
- **Pinia** — not used anywhere in the platform; URL query + composables carry all state.

---

## 5. Standing empirical constraints (violations fail silently — treat as MUSTs)

1. **Tailwind v4 motion namespace is `--transition-duration-*`.** A `--duration-*` token
   is in an unknown namespace: v4 **drops it silently** and `duration-*` utilities fall
   back to the 150ms default. (`--ease-*`, `--radius-*`, `--shadow-*`, `--text-*` +
   `--text-*--line-height`, `--tracking-*`, `--leading-*`, `--font-weight-*` are real
   namespaces.) Utility classes stay `duration-fast` etc.
2. **Prerender seeds must be pushed on `nitro:init`**, base-prefixed:
   `nitro.options.prerender.routes.push(joinURL(nuxt.options.app.baseURL, route))` (the
   engine's `enginePrerenderSeeds` inline module). There is **no `prerender:routes` Nuxt
   hook** in Nuxt 4.4, and static `prerender.routes` arrays are not auto-prefixed — under
   a subpath they 404 the build.
3. **`NUXT_APP_BASE_URL` alone is runtime-only.** For SSG it desyncs the router from
   build-time asset paths and prerender seeds. The engine reads it **explicitly at build**
   (`app.baseURL: process.env.NUXT_APP_BASE_URL || '/'`); games flip base via config or
   this env var and get a correctly nested build (verified: whole site under `static/sub/`
   with zero base-escaping requests).
4. **CSS `url()` cannot be base-prefixed** — CSS has no `withBase()`. Any CSS-referenced
   asset (fonts, textures) must be a **relative** `url()` next to the CSS (Vite emits it
   hashed under the base) — never an absolute `public/` path. Absolute `/fonts/*` is a
   silent 404 under a subpath.
5. **Git-layer consumers prune the engine's `devDependencies` and skip its lifecycle
   scripts.** Anything a consumer's build needs must be a runtime `dependency` or a
   **committed artifact** (that's why the neutral fonts are committed and there is no
   `postinstall`). **And the install is opt-in:** the extend entry MUST be
   `['github:…#tag', { install: true }]` — a bare string clones the layer with NO
   node_modules at all and the engine's runtime deps fail to resolve (verified in the
   Phase-3 remote-layer check; the 2XKO app is the reference).
6. **Internal SSR/prerender `$fetch` cannot read the app's own `public/`** — it falls
   through to the router catch-all and resolves `null` (plus a router warning). Hence:
   registries get **provided/bundled** (Phase-2 API, PLAN §2.4) for real prerendered HTML;
   pure client fetches are marked `server: false`.
7. **`server:false` data + SSR'd conditionals = hydration mismatch.** The server renders
   the no-data branch, the client's first render disagrees. Wrap client-fetched result
   subtrees in `<ClientOnly>` (with a fallback) — as `app/pages/index.vue` does.
8. **`nuxt dev` under a subpath base mis-serves Vite fs-path module URLs** (dev-only
   quirk; `/sub/_nuxt/home/...` 404s). Validate subpath behavior on the **generated**
   output (`verify-subpath.mjs`), never on the dev server.
9. **Headless verification:** `puppeteer-core` drives `/usr/bin/google-chrome-stable`;
   port 3000 may be held by another dev server (Nuxt auto-bumps) — read the actual port
   from the dev log before browser runs.
10. **The remote-layer cache receives a prod-deps-only install**, so modules the engine
    declares in `modules` (`@nuxt/eslint`) resolve from the **consumer's** `node_modules`
    — every consuming repo must carry them in its own `devDependencies`. A missing one is
    a **hard build error** (module resolution fails), not a degraded lint. This is why the
    §1 devDependencies table is a **replication contract** for new repos, not just a
    reference.
11. **Gate hygiene.** Every piped gate runs under `set -o pipefail` (or reads
    `PIPESTATUS[0]`) — `$?` after a pipe measures the last pipe stage, not the checker.
    Before trusting any green gate, run its **positive control** once: inject a known
    failure (a type error for typecheck, a broken assertion for tests, an unused var for
    lint) and confirm the gate exits non-zero, then confirm the clean run exits 0.
    Canonical since the Phase-1 close-out, where an unpiped `$?` reported `tail`'s exit
    as the typechecker's.
12. **`nuxt.options.appConfig` does NOT contain `app/app.config.ts`** (verified
    empirically) — at build time it only carries `appConfig` set inside nuxt.config
    files. Build-time consumers of GameConfig (the static-artifacts module) must re-merge
    the layer app configs themselves (jiti-import each layer's `app/app.config.*` with a
    `defineAppConfig` shim, defu in layer order — `loadMergedGameConfig()` is the
    reference implementation).
13. **App theme files MUST wrap their tokens in plain unlayered `:root`, never
    `@theme`.** A consuming app's `css:` stylesheet does not enter the engine's Tailwind
    root compile, so a raw `@theme` at-rule ships to the browser uncompiled and is
    silently dropped — production wears the umbrella defaults while `nuxt dev` (per-file
    CSS compile) looks correct. Caught live on 2XKO by the Phase-4 audit (v0.4.1);
    Tekken shipped `:root` from day one. Unlayered `:root` beats the engine's
    `@layer theme` defaults in every build mode. Gated by `scripts/verify-override.mjs`
    (built fixture bundle, both directions) and by each game's e2e theme-presence test
    against its own built output.

---

## 6. Landed in Phase 2 (v0.1.0) — and what remains game-side

Everything §6 previously listed as "arriving" has landed and is locked in §1/§2:
anime.js 4.5.0 · seo plugin + useSiteMeta/useJsonLd · registry provisioning · the
ReplayDB umbrella theme (teal `#17CFC8` / gold `#FBC318`, Space Grotesk) · the `Brand*`
family (BrandMark, BrandSpinner, BrandLogo, BrandWordmark) · game-panel extension slots ·
static artifacts (sitemap/robots/manifest/designed-404).

**Semantic token additions (v0.1.0), all game-overridable** — full list in the README
theme contract: `--color-secondary`, `--color-danger/-warning/-success`,
`--color-surface-sunken` (inset tracks/inputs), `--color-text-secondary` +
`--color-text-faint` (the ported four-tier text ramp), `--color-primary-hover`.
Structural additions: the real product cut geometry (`cut-xs/sm/md/lg` +
`cut-bl-sm/md/lg`), `--ease-snap`, the display type scale
(`hero/d1/d2/title/sub/body/data-xl/label`).

**Contract additions (v0.1.0, all optional/additive):** `Replay.durationSec?`,
`GameConfig.manifest?` (`themeColor`/`backgroundColor`), `GameConfig.ogImage?`, and the
`KnownStats` well-known stats keys (types/stats.ts). Well-known `extra` key:
`aliases: string[]` on Character/Player (search + badge initials).

**Explicitly NOT in the engine (game-side, Phase 3):** the 2XKO fuse system (useFuses,
Fuse* components, fuse dev pages) — plugs into the extension slots; per-game themes
(2XKO neon pink/cyan + Chakra Petch arrive as 2XKO's own theme.css).

---

## 7. v0.2.0 — Phase-3 contract additions (all optional/additive)

Driven by the 2XKO refactor's parity gates (the live site's indexed URLs, visible
vocabulary, and duo-queue data could not ride the v0.1.0 contract):

- **`GameConfig.terms?`** (`character/characters/side/patch/patches/source`, lowercase) —
  every user-visible engine noun (nav, headings, filter labels, search placeholder, SEO
  strings, JSON-LD breadcrumbs, 404 copy) resolves through `useGameTerms()`; labels
  capitalize at the call site with `capWord()`. 2XKO: champion/champions · team ·
  season/seasons · channel. Defaults preserve v0.1.0 output byte-for-byte.
- **`GameConfig.characterRouteSegment?`** — the characters section's URL segment
  (default `characters`). The engine's `engineCharacterRoutes` inline module renames
  `/characters*` page routes via `pages:extend` at build, and every engine link resolves
  through `useGameTerms().characterPath` / `.charactersBase` — so 2XKO keeps its live,
  indexed `/champions/*` URLs with zero page-file duplication. Build-time GameConfig
  resolution is shared with static-artifacts via `modules/game-config.ts`
  (`loadMergedGameConfig`).
- **`Side.players?: string[]`** — a side that is a team of PEOPLE (2XKO duo queue,
  tournament sets; 321 live videos). `player` stays the primary (= `players[0]`).
  `utils/filterReplays.sidePlayers()` is the single accessor: the player facet, search
  haystack, derived options, related-replay affinity, player pages, and card/modal
  labels (joined `' + '`, featured-if-any) all cover every listed player. An empty
  `player` with no `players` yields no people (junk-data sides never enter the player
  facet). Covered in `test:filters` ("Side.players" section).

---

## 8. v0.3.0 — game-defined filter facets + replay badge slots (all additive)

Driven by Phase 3.5 (the 2XKO fuse surface is a launch-advertised feature the generic
Browse could not carry):

- **Game facets** — `provideGameFacets([...])` (app plugin; module-scope holder like the
  registries, `app/utils/gameFacets.ts`). A facet = `{ param, label, note?, chips
(id/label/accent?), matches(selected, { replay, state }), chipLabel? }`. The engine
  renders facet rows in FilterBar/FilterDrawer with the standard chip anatomy
  (accent diamond + accent-tinted active state), wires `param` into URL state / deep
  links / ActiveChips / Clear all / filterKey, and applies predicates inside the pure
  core (`filterReplays(…, gameFacets)` — AND across facets; within-facet semantics are
  the game's). The predicate context carries the **whole FilterState**, so cross-facet
  composition (the promised "fuse on the same side as the selected characters") needs
  no further engine change. Facet `param` is a public URL contract — a game restoring a
  shipped filter keeps its old deep links by reusing the shipped param name (2XKO:
  `fuse`). Covered in `test:filters` ("game-defined facets" section).
- **Positioned stats anchors (v0.4.0)** — the stats page invokes `GameStatsPanels`
  at THREE anchors, passing `position: 'after-usage' | 'beside-timeline' | 'bottom'`:
  a naked full-width row under the usage panel, the Meta-over-time grid's second
  cell (naked; only when the timeline renders), and the original wrapped bottom
  slot. **Overrides must branch on `position`** or their content renders at every
  anchor (the fixtures dummy shows the pattern). Restores the shipped 2XKO stats
  composition (Fuse usage 2nd, Fuse meta beside the timeline) — found in the
  Phase-3.5 preview review, where bottom-stacked fuse panels left half-empty rows.
- **Replay badge slots** — empty same-path-override components:
  `GameReplayBadges.vue` (`replay`, `context: 'card' | 'modal'`) rendered naked between
  a card's matchup and players rows and below the modal's sides block (the
  center/UNBOUND strip — attribution unknown); `GameSideBadge.vue` (`replay`,
  `side: 0|1`, `context`, `compact?`) rendered inside each modal side block under the
  player line (per-side chips — attribution known; `compact` = the mobile variant).
  Overrides own their full markup, so unused slots cost zero pixels (fixture output
  verified stable).

---

## 9. v0.4.1 — theme-contract hardening (docs/tests only; zero runtime change)

Consumers stay pinned at `v0.4.0` — nothing a game imports or renders changed.

- The theme override contract now **mandates plain unlayered `:root`** for app theme
  files (README "Theme override contract"; §5.13). Cause: the 2XKO Phase-4 audit found
  the production bundle shipping a raw `@theme` block — dropped by the browser, so the
  live site wore the umbrella teal/Space Grotesk while `nuxt dev` looked correct.
- `scripts/verify-override.mjs` reworked accordingly: it now **builds the fixtures app
  and probes the generated bundle's computed styles in BOTH directions** — the committed
  fixture override (`fixtures/app/assets/theme.css`, `:root` form, wired through the
  same `css:` array a game uses) must win, and emptying it must fall back to the
  umbrella — plus a raw-`@theme` tripwire over every emitted stylesheet. The old form
  probed a dev server carrying a temporary theme: exactly the mode that masks this bug.
  It also asserted stale pre-Phase-2 values (`--color-surface #131519`, `--cut-md`
  `0.875rem`), so it had not been re-run since the umbrella port — treat verify scripts
  whose expectations drift as unrun, not as passing.
- **Recorded recommendation — replays.json `thumb` omission (emitter contract, future
  minor).** The 2XKO audit measured **all 2,921** emitted `thumb` values as the
  id-derivable `https://i.ytimg.com/vi/<id>/maxresdefault.jpg` (~180 KB ≈ 16% of the
  1.1 MB payload). Emitters could omit pattern-derivable thumbs entirely **if** the
  engine's client fallback chain tried `maxresdefault` → `hqdefault` on error — today
  `BrowseCard`/`VideoModal` derive `hqdefault` only, so omission would silently
  downgrade card/modal art. That fallback is a runtime change, deliberately **not** in
  v0.4.1; until it lands, emitters keep writing explicit `thumb` URLs.

---

## 10. v0.5.0 – v0.5.1 — rank chips from data; static-artifacts under a subpath

**v0.5.0 — rank chips derive from the data, highest-first.** The rank facet had been
rendering `GameConfig.ranks` verbatim, so a game shipping the full ladder got a chip for
every rung — including rungs no replay carries, which filter to zero results. The facet
now renders `FilterController.rankOptions` instead: `deriveOptions()` intersects the
canonical ladder with the ranks actually present (`rankOrder.filter((r) => ranks.has(r))`),
and `useFilters` reverses that for display, so chips read highest-first while the config
stays canonical ascending. This makes ranks behave like every other data-derived facet
(characters, players, patches) — **a chip that would filter to zero is never shown**.

The consumer-side contract is therefore "**ship the whole ladder; the data decides what
shows**" — a game with a 30-rung ladder and three populated ranks renders three chips,
and needs no config change as coverage grows. Tekken is the only current consumer
(`filters.rank: true`, `data/ranks.json`). Games without ranks are unaffected; the facet
is gated off entirely.

**v0.5.1 — static-artifacts under a subpath base (Phase-5 blocker fix).**
The first-ever subpath game build (Tekken `/tekken/`, Phase 5) hard-failed in
`modules/static-artifacts.ts`. Two empirical nitro conventions the module had
conflated (invisible at base `/`, where all prior builds ran):

- **Filesystem:** nitro's static presets template `output.publicDir` WITH the base
  (`vercel-static` → `.vercel/output/static/{{ baseURL }}`) and write prerendered
  routes de-based beneath it — so `publicDir` already IS the base directory.
  Re-applying `withBase()` to a filesystem path doubled the base
  (`static/tekken/tekken/…`): sitemap + manifest landed at the doubled path and the
  404-copy probe threw. Fix: artifacts write to `publicDir` directly; `404.html`
  goes to the **static root** (base segments stripped) — Vercel's 404 lookup ignores
  the base.
- **Route strings:** nitro's `prerender:route` hook yields **mixed-space** strings —
  each route keeps the form it ENTERED the queue in (module seeds + crawled hrefs:
  base-prefixed; `x-nitro-prerender` payload/manifest routes: router-space). Only
  `fileName` is uniformly de-based. The module now normalizes with
  `withoutBase()` **before dedupe/exclusion**, and re-bases `<loc>`s with
  `withBase()` at emit — otherwise a subpath sitemap emits duplicate `<loc>`s and
  the `/health`/`/not-found` exclusions miss the prefixed forms.

Verified: fixtures at `/sub/` (artifacts single-based, deduped, exclusions hold,
designed 404 at static root) and at `/` (byte-identical placement to v0.5.0 —
root behavior unchanged); `test:filters` / `test:registry` / typecheck / lint green.
`scripts/verify-subpath.mjs` predates this module and never probed artifacts — its
gap is what let this ship; extending it with an artifacts-placement assertion is the
recorded follow-up.

---

## 11. v0.5.2 – v0.5.4 — Phase-5 shell polish (all optional/additive)

Driven by the cutover: with two games live behind one shell, the differences between
them stopped being data and started being layout. Every knob below is optional and
every default reproduces v0.5.1 output, so adopting these pins is a no-op until a game
opts in.

- **Unified sticky site footer (v0.5.2)** — `SiteFooter.vue` became a three-column
  sticky grid (`sticky bottom-0`, `bg-surface-sunken`) with the Buy Me a Coffee link
  centered and the copyright trailing. Shared by every consuming app, the shell
  included, so support/attribution chrome is identical platform-wide. No config
  surface: `BMC_URL` is an engine constant, and the fan-project disclaimer stays
  templated from `GameConfig.name` / `.rightsHolder`.
- **`GameConfig.stats?` (v0.5.3)** — `{ metaTimelineTopN?, metaTimelineFullWidth? }`,
  read in `app/pages/stats.vue` as `?? 5` and `?? false`. Tunes the meta-over-time bump
  chart: how many characters to plot, and whether it spans the whole row instead of
  sharing it with the `beside-timeline` `GameStatsPanels` anchor. A game that leaves
  that anchor empty should set `metaTimelineFullWidth: true` rather than ship a hole —
  Tekken does (`8` / `true`); 2XKO keeps both defaults so its Fuse-meta companion still
  occupies the grid's second cell.
- **`GameConfig.heroFocus?` (v0.5.4)** — the character-page hero splash's
  `object-position`, read in `app/pages/characters/[id].vue` as `?? '70% 25%'`. The
  default suits wide landscape splashes (2XKO); games whose renders sit heads-near-top
  bias the vertical up (Tekken: `'70% 4%'`). Keep X near 70% so the subject stays clear
  of the left gradient and name/stat overlay. Framing is config precisely so a game
  never forks the page to re-crop an image.
- **Selector-aware wordmark (v0.5.4)** — the header wordmark now returns to the game
  **selector** at the true site root. It is a plain `<a href="/">`, deliberately **not**
  a `<NuxtLink>`: under a subpath build (`app.baseURL = '/2xko'`) NuxtLink/`withBase`
  would prefix the base and land on the game's own home instead. The selector lives
  above the base, so this is the one engine link that intentionally escapes it — do not
  "fix" it back to `<NuxtLink>`. At a root deploy the selector simply is `/`.

v0.5.2 also set the repo-wide **SFC authoring order** and added `singleAttributePerLine`
to `.prettierrc`. Both are standing conventions recorded in §2 (Lint / format) rather
than repeated here — but note that the `.prettierrc` half is part of the §1 replication
contract and **did not propagate**: it reached the shell but not either game repo until
2026-07-20, leaving 2XKO formatting `.vue` files against a stale config for two days.
That drift is what prompted `npm run verify:replication` (§2, _Enforcing the replication
contract_) — run it when adopting a pin, and this class of gap fails loudly instead of
waiting to be noticed.

## 12. v0.5.5 — source-filter grouping (optional/additive)

- **`GameConfig.sourceGroups?` (v0.5.5)** — `{ id, name, sources: string[] }[]`, read in
  `FilterBar.vue` / `FilterDrawer.vue`. When set, the source filter renders one chip per
  group instead of one per `sourceChannels` entry; toggling a group writes its member ids
  to `?src=` as a set (`toggleSourceGroup` / `isSourceGroupActive` in `useFilters`), and
  the active-chips row collapses to one pill per selected group. Absent → chips render 1:1,
  unchanged. Deliberately does **not** touch `SourceBadge` or the `filterReplays` source
  predicate: the per-video badge still resolves the real channel from `sourceChannels`, and
  the predicate still matches the same per-channel ids, so per-channel deep links
  (`?src=proReplays`) and legacy `?ch=` translations keep working. Both games opt in to
  collapse their channels into **Online + Tournament** (2XKO: proReplays/highLevel/
  bestReplays + manual; Tekken: highLevel/telly/ranked + tournament). Default reproduces
  v0.5.4 output, so the pin is a no-op until a game sets `sourceGroups`.
