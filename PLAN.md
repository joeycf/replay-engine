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
  · Vite · TypeScript · Tailwind via `@nuxtjs/tailwindcss` (v4, CSS-first `@theme`) ·
  anime.js (viz) · no Pinia.
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
                  │   replaydatabase-shell      │   owns the domain
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
- **`replaydatabase-shell`** — owns `replaydatabase.com`. Serves the selector at `/` and
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

4. **Data provisioning: config is pushed, collections are fetched.** To keep the engine
   game-agnostic and dodge Nuxt's cross-layer alias resolution (aliases like `~~/` behave
   subtly when the file lives in the app but the code lives in the layer), each game:
   - puts truly-small, static settings in `app.config.ts` (name, slug, accents, filter
     toggles, disclaimer) — merged over the engine's defaults;
   - writes its data collections (`characters`, `players`, `replays`, `stats`) to
     `public/data/` in its pipeline, and the engine fetches them under the base path.
   The engine never reaches into an app's filesystem; the app hands data up. Trade-off vs.
   the original build: the small registries become cached static fetches instead of being
   bundled (~a couple of extra tiny cached requests, negligible for SSG). If you'd rather
   keep them bundled, each app can import its own registries in-app and provide them to the
   engine via a plugin — noted in prompt-3. Default is fetch-all-under-baseURL for
   robustness.

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
    `--color-text-muted`, `--color-primary`, `--color-primary-contrast`, `--color-focus`.
  - **Font families**: `--font-display`, `--font-ui`, `--font-mono` (family assignment only;
    the scale stays structural).
  - **Accents**: `--accent-<characterId>`, injected from `GameConfig.accents` by
    `app/plugins/accents.ts` (already in the plan). Accents live in `app.config.ts`; the
    palette + fonts live in the theme CSS.

**The hard rule:** engine components must reference only these semantic variables — never a
raw hex value or a literal font-family name. That is what makes a full re-skin a
drop-in-CSS operation. Prompt-2's audit greps for violations, exactly like the
"no hard-coded champion" check.

**Override mechanics (Tailwind v4 + Nuxt layers):** the engine defines neutral defaults in
its `@theme`; each game's `app/assets/theme.css` defines its own `@theme` (or `:root`)
block that **shadows** them, and because the app's CSS loads after the layer's, the app's
values win. **Self-host fonts** per game the same way the 2XKO build did (no gstatic
leakage): a game using a non-default display face drops its `woff2` in `public/fonts/`, adds
an `@font-face` in its `theme.css`, and reassigns `--font-display`.

**The neutral engine default is the umbrella/selector look** — a deliberate, presentable
neutral dark "Replay Database" theme (neutral palette + a clean neutral display font,
self-hosted in the engine). The **selector** uses it as-is (favoring no single game); each
**game** fully replaces it. 2XKO's neon palette + Chakra Petch / Barlow / JetBrains Mono
become **2XKO's own theme override**, not an engine default — so 2XKO and Tekken are
symmetric skins.

**Deeper per-game flourishes** (a background texture, a bespoke hero, a custom wordmark
treatment) are done by overriding a *single component* at the same path in the game app —
which Nuxt layer precedence already supports — rather than adding many token knobs. Keep
these rare; most identity comes from palette + display font.

**Fan-project safety:** evoke each game's feel through **type and color**, not the
trademarked logo. Use a `"{shortName} / REPLAY"` wordmark in a game-appropriate display
font, consistent with the disclaimer each site already runs.

---

## 5. Repo-by-repo layout

**`replay-engine`** (the layer)
```
replay-engine/
├─ PLAN.md                      ← this document (source of truth)
├─ nuxt.config.ts               ← base config: tailwind, SSG/Vercel defaults, anime.js
├─ app.config.ts                ← DEFAULT GameConfig (generic, safe fallbacks)
├─ tailwind/
│  ├─ preset.ts                 ← shared Tailwind preset
│  ├─ structural.css            ← FIXED tokens: spacing, radii, corner-cuts, shadows, motion, type scale
│  └─ theme-default.css         ← NEUTRAL default theme (semantic palette + fonts) = umbrella/selector look
├─ public/fonts/                ← self-hosted NEUTRAL default fonts (no gstatic)
├─ types/                       ← game.ts, replay.ts  (THE contract)
├─ app/
│  ├─ layouts/default.vue       ← the shell: header/wordmark, nav, footer/disclaimer
│  ├─ pages/
│  │  ├─ index.vue              ← Browse (grid + filters + modal)
│  │  ├─ stats.vue
│  │  ├─ characters/index.vue
│  │  ├─ characters/[id].vue
│  │  ├─ players/index.vue
│  │  ├─ players/[id].vue
│  │  └─ health.vue             ← dev: renders counts from config + fetched data
│  ├─ components/               ← BrowseGrid, FilterPanel, ReplayModal, StatCharts,
│  │                              CharacterCard, PlayerCard, Wordmark, SiteFooter, …
│  ├─ composables/              ← useGame, useReplays, useFilters, useStats, useCharacters,
│  │                              usePlayers  (all fetch from public/data under base)
│  └─ plugins/                  ← seo.ts (titles/meta/OG/JSON-LD from config), accents.ts
├─ fixtures/                    ← tiny synthetic data so the engine runs standalone
│  └─ public/data/*.json
└─ README.md                    ← how to consume: extends + required public/data files
```

