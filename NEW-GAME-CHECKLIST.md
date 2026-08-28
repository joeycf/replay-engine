# New-game checklist

Everything the engine boundary does not cover — the conventions a game's
pipeline has to honour, in the order to do them in.

> **Why this is its own file.** It was written in `a7fbebe`, and twice since
> then a wholesale hand-sync of `PLAN.md` has silently deleted it: once in
> `0fe4f34` ("Updated PLAN.md to current latest"), and again a day after it was
> restored — taking with it the comment that existed specifically to warn
> against that. A guard comment cannot survive the process it warns about,
> because the paste replaces the comment too. So the checklist lives here,
> where syncing the surrounding document physically cannot reach it.
>
> The engine `README.md` links here, and `PLAN.md` keeps a one-line pointer.

The prose behind each step lives in the engine docs — README "Onboarding a new
game — the pipeline contract" is the consumer contract, STACK §5 items 14–18
are the standing MUSTs.

Each step names the failure it prevents, because every one of these was learned
from a defect that shipped and every one of them fails silently.

Written 2026-08-09, closing the three forward-references this doc had been
carrying to a checklist that did not exist.

1. **Model the sources before writing a fetcher.**
   List every channel, decide its `Replay.source` token, and group the tokens
   into user-facing chips (`sourceGroups`, typically Online / Tournament). One
   physical channel may emit several tokens — classify per video and send
   ambiguous titles to the review queue, never to a guess. Every contributing
   channel is an **ordinary daily channel**; the first run is the backfill.
   _Failure: a channel you meant to backfill once quietly stops being fetched,
   and nobody notices until its records go stale. The cron-preservation gate — a
   simulated daily run proving untouched channels survive — is what catches it._

2. **Decide the dedupe key at the same time, and make it the intake channel.**
   Not the public source token, which two channels may deliberately share.
   Hand-authored `sides` overrides protect a record from dedupe; extraction-origin
   overrides do **not**.
   _Failure: channel-priority silently never fires between two channels sharing a
   token, and override protection leaks between them. Both look like working
   dedupe._

3. **Gate on a game marker before parsing anything.**
   Mandatory wherever the publisher shares a title grammar across titles. Widen
   the gate to the video description per-channel when titles carry no marker.
   _Failure: the other game's matches parse cleanly — players, characters,
   duration — and replace part of your archive. Observed live for ~24 hours. The
   inverse is just as costly: a first-party archive read 0/1,025 on a title gate
   and 1,025/1,025 on a description gate._

4. **Build the patch table from the vendor's own version grammar.**
   Eras open on balance overhauls, from an explicit hardcoded table, never
   inferred from major version numbers. Nest patches under eras by release date.
   Never invent a version to fill a sequence gap. Ship child granularity;
   era-only requires a stated reason in the app's README.
   _Failure: an era-only facet renders, filters, and passes every count
   assertion. It simply cannot answer "which patch", and nobody notices until two
   games are compared._

5. **If characters come from footage, recon first.**
   Re-derive the crop for this game (a ported crop reads 0/60 where the
   grid-searched box reads 48/60). Derive each alias's edit budget from the
   roster's own distance table — `min(lengthScaled, floor((minCrossDist−1)/2))`
   — not from length alone. Treat blank frames as neutral. Require ≥2 frames for
   union membership. Read side attribution from the HUD, never from title order
   (measured 37.7% / 12.8% / 11.1% wrong across three corpora). Gate auto-accept
   on `decided`.
   _Failure: every one of these produces a complete-looking record with the wrong
   data in it. Title order alone would have credited over a third of one corpus
   to the wrong player._

6. **Stand up the review queue before the first bulk import.**
   Two item kinds: source-classification and character-completion. Pending items
   never reach `replays.json`. Keep labeling blind — the server computes any
   machine-vs-human comparison and discards the machine's answer.
   _Failure: a contaminated label set is worth less than no labels, and you
   cannot tell which is which afterwards._

