# Replay Database — Multi-Game Platform Plan
### Polyrepo + Nuxt Layer architecture

This is the source-of-truth document for turning the single 2XKO Replay Database into a
multi-game platform where each game is its own repository, all games share one design
system and one "replay-database engine," and a selector at the root of
`replaydatabase.com` points at each game. Phase prompts (`prompt-1…6`) are derived from
this document; keep this committed at the root of the **engine** repo as `PLAN.md` so
every phase has the same context, exactly as `2xko-video-hub-plan.md` served the original
build.

---

## 0. Where we're starting from

The current live site (`replaydatabase.com`) is one Nuxt 4 app, `2xko-replay-database`:

- **Stack:** Nuxt 4 (SSG via `nuxt generate`, Vercel `vercel-static` preset → `.vercel/output`)
  · Vite · TypeScript · Tailwind **v3** via `@nuxtjs/tailwindcss@6` (JS `tailwind.config.js`
  mirroring `design/handoff` tokens) · `@nuxtjs/google-fonts` (download mode, self-hosted) ·
  `@vercel/analytics` module + speed-insights client plugin · anime.js (viz) · no Pinia.
  Phase 3 modernizes this to the canonical stack in the engine's STACK.md (Tailwind v4 via
  the layer, fontsource fonts, shared lint/format tooling).
- **Layout:** repo-root `/data` (`videos.json`, `champions.json`, `players.json`,
  `stats.json`), `/types` (shared TS interfaces), `/scripts` (`fetch.ts`, `parse.ts`,
  `channels.ts`, `champions.ts` — the pipeline), `/design` (Claude Design `handoff/`
  exports + `.dc.html` mockups + `screenshots/`), `/public/img/champions/` (webp art).
  App code under `app/` (`app/pages`, `app/components`, `app/composables` —
  `useVideos`/`useFilters`/`useStats` — `app/layouts`). Root alias `~~/` for repo-root
  JSON since `~/` resolves to `app/`.
- **Data flow:** the small registries (`champions`, `players`) are static-imported and
  bundled; the whale file `videos.json` is copied to `public/data/` at build (gitignored)
  and fetched client-side via `useAsyncData('videos', () => $fetch('/data/videos.json'), { server: false })`.
- **Pipeline:** YouTube Data API (key is **local-only**, never on Vercel), parse, channel
  extraction, champion art from Riot's CMS CDN. Rebuilt on a schedule so new uploads appear.
- **Pages:** Browse (grid + AND-semantics filters + video modal), Stats (charts),
  Champions, Players, per-champion, per-player, `/health` (dev), `/`. ~1,470 prerendered
  routes.
- **SEO:** per-page titles/meta, OG cards, `sitemap.xml`, robots, WebSite + Organization
  JSON-LD, SearchAction sitelinks-searchbox, `NUXT_PUBLIC_SITE_URL`. Live on Porkbun DNS.
- **Product name:** "2XKO Replay Database," wordmark `2XKO/REPLAY`, footer disclaimer
  "…unofficial fan project, not endorsed by or affiliated with Riot Games."

Everything below preserves this and generalizes it.

---

## 1. Target architecture at a glance

Four repositories:

```
                         replaydatabase.com
                                │
                  ┌─────────────┴──────────────┐
                  │   replay-database-shell      │   owns the domain
                  │   (selector landing page)   │   vercel.json rewrites (subpath mode)
                  └─────────────┬───────────────┘
             /2xko*  ┌──────────┼───────────┐  /tekken*
                     ▼                       ▼
     ┌────────────────────────┐   ┌────────────────────────┐
     │  2xko-replay-database  │   │  tekken-replay-database │   thin game apps
     │  (existing, refactored)│   │  (new)                  │   own Vercel project each
     └───────────┬────────────┘   └───────────┬────────────┘   own data + pipeline
                 │  extends (pinned tag)       │  extends (pinned tag)
                 └──────────────┬──────────────┘
                                ▼
                   ┌─────────────────────────┐
                   │      replay-engine       │   Nuxt LAYER (library, not deployed)
                   │  components · composables │   shared design system + schema
                   │  pages · layouts · types  │   base-path-aware, config-driven
                   └─────────────────────────┘
```

- **`replay-engine`** — a Nuxt layer. Holds *all* shared UI, composables, page scaffolding,
  layouts, the design tokens, and the data contract (types). Never deployed on its own; it
  is consumed by the other apps. Ships a tiny synthetic fixture dataset so it can run
  standalone for its own development.
- **Game apps** (`2xko-replay-database`, `tekken-replay-database`, …) — thin. Each is a
  Nuxt app that `extends` a *pinned version* of the engine and supplies only: its data
  (`public/data/*.json` produced by its own pipeline), its `app.config.ts` (game-specific
  settings), its character art, its bespoke `/scripts` ingestion, and — rarely — a genuine
  UI override. Each is its own Vercel project with its own scheduled rebuild.
- **`replay-database-shell`** — owns `replaydatabase.com`. Serves the selector at `/` and
  (in subpath mode) proxies `/2xko/*` and `/tekken/*` to the game deployments. Also
  `extends` the engine so the selector's chrome matches the design system.

---

## 2. Key decisions and the reasoning

1. **Polyrepo + Nuxt layer, not a monorepo, not copy-paste.** Separate repos give you
   independent deploy cadence, independent data pipelines, and blast-radius isolation (one
   game breaking never blocks another). A Nuxt layer gives you shared look/feel/behavior
   without the drift you'd get from copy-pasting. A monorepo would re-introduce deploy
   coupling on Vercel; copy-paste would guarantee divergence. The layer is the idiomatic
   Nuxt primitive for "N sites that share everything but their data."

2. **Pin each game to a tagged version of the engine, never `main`.** `extends:
   ['github:you/replay-engine#v1.3.0']`. This is what keeps "separate repos" meaningfully
   independent: an engine change cannot silently break a game on its next scheduled
   rebuild. You upgrade each game deliberately by bumping its pin. (Dev loop for
   co-developing engine + a game is in §7.)

3. **The engine is base-path-aware from day one**, so the subpath-vs-subdomain routing
   decision is deferred to the final phase and stays a config flip rather than a refactor.
   Every internal link, asset URL, and data fetch in the engine goes through Nuxt's
   base-URL machinery (`app.baseURL`, `<NuxtLink>`, and `withBase()` for the handful of
   absolute paths). A game runs correctly at `/` or under `/2xko` purely by changing
   `app.baseURL`. This means 2XKO stays live at root through the whole build; routing only
   gets decided when the shell is built (§8).

4. **Data provisioning: config is pushed, registries are provided (bundled), replays are
   fetched.** To keep the engine game-agnostic and dodge Nuxt's cross-layer alias
   resolution, each game:
   - puts truly-small, static settings in `app/app.config.ts` (name, slug, accents, filter
     toggles, disclaimer) — merged over the engine's defaults;
   - **statically imports its small registries** (`characters`, `players`, `stats`) and
     hands them to the engine through a provisioning API (an app plugin calling an
     engine-exported provide function; exact API defined in Phase 2). Bundled data is
     available at prerender time, so character/player/stats pages generate as **real HTML
     with data-derived titles** — this preserves the original build's SEO and is
     **required**, not optional: Phase 1 proved prerender-time `$fetch` cannot read the
     app's own `public/`, so fetch-only registries would prerender every registry page as a
     hollow client-hydrated shell;
   - writes the whale file (`replays.json`) to `public/data/` in its pipeline; the engine
     client-fetches it under the base path (`server: false`), exactly like the original
     `videos.json` flow.
   The engine never reaches into an app's filesystem; the app hands data down. Engine
   composables fall back to client fetch for registries only when nothing is provided
   (fixture/standalone robustness).

5. **Naming: keep the current repo as the 2XKO game app; the engine is a NEW repo.**
   Details and the answer to "should I rename it?" are in §6.

6. **Two-tier design tokens; every game carries its own full theme; the engine default is a
   neutral umbrella look.** The engine shares the *product* design of a replay database —
   layout, component anatomy, interaction patterns, responsive behavior — but each game
   fully re-skins it: its own palette, display font, and wordmark, not just accent colors.
   Tokens split into **structural** (spacing, radii, the corner-cut geometry, shadows,
   motion, the type *scale* — fixed in the engine, not overridden) and **theme** (the
   semantic palette + font *families* + per-character accents — neutral defaults in the
   engine, fully overridden per game). Engine components reference only *semantic* variables
   (`--color-surface`, `--font-display`, `--accent-<id>`), never raw hex or a specific font
   name — the design analogue of the "no hard-coded champion" rule. The engine's neutral
   default theme is deliberately presentable (it's what the **selector** uses, so it favors
   no single game), and 2XKO's neon look becomes 2XKO's *own* theme override rather than a
   privileged default — making 2XKO and Tekken symmetric skins. Full architecture in §4.
   Because layouts already exist, a new game is a **theming exercise** (palette + display
   font + roster accents against shared components), meaningfully less work than the original
   2XKO design.

---

## 3. The shared data contract (the real foundation)

The UI ports trivially; the schema is where reuse breaks. 2XKO is a 2v2 tag fighter (each
player controls a duo, "same-side" pairing matters, 15 champions). Tekken 8 is 1v1 (large
roster, a rank ladder, no team composition). A schema that hard-codes tag-fighter
assumptions will not fit Tekken.

