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
| `@vercel/analytics`      | 2.0.1   | Web analytics — the **generic** `inject`/`pageview`, NOT the Nuxt module (see below)                                                              |
| `@vercel/speed-insights` | 2.0.0   | CWV reporting — the **generic** `injectSpeedInsights` (sampleRate 0.5), NOT the Nuxt wrapper                                                      |

**MUST: never register `'@vercel/analytics'` as a Nuxt module, and never call
either package's `nuxt/runtime` wrapper.** Both are wired by hand in
`app/plugins/vercel-observability.client.ts`, because behind the shell each
wrapper is wrong in two independent ways:

1. It resolves the **per-project obfuscated endpoint** Vercel bakes into the
   build (`VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` →
   `/41a6d9d2116e7933/script.js`). That path exists only on the project's own
   host; proxied onto the apex it 404s, so the SDK reports **nothing**. The seed
   changes every build, so it cannot be hardcoded — only overridden. Web
   Analytics needs all three of `viewEndpoint`/`eventEndpoint`/`sessionEndpoint`
   overridden, not just `endpoint`: the served script resolves the per-type key
   first.
2. It reports vue-router's **base-stripped** `route.path`, so `/2xko/stats`
   arrives as `/stats` and collides with the other games in whichever dashboard
   receives it. Every reported route/path goes back through `withBase()`.

This cost ~10 days of blind analytics after the Phase-5 subpath cutover. Gated
now: each game's `e2e.ts` asserts the script src and the base-prefixed report,
and the shell's `verify-cutover.mjs` asserts both resolve through the apex.

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
| `scripts/verify-subpath.mjs`             | Base-path resilience probe — asserts no request escapes the base; `--artifacts <output dir> [base]` gates BUILD placement (§15)       |
| `scripts/verify-patch-groups.mjs`        | Grouped patch facet (v0.6.0) on an overlay build — deep links, tri-state, era-keyed stats                                             |
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
14. **A game's patch facet MUST carry child granularity under its era parents, never
    era-only.** `Replay.patch` holds the fine patch token, with the era token as the
    documented "era known, patch unknown" fallback, and `GameConfig.patchGroups` nests
    those children under their eras — one boundary authority derives BOTH the tokens and
    the committed `data/patchGroups.json` that `app.config.ts` imports, so derivation and
    UI cannot drift. Era boundaries come from an explicit table of balance overhauls and
    are **never inferred from major version numbers** (SF6's `1.x` line spans two seasons
    and `2.00` lands mid-season; an all-character balance pass does not imply a new era
    either). Patches nest under eras BY RELEASE DATE. The failure is silent and shaped
    like success: era-only ships a facet that renders, filters, and passes every count
    assertion — it simply cannot answer "which patch", and the omission stays invisible
    until two games are compared. Caught after SF6 (Phase 7) shipped era-only while
    Tekken and 2XKO had shipped nested patches since v0.6.0, because the convention
    existed only as code in two repos. Era-only is an exception that requires a stated
    reason in the app's README. Gated per-app by the patch-table validator (era-token
    collision, token shape, release order, in-era windows, opening-patch-on-era-start),
    by emit's era-or-declared token assertion plus ids-unique / no-ungrouped-token
    checks, and by each game's e2e grouped-patch-facet block (fine-token deep link,
    mixed union, tri-state round-trip, era-keyed stats, chips == data-present). See
    README.md "Patch grouping (v0.6.0)" for the consumer contract.
15. **Dedupe MUST key on the intake channel, never on the public source token.** Two
    channels may deliberately share a `Replay.source` token — a new tournament channel
    reusing an existing one avoids minting a public badge nobody asked for — and the
    moment they do, a `SourceId`-keyed dedupe stops firing channel-priority between them
    AND leaks override protection from one channel's hand corrections onto the other's
    records. Carry the intake key on the record and key dedupe off that. Related and
    equally silent: **extraction-origin overrides confer no dedupe priority.** Every
    visually extracted record is a `sides` override, so a "hand-authored overrides win"
    rule makes the extracted channel beat every duplicate and inverts declared channel
    precedence — only hand-authored `sides` overrides protect. Both were caught in
    review, not by a gate. See README.md "Sources, groups, and dedupe keys".
