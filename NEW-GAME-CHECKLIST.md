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

### Amendments from the second consumer (Fatal Fury: CotW, 2026-09-03)

Written 2026-09-07, by the THIRD consumer. These eleven were reported on
2026-09-03 and never written down, so the third consumer opened the same file the
second one had already outgrown. The capabilities below all shipped between Tōkon
and Fatal Fury and none of them had a step: the checklist contained zero
occurrences of `theater`, `cursor`, `witness`, `composite`, `catchup`,
`fingerprint`, `commit-guard`, `patch-check`, `liveness`, `typecheck` or `202F`.

Each is reconstructed from the shipped code rather than from the summary, because
the code is the only surviving record. Where the five copies of a rule disagree,
the amendment says which one is right and why.

**12. An index source is a pipeline stage, not a channel.**
A third-party match catalogue — one that hosts no video and points AT video — is
the first source that is not a channel, and every assumption in step 1 bends
around it. It has no channel id, no uploads playlist and no title to gate; its
rows arrive already parsed by strangers; it re-indexes uploads you already have;
and it is somebody else's service, so it can be wrong, slow, or gone. It gets its
own entry in the channel table with an `index` block and a LOWEST dedupe
precedence, because a source that re-indexes other people's uploads should never
outrank the uploader. Sub-rules 12a–12i are not optional extras: each one was a
defect first.
The instance every game on this platform consumes is **Replay Theater**
(`replaytheater.app/api/matches`), ported five times; the rules below are
written from what those five ports disagreed about.
_Failure: the rule set for this stage lived only in five diverging copies of one
file, and the divergences below are what accumulated in the gap._

**12a. Gate the game per ENTRY, not on the query you sent.**
`?game=<slug>` is a filter the catalogue answers, not one you control, and the
slug is THEIRS (`cotw`, `strive`, `tkn8` — never your own game id; a wrong one
returns HTTP 400). Re-check every row against its own declared game label. A
mistagged submission arrives looking exactly like a real one.

**12b. A composite id follows the ENTRY, not the source.**
`${videoId}@${startSeconds}` when the entry carries a real offset, the plain video
id when it does not. Stating the composite rule unconditionally is right only for
an all-segments catalogue: on a catalogue that is mostly whole videos it mints
ids like `vid@0` that can never dedupe against the same video arriving from a
channel. Guard `videoId` and `startSeconds` TOGETHER when emitting — guarding on
`startSeconds` alone strips `videoId` from every offset-zero record.
_Failure: one VOD holding nine matches collapses to one record, or the same
upload publishes twice under two id shapes._

**12c. Ignore anything known ANYWHERE — and exclude the intake's own rows.**
If the repo has already ruled on a video in any capacity — a raw dump pre-gate,
a record built this run, the committed corpus, an overrides entry, `exclude` or
not — the catalogue entry is ignored, not merged, not preferred. The subtlety
that only shows up on run two: when the intake's own record ids can be bare video
ids, its committed rows match THEMSELVES, every candidate skips as already-known,
the run builds zero, and the add-only pin assertion throws. Exclude this intake
from its own known-set.
_Failure: an intake that works perfectly on its first run and cannot run twice._

**12d. Add-only, never-depends, and a carry pin that only grows.**
The intake may only ADD. Carry every committed record the dump did not reproduce;
COUNT entries that vanished upstream, never remove them. The cron step runs last
and is allowed to fail: on any failure there is simply no dump, parse carries, and
the cron stays green. Pin the built count in a data file — the rebuild path
asserts the pin never falls (`<`), the carry path asserts it exactly (`!==`). That
asymmetry is deliberate.
_Failure: one VOD going private removes every segment cut from it — 57 records in
one measured case — passing both collapse-guard arms while the pin is overwritten
downward._

**12e. The cursor is written by parse, on the PULL, not by the fetcher on the
rebuild.**
Every `data/` write belongs to parse. A fetcher that wrote the cursor would
advance it for a pull whose records parse then refused, and the next run would
skip those pages forever. Key the write on the pull having happened, not on
records being rebuilt — the common carry path rebuilds nothing, and a cursor
keyed on rebuilds never advances at all. It only ever moves forward.

**12f. The cursor plausibility bound must REFUSE, not recover.**
Bound the committed cursor against the newest id the catalogue offers on page 1.
Exceeded, it means a bad write, an upstream id reset or a hand edit. **Exit
non-zero.** The newest repo softened this to a warning plus a silent full sweep,
and the recovery cannot heal: the fallback observes a LOWER highest-id than the
poisoned cursor, the forward-only write refuses to move it down, and the
catalogue gets swept in full every morning forever — visible only as a
`console.warn` inside a step that is already expected to be yellow. Clamping is
just as wrong: it hides which entries were skipped while the cursor was bad. A
cursor that is wrong is a question about the repository's history, not a number to
round off.
_Failure: a forward-only cursor can never heal; every page reads as already-seen;
the cron stays green while the intake silently never ingests again._