**`2xko-replay-database`** (existing, refactored to thin app)
```
2xko-replay-database/
├─ nuxt.config.ts               ← extends engine (pinned); app.baseURL from config
├─ app.config.ts               ← the 2XKO GameConfig (accents, filters, channels, …)
├─ app/assets/theme.css         ← 2XKO THEME override: neon palette + @font-face, shadows engine defaults
├─ data/                        ← source JSON (pipeline output, generic schema)
├─ scripts/                     ← 2XKO pipeline: YouTube + Riot CMS art (UNCHANGED intake,
│                                 new: emits generic schema + writes to public/data)
├─ public/
│  ├─ fonts/                    ← self-hosted Chakra Petch / Barlow / JetBrains Mono (moved from engine)
│  ├─ img/champions/            ← champion art (webp) — now under base at runtime
│  └─ data/                     ← generated: characters/players/replays/stats.json (gitignored)
├─ types/                       ← (optional) 2XKO-only extension types
└─ design/                      ← 2XKO Claude Design exports (theme + accent source of truth)
   (app/ is otherwise nearly empty — only genuine 2XKO-only component overrides, ideally none)
```

**`tekken-replay-database`** (new) — same shape as the 2XKO app, with a Tekken pipeline in
`/scripts` (YouTube + character art/data from Bandai Namco or a fan wiki), Tekken art in
`public/img/`, the Tekken `app.config.ts`, and its **own** `app/assets/theme.css` +
`public/fonts/` carrying Tekken's darker/metallic palette and display font.

**`replaydatabase-shell`** (new)
```
replaydatabase-shell/
├─ nuxt.config.ts               ← extends engine (for chrome/tokens); app.baseURL '/'
├─ app.config.ts               ← umbrella config (brand, list of games + their slugs/urls)
├─ app/pages/index.vue         ← the selector landing page (game cards + aggregate counts)
├─ public/data/summary.json    ← per-game counts (fetched/committed at build) for the cards
└─ vercel.json                 ← SUBPATH MODE ONLY: external rewrites to the game deploys
   (no theme.css → the selector uses the engine's NEUTRAL umbrella theme, favoring no game)
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
3. **Delete the now-duplicated code** that moved to the engine: shared components, the
   `useVideos`/`useFilters`/`useStats` composables (superseded by engine versions), the
   layouts, the shared pages, the shared types, and the **structural** tokens/Tailwind
   preset. What remains in `app/` should be nearly nothing.
3a. **Relocate 2XKO's look into its own theme override.** The engine default is neutral, so
   2XKO's identity must move into `app/assets/theme.css`: the neon **semantic palette**
   values (shadowing the engine defaults) plus `@font-face` for **Chakra Petch / Barlow /
   JetBrains Mono**, with the font `woff2` moved from the engine into `public/fonts/` and the
   `--font-*` variables reassigned. Accents stay in `app.config.ts`. Net effect: the 2XKO
   site looks **identical to today**, but its palette/fonts now live in 2XKO's repo, not the
   engine — making it a symmetric skin with Tekken.
4. **Reshape the pipeline output to the generic schema** (`Replay.sides[2]` etc.) and write
   the collections to `public/data/`. The *intake* (YouTube fetch, Riot art scrape) is
   unchanged; only the *shape it emits* changes, plus a copy step into `public/data/`.
   Verify with the `/health` route that counts are **identical pre- and post-reshape**
   (2,809 / 15 / 714 / 24 — assert against independently computed numbers, same discipline
   as the original build). This is the one step that touches working data, so it gets the
   strongest verification.
5. **Base-path-awareness inherited from the engine.** No 2XKO-specific work here beyond
   confirming champion-art paths and the replays fetch resolve under base (they will,
   because the engine uses `withBase()`); `app.baseURL` stays `'/'` until the shell phase.
6. **Keep it deployed at root.** No migration yet. 2XKO continues serving
   `replaydatabase.com/*` unchanged for users while all this happens.

What **stays** in / newly **lives in** the 2XKO repo: `data/`, `scripts/`,
`public/img/champions/`, `app.config.ts`, its **own** `app/assets/theme.css` +
`public/fonts/` (the 2XKO skin), `design/`, and its own Vercel project + cron. What **moves**
to the engine: everything shared (UI, composables, pages, layouts, types, and only the
*structural* tokens — the neutral default theme stays in the engine, the 2XKO theme does
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
- **`replaydatabase-shell`** — its own project, owns `replaydatabase.com`. In subpath mode
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
| 5 | Build `replaydatabase-shell`: selector landing page + wire routing (subpath rewrites **or** subdomains) + migrate 2XKO off root. | `prompt-5-shell-and-routing.md` |
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
- **Layer version drift** — pin tags, bump deliberately, keep a CHANGELOG (§7).
- **External-rewrite caching** — for Vercel projects created on/after Apr 6 2026, external
  rewrites honor upstream cache-control by default; fine here, just be deliberate about
  cache headers on proxied game assets in subpath mode.
