# replay-engine

> Stack details (locked versions, delivery mechanisms, conventions, constraints)
> live in [`STACK.md`](./STACK.md) — the canonical reference for every consuming
> repo. Architecture and phases live in [`PLAN.md`](./PLAN.md).

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
  // `install: true` is REQUIRED for the git-layer form: without it Nuxt/c12
  // clones the layer with NO node_modules, and the engine's runtime deps
  // (@tailwindcss/vite, ufo, …) fail to resolve at build (verified in the
  // Phase-3 remote-layer check).
  extends: [process.env.ENGINE_PATH || ['github:you/replay-engine#v1.0.0', { install: true }]],
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

### 2. Provide your data — registries PROVIDED, replays FETCHED

Two provisioning paths (PLAN §2.4 as amended):

**Small registries (characters / players / stats) — statically imported and
PROVIDED.** Your app plugin hands them to the engine, bundled once at build and
synchronously available during prerender — this is what makes character/player
pages emit real HTML with data-derived titles (the SEO requirement):

```ts
// app/plugins/registries.ts (in the GAME app)
import characters from '../../data/characters.json';
import players from '../../data/players.json';
import stats from '../../data/stats.json';
import type { Character, KnownStats, Player } from '@engine/types';

export default defineNuxtPlugin(() => {
  provideRegistries({
    characters: characters as Character[], // arrays or id-keyed records both work
    players: players as Player[],
    stats: stats as KnownStats,
  });
});
```