**12g. Cursor-gate the dump, or the number you print is the walk length.**
The daily walk reads a fixed window — two clean pages, ten at most — whether or
not anything in it is new. Cutting the dump from that whole window makes the
intake's reported figure a function of how far you walked rather than of the data,
so a quiet morning prints a window-sized number into a file the cron commits.
In cursor mode keep only entries above the committed cursor; keep an entry with
no id, because a spurious rebuild is free under add-only and a dropped entry waits
for the next full sweep.

**12h. Liveness is a property of the source — measure it and report a RATE.**
A catalogue accumulates links to videos that no longer resolve. Join every
candidate to the video API and drop what does not come back: absence from the
response IS the dead signal, and a record whose video does not resolve is never
built. Report the rate, not the list, once the count passes a handful. **Do not
inherit another game's number or its shape** — one measured 32% decaying smoothly
with age; the next measured 9.2% concentrated in a single year, because a channel
had deleted its back catalogue. Both are true; neither predicts the other. And
note that the daily cursor window is all recent rows, so any alarm keyed on the
daily figure reads ~0% forever — the real number only appears on a full sweep.

**12i. A witness must have a reader.**
Write every row the run saw, behind the per-entry game gate, to a file that is NOT
the intake file: nothing that reads it may build a record from it. Then actually
read it — compare the catalogue's handles and characters against your own parse,
publish the agreement rate, route disagreements to a file with both claims side by
side, and let it overwrite nothing. It never outranks a confident parse and never
outranks a human. **Measure the independence before banking the number**: where
the catalogue is a same-day re-index of your own uploads it read the same title
you did, and agreement is close to tautological. Say which part of the reach is
genuinely independent.
_Failure: a witness file written every morning that no code has ever opened, and
a trust number quoted as verification that measures the pipeline agreeing with
itself._

**4c. `data:patch-check` treats an unparseable title as a HARD FAILURE.**
The checker exists to notice a shipped patch missing from your table, so anything
it cannot read must fail loudly rather than be skipped. Two more rules the vendor
will teach you: category membership is not enough (a "Known Issues" post can carry
a parseable version bracket and would mint a duplicate row), and the announcement
date in the title is not the release date — extract the date from the body
sentence, and expect the two to disagree.
_Failure: a green tick forever while the table rots._

**5l. Normalize invisible Unicode — and make the control exercise IDENTITY.**
Titles carry characters that look like spaces and are not: U+202F, U+3000, U+00A0,
U+200B. Normalize before matching, on the exact-match surfaces — handles, aliases,
registry keys. The trap is in the control, and it is the reason this amendment
exists: **a control that asks "does it still parse" passes on a pipeline with no
normalization at all**, because `\s` in JS already covers these codepoints. The
parse rate is unmoved; what breaks is identity lookup, so one player becomes two.
Do not assume the codepoint carries over either — one game found 333 U+202F and
zero U+3000; the next found zero U+202F, 547 U+3000 hiding a hashtag-run boundary,
and a U+00A0 sitting inside the game marker itself, where a marker written with a
literal space misses it entirely.

**9b. The commit-guard stages data files BY NAME, never `git add data/`.**
A blanket add stages whatever else is in the directory — a hand-edited overrides
file mid-review, a scratch file — and commits it as part of an unattended refresh.
List every pipeline-owned file explicitly, with a comment saying what each one is.
Two files that look skippable are not: the carry pin, because most runs rewrite it
and an unstaged file that DOES change is a change discarded in silence; and the
cursor, because a fresh CI checkout without it resets to zero every morning.
Suppress the commit when the cursor is the ONLY change, or the archive redeploys
daily forever — and write that test as an emptiness check on the remaining staged
NAMES, since an empty pathspec means "everything" and would invert the check.

**9c. Pair fetch with parse in one command — `data:catchup`.**
`raw/` is gitignored, so a local dump is routinely OLDER than the committed data
the cron produced in CI, and running parse alone silently deletes every record the
local dump cannot reproduce. The collapse guard does not catch it: the loss
arrives as one or two records spread across every intake. The stale-raw guard
catches only the clear-cut case. **Ordering is what closes the gap** — fetch, then
the index pull (allowed to fail), then parse, then emit — and making the mistake
unhittable by accident is worth more than either guard.

**10e. The deploy check compares a CONTENT DIGEST, not a record count.**
A count catches an archive collapsing and is blind to a record's characters
changing while the count holds — which is exactly what a review resolution or an
override does, and it is the common case. Hash every record's id and characters
alongside the count. Nothing is embedded in the build: both sides are computed
independently at check time and compared, cache-cold. Keep the failure semantics
narrow — a count collapse past the band is the only hard failure, because a hash
mismatch cannot distinguish a slow build from a wrong one. What the hash buys is
that the success claim is TRUE when it is made.
_Failure: a smoke check that cannot tell a deployment that does not exist from one
still in flight, and calls a collapsed archive green because the count it compared
against was nothing._

