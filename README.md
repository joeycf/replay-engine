# replay-engine

A **base-path-aware Nuxt 4 layer** that holds all shared UI, composables, page
scaffolding, layouts, design tokens, and the **data contract** for the Replay
Database multi-game platform. It is a **library, not a deployed site** — each
game app (`2xko-replay-database`, `tekken-replay-database`, …) `extends` a pinned
tag of this repo and supplies only its data, its `app.config.ts`, its art, and
its theme. See [`PLAN.md`](./PLAN.md) for the full architecture.

The engine ships a tiny synthetic **fixture dataset** so it runs standalone in
the neutral "Replay Database" look for its own development.

---

## Consuming the engine

### 1. Extend a pinned tag (never `main`)

In your game app's `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  // Pin a tag in prod; use a local checkout during co-development.
  extends: [process.env.ENGINE_PATH || 'github:you/replay-engine#v1.0.0'],
});
```

**Local co-development** (editing the engine while building a game): keep a local
checkout next to your app and set `ENGINE_PATH` in the app's `.env`:

```
ENGINE_PATH=../replay-engine
```

The line above then uses the local path locally and the pinned tag on Vercel
(where `ENGINE_PATH` is unset). No link juggling. Bump the pin deliberately, one
game at a time (`PLAN.md` §7).

### 2. Provide your data → `public/data/*.json`

Your pipeline writes four JSON files to your app's **`public/data/`** (git-ignore
them; they're generated). The engine fetches them **client-side under the base
path** via `withBase()` (see the data-provisioning note below). Shapes come from
[`types/`](./types). Consuming apps inherit the engine's layer-safe `@engine`
alias, so import them from there:

```ts
import type { Character, Player, Replay, Stats } from '@engine/types';
```

| File               | Type          | Notes                                              |
| ------------------ | ------------- | -------------------------------------------------- |
| `characters.json`  | `Character[]` | roster registry                                    |
| `players.json`     | `Player[]`    | player registry                                    |
| `replays.json`     | `Replay[]`    | the "whale" file                                   |
| `stats.json`       | `Stats`       | `{ totals: {...}, …usage/matchup tables }`         |

Contract essentials (full definitions in `types/`):

- A `Replay` has exactly **two `sides`**; each `Side` is one `player` plus a
  `characters: string[]` whose **length === `charactersPerSide`**.
- `Side.rank` is present **iff** the game has ranks.
- `Character.imgPortrait` is a path **under base** (e.g. `/img/char/asuka.webp`);
  the engine resolves it through `withBase()`.
- `Character.extra` / `Player.extra` are free-form bags the engine renders as a
  generic key/value strip but does not reason about.

### 3. Provide your config → `app/app.config.ts`

> ⚠️ **Location:** in Nuxt 4, `app.config.ts` lives in the **`app/`** srcDir
> (`app/app.config.ts`), **not** the repo root. (The `PLAN.md` §5 diagram shows
> the Nuxt-3 root location; Nuxt 4 moved it into `app/`.)

Nuxt merges your config **over** the engine's neutral default (yours wins), so
you only set what differs:

```ts
import type { GameConfig } from '@engine/types';

export default defineAppConfig({
  game: {
    id: 'tekken8',
    slug: 'tekken', //            → URL segment + base path
    name: 'Tekken 8', //          → disclaimer ("{name} Replay Database …")
    shortName: 'Tekken', //       → wordmark ("{shortName} / REPLAY")
    rightsHolder: 'Bandai Namco Entertainment', // → disclaimer
    baseURL: '/', //              → '/' now; '/tekken' at the shell phase
    siteUrl: 'https://replaydatabase.com',
    charactersPerSide: 1, //      2XKO=2, Tekken=1
    accents: { kazuya: '#8B1E1E', jin: '#1E3A8B' /* …roster */ },
    filters: { coOccurrence: false, rank: true },
    ranks: ['Beginner', '1st Dan', /* … */ 'God of Destruction'], // req. iff filters.rank
    sourceChannels: [{ id: 'ch-abc', name: 'Some Channel' }],
  } satisfies GameConfig,
});
```

The engine reads **every** game-shaped value through `useGame()` — wordmark,
disclaimer, which filters to render, accent lookup, per-side slot count, SEO
strings. Nothing game-specific is hard-coded in the engine.

**Gated filters:** `coOccurrence` (within-side duos, tag fighters) and `rank`
(ladder games) render **only** when your config enables them. `character`,
`matchup`, `player`, `date`, `patch`, and `source` are always available.

---

## Theme override contract (the visual skin)

Tokens are **two tiers** (`PLAN.md` §2.6 / §4b):

- **Structural tokens** — `tailwind/structural.css`. The fixed *shape* of the
  product: spacing scale, radii, corner-cut geometry, shadow *geometry*, motion,
  and the type *scale* (sizes/weights/line-heights/letter-spacing). **Shared by
  every game — do not override these.**
- **Theme tokens** — `tailwind/theme-default.css`. A neutral dark default you
  **fully replace** in your app's **`app/assets/theme.css`**.

Because your app's CSS loads **after** the engine layer's, your `@theme` / `:root`
values **shadow** the defaults. The engine's components reference **only** these
semantic variables — never a raw hex or a literal font family — so a full re-skin
is a drop-in CSS operation.

**Variables you MAY shadow:**

| Palette (`--color-*`)     | Fonts (`--font-*`) | Depth tints (optional)  |
| ------------------------- | ------------------ | ----------------------- |
| `--color-bg`              | `--font-display`   | `--shadow-color`        |
| `--color-surface`         | `--font-ui`        | `--shadow-highlight`    |
| `--color-surface-raised`  | `--font-mono`      |                         |
| `--color-border`          |                    |                         |
| `--color-border-subtle`   |                    |                         |
| `--color-text`            |                    |                         |
| `--color-text-muted`      |                    |                         |
| `--color-primary`         |                    |                         |
| `--color-primary-contrast`|                    |                         |
| `--color-focus`           |                    |                         |

Per-character **accents** are separate: they come from `GameConfig.accents` and
are injected as `--accent-<characterId>` by `app/plugins/accents.ts`. Put accents
in `app.config.ts`; put the palette + fonts in `theme.css`.

**Off-limits:** everything in `structural.css` — spacing, radii, the corner-cut
geometry, motion, shadow geometry, and the type scale. Overriding these breaks
the shared product shape.

### Minimal `app/assets/theme.css` for a new game

```css
/* Self-host your display face (no gstatic): drop woff2 in app/assets/fonts/
   and reference it RELATIVELY — Vite then emits it as a hashed asset under the
   app's base path. (An absolute '/fonts/…' url() bypasses base handling and
   silently 404s under subpath deployment — CSS cannot call withBase().) */