16. **Side attribution MUST be read from the footage, never from title order.** Event
    titles name the players in the wrong order often enough to be a data-integrity
    problem, not an edge case: measured 37.7% on one game's event corpus, 12.8% on
    another, 11.1% on a third, against 100% for HUD-handle attribution on the same
    sample. Enrolling on title order would have credited over a third of one corpus to
    the wrong player, and the error is invisible downstream — the record looks complete.
    Title order survives only as a queue item's provisional arrangement a human confirms;
    an unreadable handle region routes to review rather than falling back. Auto-accept
    additionally requires the side to be `decided`: an undecided side is a coin-flip
    dressed as a verdict, however confident the character read was. See README.md
    "Extraction conventions".
17. **The collapse guard and the freeze pattern are standard equipment, not incident
    response.** Refuse to write when a channel loses >10% AND >20 of its committed
    records (both thresholds required — a percentage alone punishes a small channel for
    churn, an absolute alone misses a large one bleeding slowly), with an explicit
    per-channel override flag, aborting BEFORE any write. Compare against whatever
    actually reaches the site; raw is a fair proxy only when the game gate runs at fetch.
    A channel that stopped publishing this game is FROZEN rather than pruned: fetch skips
    it, parse carries its committed records forward byte-stable, and the carried count is
    PINNED and hard-asserted every run — the committed data file is both source and
    target of that carry, so one bad run poisons the next run's reference permanently and
    silently. Editing the pin is the deliberate-prune mechanism and shows up in a diff.
    Learned from a channel that rebranded to another game and unlisted its back
    catalogue: a bare rebuild would have pruned a quarter of the archive. See README.md
    "Channel lifecycle".
18. **Game-marker gates are mandatory wherever a title grammar is shared across games.**
    A publisher reusing one title format across two titles will eventually push the other
    game's matches through your parser, and they parse CLEANLY — players, characters,
    duration, everything — so nothing downstream flags them. One cron replaced part of an
    archive with another game's matches and served it for ~24 hours. Gate on a marker the
    other game cannot carry, and widen the gate to the description per-channel when the
    title does not carry one (a first-party archive read 0/1,025 on the title gate and
    1,025/1,025 on the description gate — the zero was the gate, not the data). See
    README.md "Channel lifecycle".

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
recorded follow-up. **Landed in v0.6.2** (§15) as `--artifacts`.

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

## 13. v0.6.0 — grouped patch facet (season → patch hierarchy)

- **`GameConfig.patchGroups?` (v0.6.0)** — `PatchGroup[]`: parents (era tokens like
  `S1`/`Beta`, optional `label`/`note`) with optional `children` (patch tokens +
  dropdown `note` hints). Childless parents render as plain chips. Declared order =
  display + canonical URL order; ids must be unique across all parents AND children.
- **URL contract, same `?patch=` param**: the URL carries the COLLAPSED canonical
  form — a fully-selected parent collapses to its parent token, a partial selection
  lists child tokens, redundant links (`?patch=S1,1.1.1`) canonicalize on the next
  toggle. `FilterState.patches` carries the EXPANDED form (a parent token brings
  itself + all declared children), so the pure predicate at `filterReplays.ts` is
  UNTOUCHED and legacy season deep links (`?patch=S1`) keep their exact counts:
  season tokens ARE the parent tokens. A replay may carry a bare era token —
  "season known, patch unknown" — which matches whole-season selections but never a
  specific patch. Pure helpers live in `app/utils/patchGroups.ts` (expand/collapse/
  tri-state/`patchTokenParts`), node-asserted in `test:filters`.