**10f. The command is `npm run typecheck`, never raw `tsc`.**
A game repo is two disjoint TypeScript tracks: the Nuxt project graph, and the
data pipeline in `scripts/` and `types/` under `tsconfig.pipeline.json`. The root
`tsconfig.json` is `files: []` delegating to Nuxt references, so `npx tsc --noEmit
-p .` reports clean while a pipeline script references two deleted functions.
Neither track alone is sufficient. This applies to anything that SUBSTITUTES for
the command too: a narrowed gate written to skip a repo-local data validator must
not also drop the pipeline track, or a pin bump typechecks none of the pipeline.
_Failure: green, and the next data run throws._

### Amendments from the third consumer (Guilty Gear Strive, 2026-09-07)

Reported before the build, from Stage 0 recon. Numbers here are Strive's;
the rules are not.

**5m. Decide title ORIENTATION per channel, before the first parse.**
Two channels covering the same game at the same quality can run MIRROR-IMAGE
grammars — one writing `HANDLE (Character)`, the other `CHARACTER (handle)` — each
96–98% internally consistent. A single rule of the form "the character is inside
the parentheses" scores 98% on one and **0%** on the other, and the 0% channel
does not fail: it files every fighter as a player and every player as a fighter,
and the pages render normally. Two more shapes defeat the question itself: a
channel with brackets on 4% of its titles, and a channel that puts a RANK TIER in
the parentheses on some titles and a handle on others.
Resolve by ROSTER RESOLUTION, not by slot position — ask which side of the
bracket resolves to a roster alias. Then add the check that a naive implementation
omits: **when BOTH sides resolve, do not take the first one.** Route it to the
review queue as slot-ambiguous, and let a per-channel declared order be the
tie-breaker for that branch alone. Tally the resolved orientation per channel,
BOTH sides, and print it — a channel that silently flips is otherwise invisible.
_Failure: measured on one corpus, 215 titles rejected and 67 filed confidently
wrong, every one of them a plausible-looking record._

**5n. The player registry shares no name with the roster.**
Assert it from the FIRST parse, not from an end-to-end test after the site is
generated — by then the bad data is on disk. Compare through the alias matcher,
not against a set of display names: punctuation-stripped, alias-expanded,
case-folded and NFC-normalized in one call, or a handle spelled `SOL` slips past a
roster entry named `Sol Badguy`. Real players ARE named after fighters, so the
guard needs an explicit CONFIRMED list, and every entry on it carries a video id
as evidence. Nothing is deleted on the guard's say-so alone.
_Failure: one game shipped a player page and a character page at the same id, both
prerendered, with nothing warning; another put fighter names in the player field
on 26 records with every count, schema and gate green._

**5o. Hydrate the video metadata before quoting a parse rate.**
A parse rate computed from titles alone omits every miss class that needs a
duration or a live flag — on one game that was 251 records and an entire gate. It
is an upper bound, and reporting it as a rate overstates the pipeline twice: once
in the headline, once in the miss split that is supposed to tell you what to fix.
The hydration pass is cheap next to the backfill it informs.

**8c. Decide the rank facet, and say which signal you are looking at.**
`filters.rank` and a `ranks` ladder are required together, so the decision must be
explicit. The distinction that decides it: a LADDER TIER describes the player, a
per-character LEADERBOARD POSITION describes one character's standing this week
and is not a property of the match at all. Strip the latter and never turn it into
a rank. Expect several spellings of the same thing in one corpus, and measure the
strip's coverage against the residue gate — an unstripped rank prefix leaks into
the handle and mints players.

**10g. Register the game in the workspace scripts — and mind the sequencing.**
Step 10b names the cron slot; it does not name the three scripts that actually run
the platform. A new game joins the fetch list, the commit list with its own gate
command, and the patch-check list — and that last one needs its short-name map,
its script map, AND the bare error string that enumerates the games, which is not
derived from any of them. **Add all of it in the same commit as the game's first
real push, never before**: an empty repo makes the commit script's preflight mark
it unusable every run and the patch checker file it as an error, while both
scripts' drift warnings stay silent because they key on artifacts an empty repo
does not have. Forgetting is not self-correcting in either direction.

**11b. The character-id convention is ONE decision, made before the design
handoff is authored.**
The id is simultaneously the URL slug, the accent key, the CSS variable, the
roster id, the partner site's link suffix, and the surface the roster-name guard
compares against — and the slug is the one irreversible thing. Partner sites key
characters by FULL name, so full-name ids derive for free and short ids need a
hand override each; one game measured 26 of 32 deriving against 21 overrides for
the alternative. Decide it once, for the design system and the partner link
together, and hand the convention TO the design handoff. Nothing downstream
catches a handoff that quietly chose the other one.