**The generalization:** a replay has exactly two *sides*; each side is one player plus a
*list* of characters whose length varies by game. 2XKO → 2 characters per side; Tekken →
1; Marvel-style games → 2–3. The 2XKO "same-side / duo" filter is not special — it is a
**within-side co-occurrence filter** ("show replays where one side's character list
contains both A and B"), which is simply only *offered* when a side has more than one
character. Tekken's ranks are a generic optional **rank filter**. Each game's config
declares which optional filters apply.

Engine `types/` (the contract every game and the engine agree on):

```ts
// types/game.ts
export interface GameConfig {
  id: string;                    // 'tekken8'
  slug: string;                  // 'tekken'  → URL segment + base path
  name: string;                  // 'Tekken 8'
  shortName: string;             // 'Tekken'  → wordmark
  rightsHolder: string;          // 'Bandai Namco Entertainment' → disclaimer
  baseURL: string;               // '/tekken' or '/' (fed into app.baseURL)
  siteUrl: string;               // canonical origin for SEO/OG/sitemap
  charactersPerSide: 1 | 2 | 3;  // 2XKO=2, Tekken=1 → validation + UI hints
  accents: Record<string, string>;       // characterId → hex accent
  filters: {
    coOccurrence: boolean;       // within-side duos ("same side"); tag fighters only
    rank: boolean;               // rank-ladder filter; games with ranks only
    // matchup / character / player / date / patch / source are always available
  };
  ranks?: string[];              // ordered ladder, required iff filters.rank
  sourceChannels: { id: string; name: string }[];
  fonts?: { display: string; ui: string; mono: string }; // defaults from engine
}

// types/replay.ts
export interface Character {
  id: string;
  name: string;
  imgPortrait: string;           // path under base, e.g. /img/char/asuka.webp
  imgSplash?: string;
  accent: string;                // resolved from GameConfig.accents at build
  extra?: Record<string, unknown>;   // game-specific fields
}

export interface Player {
  id: string;
  handle: string;
  featured?: boolean;
  extra?: Record<string, unknown>;
}

export interface Side {
  player: string;                // Player.id
  characters: string[];          // Character.id[]; length === charactersPerSide
  rank?: string;                 // present iff the game has ranks
}

export interface Replay {
  id: string;                    // youtube id
  sides: [Side, Side];
  date: string;                  // ISO
  patch?: string;                // season / version
  source: string;                // channel id
  title: string;
  views?: number;
  thumb?: string;
}

export interface Stats {
  totals: { replays: number; characters: number; players: number };
  [k: string]: unknown;          // usage tables, matchup matrix, etc.
}
```

Notes:
- `extra` on `Character`/`Player` is the pressure-release valve for genuinely
  game-specific metadata (e.g. Tekken movelist links, 2XKO fighter archetype) that the
  engine renders generically (a key/value strip) but doesn't reason about.
- The engine's filter composable exposes character, matchup, player, date, patch, and
  source filters unconditionally, and co-occurrence / rank filters conditionally on
  `config.filters`. AND-semantics across chips is preserved from the original build.

---

## 4. Game config and theming

Each game customizes the engine on two surfaces: **`app.config.ts`** (data-shaped settings)
and its **theme CSS** (the visual skin). Keep them separate — config is TypeScript the
engine reads via `useGame()`; the theme is CSS variables the engine's components resolve.

### 4a. `app.config.ts` (data-shaped settings)

Each game app ships an `app.config.ts` that Nuxt merges over the engine's default config.
Everything game-shaped lives here so the engine stays generic.

**2XKO** (`2xko-replay-database/app.config.ts`, abbreviated):

```ts
export default defineAppConfig({
  game: {
    id: '2xko', slug: '2xko', name: '2XKO', shortName: '2XKO',
    rightsHolder: 'Riot Games',
    baseURL: '/',                 // stays '/' until the shell phase, then '/2xko'
    siteUrl: 'https://replaydatabase.com',
    charactersPerSide: 2,
    filters: { coOccurrence: true, rank: false },
    accents: { ahri: '#E93B77', yasuo: '#3BA7E9', /* …15 champions */ },
    sourceChannels: [ /* the tracked YouTube channels */ ],
  } satisfies GameConfig,
})
```

**Tekken 8** (`tekken-replay-database/app.config.ts`, abbreviated):

```ts
export default defineAppConfig({
  game: {
    id: 'tekken8', slug: 'tekken', name: 'Tekken 8', shortName: 'Tekken',
    rightsHolder: 'Bandai Namco Entertainment',
    baseURL: '/',                 // '/' during build; '/tekken' at the shell phase
    siteUrl: 'https://replaydatabase.com',
    charactersPerSide: 1,
    filters: { coOccurrence: false, rank: true },
    ranks: ['Beginner','1st Dan','…','Tekken King','Tekken God','God of Destruction'],
    accents: { kazuya: '#8B1E1E', jin: '#1E3A8B', /* …roster */ },
    sourceChannels: [ /* Tekken replay channels */ ],
  } satisfies GameConfig,
})
```

The engine reads `useAppConfig().game` (wrapped in a `useGame()` composable) everywhere it
needs a game-shaped value: wordmark, disclaimer, which filters to render, accent lookup,
per-side character-slot count, SEO strings, canonical origin.

### 4b. Theming (the visual skin)

Two tiers of tokens, per decision §2.6:

- **Structural tokens** — fixed in the engine, identical for every game. They define the
  *shape* of the product: the spacing scale, border radii, the **corner-cut geometry**
  (2XKO's angular clips), the shadow system, motion (easing/durations), and the
  **typographic scale** (sizes, weights, line-heights, letter-spacing). NOT the font
  families — only the scale. These live in the engine's Tailwind preset /
  `tailwind/structural.css` and are not expected to be overridden.

- **Theme tokens** — semantic variables with neutral defaults in the engine
  (`tailwind/theme-default.css`), **fully overridden per game** in the game's own
  `app/assets/theme.css`. Three groups:
  - **Palette** (semantic, not raw): `--color-bg`, `--color-surface`,
    `--color-surface-raised`, `--color-border`, `--color-border-subtle`, `--color-text`,
    `--color-text-muted`, `--color-primary`, `--color-primary-contrast`, `--color-focus` —
    plus, added in Phase 2 while porting the real UI: `--color-secondary` (the second brand
    color; umbrella gold) and the status colors `--color-danger` / `--color-warning` /
    `--color-success`, with any further additive tiers (e.g. an extra text tier) documented
    in STACK.md as they prove necessary.
  - **Font families**: `--font-display`, `--font-ui`, `--font-mono` (family assignment only;
    the scale stays structural).
  - **Accents**: `--accent-<characterId>`, injected from `GameConfig.accents` by
    `app/plugins/accents.ts` (already in the plan). Accents live in `app/app.config.ts`; the
    palette + fonts live in the theme CSS.

**The hard rule:** engine components must reference only these semantic variables — never a
raw hex value or a literal font-family name. That is what makes a full re-skin a
drop-in-CSS operation. Prompt-2's audit greps for violations, exactly like the
"no hard-coded champion" check.

**Override mechanics (Tailwind v4 + Nuxt layers):** the engine defines neutral defaults in
its `@theme`; each game's `app/assets/theme.css` defines its own `@theme` (or `:root`)
block that **shadows** them, and because the app's CSS loads after the layer's, the app's
values win. **Fonts are self-hosted as npm `@fontsource` packages imported from the theme
CSS** and processed by Vite (hashed, base-path-safe) — as-built in Phase 1. Never reference
fonts via `public/` CSS `url()`s: CSS cannot `withBase()`, so absolute `/fonts/*` URLs are a
silent 404 under a subpath. A game using a non-default face installs its `@fontsource-*`
package (or commits the `woff2` as a Vite-processed asset), imports it in `theme.css`, and
reassigns `--font-display`.

**The neutral engine default is the umbrella/selector look — and the umbrella IS the
ReplayDB brand:** teal `#17CFC8` primary, gold `#FBC318` secondary, Space Grotesk display
(set in Phase 2 from the Claude Design logo system). The **selector** uses it as-is
(favoring no single game); each **game** fully replaces it. 2XKO's neon pink/cyan palette
(`#FF2E88` / `#38CFFF`) + Chakra Petch / Barlow / JetBrains Mono become **2XKO's own theme
override**, not an engine default — so 2XKO and Tekken are symmetric skins, each visually
distinct from the umbrella.

**Deeper per-game flourishes** (a background texture, a bespoke hero, a custom wordmark
treatment) are done by overriding a *single component* at the same path in the game app —
which Nuxt layer precedence already supports — rather than adding many token knobs. Keep
these rare; most identity comes from palette + display font.

**Fan-project safety:** evoke each game's feel through **type and color**, not the
trademarked logo. Use a `"{shortName} / REPLAY"` wordmark in a game-appropriate display
font, consistent with the disclaimer each site already runs.

---

## 5. Repo-by-repo layout

*(Architectural trees — the as-built canonical layout, exact file names, and locked
versions live in the engine's `STACK.md`, which wins where they differ.)*

**`replay-engine`** (the layer)
```
replay-engine/
├─ PLAN.md                      ← this document (source of truth)
├─ STACK.md                     ← locked stack/versions/conventions (canonical as-built)
├─ nuxt.config.ts               ← layer base: Tailwind v4 via @tailwindcss/vite
│                                 (vite:extendConfig hook), SSG/Vercel defaults, anime.js
├─ tailwind/
│  ├─ structural.css            ← FIXED tokens: spacing, radii, corner-cuts, shadows, motion, type scale
│  ├─ theme-default.css         ← NEUTRAL default theme = the ReplayDB umbrella brand (teal/gold, Space Grotesk)
│  └─ fonts/                    ← committed neutral-default woff2, Vite-processed (NOT public/)
├─ design/brand/                ← brand sources: rd-mark.svg, spinner.svg, replaydb-primary.svg, rd-icon.svg
├─ public/                      ← favicon(.ico/.svg) + icons/ (16→512 + maskable) — inherited by all games
├─ types/                       ← game.ts, replay.ts  (THE contract)
├─ app/
│  ├─ app.config.ts             ← DEFAULT GameConfig (Nuxt 4 srcDir — root placement is ignored)
│  ├─ layouts/default.vue       ← header/wordmark, nav, footer/disclaimer, analytics
│  ├─ pages/                    ← index (Browse), stats, characters/*, players/*, not-found, health
│  ├─ components/               ← grid/filters/modal/charts/cards + BrandMark, BrandSpinner, BrandLogo
│  ├─ composables/              ← useGame, useReplays (client fetch), useCharacters/usePlayers/useStats
│  │                              (provided-first, fetch fallback), useFilters, …
│  └─ plugins/                  ← seo.ts (titles/meta/OG/JSON-LD/icons head), accents.ts
├─ fixtures/                    ← thin consuming app (extends '..'): own app/app.config.ts,
│                                 provided fixture registries + fetched fixture replays
└─ README.md                    ← consumer contract: extends, provisioning API, theme override contract
```

**`2xko-replay-database`** (existing, refactored to thin app)
```
2xko-replay-database/
├─ nuxt.config.ts               ← extends engine (pinned); prerender route seeding from registries
├─ app/
│  ├─ app.config.ts             ← the 2XKO GameConfig (accents, filters, channels, …)
│  ├─ assets/theme.css          ← 2XKO THEME: pink/cyan palette + @fontsource imports (Chakra
│  │                              Petch / Barlow / JetBrains Mono, Vite-processed)
│  ├─ plugins/data.ts           ← statically imports registries → engine provisioning API
│  ├─ pages/dev/*, server/api/dev  ← 2XKO curation tooling (manual entry, fuse gaps) — stays
│  └─ components/Fuse*, composables/useFuses  ← 2XKO-only fuse system, plugged into engine slots
├─ data/                        ← source JSON (pipeline output, generic schema + fuse extras)
├─ scripts/                     ← 2XKO pipeline (UNCHANGED intake; emits generic schema;
│                                 copies replays.json → public/data)
├─ assets/                      ← pipeline parsing templates (fuse/name) — stays
├─ public/img/champions/        ← champion art (webp)
├─ public/data/                 ← generated: replays.json (gitignored)
├─ types/                       ← 2XKO-only extension types (fuses)
└─ design/                      ← 2XKO Claude Design exports (theme + accent source of truth)
```

**`tekken-replay-database`** (new) — same shape as the 2XKO app, with a Tekken pipeline in
`/scripts` (YouTube + character art/data from Bandai Namco or a fan wiki), Tekken art in
`public/img/`, the Tekken `app/app.config.ts`, and its **own** `app/assets/theme.css`
carrying Tekken's darker/metallic palette and an `@fontsource` display font.

**`replay-database-shell`** (new)
```
replay-database-shell/
├─ nuxt.config.ts               ← extends engine (for chrome/tokens); app.baseURL '/'
├─ app/
│  ├─ app.config.ts             ← umbrella config (brand, list of games + their slugs/urls)
│  └─ pages/index.vue           ← the selector landing page (BrandLogo, game cards, counts)
├─ public/data/summary.json     ← per-game counts (fetched/committed at build) for the cards
└─ vercel.json                  ← SUBPATH MODE ONLY: external rewrites to the game deploys
   (no theme.css → the selector wears the engine's ReplayDB umbrella theme, favoring no game)
```

---

## 6. Changes to the ORIGINAL repo to prepare (your explicit question)

**Should you rename `2xko-replay-database` to something generic to make room for a new 2XKO
repo? No — invert it.** Reasons:

- The existing repo is wired to your **live Vercel project** and your **indexed URLs**.
  Gutting it and renaming it to "engine" mid-flight is the single highest-risk change
  available. Keep production boring.
- `2xko-replay-database` is a *correctly game-specific* name for a per-game app repo. In a
  polyrepo, game apps are supposed to be game-named. It doesn't need to change.
- Its git history is coherent as "the 2XKO site." Renaming it to a generic engine muddies
  that; a fresh `replay-engine` repo starts the shared code's history cleanly.

So: **keep `2xko-replay-database` as the 2XKO app. Create `replay-engine` as a new repo.
Move the shared code there, then refactor the 2XKO repo to consume it.** The existing repo
becomes the engine's first consumer and reference implementation.

Concrete prep changes to the original repo (executed in prompt-3, after the engine exists):

1. **Add the layer dependency.** `extends: [process.env.ENGINE_PATH || 'github:you/replay-engine#v1.0.0']` in `nuxt.config.ts`.
2. **Introduce `app.config.ts`** with the 2XKO `GameConfig` (name, slug `2xko`, `baseURL`
   kept at `'/'` for now, `charactersPerSide: 2`, `filters.coOccurrence: true`, the 15
   champion accents, tracked channels, Riot disclaimer). The accents come from the existing
   `design/handoff` tokens — single source of truth preserved.
3. **Delete the now-duplicated code** that moved to the engine: the shared components,
   composables, layouts, pages, types, and the v3 Tailwind config/tokens. What remains in
   `app/` is 2XKO's real surface: the GameConfig, the theme, the data-provider plugin, and
   the **2XKO-only fuse system** (`useFuses`, `Fuse*` components, the fuse/manual-entry dev
   pages + `server/api/dev`, `assets/*-templates`) — which stays app-side and plugs into the
   engine's game-panel extension slots rather than being genericized.
3a. **Relocate 2XKO's look into its own theme override.** The engine default is the ReplayDB
   umbrella, so 2XKO's identity must move into `app/assets/theme.css`: the pink/cyan
   **semantic palette** values from `tailwind.config.js` / `design/handoff` (shadowing the
   engine defaults) plus **Chakra Petch / Barlow / JetBrains Mono** as `@fontsource`
   packages imported in `theme.css` (Vite-processed; exact weights matched to the current
   `googleFonts` config). Accents stay in `app/app.config.ts`. Net effect: the 2XKO site
   looks **identical to today**, but its skin now lives in 2XKO's repo, not the engine —
   a symmetric skin with Tekken. This step rides the broader **stack modernization**
   (Tailwind v3 module + google-fonts module removed, canonical lint/format/tsconfig
   adopted, versions aligned per STACK.md).
4. **Reshape the pipeline output to the generic schema** (`Replay.sides[2]` etc.). The
   *intake* (YouTube fetch, Riot art scrape) is unchanged; only the *shape it emits*
   changes. Registries (`characters`/`players`/`stats`) are **statically imported and
   provided** to the engine (preserving both the original bundling optimization and
   prerendered SEO); `replays.json` keeps the copy step into `public/data/` for client
   fetch; fuse data rides as 2XKO extension collections/`extra`. Verify with `/health` that
   counts are **identical pre- and post-reshape** (2,809 / 15 / 714 / 24 — assert against
   independently computed numbers, same discipline as the original build). This is the one
   step that touches working data, so it gets the strongest verification.
5. **Base-path-awareness inherited from the engine.** No 2XKO-specific work here beyond
   confirming champion-art paths and the replays fetch resolve under base (they will,
   because the engine uses `withBase()`); `app.baseURL` stays `'/'` until the shell phase.
6. **Keep it deployed at root.** No migration yet. 2XKO continues serving
   `replaydatabase.com/*` unchanged for users while all this happens.

What **stays** in / newly **lives in** the 2XKO repo: `data/`, `scripts/`, pipeline
`assets/` templates, `public/img/champions/`, `app/app.config.ts`, `app/assets/theme.css`
(the 2XKO skin, fontsource-provisioned), the data-provider plugin, the fuse system + dev
curation tooling, `design/`, and its own Vercel project + cron. What **moves** to the
engine: everything shared (UI, composables, pages, layouts, types, and only the
*structural* tokens — the umbrella default theme stays in the engine, the 2XKO theme does
not).

---

## 7. Layer versioning and the dev loop

- **Prod:** each app pins a tag — `github:you/replay-engine#v1.3.0`. Bumping is a
  deliberate one-line change per app; upgrade 2XKO, verify, then upgrade Tekken.
- **Local co-development** (editing the engine while building a game): keep a local
  checkout of `replay-engine` next to the app and set `ENGINE_PATH=../replay-engine` in the
  app's `.env`. The `nuxt.config.ts` line
  `extends: [process.env.ENGINE_PATH || 'github:you/replay-engine#v1.0.0']` then uses the
  local path locally and the pinned tag on Vercel (where `ENGINE_PATH` is unset). No link
  juggling.
- **SemVer discipline:** breaking schema/config changes → major bump, and the migration
  note goes in the engine's `CHANGELOG.md`. Additive components/filters → minor. This is
  the contract that lets many games ride one engine safely.

---

## 8. Routing — the one deferred decision

The engine's base-path-awareness means you can build everything else first and pick this
last. Both branches:

**Subpath mode (`replaydatabase.com/2xko`, the form you described):**
- Each game app sets `app.baseURL` to `'/2xko'` / `'/tekken'` (flip the value in its
  `app.config.ts` → `nuxt.config.ts`). Nuxt then emits pages, assets, and public files
  under that subfolder, and `withBase()` fetches resolve correctly.
- The shell owns the domain and carries a `vercel.json` proxying each subpath to the game's
  own deployment. Rewrites to external origins are the supported, framework-agnostic way to
  do this on Vercel (they work with Nuxt; the Microfrontends product is oriented to
  Next/SvelteKit/React Router, so plain external rewrites are the safer choice):
  ```json
  {
    "rewrites": [
      { "source": "/2xko/:path*",   "destination": "https://2xko-replay-database.vercel.app/2xko/:path*" },
      { "source": "/tekken/:path*", "destination": "https://tekken-replay-database.vercel.app/tekken/:path*" }
    ]
  }
  ```
- **Migration of 2XKO off root** (the real cost): 301/308 redirects from every old root URL
  (`/stats`, `/champions/*`, `/players/*`, `/browse`, …) to its `/2xko/*` equivalent;
  regenerate the sitemap with the `/2xko` prefix; resubmit in Search Console. Do this
  **sooner rather than later** — the more URLs indexed at root, the larger the migration.
- **SEO upside:** authority consolidates under one host — which matters given the SEO work
  already invested. This is why subpath is the recommended long-term answer.

**Subdomain mode (`2xko.replaydatabase.com`) — the simpler alternative:**
- Each game keeps `app.baseURL: '/'` and gets its own custom subdomain (a CNAME at
  Porkbun → Vercel). No rewrites, no shell proxy, apps stay at their own root.
- The shell at `replaydatabase.com` just links out to the subdomains.
- Cost: still requires moving the current 2XKO site off the apex to a subdomain (same
  migration shape), and subdomains fragment domain authority somewhat versus subpaths.

**Recommendation:** subpath, for the SEO consolidation, accepting the one-time migration —
but because the engine is base-path-aware, you can validate the whole platform in subdomain
or even root-only mode first and switch to subpaths by flipping `app.baseURL` + adding the
shell `vercel.json`, with the migration redirects as the only extra work. Prompt-5 covers
both branches; finalize it once you pick.

---

## 9. Deploy topology

- **`replay-engine`** — not deployed. It's a library. (Optionally deploy its fixture
  playground to a throwaway preview for engine QA, but no production project.)
- **Each game app** — its own Vercel project (Hobby fine), `npm run generate`, its own
  `NUXT_PUBLIC_SITE_URL`, its own scheduled rebuild (Vercel Cron or a GitHub Action hitting
  a deploy hook) so new uploads appear. YouTube key stays **local-only**; the site builds
  from committed/generated JSON.
- **`replay-database-shell`** — its own project, owns `replaydatabase.com`. In subpath mode
  it also carries the rewrites.
- **Selector counts** — each game publishes a small `summary.json` (its totals) at its
  deploy root; the shell fetches them at build (or you commit them) to render "N replays
  across M games" and per-card counts.

---

## 10. Phase roadmap

| Phase | Goal | Prompt |
|------|------|--------|
| 1 | Scaffold `replay-engine` + define the shared contract (types, config schema) and the **two-tier tokens** (structural + a neutral default theme), fixture data, `/health`. Engine runs standalone on fixtures in the neutral look. | `prompt-1-engine-scaffold-and-schema.md` |
| 2 | Port the 2XKO UI into the engine as generic, config-driven, base-path-aware components/pages/composables **referencing only semantic theme variables**. Still running on fixtures. | `prompt-2-engine-extraction.md` |
| 3 | Refactor `2xko-replay-database` to a thin app that `extends` the engine; reshape its data to the generic schema; **relocate the 2XKO palette + fonts into its own `theme.css`**; verify counts and that the look is unchanged; keep it live at root. | `prompt-3-2xko-refactor-to-layer.md` |
| 4 | Build `tekken-replay-database` as the second thin app: bespoke pipeline, shared schema, Tekken config (1v1, ranks), **and its own full Tekken theme** (palette + display font). Validates genericity *and* the re-skin path. | `prompt-4-tekken-app.md` |
| 5 | Build `replay-database-shell`: selector landing page + wire routing (subpath rewrites **or** subdomains) + migrate 2XKO off root. | `prompt-5-shell-and-routing.md` |
| 6 | Per-game scheduled rebuilds, `summary.json` for selector counts, cross-game SEO (each game + the selector). | `prompt-6-refresh-and-cross-game-seo.md` |

Ordering rationale: the schema (1) is the foundation; the engine must be proven on
fixtures (2) before touching the live game; 2XKO (3) validates the extraction against real
data; Tekken (4) is where genericity is actually tested; the shell (5) is trivial and comes
last because it points at proven games and is where routing lands; refresh/SEO (6) is
polish. This is deliberately the reverse of "build the selector first."

---

## 11. Risks and gotchas (recap)

- **Cross-layer alias fragility** — solved by the data-provisioning approach in §2.4 (apps
  push data; engine fetches under base). Don't have engine files import app JSON via `~~/`.
- **Base-path absolute-path traps** — `app.baseURL` fixes `<NuxtLink>`, the router, and
  bundled assets, but any *absolute* string path (the replays fetch, `/img/...`,
  hand-written `<a href>`, JSON-LD URLs) must go through `withBase()` /
  `useRuntimeConfig().app.baseURL`. These fail silently under a subpath. The engine must be
  audited for these once, in prompt-2.
- **Migration timing** — moving 2XKO off root is real work and gets worse with time; if
  subpaths are the plan, don't let it drift (§8).
- **Schema leaks** — if any engine component hard-codes "2 characters" or "same side" or a
  Riot-specific string, genericity is broken. Everything game-shaped comes from
  `useGame()`. Tekken (phase 4) is the test that catches leaks.
- **Design leaks** — the visual analogue: any engine component with a raw hex color or a
  literal font-family name silently privileges 2XKO's look and breaks a clean re-skin.
  Engine styles reference only semantic variables (`--color-*`, `--font-*`, `--accent-*`);
  prompt-2 greps for violations. Structural tokens (radii, corner-cuts, motion) are
  deliberately shared and are *not* leaks.
- **Prerender-SEO hollow shells** — prerender-time `$fetch` cannot read the app's own
  `public/` (proven in Phase 1), so fetch-only data prerenders every page as an empty
  client-hydrated frame, silently discarding the live site's indexed, content-ful HTML.
  Resolved by required registry provisioning (§2.4); guarded by the view-source checks in
  prompts 2–3 (generated character/player HTML must contain the entity's name and title).
- **CSS `url()` cannot base-prefix** — fonts or images referenced from CSS as absolute
  `public/` paths 404 silently under a subpath. Resolved by fontsource/Vite-processed
  assets (Phase 1 as-built); any future CSS-referenced asset must follow the same rule.
- **Game-specific stat systems** — some UI is legitimately per-game (2XKO's fuse panels,
  synergy/pairing views beyond generic co-occurrence). The engine's stats page exposes
  extension slots for game panels; the failure mode to avoid is genericizing a mechanic
  only one game has, or worse, hard-coding it into the engine.
- **Layer version drift** — pin tags, bump deliberately, keep a CHANGELOG (§7).
- **External-rewrite caching** — for Vercel projects created on/after Apr 6 2026, external
  rewrites honor upstream cache-control by default; fine here, just be deliberate about
  cache headers on proxied game assets in subpath mode.

---

## Addendum — Phase 3 as-built (engine v0.2.0 → v0.4.0, 2XKO live on the layer)

Phase 3 + 3.5 completed and merged to production (replaydatabase.com now runs the thin app
on `replay-engine#v0.4.0`). The parity gates forced four **additive** engine contract
features this plan had not specified; STACK.md §7–8 and the engine README are canonical for
their APIs. Recorded here so §2–§5 are read with these in mind:

- **`GameConfig.terms?` + `useGameTerms()` (v0.2.0)** — per-game vocabulary
  (character/characters/side/patch/patches/source) rendered through every engine noun
  (nav, labels, placeholders, SEO strings, JSON-LD, 404 copy). 2XKO: champion/champions ·
  team · season/seasons · channel. Defaults preserve generic output byte-for-byte.
- **`GameConfig.characterRouteSegment?` (v0.2.0)** — the characters section's URL segment,
  remapped at build (`pages:extend`); links resolve via `useGameTerms().characterPath`.
  This is what preserved 2XKO's ~1,500 indexed `/champions/*` URLs — the §6 URL-parity
  gate caught the gap.
- **`Side.players?: string[]` (v0.2.0)** — a side that is a team of PEOPLE (duo queue,
  tournament sets; 321 live 2XKO videos). `player` stays primary; `sidePlayers()` is the
  single accessor across filter/search/options/pages/labels.
- **Game-defined filter facets + replay badge slots (v0.3.0)** — `provideGameFacets([...])`
  (URL param is the game's public contract — restored `fuse=` deep links with zero
  translation machinery) and the `GameSideBadge` / `GameReplayBadges` same-path overrides
  (per-side when attribution is known; unbound center strip when it isn't). This restored
  the 2XKO fuse surface as pure app-side code — §6's "fuses stay app-side" held.
- **Positioned stats anchors (v0.4.0)** — `GameStatsPanels` is invoked at
  `after-usage` / `beside-timeline` / `bottom`; overrides must branch on `position`.
  Restores per-game page composition without page-file duplication.
- **Git-layer gotcha (STACK §5.5 amended):** the extend entry MUST be
  `['github:…#tag', { install: true }]` — a bare string clones the layer with **no
  node_modules** and the engine's runtime deps fail to resolve.
- Pipeline pattern proven for §6/§9: the rich substrate (`videos.json`) stays the
  pipeline's format; a shared emitter derives the generic artifacts (identical stats math
  via one extracted module); `overrides.json` supports `exclude: true`; the refresh
  workflow commits substrate + generic artifacts atomically.
- **Theme contract correction (Phase 4 finding):** app theme files use plain
  **`:root { … }`**, never `@theme { … }` — the app stylesheet is outside the
  engine's Tailwind root compile, so a raw `@theme` ships to the browser and is
  silently dropped in production builds (dev compiles per-file and masks it).
  Unlayered `:root` custom properties beat the engine's `@layer theme` defaults
  in every build mode. The override gate is **both directions** on the BUILT
  output: presence → computed game primary; removal → computed umbrella teal.
  Canonicalized in engine v0.4.1 docs/tests; Tekken shipped `:root` from day one.
- **Routing decision (Phase 5): SUBPATH.** Root = selector, `/2xko` + `/tekken` via shell
  `vercel.json` external rewrites to the game projects' production aliases; 2XKO migrates
  off the apex with a permanent 301 map (path routes + query-conditional root rules for
  the legacy shared deep links). Base flips are env-driven (`NUXT_APP_BASE_URL`), the
  apex domain moves from the 2xko project to the shell, and only the root robots.txt /
  sitemap index count — the shell owns both. Host-based redirects on game projects are
  forbidden (rewrite-proxy loop).
- **Phase 5 findings (pre-cutover):** (1) *Env-only base flips don't work as designed* —
  each game's literal `app.baseURL: '/'` shadows the engine's env-reading expression in
  the layer merge, so `NUXT_APP_BASE_URL` alone flips the runtime router while prerender
  seeds stay root-based (total-404 build, reproduced). Pattern now: each game commits
  `baseURL: process.env.NUXT_APP_BASE_URL || '/<slug>/'` — the committed default IS
  production truth; env is the override. (2) *Engine v0.5.1 (required, "zero engine
  changes" prediction failed):* static-artifacts conflated filesystem space (nitro's
  static presets suffix `publicDir` with the base and write routes de-based beneath it)
  with URL space, and `prerender:route` strings are mixed-space — fixed by normalizing
  with `withoutBase()` before dedupe/exclusion and re-basing only `<loc>`s at emit;
  `404.html` goes to the static root. Root-base output byte-identical. (3) *Standing rule
  from three stale-gate incidents* (verify-override, verify-browser, verify-subpath):
  **when a phase adds a build surface, the base-path/theme gates must be extended in the
  same phase** — verify-subpath gains an artifacts-placement assertion as the recorded
  follow-up. Engine lineage: v0.4.1 (theme docs/tests) → v0.5.0 (rank-chip minor, shipped
  between audited phases) → v0.5.1 (subpath artifacts fix; the platform-wide cutover pin).
- **Phase 7 (planned): Street Fighter 6** — third game, Tekken-shaped
  (`charactersPerSide: 1`, rank ladder, no co-occurrence); expected engine changes
  zero. First game born into the subpath world: committed `baseURL '/sf6/'` default,
  no legacy 301s. New-vs-Tekken surface: the shell exists, so launch = game repo
  live-and-verified at its alias FIRST, then one shell commit (games.ts + two
  rewrites + gate extensions per the gate-growth rule) — zero broken window.
  Channels: @SF6HighLevelReplays, @TheFGCplace (game-mix recon required — likely
  multi-game), @streetfighterreplays41. Cron stagger: 07:17 UTC. Patch eras =
  "Years" (Y1 2023-06-02 fixed; Y2/Y3 dates verified at build). Theme: "UI Street"
  direction — safety-orange primary + Drive-paint green secondary on warm asphalt
  surfaces, collegiate-urban display face; tokens-only, `:root` contract.
- **Phase 7 (SF6) built & gated — launch pending:** engine pin now **v0.6.0**
  (v0.5.4 `heroFocus`, v0.5.5 `sourceGroups`, v0.6.0 `patchGroups` — shipped
  between audited sessions). SF6: 19,495 replays / 1,650 players / 30 characters
  (Yasmine behind a self-expiring UNRELEASED gate until 2026-08-03); Seasons
  S1–S4 with S4 pre-declared `confirmed: false`; `scripts/expiries.ts` drives
  three severities (roster script exit 1 · parse soft ACTION-REQUIRED riding the
  report.md commit-guard channel · workflow red after commit+push). Zero engine
  changes needed to function — but the payload-measurement mandate exposed **two
  live engine defects affecting all three games**: `useReplays()` re-fetches the
  whale once per consuming component (×5 ≈ 30 MB observed per browse load on
  SF6) → fix is an engine patch (memoize / getCachedData) + pin bumps; and
  `patchTokenParts()` renders parent era tokens unlabeled in the modal ("S3" vs
  the chip's "Season 3"). Shell: third card (ShellGame.video now optional),
  /sf6 rewrite pair, gates 68/68 app · 14/14 shell · 36/36 cutover, including
  the fixed per-slug `<loc>` sampler. Next after launch: engine fetch-dedupe
  patch + pins ×3, then Phase 6 (`summary.json` ×3 → selector counts light up).
- **The intermittent Vercel build failures (all three games) — root cause found:**
  nitro's prerender queue holds BOTH spellings of each payload route
  (base-prefixed `/2xko/<r>/_payload.json` and router-space `/<r>/_payload.json`);
  the losing twin 500s and kills the build (`/health`, `/not-found` observed).
  Pre-dates Phase 6 (deploy history shows identical failures interleaved with
  lucky greens); 2XKO at fc4cde0 is reproducibly red. Mixed-space class, third
  appearance — v0.5.1 fixed the artifacts module's VIEW of the queue, not the
  queue. **Precise cause (v0.6.2 diagnosis):** four producers across two URL
  spaces enqueue the same logical routes; the spelling that always failed is the
  crawler-harvested payload `<link>` carrying `?<buildId>` — and nitro's
  `canWriteToDisk` refuses any route containing `?`, so that render is discarded
  as `(skipped)`. It could only ever fail the build, never produce output: pure
  liability. Fix = **v0.6.2**, deterministic logical-route dedupe by taking over
  the prerender queue's `add` in `prerender:routes` (crawled links and
  `x-nitro-prerender` hints append to that Set from inside `generateRoute` with
  no hook of their own), plus the long-deferred verify-subpath
  artifacts-placement gate (`--artifacts <dir> [base]`); pins ×4.
  **Two corrections to earlier claims in this doc, both retracted:** (a) there
  were no ~1,000 orphan root-space payload *files* — router-space payloads
  landed correctly inside the base (`withoutBase` no-ops on a never-based route
  and `publicDir` is already base-suffixed); the real defect was the
  `.vercel/output/config.json` **overrides map**, where six router-space page
  twins clobbered correct entries with root-space serving paths; (b) an earlier
  network/giget rate-limit hypothesis was falsified by the build log. The race
  reproduces on Vercel (6 consecutive failures) but **never locally** (16 v0.6.1
  subpath builds, incl. 8 pinned to two cores, all green; nitro runs the
  prerenderer at `logLevel: 0` so the 500 body is never captured) — the fix
  rests on the structural argument plus 3× byte-identical-counter green runs.
  Watch item: under a subpath `config.json` grows 88 KB → 193 KB (base-prefixed
  payload routes now satisfy nitro's `fileName !== route` override condition);
  those entries are de-based and inert, as v0.6.1's 1,067 HTML overrides already
  were.
- **Patch granularity is a platform requirement, not a per-game choice** (added
  after SF6 shipped era-only while 2XKO and Tekken shipped nested patches). Every
  new game emits a **patch/era table with child granularity**: `Replay.patch`
  holds the fine-grained patch token, `GameConfig.patchGroups` nests those
  children under their eras, and the facet renders parent chips with child
  dropdowns (modal reads `S3 · 2.02` — **correction:** `patchTokenParts()`
  resolves *ids*, never a parent's `label`, so `Season 3 · 2.02` is NOT reachable
  from config; the Phase-7 modal-label defect is therefore **not** retired by
  child granularity, it changed shape and remains an open engine item, not a
  consumer's to work around). Era boundaries come
  from an explicit hardcoded table of **balance overhauls — never inferred from
  major version numbers** (SF6's `1.x` line spans two seasons and `2.00` lands
  mid-season). Era-only is a deliberate exception requiring a stated reason.
  **Root cause of the miss, and the fix:** the convention lived only as code in
  two repos, so a new-game prompt that said "read PLAN/STACK/README" could not
  inherit it — it is now written into all three engine docs and this checklist
  (README "Patch grouping (v0.6.0) — child granularity is expected" = the
  consumer contract; STACK §5 item 14 = the standing MUST, plus §13's consumer
  pattern; and this entry). **What folds into a parent row is vendor-specific:**
  Tekken folds hotfixes via an `includes` array because Bandai's tokens are
  `X.YY.ZZ` with `.ZZ` a hotfix segment; 2XKO lists them; **SF6 folds nothing**
  because Capcom's versions are one atomic field (`2.01` and `2.0111` are
  distinct versions, not a version plus a hotfix). Read the vendor's own version
  strings before reusing another game's fold rule, and **never invent a version
  to fill a sequence gap** — a synthesis recommending an invented `2.03` for
  Ingrid was caught and refused; Ingrid is `2.0301`.
  General rule this instantiates: *a convention that exists only in
  implementations will be missed by the next implementation; put it in the docs
  the phase prompts already require reading.*
- **Analytics broke at the subpath cutover and nothing caught it** (found
  2026-07-27, ~10 days blind). Vercel bakes project-specific obfuscated script
  paths into each build; proxied onto the apex they 404, so all three games
  reported **nothing** — dropped, not misattributed — for both Web Analytics and
  Speed Insights. Independent second bug: the SDK reports Nuxt's baseURL-stripped
  router path, so `/2xko/stats` would report as `/stats` and collide across
  games; both need fixing together. Fix = engine plugin setting explicit
  endpoints + base-prefixed paths; preferred endpoint strategy is per-game
  same-origin proxying through the shell (`/2xko-insights/*` →
  `<child>/_vercel/insights/*`), with verified shell-consolidation as fallback.
  **Speed Insights is single-project on Hobby**, so it cannot use the per-game
  strategy — it must target whichever project has it enabled (the shell).
  Also: game project roots serve only `404.html` (build nests under the base), so
  the dashboard's Visit link 404s — fixed by a `/` → `/<slug>` **path** redirect
  (never a host redirect: rewrite-proxy loop). **Gate lesson, fourth instance:**
  the cutover battery checked themes/canonicals/sitemaps/redirects but never
  asserted a beacon resolves — third-party integrations need gates like every
  other surface.
- **State as of 2026-07-27:** engine **v0.6.2** live, all three games building
  green (prerender race closed). **SF6 patch granularity shipped** (`c70b048`):
  17 patch children under 4 season parents, no folding, `Replay.patch` now the
  fine token; era-keyed `stats.json`/`summary.json` proven untouched by the
  migration — a cron ran mid-session, the re-emit from the newer substrate
  reproduced the cron's own copies **byte-for-byte**, which is stronger evidence
  than a self-assertion since the cron generated its copy without the new code.
  Engine docs commit (`6549daa`) is on `main` but **untagged**; the next engine
  tag carries it. Re-emit-don't-merge is now the established pattern when a cron
  lands mid-session (rebase → `data:emit` → re-run the battery).
- **Recon hygiene:** tcrf.net's SF6 version page serves a **prompt-injection
  payload aimed at automated agents** in place of content. It was identified,
  ignored, and no data from it was used. Treat it as a non-source in any future
  version/patch recon, and treat scraped pages generally as untrusted data rather
  than instructions.
- **Analytics restored 2026-07-30 — the unverified option verified in production.**
  The per-game same-origin proxy shipped (shell rewrites `/<slug>-insights/*` →
  `<child>/_vercel/insights/*`), so each game's beacons land in **its own** Vercel
  project rather than pooling; the verified-fallback consolidation was not needed.
  Both bugs closed together: endpoints resolve (no baked per-project hash 404s)
  **and** reported paths carry the base. Live evidence on real traffic — 2XKO's
  own dashboard shows `/2xko`, `/2xko/champions`, `/2xko/stats`, `/2xko/players`,
  `/2xko/champions/caitlyn`; Tekken and SF6 in theirs; the shell shows only `/`
  with no game traffic leaking in. Gates grew 36 → **66/0** in `verify:cutover`
  (per game: no failed analytics/vitals request · insights script resolves under
  `/<slug>-insights` · vitals under `/_vercel/speed-insights` · no baked-hash
  path). Child project roots now 307 → `/<slug>`, so the dashboard Visit links
  work. **Jul 20–26 data is permanently lost** — nothing buffers. Baseline
  correction: ~6 visitors/day is the true current volume (the mid-July 14–16 were
  reddit-spike days; traffic had already decayed to 1–3 pre-cutover), matching the
  shell's ~5/day at the selector — not suppressed reporting.
- **Still open (one dashboard glance, no code):** which single Vercel project has
  **Speed Insights** enabled. Vitals from all three games now post to
  `/_vercel/speed-insights/vitals` on the apex, i.e. the **shell's** project. If
  the shell owns it, game-page Core Web Vitals arrive for the first time; if a
  game project still owns it (the original 2XKO setup), those vitals are silently
  discarded — no worse than before, and the fix is either moving enablement to the
  shell (Hobby = one project at a time, so disable first) or adding a vitals
  rewrite pair mirroring the insights ones. Minor cleanup outstanding: an orphaned
  2XKO preview from the SSO experiment, and a synthetic `__proxy-verification`
  analytics row that will age out.
- **Game #4 planned: MARVEL Tōkon: Fighting Souls** (Arc System Works / Sony
  Interactive Entertainment / Marvel Games). **Launches 2026-08-06** (JP 08-07),
  PS5 + PC. Immediate step is a shell-only **inactive "Coming Soon" card** —
  separate `UPCOMING` array with a narrower type (no `url`/`sitemapUrl`/
  `summaryUrl`, so it structurally cannot reach the sitemap index or the ItemList
  JSON-LD, both of which must stay at 3), persistent badge rather than
  hover-only (no hover on touch), no launch date in the copy (it would go stale
  within days while "Coming Soon" stays true). Design direction for the eventual
  full skin, per user: the **orange from "FIGHTING" and blue from "SOULS"** in the
  official wordmark, sampled not invented, with the game's own **comic-book**
  register (halftone, ink outline, panel edges — the game bills itself as "a
  living tribute to comic books" and its UI uses comic paneling).
- **Tōkon is the first game to exercise `charactersPerSide: 4`** (4v4 tag team,
  20 launch characters in five themed teams, shared life bar, Year-1 pass of 4).
  The platform has only ever run 1 (Tekken, SF6) and 2 (2XKO duos), so the
  genericity claim is untested above 2. Known pressure points to check **before**
  writing that pipeline: browse cards rendering 8 character badges per replay;
  `characterUsage` ÷ `charactersPerSide` stats math at 4; and co-occurrence, which
  is combinatorially different — C(4,2) = 6 pairs per side versus 1 for a duo, so
  `pairingUsage`/synergy surfaces may need a genuine engine knob rather than
  absorbing it. Also: no replay corpus can exist until channels accumulate uploads
  post-launch, so the full build is weeks out at minimum — the coming-soon card is
  the correct interim state.
- **Source groups are also a platform convention** (surfaced 2026-07-30, another
  offscreen-work reveal): 2XKO and Tekken run an **Online / Tournament** split on
  the source facet via engine v0.5.5 `sourceGroups`, with tournament channels
  ingested as **one-time backfills** excluded from the daily cron, and duplicate
  matches across tournament channels resolved by a priority-ordered dedupe
  (2XKO's `scripts/replay-dupes.ts`). SF6 parity in flight: existing 3 daily
  channels → `Online`; one-time `Tournament` ingest of @CapcomFighters >
  @EvoEvents > @TheKingArena > @superfighters-jkm (that order = dedupe tiebreak).
  Known realities: EvoEvents is majority non-SF6 (big excluded counts are
  correct); tournament sides carry no ranks (coverage drops honestly); the
  critical gate is **cron-preservation** — a simulated daily run must prove the
  backfilled videos survive a fetch that never touches their channels. Like patch
  granularity, this convention lived only in sibling code; when it lands for SF6
  it should be written into the engine docs' new-game checklist the same way.
- **Tournament backfill recon corrections (2026-07-31) — three of this doc's
  premises were wrong:** (1) the one-time-backfill-excluded-from-cron mechanism
  exists in NO sibling — it was only ever a PLAN.md aspiration; Tekken's
  tournament channel is an ordinary daily channel and 2XKO's "Tournament" is a
  hand-authored `data/manual-videos.json`. All contributing channels become
  ordinary daily channels (first run = the backfill). (2) The field is
  `Replay.source`; `src` is only the URL param. (3) With `sourceGroups` set the
  engine renders ONLY group chips; child filtering is URL member-CSV
  (`?src=a,b,c`) — there is no parent token. **Recon yields:** KingArena
  2,088/2,333 parseable (the real prize; uploads daily; splits per-video
  Online/Tournament via a three-way title classifier, ambiguous → review queue);
  superfighters-jkm 92/190; CapcomFighters and EvoEvents 0 — but CapcomFighters'
  zero is suspected to be a **gate-ordering artifact** (match-shaped titles carry
  players+characters but no game marker, so is-SF6-by-title rejects them first;
  re-recon with description+date game gate on cached data). Evo's characters
  exist only in footage → documented not-tracked pending a **visual-extraction
  spike** (separate session; platform-wide). New surface: an SF6 **review queue +
  local UI** on the 2XKO precedent, two item kinds (source-classification,
  character-completion), pending items never reach `replays.json`. Dedupe: act on
  117 intra-Tournament self-re-uploads + 39 cross-group same-video collisions
  (Online incumbent survives); **~200 legacy tier-A clusters in the shipped
  Online corpus report-only** — a separate cleanup session with human eyeballing.
- **Tournament work as-landed (2026-07-31, commit 34d5f25, +3,128 replays):**
  SF6 19,586 → **22,714** (Online 20,839 / Tournament 1,875); players 1,653 →
  1,934; rank coverage 52.9% → 45.6% (honest nulls — tournament sides carry no
  ranks). **CapcomFighters hypothesis confirmed conclusively**: SF6 marker in
  description 1,025/1,025 vs title 0 — `sf6Signal` (description+date game gate)
  recovered 1,022 replays from the first-party CPT archive the title gate had
  zeroed. KingArena classifier: online 1,391 · event 733 · conflicts 38 (all
  adjudicated → tournament via the new review UI); landed as `kingArenaOnline`
  1,251 + `kingArenaTournament` 758 after dedupe. Dedupe: 156 dropped (109
  KingArena self-re-posts, 35 vs shipped Online — incumbent survived every time,
  5 cross-classifier, 2 Capcom, 5 other), **zero shipped records dropped**;
  legacy Online-only tier-A pairs firmed to **201**, report-only, regenerable
  via `npm run data:replay-dupes` (future cleanup session). **Integrity catch:**
  queue verdicts write to overrides, and override-protection briefly shielded a
  tournament newcomer from dedupe — fixed so only hand-authored `sides`
  overrides protect (replay-dupes.ts:87). Review UI's round-trip test caught a
  real h3 version-skew bug in `readBody` on day one. e2e now 118 assertions;
  positive controls ×3; quota ~1,880 units on the day, cron steady-state
  ~1,320/day of 10k. Engine changes zero, shell changes zero. Open follow-up:
  write the sourceGroups/tournament convention into the engine docs' new-game
  checklist (engine-repo edit, next engine session).
- **2026-08-03 expiry gates cleared (SF6, commit fe5bb3f)** — both fired on
  schedule and both were cleared by doing the work. **Yasmine** is the 31st
  character; accent **`#F49BDF` "eagle orchid"**, user-picked from four
  synthesized candidates after all three raw art anchors landed in crowded hue
  regions (contrast 8.91:1 on `--color-surface`, ≥8–12° hue separation from all
  30 existing accents — the tokens.css method applied rather than eyeballed);
  `UNRELEASED` now empty, roster floor raised to ≥31. **Season 4 confirmed**
  (`confirmed: true`) with its first child patch **2.0401**; 18 patches across
  4 eras, every era opening on its first child's date, dates re-verified against
  the wiki. e2e 119/119. **The cron collision was the proof:** today's 07:17 cron
  committed first, and its build — from source with the gates still unfired —
  showed exactly the coarseness the expiry note predicted (4 Season-4 replays
  stranded on the bare `S4` token, 30 characters, no `children` key). The rebase
  resolved five derived artifacts to the new side, then `data:emit` reproduced
  them byte-for-byte, proving the committed artifacts are what the source
  produces rather than a hand-merged approximation. **Next expiry only appears
  when Capcom pages the second Year-4 character and someone adds that row.**
- **Evo visual-extraction spike (in flight) + Evo as a cross-game channel (user
  directive):** end state is @EvoEvents tracked in ALL THREE game repos as child
  token `evoEvents` under each game's Tournament group — Evo 2026 (June 26–28,
  Las Vegas) ran SF6, Tekken 8, and 2XKO all mainline (2XKO's first mainline
  Evo), so every repo has content. Characters exist only in footage → the spike
  builds a deterministic extractor: yt-dlp 1-second segments at 4 timestamps,
  ffmpeg frames, per-game FIXED HUD crop configs, tesseract OCR fuzzy-matched
  against the existing roster alias tables, multi-frame voting, confidence
  gating. **Ground truth is hand-labeled in the review UI** (the
  character-completion queue becomes the labeling tool); acceptance bar = ≥95%
  precision on auto-accepted at a measured threshold, low-confidence routes to
  the human queue — the extractor is architecturally an *automated reviewer*
  writing the same resolution format. Hard stop at a decision gate after
  measurement; productionize-SF6 only on approval; Tekken/2XKO replication later
  (2XKO's crop config reads TWO nameplates per side — first real duo test).
  Honest notes: segment downloads sit outside YouTube ToS (user's call, stated
  plainly); GitHub-Actions IPs may be blocked for downloads → local-batch
  fallback is designed in; Evo volume is prestige-not-scale (dozens of match
  VODs per game per event; streams/compilations stay excluded).
- **Evo spike Part A checkpoint (2026-08-03):** corpus = 81 match-shaped SF6
  VODs / 910 min / 8 Evo events (a "Top \d+" compilation-marker bug that ate six
  real matches — round labels, not compilations — was caught and fixed).
  **Recon resolved the premise dispute in a third direction:** SF6's tournament
  mode prints CHARACTER names in the top corners (not the CFN nameplate),
  pixel-identical across Evo 2023→2026 → fixed crop viable. **Reader = OCR after
  all, NOT dHash** — decisive argument is open-set coverage: templates need a
  labeled example per class, so tail + future DLC characters would be
  permanently unreadable; OCR reads names it has never seen (tesseract.js WASM,
  --no-save; its native confidence is unusable — 0 on a correct read, 95 on a
  wrong one — so confidence = vote agreement + edit distance). 162/162 Evo
  handles matched existing players.json identities (the tournament backfill
  built the substrate that neutralizes the duplicate-player risk).
  **THE finding — mid-set character switches:** players counter-pick mid-VOD
  (MenaRD M.Bison→Blanka at the Evo 2026 reset; Leshar Ed→Elena→Ed), detected
  with sharp temporal boundaries and unanimous reads. This is a SCHEMA truth,
  not an extraction failure: `MatchVideo.sides` holds exactly one character per
  side, so a switch VOD is unrepresentable — by the harness (confidence forced
  to 0 → human) AND by the human's form. Grand finals (the sampled set) are
  maximally counter-pick-heavy; the corpus-wide switch rate is being measured
  and is the decision-gate's second number. Options staged for the gate:
  exclude switch VODs (loses precisely the marquee matches) · union-of-
  characters per side (engine already renders multi-badge sides; needs a
  set-vs-duo visual distinction — possible engine minor) · segment one VOD into
  per-game records (most truthful, biggest lift). Extraction running 6/81,
  ~100 s/video.
- **Evo spike A5 + gate decision (2026-08-03):** corpus run 81/81, zero
  failures, zero null reads, zero bot-checks across 729 downloads (~120 s +
  22 MB/video; 1.81 GB total, frames pruned). Confidence: 131/162 sides at 1.0;
  the 16 confidence-0 sides are exactly the switched ones (policy, not
  uncertainty — underlying reads unanimous at distance 0). **Switch rate
  19.8%** (16/81), which killed the exclude option. OCR-over-templates
  vindicated concretely: only 21/31 characters appear in the corpus — a third
  of the roster would have been permanently templateless. **Gate decision
  (user's call): union-of-characters per side** — `characters: string[]` 1..N
  ordered by first appearance; timeline of the switch deliberately out of
  scope. Expected engine changes ZERO (2XKO's duos already ship 2-char sides
  through the same contract — verify, and STOP if anything engine-side treats
  `charactersPerSide` as a hard cap). `charactersPerSide` stays 1 +
  co-occurrence off (describes the game format, not a record cap). Emit gate
  relaxes to 1..N, still hard-fails 0. Matchups cross-product per side
  (honest). Position-swap guard: simultaneous complementary "switches" =
  broadcast P1/P2 swap, normalize not union (zero instances so far). Sequencing:
  labeling form grows multi-character FIRST, then all 81 labeled, then the
  scorer — **the ≥95% accuracy gate still decides Part B.** Under the union
  design the forced-0 sides become high-confidence data, pushing auto-accept
  from 80% toward the mid-90s.
- **Union design verified against the engine (2026-08-03): STOP condition
  cleared with line-level evidence.** `Side.characters` is `string[]` always —
  the `length === charactersPerSide` invariant is a **comment, not code**; all
  12 `charactersPerSide` usages are UI-affordance booleans or soft divisors; no
  validator anywhere; rendering/filtering already map arrays. **Matchup
  cross-product needs zero SF6 code** — the engine's `.includes()` predicate
  does it natively. Three catches the revision added: (1) per-frame OCR reads
  were never persisted (`extracted.json` holds counts), so the union re-emit is
  a ~30-min re-OCR over cached frames — zero network — and reads persist from
  now on; (2) **≥2-frame bar for union membership**: 20 sides read a second
  character but only 16 clear two frames — the 4 one-frame extras (short game
  vs misread, indistinguishable at 9 samples) are excluded from the union AND
  forced below auto-accept for human confirmation — precision-first, visible
  not absorbed; (3) a second hidden hard gate at `emit.ts:254-256`
  (`usageTotal !== records.length * 2`) that would have failed the first union
  record — becomes the computed sum. Also retracted: the Explore pass's claim
  that overrides carry sides (0/193 do — no migration). Footnote for
  housekeeping: 2XKO's `characterUsage` dedupes across sides per video,
  contradicting the engine's own side-appearances doc — cross-repo stats
  semantics drift (mirror matches only); SF6 keeps its own semantics.
- **Labeling surface live (2026-08-03 evening):** form + POST verified on a real
  switched VOD round-trip (Leshar Ed→Elena→Ed → `["ed","elena"]` → snapshot →
  scorer). Correction to the entry above: **the accuracy gate needs no re-OCR**
  — `extracted.json` already persists per-character frame counts and scoring is
  order-insensitive, so the ≥2-frame union is derivable now; the ~30-min re-fold
  is Part-B presentational (first-appearance order) only. **Blind ground truth:**
  the session deleted its own round-trip test label because it had seen the
  extractor's answers — contaminated labels refused on principle. Two items
  deferred to the gate with data: the proper edit-distance confidence (Part B
  re-fold) and the 4 one-frame second-character sides, which the user's labels
  adjudicate as real short games vs misreads.
- **Evo accuracy gate MET (2026-08-03 night): 96.3% both-sides-exact (78/81) at
  FULL coverage** — per-side 98.1%, single-char 97.0%, multi-char 14/15 (93.3%).
  Threshold dial: 0.50 → 98.4% at 78% coverage (re-decide from the post-re-fold
  curve). Human labeled all 81; **found a shape the machine's sweep missed: one
  2v2 video, both sides counter-picked** (extractor's sweep had zero both-sides
  cases). All three disagreements diagnostic: (1) `6Y1z9cg0ohg` want bison got
  ryu at conf 1.00 — **Japanese-UI SF6 renders M. Bison's nameplate as VEGA**
  (the classic SF name-swap, previously a slug-table warning, now appearing in
  pixels); user added the `vega` alias in characters.json mid-labeling, session
  ran a full blast-radius investigation before parsing (150 "Vega" titles = SFV
  pre-launch date-gated + player "KINGS VEGA" in handle position → zero
  reclassification, artifacts byte-identical) — plus a scoring-confidence bug
  (coverage term dropped in unionOf: agreement measured over frames-that-read,
  so 2/9 reads scored 1.00); (2) `RnZ2Amz6l2c` — the ≥2-frame rule dropping a
  real one-frame character, routed to review at 0.43 (tradeoff working as
  designed); (3) `rEnoiMHeU3Q` got [zangief, blanka] vs label [zangief] — the
  extractor may be RIGHT (MenaRD, famously Blanka, read on ≥2 frames; suspected
  label miss → true accuracy would be 97.5%). Confidence isolated 2 of 3; the
  coverage fix would catch the third. Decision: re-fold (~30 min, zero network,
  vega alias + coverage term live, produces first-appearance order) with the
  human re-adjudicating rEnoiMHeU3Q AND the 2v2 video in parallel — final table
  = non-stale extractor vs adjudicated labels; Part B baselines on it.
- **Phase R design (pre-Part-B, 2026-08-04):** the re-fold got a better
  confidence model than specified — the old winner's-share term is *demonstrably
  wrong* for unions (a correct short-game `ed` at 2/7 reading frames would score
  0.29), replaced by **contiguity**: `member = min(1, run/2) × (1 − meanDist/3)`
  (longest consecutive sampled-frame run distinguishes a real game segment from
  a scattered misread), `coverage = min(1, read/4)` restored (catches the VEGA
  case), side = min over members × coverage. The 4 one-frame sides get a
  **targeted dense re-sample** (~20 extra frames each, ~80 one-second downloads)
  — measure instead of ruling — which also independently cross-checks the
  human's RnZ2Amz6l2c adjudication. **The 2v2 video IS RnZ2Amz6l2c** (same as
  disagreement #2), and the position-swap question is resolved by data: the two
  sides' sets are disjoint ({ed,deejay} vs {cammy,mai}) with zero crossover
  reads — a P1/P2 swap would show exactly that crossover; genuine double
  counter-pick, human confirms attribution. Operational trap caught: data:parse
  reset the queue to [] and the POST 404s absent ids, so queue-evo.ts must
  re-run before revised verdicts can save. Re-fold runs as a background job,
  not the batch subagent — that role exists to prevent concurrent-download
  throttling, and a cached-frame re-OCR has no downloads (the rule's reason
  honored over its letter). Part B still gated on explicit approval after R6's
  final table + threshold-from-the-new-curve.
- **Phase R final (2026-08-04): 79/81 = 97.5% both-sides-exact · per-side 98.8% ·
  multi-character 15/15 = 100% · zero characters missed vs labels** — both
  remaining errors are the extractor seeing MORE than the label, never less.
  Fourth fix found via the newly-persisted reads: **blank frames were breaking
  runs** ("· ed · ed · deejay…" — tournament VODs cut to crowd/replays/player
  cams constantly; a single blank between two Ed reads split them into runs of 1
  and dropped a real character). Fix: blanks are NEUTRAL — absence of evidence
  is not evidence of absence — runs measured over the subsequence that read
  something; recovered Fuudo's Ed→DeeJay (17th multi-char video). Confidence:
  150/162 at 1.00, none below 0.50. **Threshold locked 0.90** (the knee:
  excludes a known error at 2 review videos; below it nothing filters, above it
  5× burden for no gain) with the honest limit stated: no threshold rescues a
  confidently-wrong read — the alias table and review culture matter more.
  **Both remaining disagreements are set-boundary extras** (Ryu on the first two
  frames of 6Y1z9cg0ohg; Blanka on the last two of rEnoiMHeU3Q) — two competing
  explanations: real boundary-game pick vs **broadcast bleed** (VODs can open
  with the prior match's tail or close with the next match/highlight); only
  human eyes on the boundary footage settle it. If both confirm: 81/81. Cost
  honesty kept: re-fold 1 s/9.6 MB per video only because first acquisition
  (119.5 s/22.3 MB) was already paid.
- **Part B shipped and soaking (2026-08-05, 4 commits pushed): final baseline
  81/81 = 100%** — both boundary cases CONFIRMED as real picks (Shuto's opening
  Ryu → [ryu,bison]; MenaRD's closing Blanka → [zangief,blanka]), so every
  extractor error in the corpus was vocabulary (VEGA) or evidence-standard
  (≥2-frame, blank-breaking) — **it never fabricated a character**. Boundary-
  bleed guard deliberately NOT built (zero bleed instances; both extras real);
  the runbook line lives in the review UI where the reviewer works. **Second
  override-interaction near-miss caught:** every Evo record is a sides override,
  and the "hand-authored sides overrides protect from dedupe" rule would have
  made Evo silently win every duplicate pair, inverting declared channel
  precedence — corrected (extraction-origin overrides confer no priority; Evo
  sits below Capcom's first-party archive; user manually ruled the 2 tier-B
  pairs Evo-over-KingArena by id). Threshold 0.90 wired. **First unattended cron
  cycle clean on the widened schema:** 22,865 replays, evoEvents 81 (17
  multi-character), queue 0, malformed 0. Loose ends: cache/evo/ 754 MB
  purgeable frames + **cookies.txt (live Google session) sitting in a cache dir
  — move to gitignored secrets/ + EVO_COOKIES, 2XKO convention**. Session
  self-critique saved to memory: it initially offered three options that all
  routed around an app-side constraint that was cheap to move.
- **Part C (Tekken) plan audit (2026-08-06):** five brief premises corrected
  against the repo — Tekken has NO dedupe/PRIORITY (SF6-only), no
  idKey/bestSpelling (its `slug()` identity is weaker: "Arslan Ash"/"ArslanAsh"
  → two pages; match rate is a measured deliverable), no app/pages or server/
  at all (pure thin consumer — the /dev surface is from-scratch), no
  expiries.ts, and the union widening is REQUIRED (`character: string`
  singular). **Short-name bound re-derived from the roster with a distance
  table:** SF6's ≤2-exact rule is dead code (no Tekken alias under 3 chars) and
  the length-scaled budget is unsafe on 59/83 aliases — the worst collisions
  are at length 10 (jin kazama / jun kazama, OSA distance 1), where
  length-scaling grants budget 3. Replacement: per-alias **unique-decoding
  radius cap** `min(lengthScaled, floor((minCrossDist−1)/2))` → 21 exact-only /
  28 @1 / 14 @2 / 20 @3; jin/jun + lee/leo forced exact. Hazards: OCR whitelist
  has no digits (jack-8 resolves as bare "jack" only by luck — add 8); Devil
  Jin crop-truncation → JIN exact-hits the wrong character (recon must confirm
  full-plate capture). *(Back-port the radius cap to SF6 someday —
  housekeeping.)* **Third override/dedupe interaction catch:** SF6's dedupe
  keys PRIORITY and FOOTAGE_SOURCES on the SourceId; Evo sharing 'tournament'
  with bneEsports would (a) never fire channel-priority between them and (b)
  strip override protection from BNE's genuine hand corrections. Fix: key
  dedupe on intake `ChannelKey`; `MatchVideo` gains `intake` (substrate schema
  addition, flagged blast-radius widening). Conscious tradeoff: Evo reuses the
  'tournament' SourceId — no new public badge, Tekken's flat source model
  preserved. §0.1 honesty: cron skips commits on no-change days, so the commit
  trail UNDERCOUNTS green cycles — Actions tab required before §5. Also ported:
  2XKO's cookie preflight hardening (SF6 lacks it and silently degrades
  cookieless — SF6 back-port is housekeeping). Corpus: 67 Tekken Evo VODs.
  Plan self-checkpoints after Phase 1 recon before the download spend.
- **Part C Phases 0–1 (2026-08-06):** the recon checkpoint's ROI in one number —
  **SF6's crop ported verbatim reads 0/60 on Tekken**; the grid-searched
  measured box reads 48/60 (80%, misses = crowd shots, blank-neutral territory),
  every recon VOD reading exactly the right pair, layout stable across three
  events/skins/years. **JP localization: negative** (Evo Japan renders Latin
  script — no VEGA-class problem; checked, not assumed). Corpus: **62**
  match-shaped VODs / 708 min / 7 events. Title-gate corrections: **`\bT8\b`
  removed — on this channel T8 means Top 8** (23 of 26 bare-T8 titles are
  Super Turbo 2014 brackets; one post-2024 "T8 Quarters" would have put ST
  footage in a Tekken corpus); **T7 marker + date gate both load-bearing** (174
  T7-marked; 2 published post-T8-launch that the date alone would miss); 6 real
  Nov-2023 pre-release Showcase matches correctly excluded (incomplete roster).
  **§0.2 synthetic path test PASS (5/5) with a retroactive catch: all 81 SF6 Evo
  overrides are hand-authored — `resolvedBy: 'extractor'` had never run against
  committed data**; the precondition designed to replace calendar-waiting
  exercised a genuinely virgin production path. §0.1 needs the user's Actions
  tab before §5 (commit trail undercounts; no-change days skip commits).
  **Dedupe measurement: 0 actionable** — 19 shared player-pairs vs BNE's 223
  tournament records, 0 tier-A, 0 tier-B, 6 tier-C (Δ19–79 s; broadcast-vs-
  capture durations differ structurally) → decision: DEFER the full
  replay-dupes port; ship `intake: ChannelKey` + a persistent overlap
  measurement, port when it announces the first actionable pair (the
  label-grace-counter principle). LilyPichu-vs-Harada exhibition excluded
  (player pages are for bracket entrants; one-line reversible). SF6 cookie
  rider committed (bc4de33, staged): secrets/yt-cookies.txt, five preflight
  failure paths tested.
- **Part C Phases 2–3 (2026-08-06):** harness + queue + /dev surface built;
  corpus extracted **63/63, zero failures, zero null-read sides** (111/126 sides
  at 1.00; 4 shaky thin-read videos at 0.50). **Counter-pick unions 15.9%** —
  close to SF6's 19.8%; the union design generalizes cross-game. Cost within 3%
  of SF6's measured figure. **Blindness contamination self-caught:** extracting
  while building printed predictions for 19/63 videos into the session log the
  user has seen — owned unprompted, and *instrumented* rather than buried:
  accuracy.ts now scores blind (44) and exposed (19) populations separately,
  displays the gap, and states the rule (gap <5pp → full number stands; blind
  materially worse → the ≥95% gate is judged on the blind row). Ruling: accept
  two-population scoring, skip the fresh-corpus option — 44 blind is adequate
  gate resolution (~2.3pp per error) and the gap check corroborates. Same
  integrity class as Part A's deleted test label, better engineering: quantify
  the contamination instead of merely avoiding it.
- **Part C Phase 4 close (2026-08-06 night): Tekken corpus 63/63 = 100%**
  (126/126 per-side, 13/13 multi-character) after two user adjudications
  (Rangchu kuma+panda; Nobi steve+lars). **Blind/exposed gap 0.0pp** — the
  contamination worry was selection bias (summaries had named the hard cases);
  "the instrumentation earned its keep by disproving its own premise." Both
  games now close at 100% against adjudicated ground truth; never-fabricates
  holds cross-game. **THE finding — player attribution: Evo titles order
  players wrong 37.7% of the time on Tekken (23/61) and 12.8% on SF6 (10/78)**
  ("Punk vs Big Bird" with Big Bird on the left); HUD-handle attribution
  measures 61/61 = 100%. Enrollment on title-order attribution would have
  credited over a third of Tekken's Evo records to the wrong player. SF6's 81
  shipped records are safe (hand-authored against footage) but the defect is
  latent in `complete-characters.ts` — never run in production — so
  **handle-probe promotion now BLOCKS enrollment in both repos.** Title order
  is demoted from signal to at-best-flagged-hint; unreadable handle regions
  route to review, never silently fall back. **Amber disputed state shipped in
  all three review UIs** with a boolean-only wire (server computes the
  comparison, discards the machine's answer — the labeling surface stays
  blind; "the flag says look again, never say this"), perturbation-controlled;
  running it on SF6: **0 disputed across all 81** — the 81/81 corroborated from
  an independent direction. 2XKO's disputed flag + manual-entry swap ship dark
  (no data yet), disclosed. **62→63 deliberateness check open:** the blanket
  `\bshowcase\b` marker removal re-admitted one post-launch video (the six
  pre-release stay date-gated) — confirm LilyPichu/Harada is in or out ON
  PURPOSE before player pages mint. Remaining before §5: handle-probe
  promotion ×2 repos · AUTO_ACCEPT from Tekken's own curve · codify sub-0.60
  dense re-sample · the user's §0.1 Actions check (still outstanding).
- **Part C close-out plan approved (2026-08-07 ~03:00 UTC): §0.1 MET (3/3 green
  cycles), enrollment unblocked.** AUTO_ACCEPT = **0.90 in both repos by stated
  prudence, not by curve** — Tekken's curve came back degenerate (100% precision
  at every level; no knee exists), so no gate is justified by measured error and
  the plan says so plainly; one constant keeps the pipelines comparable.
  Side-resolution design: two-way choice (candidates known from title), wide
  HANDLE_REGIONS for org tags, best-window OSA, per-frame voting — and the
  load-bearing gate: **`ok` requires `side.decided`; an undecided side "is a
  coin-flip dressed as a verdict" and stays in the queue** (0 undecided measured
  across 61, gated anyway). Title order survives only as the queue item's
  provisional arrangement a human confirms. HANDLE_ALIASES promoted from spike
  to production (curated merges must run where records are built). Enrollment
  converts the 63 hand labels directly into shipped records via the record
  builder — the labeling session was data entry all along. Verification's
  decisive test: the end-to-end side-resolution check runs ON one of the 21
  title-reversed videos, where title-order pairing would be provably wrong.
  Tekken gains `gameSignal` as a per-channel opt-in (its four native channels
  never needed game markers). Feedback attached at approval: SF6's FULL e2e
  battery re-runs too — complete-characters.ts is in its production path.
- **Part C SHIPPED (2026-08-07 04:28 UTC) — @EvoEvents live in Tekken; 3 repos
  pushed (tekken 9 commits/4f32278, sf6 4/31149a7, 2xko 2/96a80a2).** Tekken
  14,686 replays (+63 Evo, 13 new, −1 deleted upstream). Side resolution in
  production in both repos with the `decided` gate; dense re-sample codified;
  AUTO_ACCEPT 0.90; Tekken battery 95/0. **The merge was the interesting part:**
  all three repos were 1 behind (cron had pushed); SF6/2XKO rebased clean
  (code-only), Tekken genuinely conflicted on five DERIVED files — resolved not
  by picking a side but by **merging code (zero conflicts there) and re-running
  `data:parse` to regenerate**, one resolution point instead of eight. Then the
  superset check found the result one record short: `PBnEwxiehtg` existed in the
  cron's data but in no `raw/*.json` — the upload was deleted from the channel
  between fetches. **raw/ is truth**, so the record goes with it and the next
  cron would drop it identically; arithmetic reconciled exactly. Full battery
  re-run on the merged tree before pushing (the merge changed data/). Standing
  lesson: derived-file conflicts are regenerated, never resolved by hand.
  Remaining Part C item: the 2XKO merge session (`charsPerSide: 2`) — and its
  two shipped-dark surfaces (manual-entry swap, disputed flag) still have no
  data to exercise them.
- **Part C finale prompt issued (2XKO Evo, 2026-08-07):** merge-not-copy into
  2XKO's native machinery (`fuses.ts` frame cache + cookies + review UI +
  original `replay-dupes.ts`). Four recon unknowns, none inheritable: where four
  champion identities live (partner may be portrait-only → the dHash+hue route
  returns, costume-hazard measured), broadcast framing (gates BOTH champion and
  fuse crops), the channel's 2XKO title-order defect rate, identity overlap
  (expect < SF6's 162/162; new bracket-entrant pages legitimate). **The
  pairing-stats trap is the session's deep question:** co-occurrence is ON only
  here, and a 3-champion union side under naive C(n,2) fabricates a never-played
  pair — default: unions count in characterUsage, are EXCLUDED from
  pairingUsage with a report count (fabrication poisons synergy silently;
  under-counting is recoverable); segment-aware true pairs derivable later from
  per-frame reads. **"VI" makes the radius cap load-bearing again** (two-letter
  champion). Fuse parity: Evo VODs run through existing fuses.ts on a SHARED
  cache; broadcast-degraded fuses stay null and route to fuse-review. First
  real exercise of the two dark surfaces is a deliverable. Enrollment gated on
  ≥2 green Tekken cycles (accumulating) + the already-passed synthetic tests.
  Small-n honesty: at ~20–40 VODs the gate is qualitative — zero fabrications,
  every miss explained, multi-champion subset exact.
- **2XKO Evo mid-session checkpoint (2026-08-07): Steps 0/1/2/4 landed; corpus
  21 VODs, extraction running background (resumable, flushes per video).**
  Step 0 was a live production fix nobody knew was needed: parse.ts silently
  discarded fuse detections AND fuse-review verdicts on hand-authored records
  on every run (A/B md5-proved). Also defused: 2 SHIPPED zero-champion records
  that a throwing emit gate would have broken the cron on — warn-and-count
  instead. **The VEGA-class hazard materialized as a SCRIPT change: Evo Japan
  renders champion nameplates in KATAKANA** — アーリ/アカリ (ahri/akali) sit at
  OSA distance 1 where Latin is 3, and Hikari played both on one side; the
  radius cap's third re-derivation is its most load-bearing. Reader: three real
  bugs fixed (framing estimated from HUD-less walk-on frames; right crop
  bleeding into portrait speckle; sharp's trim() silently no-op unless
  buffer-round-tripped after negate()); two events anchor plates 0.07
  frame-widths apart → column-ink-profile isolation replaced the bounding box;
  795 s → 23 s per video. **Honest limit: Latin nameplates defeat tesseract
  despite perfect legibility (AHRI → "V-V.JI")** — user chose to ship the
  split: katakana events auto-read, Latin routes to review (~half of 21 =
  ~10 hand completions; trivial at this scale). Documented escape hatch for
  later: ~20-champion roster + fixed nameplate font ⇒ auto-rendered font
  templates + dHash reads what OCR can't, extending automatically with DLC.
  Emit's computed-sum gate re-derived for 2XKO's OWN semantics — per-video
  deduped union, where the siblings' sum-of-side-lengths form gives 21,730 vs
  actual 19,563 and would throw on run one (the documented cross-repo
  usage-semantics divergence, now with exact numbers). The silent
  pairing-exclusion surfaced: 1 oversized side already in shipped data
  (zxRvkDeYL8w). Sequencing: extraction continues background → Step 5 (review
  surface — critical path for both Latin completion and blind labeling) →
  labels → score (small-n qualitative) → Step 3 (fuses over the completed
  shared cache) → Step 6 gated on the user's TEKKEN Actions check (≥2 green
  cycles; commit evidence undercounts; still outstanding).
- **2XKO Steps 5+3 (2026-08-07 evening):** review surface live — worklist keys
  on manual-videos.json, NOT extracted.json ("a video whose extraction failed
  outright is exactly the one a human most needs to see"); accept-proposal maps
  screen→title through leftIsFirst and REFUSES on an undecided side (the
  decided gate propagated into the UI affordance); disputed flag widened
  behaviour-identically; Latin videos skip the dense re-sample (font blindness
  isn't evidence scarcity). **Step 3's answer is "not yet," proven against
  pixels:** native fuse templates misread broadcast footage 3-of-4 (one
  confidently wrong) — **the Evo overlay REDRAWS the pill rather than scaling
  it** (struct 26–30 vs ceiling 30), same lesson as the champion crops. Two
  -evo templates cut and verified (train-equals-test, honestly flagged); **the
  runner refuses to write with 4 of 6 classes untemplated — "an absent class
  can't abstain; it gets absorbed by its nearest neighbour," fabrication not
  partial coverage.** Evo fuses ship null-with-refusal; templates cut
  opportunistically as future frames show the missing classes. `fuse-detect.ts`
  extracted from fuses.ts (1092→~830) with a --validate baseline and identical
  per-id score md5 after — provably behaviour-preserving, one implementation
  two callers. **Ruling on the surfaced judgment call: -evo templates stay
  opt-in** — the native 98.75% is a published property of a specific template
  configuration; widening it trades a fabrication-class regression on
  validated ground truth for promotions, and if ever taken it's a deliberate
  re-validation session with a new published figure, never a side effect.
- **2XKO close-out (2026-08-07 night): the small-n gate PASSES on its stated
  terms — zero fabrications across all 21, 100% precision at every threshold,
  no undecided sides, every miss an omission.** Split table: katakana 9/10
  both-sides (95% per-side) · Latin 4/11 (the designed abstention — font
  blindness routes to review, and the human completed those sides) · all 13/21.
  Totals honestly moved AGAINST the extractor when jEWF1k9zyPk became scorable
  (read only screen-left; multi-champion subset now 1/2). **Side resolution
  18/18 — after fixing the scorer itself:** the old attribution check required
  both sides exact, excluding every one-unread-side video — exactly where both
  reversals lived — so it reported "0 reversed" while the extractor had called
  two and been right about both. "A measurement that structurally can't observe
  the positive case isn't a measurement." Ground-truth title-order defect rate
  **2/18 = 11.1%** (SF6 12.8%, Tekken 37.7%) — third confirmation that sides
  are read, never assumed. A p≈8e-7 flag retracted in the README as a false
  positive against the wrong null. Pipeline end-to-end with labels: 31 manual
  records clean, 3 new players (myth/jakenbake/yohosie), **2 oversized sides
  now surfaced** (usage-counted, pairing-excluded — the gate doing its job on
  real data). Remaining: Step 6 on the Tekken Actions check; 4 untemplated Evo
  fuses self-resolve as future events show them. **Part C is one push from
  closed across all three games.**
- **PRODUCTION INCIDENT averted (2026-08-07 ~21:00): Pro Replays — 2XKO's
  largest source, 1,317 of 5,434 records (24%) — pivoted to "MARVEL TOKON Pro
  Replays" and UNLISTED its entire 2XKO catalogue.** Unlisted videos vanish
  from the uploads playlist, so the next cron's fetch would see 7 records where
  it saw 1,317 and data:build would commit a ~4,124-record catalog — and the
  stale-raw guard's own comment blesses the path ("fresh dumps missing ids are
  legitimate — that's how deleted videos get pruned"): right for deletions,
  wrong for a channel walking away. Caught ONLY because the Evo enrollment
  required the first real fetch in three days; the session stopped before any
  write, probed 5/5 unlisted videos (still resolve, titles intact), and paused
  with snapshots. **Response: workflow disabled in Actions (clock removed) →
  collapse guard** (per-channel, refuse on drop >10% AND >20 records, override
  flag, abort-before-write; positive control = the live incident itself) →
  **RETAIN-and-FREEZE decision** (records are real, videos still play at their
  URLs; frozen channel: fetch skips, parse carries committed records forward
  byte-stable, prune only by explicit override, frozen count surfaced in
  report.md) → guard ported to tekken + sf6 (class proven real) → Evo migration
  finishes calmly after, still gated on the Tekken cycle check. **Silver
  lining: the departing channel is Tōkon's first identified source channel**
  (UCdppkT52RXi-pGvyibNIXNw) — top of the game-4 candidate list.
- **Incident-response plan approved (auto, 2026-08-07 late):** four exceedances
  over the directive. (1) The guard's soundness proven, not assumed: **videos ≤
  raw always holds for a fetched channel**, so raw below committed count is
  always real loss, never churn (today's normal gaps: +18, +67). (2) **The
  count pin** — `frozen.records: 1317` hard-asserted every parse, because
  videos.json is both source AND target of the carry and a bad run would poison
  the next run's reference permanently; editing the pin is the explicit-prune
  mechanism, reviewable in a diff. (3) **Three naive-freeze breakages found in
  the code**: rawPaths statSync throw; the stale-raw guard's rawIds putting all
  1,317 carried ids in `missing` (firing the OTHER guard every run);
  buildManualRecords' collision check silently losing coverage — plus the
  lowReports desync (10 of 12 current lows ARE proReplays). (4) **Full merge
  over fuse-fill for carried records** — verbatim carry would recreate, for
  1,317 records, the review-page-writes-a-file-the-pipeline-ignores bug fixed
  hours earlier; curation must keep reaching frozen records, and verification
  tests exactly that property. e2e canaries NAMED in advance (fuse-coverage
  floor, Online group sum, the proReplays legacy deep-link). Sibling port =
  guard-only re-derivation (array CHANNELS, no adjacent guard, Tekken groups on
  `intake`). Tōkon seed preserved: raw/_tokon-sample.json, and its title
  grammar is the same ▰-delimited shape this repo already parses. Follow-up
  logged: fuse-gaps.ts buckets only zero-fuse records — 24 half-attributed
  proReplays records never reach review (pre-existing blind spot).
- **Incident CLOSED in code (2026-08-07 ~23:15, commit 147b681 staged):** guard
  positive-controlled on the live incident (fires at 99.5% drop / override
  proceeds / both healthy channels + synthetic small drops pass / synthetic
  −12.7% fires); freeze carries **1,317 / 0 missing / 0 content-changed**,
  catalogue 5,452 (5,434 + 18 real growth), e2e 32/32 incl. the named canaries;
  all three predicted breakages real and fixed; the curation-reaches-frozen
  property VERIFIED (a fuse verdict on a carried id lands next parse). **Commit
  hygiene:** the tree had guard+freeze entangled with the staged Evo migration
  → reset to HEAD and REPLAYED guard+freeze via an idempotent-by-anchor script
  so 147b681 is provably uncontaminated; Evo work restored on top, verified
  21/21 overrides + 15/15 katakana + 21/21 fuse verdicts. **Process error
  disclosed unprompted:** a mid-work `git checkout -- data/` was too broad and
  reverted the Evo migration + labels + katakana aliases — fully recovered
  because the snapshots existed (the labels-are-precious rule's third payout),
  with one refinement noted: data/characters.json wasn't in the snapshot
  (recovered only because deterministic) — snapshot scope must include EVERY
  touched data file. Remaining: user pushes 147b681 + re-enables workflow
  tonight; tomorrow one Actions visit covers BOTH checks (2XKO's 06:17 cron
  under the new guard = the incident's live close-out; Tekken cycle 2 at 06:47
  = the Evo gate) → Evo migration commits → **Part C closes** → sibling guard
  ports ride along.
- **Collapse timeline CORRECTED (2026-08-08): the damage predated the incident
  response by ~15 hours.** `c9312fc` ("data: refresh 2026-08-07 — 4130 videos")
  shipped at the Aug 7 06:17 cron — BEFORE the evening discovery session, whose
  "lands in ~5 hours" prediction was measured against a local tree one commit
  behind origin; the push rejection is what surfaced the truth. My prior
  reconstruction (a lost morning race, push-ordering fault) was wrong and is
  retracted — nobody raced; the race was over before anyone knew it existed.
  **Worse than a prune:** the collapse's 3 "surviving" proReplays records are
  MARVEL Tōkon matches parsed as 2XKO (shared ▰ grammar) — the cron replaced
  part of the archive with another game, live for ~24h. **The recovery merge is
  superset-verified against BOTH parents**: 0 records absent vs pre-collapse
  5,434; only the 3 Tōkon pollutants absent vs the collapsed 4,130. Result
  **5,454** = 1,317 carried + 1,730 highLevel + 2,376 bestReplays + 21
  evoEvents + 10 manual; battery 32/32 on the merged tree incl. ?ch=pro at 611.
  The freeze keeps the pollution out permanently (proReplays raw never read
  again). **Decision: check-then-push-all** — the ten-second Tekken cycle-2
  glance satisfies the Evo gate, then the whole stack pushes together
  (restoring 1,300 live records + de-polluting outranks rebuilding the merge
  to split Evo out); engine's 1-ahead docs commit rides along. **Part C closes
  with this push.** Silver lining #2: the pollution PROVES the ▰ grammar
  cross-parses — Tōkon's parser is nearly free, and game-marker gates are
  mandatory wherever that grammar appears.
- **2026-08-08: recovery on origin, NOT in production.** Git state healed
  (9e669ad recovery merge → 2c3ded0 first green cron, 5,454, guard pass-path
  observed live; sibling guards pushed: tekken 9a01ae3, sf6 1076b5b; Part C's
  Evo migration in the stack) — but the apex still serves the collapse-era
  4,130: the two post-recovery commits produced no successful deploy. Under
  investigation via Vercel CLI: failed builds (suspects: the Evo migration's
  /dev pages + server/api/dev routes vs the static generate; build resources) ·
  never-triggered (git integration) · or stale alias/cache. Meta-lesson, one
  layer up from the session's own "fetch before diagnosing" memory: its
  close-out claimed "back on the live site" from the push alone — **verifying a
  deploy means fetching the deployed thing.** Incident stays OPEN until
  production reads 5,454. The what's-next queue (Tōkon design session ready ·
  build gated on corpus · consolidated housekeeping batch) stands ready behind
  it.
- **Incident CLOSED for real (2026-08-08): production was healed at 00:57:43
  EDT — nine hours before my "hold the celebration."** The four-branch
  diagnosis found none of them: all deploys Ready, git integration live (4 s
  trigger latency), apex and deployment host byte-identical, live payload shows
  proReplays 1,317 + evoEvents 21, /dev surfaces 404 by two mechanisms. The
  user's 4,130 = a stale SPA tab (open tabs hold replays.json in memory
  forever); **mine = my own tool's cache serving back my earlier
  genuinely-correct-at-the-time fetch** — retracted, with the refined rule: a
  verification fetch must be CACHE-COLD (the session's replays.json probe was
  decisive precisely because nobody had ever fetched it). Real cost of the
  collapse: **21 hours live to visitors** — which surfaced the missing
  deploy-side control, now queued: a post-deploy smoke check asserting the
  SERVED record count (the collapse guard's downstream twin). **Part C closed +
  incident closed**: @EvoEvents in all three games, archive whole at 5,454,
  guards ×3 (2XKO observed both directions; sibling first unattended runs =
  the only watch item). Consolidated housekeeping prompt delivered
  (Parts A docs-codification / B gates-hygiene incl. the smoke check / C
  product polish incl. legacy-201 with user eyeballs; font-template and -evo
  re-validation explicitly deferred).
- **Housekeeping batch plan approved (2026-08-08): eight contradictions, the
  code won each time.** (1) **Legacy-201 is SF6, not 2XKO** — my prompt
  misattributed it; LEGACY_SOURCES = SF6's three pre-tournament channels; 2XKO's
  own report is tier-A 0. Scale: 201 pairs → 187 clusters → 196 drops if all
  approved (22,918 → 22,722, −0.86%). (2) No deploy step exists to smoke-check
  after — B1 becomes a poll-until-band-or-deadline against the apex, reusing
  the collapse guard's band so both gates agree on "collapse." (3) fuse-gaps
  blind spot is **56** records (24 proReplays + 32 highLevel), the summary
  currently overcounts attribution (5,398 vs true 5,360), and half-attributed
  gets its own `partial` bucket. (4) Radius-cap donor is Tekken (shared roster
  module + window-free matchRead; 2XKO's alias-length scaling is unsound
  without its windowing); SF6 effect honestly small (5/57 aliases). (5) The
  fuse predicate is NOT one line: **35.4% of the corpus is `fusesUnordered`**
  (CV couldn't attribute sides) — design: side-pin the 3,429 ordered, either-
  slot fallback for the 1,931 unordered, and the "Fuse · either team"
  label/note MUST change or it becomes a lie. (6) `dupeOf` is provenance
  commentary, not schema. (7) No knob needed for the tile — stats.vue already
  interpolates terms.side four lines below (**production shows "Top pairing"
  above "Top team pairings" today**); one-line fix, v0.6.4 as a PATCH. (8)
  Part A can't be strictly docs-only: README:122 + types/replay.ts:31 still
  assert the disproved length===charactersPerSide. Also raised, not fixed:
  2XKO's stats are internally inconsistent (playerCharacters undeduped vs
  characterUsage deduped) and the engine UI labels "appearances"
  unconditionally over 2XKO's deduped numbers incl. JSON-LD. B6's sharpened
  argument: freezing proReplays broke the "survived-refresh ⇒ still-listed"
  inference for exactly those 1,317 ids — the link-health script is the
  replacement signal.
- **Housekeeping Part A committed (a7fbebe, local — push held by user; no tag
  cut, consumers unaffected on v0.6.3):** 362/15 across README (+185, the
  six-section "Onboarding a new game" contract) / PLAN (+106, ten-step
  checklist, each step naming the failure it prevents) / STACK (+45, MUSTs
  15–18) / three type files (comment-only). Full battery green; the one
  format:check red (vercel-observability.client.ts, pre-existing) correctly
  deferred to B5. **Ninth code-win of the batch, found BY the act of writing
  the docs:** README + types/game.ts documented 2XKO's source term as
  'channel'; the shipped config says 'source', and git (93ee3ac) proves it was
  deliberate — the filter consolidated to Online/Tournament, which are groups,
  not channels. Docs corrected, config untouched. Precision-forcing
  documentation is itself an audit. a7fbebe must push before/with the v0.6.4
  tag in Part C (the VALIDATE_TAG flow handles the ordering naturally).
- **Housekeeping Part B complete (4 local commits: engine 7e4a8b6 +24/−413,
  2xko efbf902, sf6 2e4dca4, tekken 467f0d6; shell already clean).** Every new
  gate positive-controlled for real: B1 smoke check pass on attempt 1 (apex ==
  committed: 2XKO 5,475 · SF6 22,948 · Tekken 14,736) with a **mismatched-slug
  control printing "PRODUCTION IS SERVING A COLLAPSED ARCHIVE" at 76.1%** —
  i.e. the control reproduced the actual incident's signature; B2 radius cap
  proven by a **differential sweep of 9,488 single-edit perturbations: 0
  loosened, 0 rerouted, 222 tightened** (strictly-stricter, empirically, not
  argued); cookie preflight fails distinctly on all five hazards; B3 now
  buckets 115 (59 zero + 56 partial), 0 of the 56 reachable before; B4 removes
  413 lines with a README tombstone. **Two further code-wins:** the radius cap
  binds on **48/57 aliases, not 4** (the earlier estimate measured Tekken's
  more-generous ladder, not SF6's) — real work, not a special case, and the
  shipped corpus loses nothing; and B1 in SF6 had to be sequenced BEFORE "Flag
  due expiries", which is designed to go red and would otherwise prevent the
  smoke check from ever running. **B6's first run is a genuine finding: 4/150
  sampled frozen records (2.7%) are already gone** (oEmbed 403 + thumbnail 404,
  serially re-checked against a live control) → ~35 of the 1,317 extrapolated;
  retain-and-freeze holds at 97.3% alive but **the frozen archive is bleeding
  slowly** — the anticipated hard-delete scenario, now measured. Considered
  follow-ups (NOT scoped): periodic link-health cadence, and whether dead-link
  records should be marked in the UI rather than silently linking out.
- **Part C plan audited (2026-08-09) — approved, one addition required.** Five
  fresh code-wins: (1) **C1's stale-raw trap** — local raw/ is 6 days old and
  missing 101 committed records, so a bare `data:parse` would land 22,651
  (looking like a plausible cleanup) while silently reverting six days of
  intake, and **the collapse guard cannot catch it** (worst channel 0.94% vs
  the 10% threshold) → sequence must start with `data:fetch`; (2) tier A
  re-scanned read-only against today's data = **byte-identical 201 pairs**, so
  the stale report was still true (only tiers B/C drifted); (3) **C2's real
  blast radius is 611 records / 11.2%**, not 35.4% — side-pinning only changes
  an answer when the slots DIFFER and the record is ordered, and 2,818 of 3,429
  ordered records are same-fuse-both-slots; (4) the predicate **degrades
  exactly to today's behaviour with no character selected** (`[].every` is
  true), which is load-bearing for e2e (f1)/(f2) at 4,228/1,931; (5) `terms`
  already carries `state: FilterState` — **zero engine work for C2**, and the
  facet's docblock had pointed at it for three versions. Release stays
  **v0.6.4 patch** (no knob ⇒ no new contract surface). `commit-and-push.sh`
  can't be driven headlessly (bare `read -r -p`, EOF answers no) → invariants
  replicated by hand, ordering unchanged. **Required addition: run
  `verify:deployed` for 2XKO/SF6/Tekken BEFORE Step 0's pushes** to establish a
  known-good production baseline — the batch's own lesson is that git-green ≠
  production-green, and a pre-push baseline distinguishes "this release broke
  it" from "it was already broken."
- **Housekeeping batch COMPLETE (2026-08-10): all five repos pushed, engine
  v0.6.4 tagged, pins ×4, production verified (SF6 22,948 → 22,909, smoke check
  caught the deploy mid-flight then matched; pre-push baseline held for
  2XKO/Tekken).** But the finale rewrote its own premise — **the data won a
  tenth time, and biggest: of the 196 proposed dedupe drops, an MR-number probe
  (tesseract on the ranked-rating digits at MATCHED offsets) proved 118 were
  DIFFERENT matches** — same players, same characters, integer-equal durations,
  different games; legacy channels upload session compilations, so duration is
  NOT same-footage evidence there, and the side-sorting signature compounds it.
  Final: **54 drops, 26 unread clusters kept (safe direction), 141 legacy
  tier-A pairs still standing because they are REAL matches.** Consequence:
  the agreed gate-widening is DEAD — it would sit permanently red demanding
  deletion of genuine records; the promise to stop-rather-than-weaken was kept,
  and the guard moved into `--include-legacy` itself (prints the 118/196
  measurement before proposing). Controls: 11 drop-clusters re-probed → 10
  confirmed 0 contradicted; 50 keeps re-read → 50 held; the user's 5
  pre-extractor verdicts are the uncontaminated ground truth (cluster 001
  matched exactly; 4 more would sharpen calibration — optional). Confounded
  first MR result caught before reporting (offset-matched re-test). Defects
  found: module-scope main() in mr-probe; 3-digit MR passing as confident (MR
  is 4 digits at Master+); a 5 MB traineddata one `git add -A` from the repo;
  the single-offset method self-refuted. C2 live ((f1)/(f2) unchanged), C3
  live ("Top team pairing" agrees with its panel), C4 icons ×4
  positive-controlled. **Standing lesson: a dedupe signature is a HYPOTHESIS
  about footage identity — verify against pixels before deleting, per-channel.**
  Board after: Tōkon design (ready) · Tōkon build (corpus trigger) ·
  font-template session before the next Latin-broadcast event · -evo
  re-validation (only if wanted) · link-health cadence (2.7% bleed) · 4
  optional verdicts. Otherwise: EMPTY.
- **Phase 8 issued (2026-08-12): Tōkon design session DONE, repo created,
  build prompt delivered.** Design files → `design/handoff/tokens.css` (+
  review doc) with the pre-commit check: 21 semantic vars + 20 --char accents +
  3 --font families + the orange-collision resolution visible in comments.
  The prompt is deliberately thinner than SF6's: **the engine README's
  new-game contract + PLAN ten-step checklist ARE the spec, and Tōkon is their
  first consumer — reporting checklist gaps is a deliverable equal to the
  site.** Structure: Stage 0 corpus recon (enumerate the rebranded proReplays
  channel + scan for others; parse-rate vs the preserved ▰ sample) → GO/NO-GO
  checkpoint at ~75–100 parseable → Stage 1 corpus-independent (config with
  **charactersPerSide: 4, co-occurrence OFF at v1**, union conventions from
  day one, roster 20 + UNRELEASED gates for Year-1 pass, S1 single-child patch
  table, theme from handoff with Ō check, lone channel = no sourceGroups yet
  but full standard equipment incl. the **mandatory ▰ game-marker gate**, fresh
  cron slot 07:47, empty-corpus e2e mode; shell UNTOUCHED — Coming Soon
  stands) → Stage 2 pipeline + the one-commit shell flip (UPCOMING→GAMES,
  rewrites, insights proxy, ItemList/sitemap 3→4, coming-soon gates inverted,
  4-card grid) + SF6's proven launch sequence ending in verify:deployed.
- **Phase 8 amended (2026-08-12): the Tōkon character extractor joins the build
  as an explicit track.** Stage 0 gains the two role-deciding questions: do the
  ▰ titles already carry characters (all eight / point-only / none ⇒ extractor
  is verification / bench-completion / primary), and where do EIGHT identities
  live in the footage (point-nameplate text vs portrait-only bench vs the
  VS-screen showing all eight — crops never transfer, 0/60 ×3). The track
  builds per the codified conventions with Tōkon re-derivations: the radius cap
  computed AFTER normalization is fixed (MS. MARVEL / DOCTOR DOOM / SPIDER-MAN
  make whitelist-vs-alias-key agreement on spaces/periods/hyphens load-bearing);
  per-slot readers decided by pixels (OCR for text slots, dHash+hue for
  portrait slots with the recolor hazard measured); **the font-template escape
  hatch is the planned contingency** — the comic display face is a prime
  OCR-defeat candidate, and this may be the hatch's first implementation;
  decided-gate side attribution with the channel's own title-order defect rate
  measured; 4v4 union semantics (>4 = mid-set team change, usage-counted,
  pairing-excluded); blind ground truth via the Stage-1 review UI; per-game
  threshold from its own curve.
- **Phase 8 Stage 0 (2026-08-12): GO — 105 parseable across FIVE ▰-grammar
  channels (~14/day, ~420/mo projected), floor 75–100 cleared.** The named
  channel is the *smallest* real contributor (13); search recon found Hadouken
  Replays 34 · Tokon Replays Hub 28 · Tokon High Level 24 · Fighting Station X
  6-of-445 (439 CPU/shorts correctly rejected — the gates working in recon).
  **Extraction role: bench-completion, three-tier** — titles carry 1–2 of 4;
  descriptions carry the full bench on 31/105 (30%) ⇒ a description parser is
  a NEW pipeline stage (checklist gap); footage completes the rest; per-side
  provenance recorded. Four contradictions: (1) **Champion is a hidden 21st
  fighter** (Episode ch.11 unlock, playable online, 7th most-used, 15 matches)
  — handoff has 20 tokens; resolution: derive provisionally via the handoff's
  own 4-step method, flagged, with a one-token Claude Design micro-session
  owed; (2) **no vendor version string** — date-titled patches (two shipped in
  four days: 08-06, 08-10) ⇒ S1 with date-keyed children, the fold rule is a
  date; (3) **`charactersPerSide` typed `1|2|3`** — Tōkon's 4 won't typecheck;
  STOP honored ⇒ widen to `1|2|3|4` (closed set, not `number`) as **engine
  v0.7.0** (new permitted value = minor), verify the 12 usages + badge render
  at 4; (4) **the ten-step checklist was clobbered** — a7fbebe wrote it,
  0fe4f34 ("Updated PLAN.md to current latest", the hand-sync) silently
  removed it while README:216 still points at it; recovered from
  d7dca0a:PLAN.md:1542–1636. Fix: MERGE it back + guard comment, consider its
  own file — **the hand-sync process needs merge discipline, not
  replace-wholesale; this doc is the thing being synced, so the lesson lands
  on our process.**
- **Phase 8 plan audited (2026-08-12) — approved, auto.** The standouts: (1)
  **the paren insight collapses three title grammars into one parser** —
  characters are always inside the parentheses, the handle is the remainder, so
  slot order is never chosen, only recorded as telemetry; (2) **the hyphen
  hazard**: 2XKO's `CHAR_SEP` split would SHRED Spider-Man/Star-Lord/Ms. Marvel
  — porting it verbatim = data corruption; span extraction via
  buildAliasMatcher treats separators as gaps, with a residue gate so unknown
  fighters surface with literal text; (3) **two queues, deliberately** —
  review-queue (unresolved, never reaches replays.json) vs bench-queue
  (incomplete-but-CONSISTENT: a 2-of-4 side is true partial data the engine
  blesses under 1..N, publishable, completed by footage over time); (4) **NFC
  normalization on the game marker** — Ō arrives precomposed AND decomposed,
  TŌKON/TOKON/Tokon all appear, decomposed-only matches counted so new
  spellings surface; the gate is the ▰ incident in reverse (proReplays' 1,317
  2XKO titles would parse cleanly as Tōkon); (5) **the collapse guard is
  provably INERT on a young corpus** (>20 AND >10% can't fire under 20
  records; 4 of 5 channels are under 35) — honest checklist amendment: the
  guard sleeps until ~200/channel, verify:deployed + the freeze pin are the
  live protection meanwhile; the guard also compares **parsed-vs-committed**
  for Tōkon since fightingStationX is 6/445. Also: PLAN.md:213 is the
  **eleventh** stale `length === charactersPerSide` instance (code wins);
  engine debt pinned not fixed (the two saturated-side divisors under-count
  partial unions — deferred with a Node-side e2e recompute); Champion
  provisional derived transparently (#EC51C9, 313.5° center of the widest free
  window, 5.65:1) with phoenix-cyclops pre-loaded into expiries; the shell
  accent reconcile caught in planning (#00a6ff vs #03A5FE — theme wins);
  push-branch-BEFORE-tag; sf6's stale README pin line fixed in its bump.
  **Decision 11 note:** sourcing official character art reverses the design
  brief's footer claim — matches the three siblings' convention (portraits
  under the fan disclaimer), and Gap 7 reconciles the copy before it ships.
- **Phase A + Stage 1 complete (2026-08-13): engine v0.7.0 local (b3176b2),
  Tōkon Stage 1 committed (c2649ce, 34 files), Phase C underway.** The widening
  is provably inert (all four consumers typecheck clean; 5 fails / 4 passes;
  badge gate fails at 9, passes at 8) — and the new gate's first catch is the
  platform's own dormant code: **BrowseCard's `n >= 4` branch shipped four
  minor versions unexercised** (now measured: 8 badges, VS 0.00 px off centre,
  no 375 px overflow). Checklist restored by merge with the first consumer's
  amendments as a separate dated subsection. **Empty-corpus proof passes**: 56
  routes from zero replays, /tokon/health reads 4, `--color-primary` computes
  #03a5fe in the built bundle, Bangers ships latin-ext (Ō covered), all 21
  fighter routes prerender. Honest self-correction: the plan's "magenta is the
  widest free window" was wrong (green-goblin→hulk is wider at 52.3°); magenta
  stands on canonical-anchor grounds and the token says so. **Two open items:**
  (1) engine push + v0.7.0 tag are the user's (push main FIRST, then tag —
  unpushed tags break consumer installs); sibling pin bumps stage after. (2)
  **Character art has no first-party manifest** (marvel.com 403s, PS page
  text-only, Steam game-level only; per-character JPEGs exist on PS-Blog
  flickr but = hand-curated third-party mapping). **Steer: generated
  comic-register placeholder tiles** (accent ground + halftone + Bangers
  name/initial, scripted from tokens.css — DLC-automatic, brief-consistent so
  the Gap-7 footer claim stays true, kills the CDN fragility, and restores
  characters.ts to FAIL-LOUD once tiles exist); official-art curation recorded
  as optional later polish (paths already typed — slots in with no code
  change).
- **Art decision superseded (2026-08-13): the Marvel Database wiki IS the
  manifest.** `Category:MARVEL_Tōkon:_Fighting_Souls/Images` uses two
  machine-consistent filename grammars — posters keyed by fighter name
  ("...Wolverine poster.jpg"), renders keyed by **comics identity +
  Earth-358 + 001/002** ("Max Eisenhardt (Earth-358) ... character render
  001.png") — the user's "two renders" literally. Bridge = a 21-entry
  roster-id→comics-identity map, hand-authored once, committed as data.
  Method: MediaWiki API (direct page fetch 402s for bots; api.php +
  static.wikia originals are the route, plain UA; if blocked, user saves
  pages and the script parses local HTML). Slots per the user: **poster →
  imgSplash** (fighter screen), **wider-aspect render → imgPortrait**
  (measured, recorded, SF6-style crop if the slot wants 3:4). webp + per-file
  provenance (source file page, dimensions, pick reason). **Synthesis with
  the placeholder steer: scraped art primary, generated comic-register tile
  as per-fighter FALLBACK, then characters.ts returns to FAIL-LOUD** — every
  fighter resolves via scrape or explicit placeholder, no silent gaps.
  Coverage report must call out Champion (hidden fighter — wiki documents
  spoilers, likely covered) and DLC (re-run the scraper; phoenix-cyclops art
  will appear at announcement). Gap-7 footer copy reconciles to the
  art-ships direction (decision 11 restored). Engine push + v0.7.0 tag
  remain the user's outstanding two commands.
- **Phase 8 revision audited (2026-08-13 evening): v0.7.0 pushed+tagged;
  Phase C written; art pipeline designed from live API measurements.** The
  recon block already earned its keep on the real fetch: a FOURTH title
  grammar (replaysHub, ▰ suffix-only) and the shared-grammar hazard at scale
  (hadoukenReplays: 729 uploads, 533 ▰-shaped across many games, ~36 Tōkon —
  the marker gate guards a real 500-video pollution). Second mid-build
  defect: app.config points ogImage at a nonexistent file — every shared
  link 404s today → og.ts ships this phase. **Art, measured (api.php, plain
  UA, 200 OK, 110 files):** 20 fighter posters uniform 1018×1440 (0.707,
  none for Champion) · 41 renders 3174×3858–3697×4974 (0.74–0.82, 001/002
  per subject) · filenames MUST be enumerated never constructed ("MARVEL
  Tōkon" vs typo'd "MARVEl Tokon" splits 41/27; "character render 001" vs
  bare "001") · the 21-entry bridge map written in full (champion ← Tryco
  Slatterus; **phoenix-cyclops ← Scott Summers art already exists** — DLC =
  re-run) · ~24 non-fighter subjects excluded by allow-list construction.
  **The slotting INVERTED from the user's directive on the measurements:**
  the "wider render" premise is false — both families are tall — and the
  engine's slots decide: poster (uniform, ≈3:4) → imgPortrait so the roster
  grid crops as one set; the 3–5 MP render → imgSplash because the hero's
  ≈4.2:1 crop destroys a 1018-wide source. Champion: render fills portrait,
  tile on failure; imgSplash emitted only when the file exists (the hero
  <img> has no @error handler). **sharp CANNOT set Bangers — proven:
  librsvg silently ignores @font-face and fontfile:, producing
  byte-identical DejaVu output with no error** → tiles render in headless
  Chrome (the shell's card-art-tokon.mjs precedent + inline woff2 data-URI),
  spawning checklist gap 5d (assert the typeface actually rendered) and gap
  11 (art provenance is data: source page, dimensions, pick reason per
  file). FAIL-LOUD restores once all 21 resolve.
- **Phase 8 pipeline + art landed (2026-08-13 night):** v0.7.0's remote tag
  proven the way that matters — Tōkon's committed pin resolves from GitHub with
  `ENGINE_PATH` unset and builds byte-equivalent to the local-engine build (the
  Vercel path tested, not assumed). Four sibling pin bumps committed locally,
  each verified against the real tag (clean install + generate + own suite: sf6
  121 · tekken 95 · 2xko 32 · shell 47/0); production was AHEAD of local
  checkouts → fast-forwarded before touching anything. **Art 21/21 from the wiki
  manifest, Champion included** (Tryco Slatterus; transparent cutout composited
  over his accent ground so he reads as part of the poster set). The
  largest-render-by-pixel-count refinement paid twice: doctor-doom's 001 is
  577×628 against a 4201×4372 sibling (~50× pixels), and Champion's 001 is a
  1200×675 landscape banner that would have looked wrong in a 3:4 tile.
  **A FIFTH grammar surfaced from the review queue — and it was wrong data, not
  a gap:** Fighting Station X writes characters and handles in separate ▰
  segments, satisfying the paren parser's SHAPE while producing records whose
  player handles were fighter names (one acceptance would have minted a player
  page called "Star Lord"). Fix recovered 26 real matches (127→153) and emptied
  26 false review entries; new invariant asserts the player registry shares no
  name with the roster. **Two of its own controls were wrong before they were
  right, both caught by inspecting ARTIFACTS rather than exit codes:** the
  collapse control truncated the newest fifth of a raw dump (which retains every
  post-launch upload) so the guard stayed correctly silent while the control
  reported ✓; and the emit controls call `emitGeneric`, which writes to `data/`
  — a snapshot scoped only around the later parse controls let a run replace the
  committed 153-record archive with one synthetic record and then faithfully
  preserve the damage (checklist step 9, learned from the inside; snapshot now
  wraps everything). Also caught: **the OG card shipped its wordmark in a serif
  fallback while passing its own font guard** — `document.fonts.check()` returns
  true for a family whose unicode-range doesn't cover the text, and total-width
  comparison also passes because a half-loaded family draws a mixed string;
  three attempts to write a guard that fails correctly. 8-badge card verified at
  real density: 38 records, VS 0.00 px off centre at 1440, no 375 px overflow.
  Remaining: e2e.ts · expiries.ts · verify-deployed.ts · cron + README → then
  extraction (frame recon first) → launch.
- **PHASE 8 COMPLETE (2026-08-14): MARVEL Tōkon live at replaydatabase.com/tokon
  — four games on the platform.** verify:cutover 84/0 at the apex including the
  full Tōkon proxy leg (insights under /tokon-insights to its OWN project,
  #03a5fe through the rewrite, apex canonical, fighter pages rendering);
  verify:deployed green ×4 (Tōkon 153→**163** after the first cron, SF6 22,965,
  Tekken 14,799, 2XKO 5,517) — the flip disturbed nothing. **The first cron was
  a REAL run, not a no-op**: 1m41s, ten new matches across all five channels,
  every channel's parse rate held or improved, clean report (no residue, no
  ACTION REQUIRED), bench queue grew to **123 sides — the extractor's worklist,
  the honest measure of known-unknowns growing with the archive.** Two lessons
  the session marked as worth more than the site: (1) **the checklist was
  deleted TWICE** — the second time taking the guard comment warning against
  exactly that — resolved structurally: it now lives in NEW-GAME-CHECKLIST.md
  where a document sync cannot reach it; (2) three defects were visible only in
  artifacts, never exit codes (fighter-names-as-handles, the serif social card,
  the collapse control passing for the wrong reason) — "open the file, look at
  the picture" is the transferable habit. Ecosystem: dataminers list five
  possible future DLC fighters (the wiki-manifest + expiries pattern absorbs
  them when real); @TokonReplays et al. keep uploading. Champion's design token
  still owed. **Next: the extraction track's crop sweep** — with the new
  five-channel variance question (five uploader pipelines, not one broadcast:
  framing, resolution, and UI LANGUAGE may differ per channel — JP-client
  captures would render katakana nameplates, the 2XKO split precedent ready).
- **Crop-sweep plan audited (2026-08-14) — approved with two scope refinements.**
  Opens by correcting its own recon ("framing is stable" was one VOD per channel
  by eye — per-source until measured). **Best original find: highLevelReplays
  contributes ZERO bench-queue records** (prose descriptions complete every
  side) ⇒ **33 records / 66 sides of pixel-independent ground truth existing
  today**, honest about limits (shares description-parser error; can't validate
  side attribution), reserved for SCORING never tuning. The recon's key
  discovery embedded: **the point nameplate is text and CYCLES as players tag**
  — naming every fighter who enters — so temporal union substitutes for spatial
  completeness, and portraits are only needed for a fighter who never enters.
  Sharp tooling insight: hud-frames caps at 720p, so resolution variance
  survives as PROVENANCE (downscale-from-1080 sharper than native-720),
  showing in OCR confidence not geometry. Handle language ≠ UI language
  (シルクちゃん over Latin plates — measured separately). Read rate scored over
  HUD-bearing frames only ("reading a nameplate on a frame with no HUD is a
  category error, not a miss"). Tesseract trigger pre-agreed; hard STOP at the
  per-channel table. **Feedback attached:** (1) record where round 1 begins —
  if t≈0, pre-match screens were TRIMMED, and the bench-surface conclusion must
  say "not present in these uploads," never "does not exist"; (2) report
  distinct-fighters-seen-per-side — it bounds how often the never-enters case
  occurs, which is the data that sizes whether the portrait tier is needed at
  all.
- **Crop sweep complete (2026-08-14): one box serves all five channels** (band
  spread 0.006/0.001 ≈4px at 720p, right anchor ~19px, nobody letterboxes; the
  1080p channel differs in sharpness not geometry). UI Latin on all ten —
  katakana path not needed (handle language ≠ UI language, as separated). Bench
  surface claim correctly scoped per refinement 1: round 1 at t≤2s on 9/10 —
  uploaders TRIM pre-match screens; "no text list of all eight in these
  uploads" is about the channels' editing, not the game. **Refinement 2 was
  load-bearing: distinct plates per side median 4.0** (17/20 ≥3, 11/20 ≥4) —
  tag-cycling exposes most of a team through the nameplate alone; the
  never-enters portrait tail is ~3 sides in 20. **Tesseract READS the face: 65%
  on HUD-bearing plates (39% exact + 26% ≤2 edits, 0% blank, 80 plates) — no
  font-template hatch.** THE NEAR-MISS: the probe's first run printed "OCR
  CANNOT READ THIS FACE" at 38% — it had sampled K.O. cards and ROUND banners,
  scoring the sampler not the reader; **the plan's own pre-agreed
  HUD-bearing-frames criterion caught its own probe's false verdict** (two more
  measurement bugs died by artifact-inspection: the row detector latching the
  handle row on short names like LOKI masquerading as framing variance; the
  plate hash on raw greyscale tracking live background → ~25 "plates" for a
  five-fighter side). Caveat owned: the left ink-start spread is detector
  contamination from bench portraits — left plate needs a fixed anchor.
  **Reader decisions: OCR primary; the fold re-derived for CYCLING (the
  contiguity prior inverts — a real tag-in can be one sampled frame);
  side-mapping anchored on the title-known fighter's plate appearances
  (decided-gate on conflict); portrait tier DEFERRED with a written trigger;
  score against the 66 free ground-truth sides FIRST, then a small blind
  sample.**
- **Reader plan audited (2026-08-14) — approved with both departures accepted.**
  Three corrections first, one of which retracts a number I called load-bearing:
  (1) **the distinct-plate hash compared as Number** — `BigInt(parseInt(h,36))`
  truncates past 53 bits, destroyed low bits make hashes look CLOSER, distinct
  plates UNDER-counted — and the poisoned "median 4.0" landed exactly on the
  4-fighter prior ("precisely the coincidence to distrust"); (2) those counts
  came from BURST frames (76–91% of HUD frames within 3s of another) — recon
  density doesn't transfer to production sampling; distinct-plates-at-production
  is UNMEASURED and decision #4's "~15% tail" pre-sizing is withdrawn (trigger
  stands, queue supplies the number); (3) ground truth is 80 sides not 66 (+14
  proReplays from a second channel, scored separately) and CAN validate side
  attribution after all (benches differ in every record, mean 1.20 shared).
  **The sibling fold is demolished by arithmetic**: min(1,frames/2) dead behind
  its own gate; mean-distance converges to a constant not 1 (more evidence makes
  a wrong-ish number more certain); min-over-4 structurally rewards
  under-reading at fixed threshold; the dropped-penalty fires hardest on
  near-complete sides; coverage inert exactly on complete unions. Re-derivation:
  **noisy-OR member scores (monotone in evidence), min kept and now
  well-behaved, Good–Turing saturation** (1 − f1/legible) for have-I-seen-enough,
  completeness a separate field, run computed at ZERO weight; q(d)/MEMBER_MIN
  fitted on ground truth never asserted. **Reader-only alias set** (the HUD
  prints 21 canonical strings; the parser's 54 prose keys would gift the cap
  cheap cross-transitions) → minCrossDist=4, caps 1×8/2×7/3×5/4×1.
  **The sampler is what finds the 4th fighter**: 12×6s windows @1fps = 72
  frames for the same request count as 12 singletons; band-cropped cache
  (~500MB). **Attribution costs zero extra OCR** (side votes from reads already
  taken; titleOk as a free per-record positive control; auto-accept = non-empty
  ∧ conf ∧ decided ∧ titleOk). Feedback attached: within-burst reads are
  CORRELATED — include the same-misread-twice-in-one-burst phantom in the
  unit sequences, and if fitting shows it clearing MEMBER_MIN, count
  membership evidence per distinct BURST. Checklist amendments 1–4 earned
  (fold re-derivation mandatory; recon density ≠ production density; a hash
  compared as Number is not a hash; reader aliases ≠ parser aliases).
- **Reader steps 1–5 committed (2026-08-15 morning); 41-video ground-truth run
  in progress.** The anchor caveat vindicated with a control (symmetric left
  anchor +15pp exact, right plate byte-identical at 0.0pp drift — the harness
  didn't move, the anchor did) — but the bigger win came from persisted reads
  making failures READABLE: "JLOKI", "WOLVERINEN", "- BLADE" — right name, HUD
  furniture glued to the ends; bounded end-trimming took the corpus 60%→87%
  resolved and dissolved an apparent per-channel geometry failure (hadouken
  left 17%→90%). "One box serves all five" survives; "clean crop ⇒ clean
  whole-string read" did not. Two further corrections owed and paid: the
  parseInt hash bug was real but small (burst median stays 4.0) — **the density
  correction is the substantive one: spread-density median is 3.0, ≥4 falls to
  8/20**; and the "Plan agent transposed the distribution" accusation retracted
  — two different quantities (radius 8/5/7/1 vs effective cap 8/7/5/1), both
  correct, now both documented. **The correlated-phantom feedback became a
  theorem: BURST_INDEP cannot be 1** — at full independence the correlated
  phantom and the genuine cross-burst repeat are the SAME EXPRESSION, so no
  constants separate them; at 0.5 they split by 0.13 around the gate; four
  structural constraints tie Q0/DECAY/MEMBER_MIN, 21/21 hand-built cases.
  Smoke (2 videos): precision 100%, attribution margins 58–65, titleOk clean —
  **recall 50%, with the point-vs-assist hypothesis raised: descriptions
  describe TEAMS, nameplates describe who took POINT** — an assist-only fighter
  may never appear on the plate at any sampling rate. If the 82-side run
  confirms a semantic recall ceiling, the portrait tier reframes from
  tail-optimization to the only automated route to true team completion (bench
  portraits show all four regardless of point time) — still gated on the
  written trigger. Incidental checklist amendment: assertRawIsFresh keys on
  mtime and the control suite's restoreAll() launders the staleness it should
  surface. VideoOverride gains a '//' provenance field.
- **Step 6 — the reader is DONE and measured (2026-08-15, 228e20e): member
  precision 99.5% (ONE invented member in 203), recall 61.6%, attribution
  40/41 decided and 40/40 CORRECT (median |votes| 50; one margin-1 record, also
  right), titleOk caught 3/41 free.** The point-vs-assist hypothesis is
  CONFIRMED, and by exactly the right evidence: **saturation is statistically
  identical on short sides (0.915) and complete ones (0.936)** — short sides are
  not starved readers, they are readers that ran out of things to find. Of 328
  bench slots: 202 found, 8 seen-and-dropped, **118 (36%) never appear on a
  nameplate at all** — descriptions state the team SELECTED, the plate states
  who took POINT, and an assist-only fighter is invisible at any sampling rate.
  Recall ceiling ~64%; denser sampling buys 2.4%, so the sampler is closed.
  **AUTO_ACCEPT fitted to 0.75, overriding my 0.90 default with a genuinely new
  finding: a high threshold ANTI-SELECTS FOR COMPLETENESS** — both-sides-exact
  goes 17.1% → 0.0% from 0.01 → 0.90, because a side at confidence 1.00 is
  typically ONE member witnessed many times, and a one-member union is never
  right about a four-fighter bench. Precision is already carried by MEMBER_MIN
  (the noisy-OR redesign moved it to the per-member gate), so the side-level
  threshold buys nothing above 0.75 and costs 39 points of coverage. **The
  portrait-tier trigger has FIRED by 13×** (~131 short sides/week against a
  ~10/week trigger; queue already 131 records / 262 sides) — and the 36% figure
  makes portraits the ONLY route to that third of the data. Known gap, not
  silent: 4 sides across 3 videos returned literally nothing (two read ZERO ids
  across 59–71 HUD frames where the reader averages 87%) — undiagnosed, routes
  to review correctly. **Champion CONFIRMED by Claude Design at the same
  #EC51C9** with better-documented reasoning (the gold ΔL escape provably
  breaks: below iron-man → AA ≤4.0:1, above → lands on wolverine L .62);
  PROVISIONAL comes off. WARNING: the design file was built from the ORIGINAL
  handoff and still says `--char-danger-x` — cherry-pick the Champion line, do
  NOT wholesale-replace.
- **Step 7 + drain shipped and pushed (2026-08-17):** 84/131 records resolved
  from footage + 47 → review; after rebase + fresh cron: **211 replays · 422
  sides · mean 2.22-of-4 · complete 135/422 · provenance title 148 /
  description 106 / footage 168 · bench queue 160.** The rebase's decisive
  check: footage HELD at 168 across a six-derived-file conflict resolved by
  regenerate-from-inputs (overrides.json, the only non-derived file, never
  conflicted) — the pattern paying a third time. Two corrections owed and paid:
  the "median 3-of-4" projection was too generous (queue delivered median 2 —
  ground truth was longer videos from prose-description channels); the ETA
  cost model (per-video cost nearly fixed → 11h not 3h). Engine push carried
  the eight checklist amendments; PLAN.md hand-sync is now SAFE by
  construction (checklist in NEW-GAME-CHECKLIST.md — the structural fix
  working). Permission layer correctly blocked all five session push attempts;
  user pushed. **Next session issued: the portrait tier** —
  prompt-tokon-portrait-tier.md: Step-0 recon on the ALREADY-CACHED band crops
  (geometry, sprite-stability vs recolor variance, tag-state signal,
  occlusion, 720p legibility, the four zero-read sides' strips) with a hard
  STOP; templates built FROM THE CORPUS (135 complete + 82 ground-truth sides
  = labeled crops; coverage explicit, absent-class refusal, DLC auto-covered);
  **the test set pre-exists** (recall on the 118 never-on-plate slots,
  precision cross-check on the 202 plate-confirmed, disagreement is a
  measurement); gate fitted with the anti-selection lesson applied; additive
  integration (provenance tier `portrait`, complete-separate-from-confidence,
  in-place improvement), drain re-run delta reported.
- **Portrait tier Step 0 complete (2026-08-17): the corner shows ALL FOUR
  fighters every HUD frame** — one large unframed bust (point) + three
  45°-rotated diamond cells in a 2×2 lattice (center (80,73) on 1280×720, cells
  at ±36 on each diagonal axis, mirror symmetry to 0.003) — so the 36% is fully
  reachable in principle and the ceiling is AVAILABILITY, not visibility.
  **Bust reader already strong** (87% ≤7 bits within-video; 12.9/14.3
  same-fighter cross-channel vs ~29 different; t=12 → 55.8% recall @ 0.01%
  false-accept) → user's call: calibration + cross-check ONLY (nameplate
  already IDs point). Icons identifiable at 720p → no 1080p re-downloads;
  **free calibration set: 19/21 fighters labeled from an 8-frame sample**;
  template coverage 21/21 in ≥1 complete side (thinnest peni-parker 3).
  **The assist diamonds' limiter is availability, proven by falsifying the
  session's own framing**: the user chose de-rotate-and-refit on a
  neighbour-leakage theory; de-rotation (elegant diagonal-substitution
  sampling, no sharp round-trip) bought 36→44.8% but the score is FLAT across
  ±6 px offsets (hypothesis dead) and smaller cells trade discrimination for
  stability — while tightening the presence cut lifts agreement MONOTONICALLY
  (p50 → 72/71/62%, mean 13.4→9.7 bits): "governed by whether the cell is
  drawn and unobstructed, not by how well it's cropped." Same shape the
  pipeline already solves (presence gate + noisy-OR over 60–190 frames;
  MEMBER_MIN/BURST_INDEP fitted and waiting). Two self-corrections paid: the
  occlusion instrument was invalid (the lattice-center box holds four cells'
  match-varying corners — its medians are NOT occlusion rates, and weren't
  reported as such); **the four zero-read sides aren't reproducible — the
  drain never persisted per-video reads** → the drain gains persistence this
  session. Geometry settled; d=22 refit provisional, to be refit AFTER the
  presence gate (the earlier fit was availability-confounded).
- **Portrait tier Step 1 did NOT clear the bar (2026-08-18) — reported straight
  rather than pushed into meaningless Step 2 tables.** Top-3 recall 46.9%,
  all-three-right 5.6%, and that is an UPPER BOUND (templates saw the sides they
  scored). Three findings and two corrections: **(1) the right corner's ART is
  mirrored, not just its position** — L-R unflipped measured 29.14 bits, i.e.
  the different-fighter level, so every cross-side pair in the transfer and
  identity tests had been noise; fixed, all crops canonicalised to left.
  **(2) The transfer hypothesis (my #3) is DEAD, killed by a pixel-blind
  popularity control**: nearest bust template hits the correct 3-of-21 16.7% vs
  the control's 36.7% — without that control, 25.9% against a naive "chance
  14.3%" would have read as a positive result. Bust art is not diamond art.
  **(3) The dim/lit watch item became the binding constraint**: median luminance
  gap 100/255 between a frame's brightest and dimmest cell, and the bright cell
  MOVES (44/20/36%) — three fighters × two render states ≈ 6 groups per side;
  state-splitting lifts top-3 cluster coverage 61%→78%. Colour tested as a
  control and rejected on the bust where truth is known (gap 8.42 vs greyscale
  14.23) — fuses.ts hue-voting does not transfer to 31×31 px. **The diagnosis:
  the hash separates fine (same-fighter ~12 bits vs different ~29); the TEMPLATE
  LIBRARY is the weak link** — co-occurrence labelled 271 groups covering only
  16/21 fighters (peni-parker, captain-america, ms-marvel, wolverine absent),
  trained on a set structurally capped at ~82 description-derived sides. "The
  constraint is information, not arithmetic." Correction owed and paid: Step 0's
  "no 1080p justified" was established on the BUST; the diamonds are ~31×31
  effective px and 1080p would give ~47×47 (2.25×), so that conclusion never
  covered them. Sharpenings #1/#2 (fit gate end-to-end, refit d) correctly
  deferred — both are downstream of a reader good enough to have an end-to-end
  number.
- **Portrait arc CLOSED (2026-08-19): the stopping rule fired and the human
  path shipped — Tōkon now 255 replays · 510 sides · 437 complete (85.7%) ·
  6 oversize represented as mid-set team changes · bench queue 37 · review 5.**
  Complete went 32% → 85.7% via the labelling bootstrap + the unblocked drain
  (50 zero-slots drained; attribution by elimination; "keep both" replacing
  "force" so a title-witnessed fighter is never dropped to satisfy a check).
  The remaining 37 are the honest hard tail (plate could neither place nor
  read) — pending and the site says so: complete or visibly pending, never
  invented, achieved at scale. The session's through-line, kept verbatim:
  "almost every defect this session was found by the human using the tool,
  not by the machine testing it… which is the same conclusion the portrait
  tier reached about the reader itself." Also shipped: **the deploy
  fingerprint** — verify-deployed now compares count + complete-side total +
  a content hash; it had been reporting success against a build missing 227
  sides, and on the very next push only the HASH caught a real difference
  (the field added expecting to carry signal carried none — the third
  instrument in this project to be improved by its own failure);
  /dev/disagreements cross-tier check (0 across 278; four off-bench readings
  resolved — two reassigned, two appended as team changes); a slow-build
  correctly classified by the deploy gate as NOT a collapse (15-record
  shortfall inside the band, under the absolute floor — the guard quiet by
  design). Throwaway spike committed WITH a header because its value is the
  negative result ("just crop where the handle is" looks right and isn't —
  one command now demonstrates it). Everything pushed, trees clean.
- **Changelog plan audited (2026-08-19/20): Step 1 arrived COMPLETE — 25
  entries, every date git-verified, my anchor list overruled in EIGHT places.**
  The two best corrections target my own suggestions: "~70% lighter" appears in
  no repo — the real figure is 31.14→7.10 MB (77.2%), so the entry quotes
  megabytes; and Tōkon's "85.7% complete" is a MOVING number (it already fell
  as new sides arrived) — omitted per the honest-numbers rule I wrote, applied
  against me. Date corrections: Tekken 07-16; one-home 07-17 (shell bootstrap +
  both cutovers in ONE day); SF6 07-25 00:39; Evo SF6 08-04 single-day;
  preservation 08-07. **Historical find: 2XKO reached replaydatabase.com
  standalone on 07-04, thirteen days before the shell existed — and the first
  commit is 07-01: the entire platform is SEVEN WEEKS old.** Pre-platform era
  included as entries #23–25. Build catches: **`crawlLinks: false` is
  load-bearing** (crawling would emit hollow /2xko/* HTML shadowing the edge
  rewrites, breaking all four games) so the route needs an explicit prerender
  seed — a footer link alone would silently never generate the page;
  erasable-syntax TS so the .mjs validator imports under Node 24 type
  stripping (with a tested fallback); badges match on **slug not id**
  (tekken8/tekken); the shell's FIRST component override (SiteFooter,
  engine-copied, width-checked at 320/360/380); sitemap-pages lands
  automatically from the actual prerender list; verify-shell gains canonical
  checking (new capability); the NEW-GAME-CHECKLIST amendment correctly
  redirected to the shell README's own "Adding a game" list (the checklist is
  pipeline-scoped and engine-repo = out of scope). **User's editorial note
  folded in: bodies expand 1–2 → 2–4 sentences, extra sentences CONCRETE
  (frozen number / what-it-means / mechanism in plain words), revised table
  shown before Step 2 builds.**
- **Changelog table revised and approved (2026-08-20):** all 25 bodies expanded
  under the 2–4-sentence concrete-only rule — every addition a frozen number, a
  visitor consequence, or a mechanism in plain words (#24 ships the platform's
  ethic as public copy: "where it couldn't tell, the match says so instead of
  guessing"; #21's "all 742 indexed URLs redirect permanently"; #14's "the
  replay file alone had been downloading five times over"; #10's 1,022
  recovered-by-description). **The honest-numbers rule caught its author a
  THIRD time:** my suggested #6 copy ("the videos still play today") was
  already stale — the session checked before publishing my words and found the
  B6 bleed (4 of 150 sampled videos gone) — decision: PUBLISH the bleed,
  reframed as the reason preservation matters ("some videos have since
  vanished entirely… which is exactly why the records remain either way").
  #15's unverifiable rank claim dropped for the verifiable
  pre-written-tables fact. Steps 2–3 running in auto; push staged for the
  user, then verify:cutover + screenshots.
- **FGC Replays Hub → Tōkon plan audited (2026-08-23) — approved, auto; four
  exceedances over my directive.** (1) **The mechanism-divergence table refuses
  to port 2XKO's shape** — Tōkon's gate is scope-only (`tokonSignal`; TOKON_RE
  is global), runs at PARSE (raw/ holds everything by design), and has a second
  line of defence 2XKO lacked: `OTHER_GAME_RE`, title-only, already listing
  2XKO — same lesson, different correct implementation per repo. (2) **Measured
  honesty about scope**: reconstructed the ungated 2,517-record corpus and ran
  the real gate — both scopes agree TODAY (1 kept / 2,516 other-game; the
  dual-game boilerplate is on exactly 1 of 2,517 descriptions), and 'title' is
  chosen on FORWARD risk with the reason stated: when the boilerplate spreads,
  titleOrDescription would match TOKON_RE on 2,516 foreign records and rest
  their rejection on the both-markers branch — "leaning on one gate to catch
  another's over-reach is not a design." (3) **Naming-collision catch**:
  `fgcReplaysHub` because `replaysHub` is TAKEN by the unrelated "Tōkon Replays
  Hub." (4) **The bench-deferral discipline**: the channel states full
  four-per-side benches in prose and ALL 8 resolve against the roster — and the
  plan REFUSES a fourth DescriptionBench grammar authored against one sample
  (checklist 5e: a wrong bench shape doesn't fail loudly, it completes sides
  with fabricated fighters) — revisit when the variant can validate against its
  own rejects. Parse dry-run already done at plan time (both champions resolve,
  empty residue, correct sides; both handles already exist → no player minted)
  with the architectural note: 2XKO's PREFIX keys on the game name (hence the
  junk player), Tōkon's core() cuts on ▰ POSITION. Precedence last, evidence-
  backed (Hook/Supernoon/Hikari already in-corpus; a character-identical
  Supernoon bench exists on highLevelReplays). **The cross-repo positive
  control asserts BOTH directions**: WryZaaMayl8 absent from every 2XKO
  artifact AND in tokon replays; a 2XKO title present in 2XKO AND absent from
  Tōkon — one day's crons, two gates, four assertions.
- **Tōkon channel add shipped + an unrelated live defect found and fixed
  (2026-08-23, a8e3035 + the channel commit, unpushed).** The planned work was
  the occasion; the find was `BRACKET_TAIL_RE` stripping only full-width 【】
  while hadoukenReplays publishes the tail BOTH ways — 53 titles 【MARVEL
  TŌKON: Fighting Souls】 and 17 ASCII [...] — and the grammar catalogue atop
  parse.ts documenting only the 【】 variant is what made a one-family regex
  look complete. **The defect was worse than first reported: it deleted records,
  not just dirtied handles.** The tail is 31 chars, so any handle ≥10 crossed
  the 40-char bad-handle refusal and the whole record was binned — the corpus
  sat on BOTH sides of that edge (longest surviving junk handle 39 of 40), so
  short names minted junk players and long names vanished silently. Results:
  records 327→**330** (the 3 bad-handle misses are back), players 281→**275**,
  bracket-bearing handles 12→**0**, bad-handle misses 3→**0**; seven junk ids
  merged into people already in the corpus (diaphone 20→23, naire, skinhoff,
  sunfaded, bazzoka, rock, tokon), five became clean new ids; only
  hadoukenReplays moved (58→61) and no channel lost a record. **players.json
  is fully derived in this repo, so it healed on reparse with NO hand edit** —
  the architectural contrast with 2XKO, where a committed seed entry was
  structurally unreachable by the pruner. Control positive-controlled by
  reverting the regex: exactly 2 of 4 new controls fail (specific, not
  incidentally green) and the ASCII fixture fails as **"(record absent)"** —
  demonstrating the deletion directly rather than the dirty handle; e2e gained
  the sibling of the fighter-name assertion (no player handle contains a
  bracket), a class that previously had no test that could see it. Two
  self-corrections: "16 players" was wrong in both directions — **a grep on
  ^tokon missed `to-kon-player` because the macron splits the slug** (the NFC
  lesson resurfacing in slugs); real picture 17 suspects, 12 this bug, and the
  other 5 are uploader-typed handles the parser read CORRECTLY (three
  corroborated by their own descriptions) → they stay, now surfaced in a new
  report.md section on the same surface-never-rewrite contract as the residue
  block. Deliberately left: an iterative tail strip (zero 【…】👊 titles in
  6,132 — wait for an example) and the 40-char cap, which behaved correctly.
- **Tōkon completeness plan audited (2026-08-24) — approved; my ordering
  corrected twice by measurement.** Verdict PROVEN not asserted: replayed every
  commit 1a40c5d→db50148 diffing per record per side — **zero records lost a
  fighter at any commit**; the bracket fix and fgcReplaysHub add each cost 0.
  Accumulation only: 85.7% (437/510) → **71.5% (479/670)**, ~2.8pp/day, last
  extract 08-20. Side sizes are BIMODAL — 189 at 1, 2 at 2, **0 at 3**, 473 at
  4, 6 oversize — and per tier title 191/**0%** · description 169/100% ·
  footage 32/100% · human 278/100%: nothing completes incrementally, so the gap
  IS the title tier. **Correction 1 — my "cheapest first" free tier barely
  exists**: fightingStationX has ZERO 4-name descriptions, replaysHub is
  one-fighter-per-side by construction, and hadoukenReplays' apparent 4+ names
  are **hashtag soup** (#IronMan #CaptainAmerica…, identical boilerplate on
  every upload — the exact fabrication trap channels.ts:96 warns about, which a
  naive count-roster-names heuristic would have turned into fabricated benches
  on every record). Real pool: fgcReplaysHub's 6 sides. **Correction 2 —
  extraction does NOT produce complete sides**: side-exact is 15.9%, mean
  footage union 2.23 of 4, and 136 of 278 human sides had a footage read first
  — the drain is the PREREQUISITE for the human pass (it downloads the frames
  /dev/bench-review needs), not an alternative to it; only 17 of 96 queue
  records have frames. **Step 0 hazard, third of its class**: local raw/ is
  stale (the 08-24 cron committed data/ from CI), cannot reproduce 5 committed
  ids, and a bare data:parse would silently shed them 335→330 with the collapse
  guard structurally unable to fire at 1–2/channel → data:fetch FIRST, always,
  and Step 5's catchup script makes the ordering impossible to get wrong.
  Step 1 fixes a FALSE ACTION REQUIRED (LEADERBOARD_RE misses reversed
  `Ranked #N`; characters resolved correctly in every case) while refusing to
  absorb genuine alias gaps — `P. Parker` is ambiguous between Peni and Peter
  and must keep surfacing. Step 3 uses `--dry --uncached` so the drain cannot
  race the labelling UI over overrides.json's whole-file read-modify-write.
  **Step 6's finding is bigger than the badge question: fighter pages filter on
  `characters.includes(id)`, so a fighter on an unread bench is ABSENT FROM ITS
  OWN PAGE, and usage (Σ characters.length) presents "appearances known" as
  "appearances" — undercounting across 191 sides.** No emit change needed;
  engine knob policy, separate proposal, after the drain changes its magnitude.
- **Tōkon completeness recovery COMPLETE and live (2026-08-26): 764/764 sides
  = 100.0%** (from 479/670 · 71.5% at the 08-24 close) — sides at one fighter
  **189 → 0**, title tier 191 → 0, unread usage slots 621 (21.8%) → 0, bench
  queue 96 → 0, review queue 11 → 2 (both explained). Pushed
  2f54c83..92162ac (nine commits — three from the review-queue work plus six
  still local from the labelling session); production verified 382 replays ·
  764 complete sides · digest d5cb2b8543e0, with two stale polls before the
  match (the documented case: a single fetch would have called a 6-record
  shortfall a collapse). e2e 73/0. **The through-line: four bugs that all
  failed the same way — silently, in the direction that HIDES WORK** — the rank
  alarm crying wolf (so a real DLC fighter wouldn't be heard), the worklist
  hiding every record OCR couldn't read (the ones most needing a human),
  contradictory attribution hiding a side and shielding a mis-attribution for
  eight days, and the **union slip** publishing sixteen appearances for an
  eight-fighter match while every downstream check waved it through because
  oversize sides are legal. "None was in the pipeline. None had a gate. Each
  surfaced only because a number didn't reconcile." The union-slip guard ships
  in **both halves** — save-time refusal in bench-review.post.ts AND a
  report.md backstop listing any already in the data (the backstop is what
  found these two; "a save-time check alone would have caught neither") — with
  the load-bearing negative control that a 4-fighter MIRROR match is legal and
  present (SPLYxPgwT5o), so identity alone must never fire; the signature is
  identity AND oversize. Side appearances 3080 → 3064; oversize 11 → 7.
  **The stopping rule vindicated: the reader's 36% blind spot bounded the
  MACHINE, never the human's eyes on the portrait cluster — which is why the
  tail went to zero instead of stalling near 190.** Two gaps disclosed
  unprompted: the e2e run that was planned and not executed (red on main since
  2f54c83; fixed, with a DEADPOOL allowlist keeping the fifth-grammar assertion
  at full strength and the exception carrying its evidence), and an HTTP-layer
  coverage gap — both new guards' predicates are gate-controlled but the
  endpoint wiring isn't, because an empty bench queue left no live item to
  drive a save against. **Steady state named: ~19 records / ~25 one-of-four
  sides per day; report.md shows the slip tomorrow, the nudge fires at 40,
  data:catchup walks it back. "100% is a moment."**