7. **Wire the collapse guard and the freeze pattern on day one.**
   Refuse to write on a per-channel loss of >10% **and** >20 records, with an
   explicit override flag, aborting before any write. Freeze rather than prune a
   channel that stopped publishing this game; pin the carried count and
   hard-assert it every run.
   _Failure: the pipeline publishes the loss, and the next run treats the
   collapsed count as the new normal. Without the pin, one bad carry poisons the
   reference permanently._

8. **Declare the stat unit, assert it in emit, and write it in the app README.**
   Side appearances for a 1v1 game; a per-record deduped union is legitimate for
   a tag game on a shared roster. Use the same denominator for `characterUsage`,
   `byPatchUsage` and `playerCharacters`.
   _Failure: the emit gate is copied from a sibling with different semantics and
   throws on run one — or worse, does not throw, and three panels disagree with
   no visible symptom._

9. **Snapshot every data file before any git operation, and keep the snapshot
   until the session closes.**
   _Failure: one `git checkout -- data/` that was a directory too broad reverted
   a migration, a set of hand labels, and a roster edit at once. The labels
   survived because a snapshot existed; the one file missing from it was
   recovered only because it happened to be deterministic._

10. **Positive-control every gate you just built.**
    Inject the failure each gate exists to catch and confirm it exits non-zero,
    then confirm the clean run exits 0. Piped gates run under `set -o pipefail`
    (STACK §5 item 11).
    _Failure: a gate that cannot fail is indistinguishable from a gate that
    passes, and you will trust it._

11. **If ComboForge carries the game, wire the cross-link and never hand-write
    the id map.**
    `npm run verify:comboforge -- --suggest --game=<their id> <repo>` in the
    engine builds the `GameConfig.comboforge` block from their live roster; paste
    it, hand-fix whatever `--suggest` dropped into the null list, then run a bare
    `npm run verify:comboforge` to gate it. Their character ids carry the FULL
    name (`sf6-a-k-i`, `tekken8-marshall-law`) and their game id is not always
    ours (`tokon` → `marveltokon`).
    _Failure: `${gameId}-${ourId}` looks right on the two games where it happens
    to work and emits dead links on the other two — a link to an empty result
    page renders exactly like a link to a full one._

### Amendments from the first consumer (Tōkon, 2026-08-13)

The ten steps above are unchanged. These are the gaps Tōkon hit that the list
did not cover — added here rather than edited in, so the 2026-08-09 original
stays legible.

**4b. When the vendor publishes no version string, the token is a date.**
Step 4 assumes a version grammar exists. Tōkon's vendor publishes none — patches
are date-titled posts on a storefront news hub ("Patch Update 8/10/2026"). Then
the patch token IS the publication date, ISO-normalised for URL and sort
stability; the fold rule is a date window; and every row records the channel it
was announced on, because "never invent a version" needs somewhere to point when
there is no version to copy. Validate `token === start`, `start >= launch`, and
`start <= today` — a typo'd year silently mints an empty window that filters to
nothing and asserts clean.

**5b. Titles, descriptions, and footage are three tiers, not two.**
Step 5 jumps from titles to footage. A real corpus can sit in between: Tōkon's
titles carry 1–2 of 4 characters, and **30% of its descriptions carry the full
per-side bench in prose**. A description parser is a genuine pipeline stage with
its own hazards — align it to a side by handle correspondence first and
character containment second, and **refuse when neither resolves**. Never align
positionally: a channel whose title reverses its second slot would compound one
order error with another. A tier that can be read from text is cheaper, more
accurate, and more auditable than one read from pixels; look for it before
building an extractor.