@font-face {
  font-family: 'YourDisplay';
  font-weight: 100 900;
  font-display: swap;
  src: url('./fonts/your-display.woff2') format('woff2');
}

/* Shadow the engine's neutral defaults. Loaded after the engine layer → wins. */
@theme {
  --color-bg: #0a0410;
  --color-surface: #150a22;
  --color-surface-raised: #1f1030;
  --color-border: #3a2350;
  --color-border-subtle: #271640;
  --color-text: #f3ecff;
  --color-text-muted: #b199d0;
  --color-primary: #b23bff;
  --color-primary-contrast: #0a0410;
  --color-focus: #cf7bff;

  --font-display: 'YourDisplay', ui-sans-serif, system-ui, sans-serif;
  --font-ui: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}
```

Register it in your app's `nuxt.config.ts` `css: ['~/assets/theme.css']`.
Deeper per-game flourishes are done by overriding a *single component* at the
same path (Nuxt layer precedence), not by adding token knobs — keep these rare.

---

## Running the engine standalone (fixtures)

`npm run dev` / `npm run generate` target **`fixtures/`** — the thinnest possible
consuming app, which `extends` the engine exactly as a real game does. It ships
`fixtures/app/app.config.ts` (`charactersPerSide: 2`, `coOccurrence: true`) and
`fixtures/public/data/*.json`, so standalone dev exercises multi-character sides
and the gated co-occurrence filter through the *same* layer-merge a game uses.

```bash
npm install          # installs deps (no lifecycle scripts needed)
npm run dev          # → http://localhost:3000  (fixtures app, neutral theme)
npm run generate     # SSG build → fixtures/.vercel/output/static
npm run typecheck    # nuxt prepare + typecheck engine root AND fixtures root
npm run test:filters # filter-semantics unit test (pure core, 8 → 6 → 3)
npm run fonts:update # refresh committed neutral fonts from @fontsource (rare)
```

Browser-level verification (needs a local Chrome at
`/usr/bin/google-chrome-stable` and a served build or dev server):

```bash
node scripts/verify-browser.mjs http://localhost:3000        # counts, toggle clicks, theme
node scripts/verify-subpath.mjs  http://localhost:4174 /sub  # base-path resilience probe
```

`/health` renders collection counts + the active `GameConfig` — the wiring check
every consuming app reuses.

### Subpath builds

`app.baseURL` defaults to `/` and reads **`NUXT_APP_BASE_URL` at build time**
(the engine wires this explicitly — on its own the env var only overrides
*runtime* config, which desyncs the router from build-time asset paths and
prerender seeds under SSG). `NUXT_APP_BASE_URL=/sub/ npm run generate` emits the
whole site — pages, `_nuxt` assets, `public/` files — nested under `sub/`, with
every data fetch, font, and nav link resolving under the base. Prerender seeds
are derived from the resolved base by the engine's `enginePrerenderSeeds` inline
module, so games don't re-declare them. This is what keeps `PLAN.md` §8's
subpath-vs-subdomain decision a config flip.

---

## Notable engineering decisions (divergences from the prompt/PLAN, and why)

1. **Tailwind v4 via `@tailwindcss/vite`, not `@nuxtjs/tailwindcss`.** The
   community module's latest (`6.14`) pins `tailwindcss ~3.4.17` (v3) and cannot
   express the CSS-first `@theme` override architecture this engine's theming is
   built on. We use Tailwind v4 + its official first-party Vite plugin.
2. **`app.config.ts` lives in `app/`,** not the repo root (Nuxt 4 srcDir change).
3. **All collections are client-fetched (`server: false`).** Nuxt's internal
   SSR/prerender `$fetch` does not serve the app's *own* `public/` assets, so a
   server-side `$fetch('/data/*.json')` resolves to null. Client-fetching under
   the base path is `PLAN.md` §2.4's stated default ("fetch-all-under-baseURL for
   robustness"). A game needing prerendered registry content can instead provide
   its registries via a plugin (the §2.4 alternative) — the engine never reaches
   into an app's filesystem.
4. **`fixtures/` is a real consuming app** (not a copy-into-`public/data` step),
   which validates the `extends` contract in Phase 1 and cleanly separates the
   engine's `charactersPerSide: 1` default from the fixture's `2`.
5. **Neutral fonts are committed under `tailwind/fonts/` (with OFL licenses) and
   referenced with relative `url()`s**, not served from `public/fonts/`:
   relative URLs make Vite emit them as hashed, base-path-safe assets, and
   committing them means a game installing the engine as a git layer (where
   devDependencies are pruned) still builds. `PLAN.md` §5 shows `public/fonts/`;
   that location only works at root deployments.
6. **Motion durations use Tailwind v4's real theme namespace**
   (`--transition-duration-*`); a literal `--duration-*` token is silently
   dropped by v4 and the `duration-*` utilities would fall back to 150ms.