Engine composables consume provided-first and fall back to a client fetch of
`/data/<file>.json` only when nothing was provided (`/health` shows each
collection's path). Don't publish registry copies to `public/data/` when you
provide them.

**The whale file — `replays.json` — always client-fetched.** Your pipeline
writes it to **`public/data/replays.json`** (git-ignored; generated); the engine
fetches it under the base path via `withBase()`, exactly like the original
`videos.json` flow.

Shapes come from [`types/`](./types) via the `@engine` alias:

```ts
import type { Character, Player, Replay, Stats, KnownStats } from '@engine/types';
```

Contract essentials (full definitions in `types/`):

- A `Replay` has exactly **two `sides`**; each `Side` is one `player` plus a
  `characters: string[]` whose **length === `charactersPerSide`**.
- `Side.players?: string[]` (optional, additive v0.2.0): a side that is a team
  of PEOPLE (2XKO duo queue, tournament sets). `player` stays the primary
  (= `players[0]`); filtering, search, player pages, and card/modal labels
  cover every listed player.
- `Side.rank` is present **iff** the game has ranks. `Replay.durationSec?`
  (optional, additive v0.1.0) drives the duration chip + "Longest" sort — both
  hide when absent.
- `Character.imgPortrait` is a path **under base** (e.g. `/img/char/asuka.webp`);
  the engine resolves it through `withBase()`.
- `Character.extra` / `Player.extra` are free-form bags the engine renders as a
  generic key/value strip but does not reason about — with ONE well-known key:
  `aliases: string[]` feeds search matching and the two-letter badge initials.
- `stats.json` follows `KnownStats` (types/stats.ts): well-known optional keys
  (`characterUsage`, `byPatchUsage`, `pairingUsage`, `playerCharacters`,
  `playerPairings`, `totals.byPatch`) — every panel hides when its key is
  absent. `byPatchUsage` key ORDER is the timeline order.

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
    // Optional vocabulary + URL segment (additive, v0.2.0). Every user-visible
    // engine noun resolves through these; the characters section's routes are
    // renamed to the segment at build. 2XKO: champion/champions · team ·
    // season/seasons · channel, segment 'champions' (its live indexed URLs).
    // terms: { character: 'champion', characters: 'champions', side: 'team',
    //          patch: 'season', patches: 'seasons', source: 'channel' },
    // characterRouteSegment: 'champions',
    // Optional stats-dashboard tuning (additive, v0.5.3). The meta-over-time
    // bump chart: how many characters to plot (default 5), and whether it spans
    // the whole row instead of sharing it with the `beside-timeline` game anchor
    // (default false — a game that leaves that anchor empty, e.g. Tekken, sets
    // it true; 2XKO keeps the default so its Fuse-meta companion still sits in
    // the grid's second cell).
    // stats: { metaTimelineTopN: 8, metaTimelineFullWidth: true },
  } satisfies GameConfig,
});
```

The engine reads **every** game-shaped value through `useGame()` — wordmark,
disclaimer, which filters to render, accent lookup, per-side slot count, SEO
strings. Nothing game-specific is hard-coded in the engine.

**Gated filters:** `coOccurrence` (within-side duos, tag fighters) and `rank`
(ladder games) render **only** when your config enables them. `character`,
`matchup`, `player`, `date`, `patch`, and `source` are always available.

`ranks` stays the **canonical ascending ladder** — the engine derives the chips
from it rather than rendering it verbatim: only ranks carried by a replay get a
chip (no chip ever filters to zero), and they render highest-first. Ship the
whole ladder; the data decides what shows.

---

## Theme override contract (the visual skin)

Tokens are **two tiers** (`PLAN.md` §2.6 / §4b):

- **Structural tokens** — `tailwind/structural.css`. The fixed _shape_ of the
  product: spacing scale, radii, corner-cut geometry, shadow _geometry_, motion,
  and the type _scale_ (sizes/weights/line-heights/letter-spacing). **Shared by
  every game — do not override these.**
- **Theme tokens** — `tailwind/theme-default.css`. A neutral dark default you
  **fully replace** in your app's **`app/assets/theme.css`**.

Your theme file **MUST declare its tokens in a plain, unlayered `:root { … }`
block — never `@theme`.** An app stylesheet does not pass through the engine's
Tailwind root compile (only the engine's own `tailwind/index.css` import graph
does), so an `@theme` at-rule in it reaches the browser raw — an unknown
at-rule the browser silently drops. The failure is invisible in `nuxt dev`,
which compiles each CSS file on its own and masks it; it bites only in the
production bundle, which then ships the umbrella defaults instead of your skin
(the 2XKO Phase-4 audit caught exactly this live). Unlayered `:root` custom
properties need no compilation, and because your app's CSS loads **after** the
engine layer's they beat the engine's `@layer theme` defaults in every build
mode. The engine's components reference **only** these semantic variables —
never a raw hex or a literal font family — so a full re-skin is a drop-in CSS
operation. `scripts/verify-override.mjs` gates this contract on the BUILT
fixture bundle in both directions (override wins; removal → umbrella).

**Variables you MAY shadow** (the v0.1.0 additions are marked ▸):

| Palette (`--color-*`)      | Fonts (`--font-*`) | Depth tints (optional) |
| -------------------------- | ------------------ | ---------------------- |
| `--color-bg`               | `--font-display`   | `--shadow-color`       |
| `--color-surface`          | `--font-ui`        | `--shadow-highlight`   |
| `--color-surface-raised`   | `--font-mono`      |                        |
| ▸ `--color-surface-sunken` |                    |                        |
| `--color-border`           |                    |                        |
| `--color-border-subtle`    |                    |                        |
| `--color-text`             |                    |                        |
| ▸ `--color-text-secondary` |                    |                        |
| `--color-text-muted`       |                    |                        |
| ▸ `--color-text-faint`     |                    |                        |
| `--color-primary`          |                    |                        |
| ▸ `--color-primary-hover`  |                    |                        |
| `--color-primary-contrast` |                    |                        |
| ▸ `--color-secondary`      |                    |                        |
| `--color-focus`            |                    |                        |
| ▸ `--color-danger`         |                    |                        |
| ▸ `--color-warning`        |                    |                        |
| ▸ `--color-success`        |                    |                        |

Each ▸ addition is load-bearing in the ported UI: `surface-sunken` = inset
tracks/inputs/wells; `text-secondary`/`text-faint` complete the shipped
four-tier text ramp; `primary-hover` = link/button hover; `secondary` = the
second brand color (source badges, drawer result count, typeahead affordance);
danger/warning/success = status accents (third+ source-channel styling, future
status UI).

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

/* Shadow the engine's neutral defaults: plain unlayered :root — NEVER @theme.
   An app stylesheet skips the engine's Tailwind compile, so a raw @theme block
   is dropped by the browser and your skin silently never ships (dev masks it).
   Loaded after the engine layer → these :root values win. */
:root {
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
Deeper per-game flourishes are done by overriding a _single component_ at the
same path (Nuxt layer precedence), not by adding token knobs — keep these rare.

---

## Game-panel extension slots

The stats and character pages expose slots for a game's OWN analytics panels
(PLAN §11 — the fuse rule: never genericize a mechanic one game has). The engine
ships empty placeholder components; a game overrides them **at the same path**:

- `app/components/GameStatsPanels.vue` — invoked at THREE `/stats` anchors
  (v0.4.0), receiving `patch: string | null` (the dashboard's active patch
  selection) and `position: 'after-usage' | 'beside-timeline' | 'bottom'` —
  **branch on `position`** or your content renders at every anchor.
  `after-usage` = full-width row under the usage panel (naked; bring your own
  container), `beside-timeline` = the Meta-over-time grid's second cell,
  `bottom` = the original wrapped slot.
- `app/components/GameCharacterPanels.vue` — rendered on `/characters/[id]`,
  receives `characterId: string`.

Compose engine primitives inside them (`StatPanel`, `CharacterUsageBars`, …).
The fixtures app demonstrates the mechanism with a dummy panel; 2XKO's fuse
panels are the first real consumers (Phase 3).

## Game-defined filter facets (v0.3.0)

A game can add its OWN Browse facet — rendered with the standard chip anatomy
and fully wired into URL state, deep links, active chips, and Clear all:

```ts
// app/plugins/facets.ts (in the GAME app)
export default defineNuxtPlugin(() => {
  provideGameFacets([
    {
      param: 'fuse', //          URL param — a PUBLIC contract: reuse a shipped
      //                         param name and old deep links keep working
      label: 'Fuse · either team',
      note: 'fuse identified for 2,826 of 2,915 replays', // optional honesty line
      chips: [{ id: 'freestyle', label: 'Freestyle', accent: '#FFD24A' }],
      matches: (selected, { replay, state }) => {
        // the game's own semantics (OR/AND within the facet is yours);
        // `state` is the LIVE FilterState, so predicates can compose with
        // native facets (e.g. require attachment to the side holding
        // state.characters) without engine changes
        return true;
      },
    },
  ]);
});
```

## Replay badge slots (v0.3.0)

Small accent chips on cards/modal, following the attribution rules a game
defines. Override at the same path (like `GameStatsPanels`):

- `GameSideBadge.vue` (`replay`, `side: 0|1`, `context`, `compact?`) — per-side
  chip when attribution is KNOWN; rendered in each modal side block (`compact`
  = mobile). Render nothing when attribution is unknown.
- `GameReplayBadges.vue` (`replay`, `context: 'card' | 'modal'`) — the
  center/UNBOUND strip for match-level badges (attribution unknown); rendered
  between a card's matchup and players rows, and below the modal's sides.
  Overrides own their full row markup (margins included) — unused slots cost
  zero pixels.

## Inherited build artifacts

Every `nuxt generate` of a consuming app automatically emits (zero per-app
scripting — see `modules/static-artifacts.ts`): `sitemap.xml` from the real
prerendered route list, `robots.txt`, `manifest.webmanifest` from `GameConfig`
(name, `shortName`, `manifest.themeColor`/`backgroundColor`), and the designed
404 (`404.html` ← the prerendered `/not-found` page, content-checked). The SEO
plugin injects the icon set + manifest link + theme-color head tags, all through
`withBase()`.

---

## Running the engine standalone (fixtures)

`npm run dev` / `npm run generate` target **`fixtures/`** — the thinnest possible
consuming app, which `extends` the engine exactly as a real game does. It ships
`fixtures/app/app.config.ts` (`charactersPerSide: 2`, `coOccurrence: true`) and
`fixtures/public/data/*.json`, so standalone dev exercises multi-character sides
and the gated co-occurrence filter through the _same_ layer-merge a game uses.

```bash
npm install            # installs deps (no lifecycle scripts needed)
npm run dev            # → http://localhost:3000  (fixtures app, umbrella theme)
npm run generate       # SSG build → fixtures/.vercel/output/static (+ artifacts)
npm run typecheck      # nuxt prepare + typecheck engine root AND fixtures root
npm run test:filters   # pure filter semantics (facets/search/sort) vs fixtures
npm run test:registry  # provisioning-store semantics incl. fetch fallback
npm run fonts:update   # refresh committed neutral fonts from @fontsource (rare)
node scripts/fixtures-data.mjs         # re-derive fixture stats from replays
node scripts/fixtures-data.mjs --1v1   # 1v1+rank fixture variant (genericity test)
```

Browser-level verification (needs a local Chrome at
`/usr/bin/google-chrome-stable` and a served build or dev server):

```bash
node scripts/verify-phase2.mjs  http://localhost:4180        # full ported-UI click-through (47 checks)
node scripts/verify-browser.mjs http://localhost:3000        # Phase-1 suite (counts, toggles, theme)
node scripts/verify-subpath.mjs http://localhost:4174 /sub   # base-path resilience probe
```

`/health` renders collection counts + the active `GameConfig` — the wiring check
every consuming app reuses.

### Subpath builds

`app.baseURL` defaults to `/` and reads **`NUXT_APP_BASE_URL` at build time**
(the engine wires this explicitly — on its own the env var only overrides
_runtime_ config, which desyncs the router from build-time asset paths and
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
   built on. We use Tailwind v4 + its official first-party Vite plugin. (`@theme`
   is engine-internal — `tailwind/theme-default.css` compiles through the engine's
   own CSS graph; app theme files override with plain `:root`, per the theme
   contract above.)
2. **`app.config.ts` lives in `app/`,** not the repo root (Nuxt 4 srcDir change).
3. **All collections are client-fetched (`server: false`).** Nuxt's internal
   SSR/prerender `$fetch` does not serve the app's _own_ `public/` assets, so a
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