**5c. Extract characters by span, never by splitting on a separator.**
A separator regex is the obvious implementation and it is wrong on any roster
with punctuated names: splitting on `[/-]` shreds `Spider-Man`, `Star-Lord` and
`Ms. Marvel` into fragments that then fail to resolve — or worse, half-resolve.
Match roster aliases longest-first as non-overlapping spans and treat separators
as the gaps between them; one code path then handles `A/B`, `A, B`, `A- B` and
`A and B` identically. Pair it with a **residue gate**: report the characters no
span covered, with the literal text, so a DLC fighter or a new nickname surfaces
as a counted line instead of silently vanishing.

**8b. Declare the provenance unit alongside the stat unit.**
With more than one character source, "how did this record get its characters" is
unanswerable unless you record it per side at the time you decide. Carry the
contributing tiers, the alignment method, and whether the tiers disagreed. Keep
it on the substrate and out of the emitted contract — the report can then state
how every record was sourced, and a regression in one tier is visible as a shift
in the mix rather than as silence.

**7b. The collapse guard is inert on a young corpus — say so.**
`>10% AND >20 records` cannot fire for a channel with 20 records or fewer. Four
of Tōkon's five channels launched under 35. Both thresholds are still correct
and must stay; what the checklist owes is the honest note that the guard _sleeps_
until roughly 200 records per channel, and that the post-deploy smoke check plus
the freeze pin are the live protection until it wakes up. A guard believed to be
watching, that structurally cannot fire, is the same failure as a gate that
cannot fail.

**10b. Launch is part of the checklist too.**
Nothing above covers registering a fresh cron slot clear of the existing ones,
flipping the umbrella entry in a single commit, or taking a post-deploy baseline
for every _already-live_ game before a release's pushes. Git-green is not
production-green, and a release that breaks a sibling is indistinguishable from
one that does not until something measures it.

**5d. Your display font may be unrenderable by your image tooling — silently.**
Anything that generates a branded image (OG cards, placeholder tiles) must
prove the typeface actually drew, because the failure mode is a plausible
fallback rather than an error. Two weak guards will pass: `document.fonts.check`
returns true for a family whose declared `unicode-range` does not cover the
text, since uncovered glyphs fall back to a system font and a system font is
always "available"; and comparing rendered width against `serif` also passes,
because a half-loaded family draws a MIXED string whose width differs anyway.
What works is measuring each subset through a string only it can draw, against
a family that cannot exist so both measurements resolve to the same default
face. Assert per subset, not per family.
_Failure: a card ships its wordmark in Times and every check reports green._

**5e. Grammar variants are found by looking at REJECTS, not at successes.**
A title parser's passing set tells you nothing about the shapes it is missing,
and nothing at all about the shapes it is mis-reading. Print, per channel, the
titles that name a roster character but do not match the expected shape — that
is where new variants live. Then read the review queue as data rather than as a
backlog: a variant that produces WRONG records rather than none is invisible in
every count, and will only surface as something that looks parsed and is not.
_Failure: one game's fifth title grammar put fighter names in the player field
on 26 records; the counts, the schema and every gate were green, and accepting
one would have minted a player page named after a character._

### Amendments from the extraction track (Tōkon, 2026-08-16)

**5f. A fold ported from a sibling must be re-derived against the new game's
temporal structure — name every term and say why it survives.**
The siblings separate real play from misreads by CONTIGUITY: a side's character
is constant within a game, so a real segment is consecutive and noise is
isolated. In a tag fighter the point character cycles by design and a genuine
tag-in can occupy a single sampled frame, so that prior inverts. Working the
arithmetic then found three more terms failing for the same reason: `min(1,
frames/MIN)` is DEAD CODE behind its own membership gate (the factor is 1 for
every member that survives — true in the sibling too); `1 - mean(dist)/3`
converges to a constant set by the OCR error mix rather than to 1, so more
evidence makes a middling score more certain; and `dropped ? conf/2` fires
hardest on NEAR-COMPLETE reads, because the last character found is the one seen
least. Port the SHAPE of the evidence — edit distance, min-over-members,
first-appearance order, the prudence constant — and re-derive the rest.
_Failure: a formula whose confidence falls as the answer gets more complete, so
the auto-accept gate rewards under-reading._

