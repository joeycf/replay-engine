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

| Package             | Version | Role                                                         |
| ------------------- | ------- | ------------------------------------------------------------ |
| `tailwindcss`       | 4.3.2   | Tailwind **v4**, CSS-first `@theme` (the theming foundation) |
| `@tailwindcss/vite` | 4.3.2   | Official first-party Vite plugin — the ONLY Tailwind module  |
| `ufo`               | 1.6.4   | `withBase` / `joinURL` — every absolute URL goes through it  |

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
| `prettier`                            | 3.9.5   | Formatter (`.prettierrc`: semi, single-quote, trailing-comma all, width 100)                                                                                                                     |
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

---

## 2. Delivery mechanisms (how each piece is wired)

### Tailwind v4 — via `@tailwindcss/vite` through a `vite:extendConfig` hook

`@nuxtjs/tailwindcss@6` (latest) pins `tailwindcss ~3.4.17` and **cannot run v4** or its
CSS-first `@theme`; the override architecture (games shadow engine tokens) requires v4.
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
  (no stylistic ESLint rules). Game repos replicate this file verbatim.
- `.prettierrc`: `{ semi: true, singleQuote: true, trailingComma: "all", printWidth: 100 }`.
  `.prettierignore` excludes generated output, binaries, `public/`, `design/`, and
  **`PLAN.md`** (hand-authored; never machine-reflowed).
- Convention surfaced by lint: `vue/multi-word-component-names` is enforced — brand
  components use the `Brand*` prefix (`BrandWordmark`; Phase 2 adds `BrandMark`,
  `BrandSpinner`, `BrandLogo` per PLAN §5).

### Scripts (the canonical set)

| Script                                   | What it does                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `dev` / `build` / `generate` / `preview` | Run against **`fixtures/`** — the thin consuming app (`extends: ['..']`)                            |
| `typecheck`                              | Two-root `vue-tsc` check (see above)                                                                |
| `lint` / `lint:fix`                      | `nuxt prepare && eslint .` (prepare guarantees the generated config exists)                         |
| `format` / `format:check`                | Prettier across the repo                                                                            |
| `test:filters`                           | Pure-logic filter-semantics test (8 → 6 → 3) via `node --experimental-strip-types`                  |
| `fonts:update`                           | Refresh committed neutral fonts from `@fontsource-*`                                                |
| `scripts/verify-browser.mjs`             | Full hydrated-client suite (counts, real toggle clicks, theme/accent tokens) against any served URL |
| `scripts/verify-subpath.mjs`             | Base-path resilience probe — asserts no request escapes the base                                    |
| `scripts/verify-override.mjs`            | Theme-override contract probe (app `theme.css` shadows engine tokens)                               |

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
  absolute path for the same reason.
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
   `postinstall`).
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

---

## 6. Arriving in Phase 2 (planned, **not yet locked** — do not pre-install)

Listed so consuming repos don't jump early; versions get locked here when they land:

- **anime.js** (stats/viz charts, PLAN §0/§5).
- **`app/plugins/seo.ts`** (titles/meta/OG/JSON-LD/icons head) and the registry
  **provisioning API** (engine-exported provide function + app data plugin).
- **ReplayDB umbrella brand as the default theme:** teal `#17CFC8` primary, gold
  `#FBC318` secondary, Space Grotesk display (PLAN §4b) — replacing Phase 1's placeholder
  neutral blue; plus new semantic tokens `--color-secondary`,
  `--color-danger` / `--color-warning` / `--color-success` (additions documented here as
  they land).
- **`Brand*` component family:** `BrandMark`, `BrandSpinner`, `BrandLogo` joining
  `BrandWordmark`, sourced from `design/brand/*.svg`.
