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