**5g. Noisy-OR assumes independent observations; burst frames are not
independent.**
Once you sample in bursts, the realistic phantom is the SAME misread twice one
second apart — same fighter, same face, same crop, same background — not two
independent errors. Combine within a burst at a discount and across bursts
freely, and keep the discount as one named constant. At full independence the
"genuine repeat" and "correlated phantom" cases are the same arithmetic and no
choice of the other constants separates them.

**5h. A measurement taken at recon density does not transfer to production
density. State the sampler with the number.**
Recon samples in dense windows; production spreads. A per-side "distinct
identities seen" count measured on burst frames is an upper bound on what a
spread sampler sees — 4.0 vs 3.0 median here — and quoting the first about the
second silently oversells coverage.

**5i. A hash compared as a `Number` is not a hash.**
`BigInt(parseInt(h, 36))` on a 64-bit value silently drops everything past 53
bits, so distinct images compare as near-identical and clusters UNDER-count.
Compare bit strings, or exact BigInt.
_Failure: the corrupted count landed exactly on the number the prior predicted,
which is the most persuasive way to be wrong._

**5j. The reader's alias set is not the parser's.**
Prose aliases exist because uploaders abbreviate; a pixel reader sees only what
the game renders. Feeding the prose table to the reader adds short mint targets
and collapses the roster's own spacing — here the minimum cross-alias distance
went from 4 to 3, forcing every decoding radius down to defend against strings
the screen can never show.

**5k. Human-readable is not machine-recoverable, and a sample that snapshots the
thing under test goes stale exactly when you need it.**
A human reads the plate in the whole frame; the reader gets a small crop. "93%
of rejects are legible to a person" is not headroom, and fitting looser accept
rules against those same labels recovered nothing. Second half: if the sample
file caches what the reader answered at build time, and you then change the
reader, scoring against that cache reports that nothing moved however much did.
Read the current answer live.

**6b. A labelling surface must display nothing authoritative, and no default may
pass for an answer.**
A page built so the MACHINE cannot whisper the answer can still leave the TITLE
shouting it: every title here names two fighters per side, and 17 of 17 labels
reproduced it exactly. Serve the artifact and a counter — no title, no
description, no handles, no id — and address the artifact by opaque index so it
cannot be looked up. Separately, every control must start at a sentinel that
cannot be saved, or "not yet answered" is indistinguishable from the answer that
happens to be the default.
_Failure: a whole labelling session that measures the title parser instead of
the thing under test._

**6c. Every dev page declares itself on the `/dev` index (v0.8.0).**
The engine ships `app/pages/dev/index.vue`; your app ships the tools. Give each
one a `definePageMeta({ devTool: { title, category, description, writes } })`
block and it lists itself — nothing to register. Values MUST be plain quoted
literals: the build extracts the block from the AST, and a backtick string or a
variable drops the key with no error, leaving the tool on the index wearing the
"no description yet" fallback. Set `nitro.prerender.ignore: ['/dev']` in the
app's `nuxt.config.ts` so the whole prefix stays out of the static output.
_Failure: a curation surface nobody but its author can find, which is how three
Tōkon pages shipped without the `import.meta.dev` guard the other seven had._

**10c. A control suite must not repair the condition it tests.**
A suite that snapshots data and restores it in a `finally` also refreshes
mtimes — so a guard keyed on mtime can never fire again after the first run.
Observed as two controls failing on a stale checkout and every later run
passing. A suite whose second run disagrees with its first is not a suite.

**10d. Two thresholds for one decision will eventually disagree.**
A band was accepted at a span of 6 and then rejected for spanning under 8, so
any frame whose topmost band fell between them was discarded and the real
content below it never examined. Use one constant once. When changing a
threshold, prove the change is ADDITIVE across the whole corpus — count the
items newly admitted AND the items whose answer changed, and require the second
to be zero.
