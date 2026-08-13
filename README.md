# Replay Engine

A **base-path-aware Nuxt 4 layer** that holds all shared UI, composables, page
scaffolding, layouts, design tokens, and the **data contract** for the Replay
Database multi-game platform. It is a **library, not a deployed site** — each
consuming app (`2xko-replay-database`, `tekken-replay-database`,
`replay-database-shell`) `extends` a pinned tag of this repo and supplies only
its data, its `app.config.ts`, its art, and its theme.

This README is the **consumer contract**: what an app must provide, what it may
override, and what it inherits for free. Read it at the start of any work that
touches the layer boundary.

> Stack details (locked versions, delivery mechanisms, conventions, constraints)
> live in [`STACK.md`](./STACK.md) — the canonical reference for every consuming
> repo, and the single source of pinned versions. Architecture, phases, and
> product decisions live in [`PLAN.md`](./PLAN.md).

The engine ships a tiny synthetic **fixture dataset** so it runs standalone in
the neutral "Replay Database" look for its own development.

> Part of the **Replay Database** platform — [replaydatabase.com](https://replaydatabase.com) ·
> [shell](https://github.com/joeycf/replay-database-shell) ·
> [2XKO](https://github.com/joeycf/2xko-replay-database) ·
> [Tekken](https://github.com/joeycf/tekken-replay-database)

## Stack

Shape only — [`STACK.md`](./STACK.md) holds every pinned version, and nothing
should restate them.

| layer     | choice                                         | notes                                                                                                                                                                                             |
| --------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework | **Nuxt 4** layer (Vue 3, `<script setup>`)     | consumed via `extends`; `peerDependencies: nuxt ^4.0.0`. Never built or deployed on its own                                                                                                       |
| Language  | **TypeScript** end to end                      | the contract lives in [`types/`](./types), exposed to apps through the `@engine` alias                                                                                                            |
| Styling   | **Tailwind CSS v4** via `@tailwindcss/vite`    | **not** `@nuxtjs/tailwindcss` (v3-locked — see Notable engineering decisions). Two token tiers: `tailwind/structural.css` (shared, fixed) and `tailwind/theme-default.css` (neutral, replaceable) |
| Fonts     | **`@fontsource/*`**, committed as Vite assets  | Space Grotesk / Inter / JetBrains Mono under `tailwind/fonts/` with OFL licenses — relative `url()`s, no runtime CDN, no `public/fonts/`                                                          |
| Animation | **anime.js v4**                                | named-export API, dynamically imported so it stays out of SSR                                                                                                                                     |
| Tests     | **puppeteer-core** + node scripts              | drives system Chrome; no bundled browser, no test framework                                                                                                                                       |
| Lint      | **`@nuxt/eslint`** flat config + Prettier last | Prettier owns formatting                                                                                                                                                                          |
| Node      | **24** (`engines.node: ">=24 <25"`)            | the platform-wide policy; `@types/node` tracks the runtime major                                                                                                                                  |

Runtime `dependencies` are kept deliberately minimal — git-layer consumers
install them, so nothing dev-shaped belongs there.

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
  extends: [process.env.ENGINE_PATH || ['github:joeycf/replay-engine#v0.6.4', { install: true }]],
});
```

`v0.6.4` is the current platform-wide pin.

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
  `characters: string[]` holding **1..N** character ids in first-appearance
  order. `charactersPerSide` describes the game's simultaneous-character format
  and drives UI affordances — it is **not** a length cap on the array, and
  nothing validates it as one. A tournament SET whose player counter-picked
  lists every character that side used. See "Extraction conventions" below.
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
    charactersPerSide: 1, //      Tōkon=4, 2XKO=2, Tekken=1 (closed set, v0.7.0)
    accents: { kazuya: '#8B1E1E', jin: '#1E3A8B' /* …roster */ },
    filters: { coOccurrence: false, rank: true },
    ranks: ['Beginner', '1st Dan', /* … */ 'God of Destruction'], // req. iff filters.rank
    sourceChannels: [{ id: 'ch-abc', name: 'Some Channel' }],
    // Optional vocabulary + URL segment (additive, v0.2.0). Every user-visible
    // engine noun resolves through these; the characters section's routes are
    // renamed to the segment at build. 2XKO: champion/champions · team ·
    // season/seasons, segment 'champions' (its live indexed URLs). It keeps the
    // default `source`: it overrode this to 'channel' until sourceGroups
    // collapsed its chips to Online/Tournament, which are not channels.
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
    // Optional character-hero framing (additive, v0.5.4): the hero splash's
    // object-position. Default '70% 25%' suits wide landscape splashes (2XKO);
    // games whose portrait renders sit heads-near-top (Tekken) bias the
    // vertical up so the head isn't cropped. Keep X ~70% to hold the subject
    // right of the name/stat overlay.
    // heroFocus: '70% 4%',
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

## Onboarding a new game — the pipeline contract

Everything above is the engine boundary: pin, data, config. This section is the
other half — the conventions a game's **pipeline** has to honour. They are not
enforced by the engine, they were each learned from a defect that shipped, and
every one of them fails silently. `PLAN.md` "New-game checklist" walks them in
order; this is the reference the checklist links to.

### Sources, groups, and dedupe keys

**Consolidate channels into groups; keep the per-channel tokens underneath.**
`GameConfig.sourceGroups` (v0.5.5) renders one chip per group instead of one per
channel — both shipped games collapse to **Online / Tournament**. The per-video
badge still resolves the real channel from `sourceChannels`, and the source
predicate still matches per-channel ids, so per-channel deep links keep working.
With `sourceGroups` set the engine renders **only** group chips; child filtering
is URL member-CSV (`?src=a,b,c`) — there is no parent token.

**One physical channel may emit several `Replay.source` tokens.** SF6's
@TheKingArena is classified per video by title signals into `kingArenaOnline`
and `kingArenaTournament`; a title carrying both signals goes to the review
queue rather than guessing. Split at the token, not at the channel.

**Tournament channels are ordinary daily channels.** The
one-time-backfill-excluded-from-cron mechanism exists in no sibling and never
did — it was a PLAN aspiration. Every contributing channel joins the daily
fetch, and the first run _is_ the backfill. The gate that matters is
cron-preservation: a simulated daily run must prove backfilled videos survive a
fetch that never touches their channels.

**Dedupe on the intake `ChannelKey`, never on a shared `SourceId`.** Two
channels may deliberately share a public source token (a new tournament channel
reusing `tournament` to avoid minting a public badge). Keying dedupe on the
shared token means channel-priority never fires between them, and override
protection leaks from one channel's hand corrections to the other's. Carry the
intake key on the record and key dedupe off that.

**Extraction-origin overrides confer no dedupe priority.** Every visually
extracted record is a `sides` override, so a naive "hand-authored overrides win"
rule silently makes the extracted channel beat every duplicate, inverting
declared channel precedence. Only _hand-authored_ `sides` overrides protect.

### Patch granularity

The consumer contract is its own section — see
[Patch grouping (v0.6.0)](#patch-grouping-v060--child-granularity-is-expected).
Three clauses the checklist repeats because each has already been got wrong:

- **Eras open on balance overhauls**, from an explicit hardcoded table — never
  inferred from major version numbers, and an all-character balance pass does
  not imply a new era.
- **Never invent a version to fill a sequence gap.** A synthesis recommending an
  invented `2.03` was caught and refused; the real version is `2.0301`.
- **Fold rules come from the vendor's own version grammar.** Tekken folds
  Bandai's `X.YY.ZZ` hotfixes into `X.YY`; SF6 folds nothing, because Capcom's
  `X.YYZZ` is one atomic field and folding would mint a version that never
  shipped. Read the vendor's strings before reusing another game's rule.

### Extraction conventions

For games whose titles do not name characters, the pipeline reads them from
footage. This is the most defect-dense surface on the platform.

**Recon before building.** Measure what the footage actually shows on a sample
before committing to a method; the corpus decides the method, not the other way
round.

**Crops never transfer between games.** A crop ported verbatim from one game to
another reads **0/60**; the same game's grid-searched box reads **48/60**. HUD
geometry is per-game and must be re-derived every time, however similar the
layouts look.

**Derive the edit budget from the roster's own distance table.** A purely
length-scaled budget is unsafe: the worst collisions are long strings one edit
apart (`jin kazama` / `jun kazama`), where length-scaling grants budget 3. Cap
each alias by its **unique-decoding radius** —
`min(lengthScaled, floor((minCrossDist − 1) / 2))` — so aliases that cannot be
told apart must match exactly. Measured on one roster: 21 of 83 aliases end up
exact-only.

**Blank frames are neutral.** Tournament VODs cut to crowd, replays and player
cams constantly. Treating a blank as a negative splits one real run into two
short ones and drops a character that was genuinely there; absence of evidence
is not evidence of absence. Measure runs over the subsequence that read
something.

**Union membership takes ≥2 frames.** A character seen in exactly one frame is
indistinguishable from a misread at normal sample counts — exclude it from the
union _and_ force the record below auto-accept so a human sees it. Precision
first; visible, not absorbed.

**Side attribution comes from the footage, never from title order.** Measured
title-order defect rates: **37.7%** on one game's event corpus, **12.8%** on
another, **11.1%** on a third. HUD-handle attribution measured 100% on the same
sample. Title order is at best a flagged hint and must never silently back-fill;
an unreadable handle region routes to review.

**The `decided` gate.** Auto-accept requires the side to be _decided_. An
undecided side is a coin-flip dressed as a verdict — it stays in the queue no
matter how confident the character read was.

**Unions are 1..N characters in first-appearance order.** Emit gates hard-fail
only on **0** characters; a side longer than `charactersPerSide` is legal data,
not a bug. Such sides **count in `characterUsage` but are excluded from
`pairingUsage`**, with the excluded count reported — naive `C(n,2)` over a
multi-character side fabricates pairs that were never played, and fabrication
poisons a synergy panel silently while under-counting stays recoverable.

### Channel lifecycle

**The collapse guard is standard equipment.** Refuse to write when a channel
loses **more than 10% AND more than 20** of its committed records; allow an
explicit per-channel override flag; abort **before** any write. Both thresholds
are required — a percentage alone punishes a small channel for ordinary churn,
an absolute alone misses a large channel bleeding slowly. Compare against
whatever actually reaches the site (raw is only a fair proxy when the game gate
runs at fetch). A channel collapses because it was deleted, renamed, made
private, or **rebranded to another game and unlisted its back catalogue** — all
observed.

**The freeze pattern is the alternative to pruning.** A channel that stopped
publishing this game keeps records that are still real and still play at their
URLs. Freeze it: fetch skips it, parse carries its committed records forward
byte-stable, pruning happens only by explicit override, and the frozen count
surfaces in the pipeline report. **Pin the carried count and hard-assert it every
run** — the committed data file is both the source and the target of the carry,
so one bad run poisons the next run's reference permanently and silently.
Editing the pin is the deliberate-prune mechanism, and it shows up in review.

> **Game-marker gates are mandatory wherever a title grammar is shared across
> games.** A publisher that reuses one title format across two titles will
> eventually push the other game's matches through your parser, and they parse
> cleanly — players, characters, everything. One cron replaced part of an
> archive with another game's matches and served it for ~24 hours. Gate on a
> marker the other game cannot carry, and widen the gate to the description when
> the title does not carry one.

### The review queue

**Two item kinds:** source-classification (which channel token does this video
belong to) and character-completion (what did each side actually play). Both
resolve into the overrides file.

**Pending items never reach `replays.json`.** An unresolved item is absent from
the site, not present-and-guessed.

**Labeling stays blind.** The server computes any machine-vs-human comparison and
discards the machine's answer before rendering — the flag says _look again_,
never _say this_. A label produced by someone who has seen the extractor's
output is contaminated and worth less than no label.

**Snapshot before any git operation, covering every data file the session
touched.** A `git checkout -- data/` that was one directory too broad reverted a
migration, a set of hand labels, and a roster edit at once; the labels survived
only because a snapshot existed, and the one file missing from that snapshot was
recovered only because it happened to be deterministic. Labels are precious and
cannot be regenerated.

### Stat semantics are declared per game

`characterUsage` and its neighbours do **not** carry one platform-wide unit —
see [`types/stats.ts`](./types/stats.ts). A 1v1 game counts **side
appearances**, so a mirror adds 2. A tag game on a shared roster, where both
sides routinely field the same character, may instead count a **per-record
deduped union**, answering "how many replays feature this character". Both are
correct; they are different questions.

What the contract requires is that each game **state its unit in its own README
and assert it in emit**, and that the same denominator drives that game's usage
bars, per-patch timeline and player tables. Emitting one unit for
`characterUsage` and another for `playerCharacters` makes three panels disagree
with no visible symptom.

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

## Patch grouping (v0.6.0) — child granularity is expected

`GameConfig.patchGroups` gives the `patch` facet a two-level hierarchy: **era
parents** (seasons) with **patch children**. Two levels only — a child has no
`children` of its own.

```ts
patchGroups: [
  { id: 'S1', label: 'Season 1', children: [{ id: '1.01', note: 'Rashid' }] },
  { id: 'S2', children: [{ id: '1.05' }] },
  { id: 'S3' }, // childless: a declared era whose first patch has not shipped
];
```

`label` and `note` are optional at both levels; `id` is the URL token and is
the display text when no `label` is given. Declared order is display order
**and** canonical URL order, and ids must be unique across all parents AND
children — the engine documents that as a MUST and does not validate it, so
assert it in your emit.

**`Replay.patch` holds the CHILD token.** The era token is the documented
"era known, patch unknown" fallback, not the normal case. A parent selection
expands to itself plus all its declared children, so a replay carrying a bare
era token still matches a whole-era selection, and `?patch=S1` links written
before a game added children keep their exact counts.

**Eras come from an explicit hardcoded table of balance overhauls, never
inferred from version numbers.** This is the trap the rule exists for: in SF6
the `1.x` line spans two seasons and `2.00` lands mid-season, and an
all-character balance pass does not imply a new era either. Nest patches under
eras **by release date**, never by version prefix.

Presence-gating works like `ranks`: declare every era and every patch you know
about; a chip that would filter to zero replays is never rendered, and a
childless parent renders as a plain chip with no expander. Ship the whole
table; the data decides what shows.

The consumer pattern is one authority for both halves — the app's pipeline owns
the boundary table, derives every replay's token from it, and emits a committed
`data/patchGroups.json` that `app.config.ts` imports, so the hierarchy and the
data cannot drift. Vercel never runs the pipeline, so that artifact has to be
committed.

> **A game with any patch history is expected to ship child granularity.**
> Era-only is a deliberate exception that requires a stated reason in the app's
> README — not a default. The failure mode is shaped like success: an era-only
> facet renders, filters, and passes every count assertion; it simply cannot
> answer "which patch", and nobody notices until two games are compared.

Known limitation: `patchTokenParts()` and `BrowseCard` resolve **ids**, not
labels, so a modal meta line reads `S3 · 2.02` even when the parent carries a
`label` of `Season 3`. Fixing that is an engine change; do not game-branch
around it.

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

## Analytics endpoints (v0.6.3) — required when the app runs behind the shell

Both Vercel SDKs are wired by the engine's
`app/plugins/vercel-observability.client.ts`. A consuming app configures only
where the beacons go, via `GameConfig.observability`:

```ts
// app/app.config.ts
observability: { insights: '/2xko-insights' },
```

Why this exists: each SDK resolves its script and its beacons against a
**same-origin** prefix, so the project credited is whichever one owns that path
on the domain being browsed — never the project that built the page. Behind the
shell, a game's pages are served from the apex, so by default all of its data
lands in the **shell's** project.

- **Omit the key** and the defaults (`/_vercel/insights`,
  `/_vercel/speed-insights`) pool every game into the shell's dashboard. Correct
  and verified, just shared — and now legible, because the plugin reports
  base-prefixed paths (`/2xko/stats`, not `/stats`).
- **Set `insights`** to a per-game prefix to send Web Analytics to the game's
  **own** project. That prefix MUST have a matching
  `/<prefix>/:path* → https://<child>/_vercel/insights/:path*` rewrite in the
  shell's `vercel.json`; the two ship together or every beacon 404s. It has to
  be same-origin — the child's endpoints send no CORS headers, so an absolute
  URL dies at preflight.
- **Leave `speedInsights` alone** unless you have checked the plan: Speed
  Insights is single-project on Hobby, so its beacons must reach whichever
  project has the feature enabled.

**A root-based app (base `/`) is left completely alone** — no override at all.
It is served from its own origin, so Vercel's baked per-project endpoint already
resolves, and keeping it preserves the ad-blocker resistance that the stable
`/_vercel/…` path lacks. The shell and the fixtures app are in this case; only a
subpath build is rewired.

## Versioning

The engine is consumed by tag, so a release is a **contract event**, not just a
commit.

- **Tag, never `main`.** A consuming app pins `#vX.Y.Z`. Tracking a branch would
  let an engine change reach production without a deliberate app-side decision.
- **Additive by default.** New contract surface arrives as optional fields and
  empty-by-default slots, so an app on an older pin keeps building. Each optional
  field is annotated inline with the version that introduced it — see
  [`types/game.ts`](./types/game.ts) and the `app.config.ts` example above
  (`additive, v0.2.0`, `additive, v0.5.4`, …). [`STACK.md`](./STACK.md) carries
  the deeper per-release notes.
- **Engine first, then apps.** A change lands and is verified here — `typecheck`,
  `lint`, `test:filters`, `test:registry`, and the browser suites — before any
  app moves. Then the tag is cut, and pins are bumped **one app at a time**
  (`PLAN.md` §7), never as a single sweeping commit.
- **`ENGINE_PATH` is a local-development affordance only.** It must stay unset in
  every deployment, or the app builds against whatever happens to be on disk
  instead of the pin.

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
node scripts/verify-subpath.mjs http://localhost:4174 /sub   # base-path resilience probe
node scripts/verify-override.mjs                             # theme-override contract, both directions
node scripts/verify-patch-groups.mjs                         # grouped patch facet (overlay build)
```

> `verify-phase2.mjs` and `verify-browser.mjs` were **deleted in v0.6.4**. Both
> were Phase-2 artifacts, wired to no npm script and no workflow, and both had
> rotted against the code they checked — `verify-browser` selected a
> `button[role="switch"]` that the co-occurrence toggle stopped being (it is
> `[data-testid="co-occurrence-toggle"]` with `aria-pressed` now), so it
> dereferenced null partway through, and both asserted an 8-replay fixture set
> that has held 10 for several versions. Their coverage moved on: `test:filters`
> and `test:registry` own the pure semantics, each game's `scripts/e2e.ts`
> playwright suite owns the real click-through, and `verify-override` /
> `verify-subpath` / `verify-patch-groups` own the built-bundle contracts. A gate
> that cannot run is worse than no gate — it reads as coverage.

The subpath probe also has a build-placement mode that needs no browser — point it
at a generated output root and it asserts nothing escaped the base:

```bash
node scripts/verify-subpath.mjs --artifacts fixtures/.vercel/output /sub
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

---

**Not documented here, deliberately:** deploy setup, Vercel configuration,
analytics, cron schedules, and data pipelines. The engine is never deployed and
owns no data — those belong in each consuming app's README.

> Feature requests and bug reports are welcome via Issues.