- **UI**: `PatchGroupChips.vue` (desktop) — tri-state parents (`aria-pressed`
  true/false/**mixed** + n/m count over data-present children; click = whole-era
  toggle) with a `▾` expander opening a MatchupPicker-anatomy child dropdown; the
  drawer renders expandable era sections. Presence-gated like every facet; data
  tokens the group table doesn't know trail as plain chips (stale-boundaries
  fallback). ActiveChips collapses a full era to one pill. `VideoModal` meta reads
  "era · patch" for child tokens; `BrowseCard` stays era-compact.
- **Verification**: `test:filters` (expand/collapse/tri-state/parity semantics) and
  the new `scripts/verify-patch-groups.mjs` — a verify-override-style overlay build
  (fixtures stay ungrouped by default; `test:filters` on the default build is the
  byte-stability evidence). Default reproduces v0.5.5 output,
  so the pin is a no-op until a game sets `patchGroups`.
- **Consumer pattern (all three games)**: the app pipeline owns a released-patch
  table (Tekken and 2XKO: `data/patchBoundaries.json` validated by a per-app
  `scripts/patches.ts`; SF6: a `PATCHES` const beside `SEASONS` in
  `scripts/seasons.ts`, so the "an era opens ON a patch" cross-check can see both
  tables), nested under eras BY RELEASE DATE, and emits `Replay.patch` as the fine
  token (era-token fallback) plus a committed `data/patchGroups.json` that
  `app.config.ts` imports — one authority for derivation AND UI, so they cannot
  drift. Stats stay era-keyed (`byPatchUsage` untouched). **What folds into a
  parent row is vendor-specific, not a fixed segment count**: Tekken folds
  Bandai's `X.YY.ZZ` hotfixes into `X.YY`; SF6 must NOT fold Capcom's `X.YYZZ`
  (the dot falls after `ZZ`, so `2.01` and `2.0111` are siblings, and folding
  would mint a `2.03` that never shipped). Read the vendor's own version strings
  before choosing — and never invent a version to fill a sequence gap.
- **`patchTokenParts()` and `BrowseCard` resolve IDS ONLY, never `label`** — a game
  whose parents carry a `label` still gets `S3 · 2.02` in the modal, not
  `Season 3 · 2.02`. Config cannot fix it; it needs an engine change. Do not let a
  consumer game-branch around it (see PLAN.md's patch-granularity entry).

## 14. v0.6.1 — one fetch per data file, not one per consumer

A pure runtime fix: no contract, config, or signature change, so a consumer pin
bump is a no-op beyond the saving.

- **The bug.** `useAsyncData`'s default `dedupe` is `'cancel'`, which does NOT
  share an in-flight request between callers — each component that calls the
  composable runs its own `execute()`, and the previous request's
  `AbortController` is aborted only after its bytes are already on the wire, so
  the browser completes every one of them. Eight components call `useReplays()`
  (`index.vue`, `characters/[id]`, `players/[id]`, `health`, `useFilters`,
  `useVideoModal`, `ActiveChips`, `FilterDrawer`); a browse load resolved five of
  them concurrently and downloaded `replays.json` **five times** — measured at
  5 × 6.01 MB = 30.06 MB on SF6, and the same code path on every game.
- **The second leak.** Nuxt's default `getCachedData` reads `payload.data` only
  while hydrating and `static.data` otherwise. Both are empty for a
  `server: false` fetch on a prerendered site, so a component mounting later
  (modal, SPA navigation) started a fresh download of an already-resolved file.
- **The fix** — `sharedFetchOptions()` in `app/composables/useEngineData.ts`,
  applied to `useReplays()` AND the `fetchedRegistry()` fallback used by
  characters/players/stats when nothing is provided: `dedupe: 'defer'` (concurrent
  callers await the one shared promise) plus an explicit `getCachedData` reading
  `payload.data` unconditionally (resolved data stays sticky for the life of the
  page).
- **Measured on SF6** (19,495 replays, `scripts/e2e.ts` payload block): first load
  **31.14 MB → 7.10 MB**, `replays.json` **×5 → ×1**; a full SPA session (browse →
  characters → a character → players → browse) stays at **one** fetch, 6.01 MB.
  Full-document reloads legitimately refetch — that is a new page, not a leak.
- **Verification**: engine `test:filters` + `test:registry` unchanged and green;
  SF6's 68-gate suite green against the patched engine, with the payload block
  now asserting the single fetch.

## 15. v0.6.2 — one logical route renders exactly once

A build-pipeline fix: no contract, config, or signature change, so a consumer pin
bump is a no-op beyond the saving. It is also the fix for the **intermittent
Vercel build failure** that had been killing production builds across all three
games.

- **The bug.** Nitro's prerender queue is a `Set<string>` deduped by EXACT
  STRING, but routes enter it in two URL spaces and two query forms:
  base-prefixed from the engine's/app's seeds and from crawled `<a href>`s;
  **router space** from Nuxt's pages plugin, which walks the ROUTER's own table
  and re-enqueues it de-based through `prerenderRoutes()` as an
  `x-nitro-prerender` header; and payloads in **both** — base-prefixed with a
  `?<buildId>` cache-buster (the `<link>` in every page head, harvested by the
  crawler) and router-space without one (the renderer's own header hint, built
  from the de-based `ssrContext.url`). Under a subpath base every page and every
  payload was therefore queued twice. On 2XKO: 7,726 route renders for 6,653
  logical routes.
- **Why it failed the build.** The two payload twins render the same route
  concurrently and the loser 500s; `failOnError` then kills the build. Six
  consecutive 2XKO production builds died exactly this way — victims
  `/2xko/health/_payload.json?<buildId>` ×3 and
  `/2xko/not-found/_payload.json?<buildId>` ×3, always the `?<buildId>` spelling.
  That spelling cannot even produce an artifact: `canWriteToDisk` refuses any
  route containing `?`, so nitro logs it `(skipped)` and throws the render away.
  It existed solely as a coin-flip chance to fail the build. The race is
  timing-dependent and did not reproduce locally: 16 subpath builds on v0.6.1 —
  including 8 pinned to two cores to mimic a Vercel builder — all went green. The
  evidence is the deploy history, plus the structural fact that the failing
  spelling is a duplicate render that can never write an artifact.
- **The second symptom.** The vercel preset builds `config.json`'s `overrides`
  from the raw route strings, so the six router-space page twins wrote
  `{"path": "stats"}` — a ROOT-space serving path for a base-scoped file —
  clobbering the correct `{"path": "2xko/stats"}` written by their base-prefixed
  twin. Whichever twin finished last won.
- **The fix** — `modules/prerender-queue.ts`, two rules applied in
  `prerender:routes` before a single route is fetched. (A) A `_payload.json` /
  `_payload.js` route keeps its path and drops the query: the cache-buster is for
  the BROWSER, the renderer strips it, and nitro can never write it. (B) Routes
  dedupe on their LOGICAL key — `withoutBase(path) + search`, the same de-basing
  nitro applies to compute `fileName` — first spelling to claim a key renders,
  later spellings are dropped. Because the seed set is normalized before
  rendering starts and every seed is base-prefixed, the surviving spelling is
  base-prefixed: the one that round-trips (`withBase` → fetch, `withoutBase` →
  file beneath the base-suffixed `publicDir`) and the one `canPrerender`'s
  public-asset filter can actually match.
- **Why `prerender:routes` and not `prerender:route`.** `prerender:route` fires
  after a route has been fetched — too late to prevent the render. Crawled links
  and header hints are added later to the SAME `Set` instance that
  `prerender:routes` hands out, from inside `generateRoute`, with no hook of
  their own. Taking the queue's own `add` is therefore the only interception
  point that covers discoveries, and it makes the outcome deterministic instead
  of dependent on which twin wins a race.
- **Root builds** shed the same waste (rule A still fires; rule B is an identity
  on an empty base) with unchanged output: 2XKO at `/` went 7,720 → 6,653 route
  renders, same 2,136 written routes.
- **Verification.** 2XKO at `/2xko/` green **3 consecutive runs**, byte-identical
  counters each time: 6,653 logical routes, 2,136 written, 1,067 payload routes,
  **0** carrying `?<buildId>`, **0** duplicate route strings in the build log,
  `/health` + `/not-found` payloads present exactly once. Root before/after:
  2,317 files both, and once the three inherently per-build tokens are normalized
  (the buildId UUID, `nitro.json`'s build date, and the `prerenderedAt` epoch ms
  Nuxt bakes into every payload and HTML) **2,315 of 2,317 files are byte-identical**;
  the two that differ — `config.json` and `_nuxt/builds/meta/<buildId>.json` —
  differ only in key/array ORDER (render-completion order, nondeterministic
  between any two builds) and are identical once sorted: same 1,067 overrides,
  same 1,067 prerendered routes. Fixtures at `/sub/` build clean and pass the new
  gate. Engine battery green: `typecheck`, `lint`, `format:check`, `test:filters`,
  `test:registry`, `verify-override` (both directions), `verify-patch-groups`,
  `verify:replication`.
- **Gate growth (the standing rule).** `verify-subpath.mjs` gains
  `--artifacts <output dir> [base]`, the assertion recorded as a follow-up in
  §10: no emitted file outside the base (404.html at the static root excepted)
  and every prerendered-route override serving under the base. It **fails on
  v0.6.1** output with exactly the six clobbered overrides and passes on v0.6.2 —
  a real positive control. Note the first assertion passes on v0.6.1 too: the
  suspected root-space orphan payloads do not exist. Router-space payload routes
  landed INSIDE the base, because `withoutBase` is a no-op on a route that never
  carried the base and `publicDir` is already base-suffixed. The orphan was the
  override map, not the files.

---

## 16. v0.6.3 — analytics that actually resolves behind the shell

A wiring fix with one additive config field. Consumers behind the shell MUST
bump and set `observability.insights`; a root-based consumer can ignore it.

- **The bug, and why nothing caught it.** The Phase-5 subpath cutover killed
  Vercel Web Analytics and Speed Insights for all three games, and they stayed
  dead ~10 days. Not misattributed — **dropped**. Vercel's build bakes a
  per-project obfuscated path into every bundle
  (`VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG` → `/41a6d9d2116e7933/script.js`),
  and that path exists only on the project's own host. The shell proxies game
  pages onto the apex, where it 404s. Confirmed in a real browser:
  `[Vercel Web Analytics] Failed to load script from /41a6d9d2116e7933/script.js`,
  with the queued pageview sitting in `window.vaq` forever.
- **The second, independent bug.** Both SDKs' Nuxt wrappers report vue-router's
  base-STRIPPED `route.path`, so `/2xko/stats` arrives as `/stats` and collides
  with the other games in whichever dashboard receives it. Fixing only the
  endpoints would have produced data that looked fine and merged three games
  into one set of rows.
- **The fix.** `app/plugins/vercel-observability.client.ts` replaces both the
  `'@vercel/analytics'` module and the old `speed-insights.client.ts`, calling
  each package's GENERIC injector with explicit endpoints, and putting every
  reported route/path back through `withBase()`. Explicit props win because
  `loadProps()` spreads the baked config first. Web Analytics needs all three of
  `viewEndpoint`/`eventEndpoint`/`sessionEndpoint` overridden — the served
  script resolves the per-type key before falling back to `endpoint`.
- **Endpoint strategy.** `GameConfig.observability.insights` names a same-origin
  prefix, paired 1:1 with a `/<prefix>/:path*` →
  `https://<child>/_vercel/insights/:path*` rewrite in the shell's
  `vercel.json`, which puts each game's Web Analytics back in its OWN project.
  Same-origin is mandatory: the child endpoints send no `Access-Control-Allow-*`
  headers (verified — `OPTIONS` returns 200 with none), so an absolute
  cross-origin URL dies at preflight. The engine DEFAULT is the stable
  `/_vercel/insights`, which pools every game into whichever project owns the
  domain — verified working, and the fallback if the proxy ever misbehaves.
- **Speed Insights is not per-game.** Single-project on Hobby, so its beacons
  must reach whichever project has the feature enabled; it stays on the stable
  apex path. Do not repoint it per game without re-checking that limit.
- **Gate lesson, fourth instance.** The cutover battery checked themes,
  canonicals, sitemaps and redirects — nothing asserted a beacon resolves. Now
  each game's `e2e.ts` asserts the script src, the absence of any 16-hex baked
  path, and the base-prefixed report; the shell's `verify-cutover.mjs` asserts
  both SDKs resolve through the apex. Positive-controlled: reverting the engine
  to the bare module fails the 2XKO gate (31/32, exit 1) and passes with it.
  Third-party integrations need gates like every other contract surface.

---

## 17. v0.6.4 — maskable icons + a tile label that matches its own panel

Two cosmetic fixes and one new gate. No config surface, so a consumer inherits
both by bumping the pin and changing nothing.

- **Maskable app icons.** `manifest.webmanifest` now declares
  `icons/maskable-192.png` and `icons/maskable-512.png` at `purpose: 'maskable'`
  alongside the two `any` entries. A maskable icon is cropped to a
  platform-chosen shape (circle, squircle, teardrop), so it is a **different
  asset**, not the same file relabelled: it needs an opaque ground and its
  artwork inside the safe circle of radius 40% of the canvas. The favicons are
  transparent and the mark's corner sits at radius 39.7 — exactly ON that
  boundary — so declaring them maskable would have shipped a logo that bleeds
  into the mask and gets composited over an arbitrary platform colour. The new
  assets are the same mark flattened onto the manifest's own
  `background_color` (`#0a0b0f`) and scaled to 83%, putting the corner at 33 of 40. They carry no alpha channel and are smaller than the transparent
  originals (1.2 KB / 3.7 KB against 14 KB / 61 KB).
- **Committed, not generated.** The engine has no image library and cannot grow
  one for this: §5 item 5 means a `devDependency` is pruned from git-layer
  consumers and a runtime `dependency` would push a ~30 MB native binary into
  four installs for a build-time concern. The PNGs were rasterized offline in a
  sibling that already carries `sharp` and committed to `public/icons/`, exactly
  as the neutral fonts are. All four consumers inherit `public/` wholesale —
  none ships an `icons/` dir — so this propagates with zero per-repo work.
- **The stats tile agrees with its panel now.** `stats.vue`'s headline tile read
  a bare `Top pairing` directly above a `StatPanel` titled
  `` `Top ${terms.side} pairings` ``, so a 2XKO visitor saw "Top pairing" over
  "Top team pairings" describing the same data. The tile interpolates
  `terms.side` too. No new `GameConfig` key: a per-tile label knob was
  considered and rejected as more surface than the one wrong string justified.
  Inert for `charactersPerSide: 1` games, whose duo tile never renders.
- **New gate (2XKO `e2e.ts`).** Nothing anywhere asserted the manifest's `icons`
  array — not length, not `purpose`, not `src`, not that the referenced files
  exist. A manifest is read only by the OS at install time, so a typo'd `src` or
  an uncommitted asset shipped in total silence. The gate now requires ≥1
  maskable entry, every `src` under the base, and every referenced file present
  in the build. Positive-controlled by pointing one `src` at a missing file.
  Base-correctness is additionally covered by `verify-subpath.mjs --artifacts`.

---

## 18. v0.7.0 — `charactersPerSide: 4`

One permitted config value, one new gate. Minor rather than patch because the
config surface accepts something it did not before; additive in every other
sense, so the three live consumers bump the pin and change nothing.

- **`GameConfig.charactersPerSide` is now `1 | 2 | 3 | 4`.** The first 4v4 tag
  game onboarded and `4` did not typecheck. The set stays **closed** — widening
  to `number` was considered and rejected: every runtime consumer either tests
  `> 1` or divides by it, and an open type turns a typo'd `40` into a silently
  wrong divisor instead of a type error. The set widens per real consumer, one
  value at a time.
- **It was already not a length cap.** `Side.characters` is documented `1..N`
  and every one of the twelve runtime uses is a `> 1` boolean, a
  `Math.max(1, …)` divisor, or a display string — the `length ===
charactersPerSide` invariant survived only as prose, and the last four copies
  of it were corrected in this release. Nothing validated it, so nothing
  changes behaviourally at 4.
- **Known limitation, recorded not fixed.** `useFeaturedPlayers.ts` and
  `players/[id].vue` derive appearances as `sum / charactersPerSide`, which is
  exact only when every side fields a full complement. A game whose sides are
  partially known (characters recovered incrementally from text and footage)
  under-counts the displayed match number proportionally. Ranking is unaffected
  — it is monotone in `sum` — so this is a display approximation, and the
  docblock already said "≈". Fixing it needs a real per-record denominator,
  which is a contract change and does not belong in a widening release. The
  consuming game pins the current behaviour with a Node-side recompute in its
  own e2e suite.
- **New gate: `scripts/verify-badge-density.mjs`.** `BrowseCard.vue` has had an
  `n >= 4` badge-sizing branch since before any game used it, which means it
  was never exercised. The gate overlays the fixtures at
  `charactersPerSide: 4` with 4-, 3- and 1-length sides, builds, and asserts
  eight badges render on a full card, the `VS` column stays centred, and
  nothing overflows at 375px. Positive-controlled by asserting nine badges.
  Fixtures are restored in a `finally`, matching `verify-override.mjs`.

## 19. v0.7.1 — the platform changelog in the shared footer

One link, added to `SiteFooter.vue`. Patch rather than minor: no contract
surface moves, no config field appears, and an app on the older pin keeps
building and simply renders the footer it already had.

- **`SiteFooter` links to the apex changelog.** `/changelog` is a single
  platform-wide page owned by the shell, and it was previously reachable only
  from the shell's own three routes — a visitor deep in a game had no way to it
  except back through the selector. The footer is the one piece of chrome every
  app on the platform shares, so the link belongs there rather than in five
  places.
- **Absolute, and a plain `<a>`, deliberately.** A `NuxtLink to="/changelog"`
  inside a game resolves against that game's base and points at
  `/2xko/changelog`, which does not exist; a root-relative `href="/changelog"`
  is right through the apex proxy but 404s on the game's own `*.vercel.app`
  host, which stays reachable by design. Building it from `useSiteOrigin()`
  lands on the apex from every host — the same host-independent stance
  `useSiteMeta` already takes for canonicals, and the same reason
  `verify-cutover.mjs` hardcodes its `APEX` const.
- **Derived, not configured.** A `GameConfig.changelogUrl?: string` was
  considered and rejected as machinery: every app on this platform already sets
  `siteUrl` to the apex, so the field would be the same literal five times and
  a fifth thing to forget when onboarding. The Buy Me a Coffee URL in the same
  component sets the precedent.
- **Cost, recorded.** A shell PREVIEW deployment's footer link points at
  production — as its canonicals already do. The link is not the surface you
  test a preview with.
- **It replaced a shell-side override.** The shell carried its own
  `app/components/SiteFooter.vue` for one release to add this link without an
  engine change; that copy is deleted in the same sweep that bumps the pin.
  Five near-identical footers were the alternative, and nothing detects that
  kind of drift.

---

## 20. v0.8.0 — the `/dev` tool index

Every game carries hand-curation and diagnostic pages at `app/pages/dev/*.vue` —
eleven of them across the four repos when this landed — and `/dev` itself 404ed
through the catch-all. The only inventory anywhere was a markdown table in 2XKO's
README; Tekken and Tōkon documented theirs nowhere. Additive: a new engine page,
one nav entry, and one `experimental` key. An app on an older pin keeps building
and simply has no index.

- **The index lives in the engine, the descriptions live in the pages.**
  `app/pages/dev/index.vue` reads `useRouter().getRoutes()`, keeps everything
  under `/dev/`, and renders `route.meta.devTool` grouped by category. That is
  the whole mechanism — no registry, no per-game list, and nothing to keep in
  sync when a tool is added, renamed, or deleted. It is the natural home
  regardless: each game's `app/pages/` contains **only** `dev/`, so every other
  route they serve is already inherited from here.
- **`experimental.extraPageMetaExtractionKeys: ['devTool']` is load-bearing, and
  its absence fails silently.** Nuxt does not carry custom `definePageMeta` keys
  into the route records: with `scanPageMeta` at its default (`'after-resolve'`)
  `normalizeRoutes` runs with `overrideMeta: true` and keeps only
  `name`/`path`/`props`/`alias`/`redirect`/`middleware`. Without the key the
  index still renders — every tool just wears the "no description yet" fallback,
  which is the symptom to recognise. Verified through the layer merge: the key
  is set once here and the extraction works in a consuming app.
- **Only plain literals extract.** The extractor (`isSerializable`) walks the AST
  and serializes `Literal`, `ArrayExpression`, and `ObjectExpression` nodes —
  nested objects of strings are fine, which is why `devTool` can be one object
  rather than four flattened keys. A `TemplateLiteral` is **not** a `Literal`, so
  a backtick string drops the key with no error. Same for a variable or an
  imported constant.
- **A page with no `devTool` block still lists**, under **Other**, with a note
  saying so. An index that silently omits what it doesn't understand is worse
  than one that shows a gap.
- **The nav entry is `import.meta.dev`-gated, not just unlinked.** `default.vue`
  spreads `{ label: 'Dev', to: '/dev' }` into `nav` only in dev, so a production
  build contains no crawlable link to `/dev` at all — the existing contract
  (guard + `prerender.ignore` + nothing links there) is preserved rather than
  traded away for the convenience.
- **No `prerender.ignore` change was needed.** All four games already set
  `ignore: ['/dev']` and nitro matches it as a prefix, so the bare index is
  covered. The shell inherits the route too but sets `crawlLinks: false` with an
  explicit route list, so it is never prerendered there either.
- **CORRECTION (v0.10.0).** The sentence above originally ended "— it renders an
  empty state, as does the `fixtures` app." The shell part is right; the
  `fixtures` part was not. The fixtures app was the one consumer that did _not_
  set `ignore: ['/dev']`, so from this release onward `npx nuxt generate
fixtures` exited on a prerender error — which silently took every browser gate
  that builds first (`verify-badges`, `verify-patch-groups`, `verify-subpath`)
  down with it, for two minor versions. Fixed in v0.10.0 by giving
  `fixtures/nuxt.config.ts` the same line every real app carries. The lesson is
  the one already written down here: a gate that cannot run reads as coverage.

## 21. v0.10.0 — a record can be a SLICE of a video

`Replay.id` was documented as `// youtube id` and four places interpolated it
straight into a YouTube URL: the embed, the watch link, and two derived
thumbnails. That held for as long as every source published one record per
video. 2XKO's Replay Theater intake is the first that does not — it indexes
**matches inside longform tournament VODs**, 889 records over 65 videos, a median
of 16 records sharing one video id. Two additive optional fields; an app on an
older pin keeps building and behaves exactly as before.

- **`videoId` is what makes the composite id safe, and it is the field that
  removes a SILENT failure.** Records are keyed `${videoId}@${startSeconds}`,
  because the id must distinguish sixteen records that share a video. Every
  YouTube-shaped URL now resolves `videoId ?? id`. Without that field the two
  thumbnail derivations build `i.ytimg.com/vi/<id>@<start>/…`, which 404s — and
  `@error` hides a dead thumbnail behind the striped placeholder, so the failure
  renders as a design choice. An emitter _could_ dodge it by always publishing an
  explicit `thumb`, which is exactly the kind of unwritten obligation that gets
  forgotten once.
- **`startSeconds` is deliberately NOT a URL param.** `useVideoModal.query()`
  copies every query key except `v` through unchanged, and `useFilters.clearAll()`
  names the keys it clears — so a bare `?start=` would outlive `close()`, survive
  a `swap()` into a _different_ video, and survive Clear all. It rides the record
  instead. `?v=` stays the whole of the modal's open state.
- **`@` round-trips through `?v=` unencoded** — asserted, not assumed. `byId()`
  is plain string equality over `replays.json`, so an encode/decode asymmetry
  would not throw; the modal would just never open. `verify-segment-records.mjs`
  proves the round trip on the built bundle. Had it failed, the fallback was `~`
  (RFC 3986 unreserved, and outside YouTube's `[A-Za-z0-9_-]` id alphabet).
- **`LiteYouTube` had to start watching `start`, and this is the subtle one.**
  The facade resets `playing`/`loaded` when its props change, but it watched
  `videoId` alone — and `videoId` is **unchanged** between two segments of one
  VOD. Clicking a related tile for another set of the same stream would leave the
  mounted iframe exactly where it was, so the viewer would sit at the previous
  match's offset believing they were watching the one they clicked. Nothing
  errors; the wrong footage just plays.
- **An absent `views` is now hidden rather than printed as "0 views".** It was
  the one optional field on `Replay` that got coerced instead of skipped —
  `durationSec` has always been hidden when absent, and the inconsistency only
  became visible when a source arrived with no view counts at all. A segment has
  none of its own: the VOD's belongs to the VOD, and stamping it on all sixteen
  sets cut from it would report one number sixteen times. Emitters that publish
  a real count are unaffected.
- **The gate carries its own control.** `npm run verify:segments` builds an
  overlay corpus of two segments sharing one video plus one whole-video record —
  the last of these is the control that the pre-v0.10.0 path is byte-identical —
  and `--expect-start 999` must fail.
