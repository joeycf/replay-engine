/**
 * CROSS-GAME PLAYER SPELLING.
 *
 * The same competitor appears in more than one game and each pipeline derives
 * their display handle from its own corpus, so each is right about its own data
 * and they disagree with each other:
 *
 *   F.Champ      / FChamp      / FCHAMP
 *   Snake Eyez   / SNAKEEYEZ   / Snake eyez
 *   Justin Wong  / JUSTIN WONG
 *
 * Measured across the four games: 152 players appear in more than one, 21 in
 * three or more, and 77 are spelled differently between them. The archive reads
 * as four sites about four sets of people.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THIS IS DISPLAY ONLY. IT CANNOT MERGE ANYBODY, AND IT CANNOT RENAME ANYBODY.
 *
 * Two separate guarantees, and the second is the one that makes a handle-keyed
 * lookup safe without per-game verification:
 *
 * 1. No ids. Every game keeps its own player ids, its own /players/* URLs and
 *    its own data/players.json. Nothing here reaches the pipeline — this module
 *    runs at render time, in the engine, and the cron never loads it.
 *
 * 2. AN ENTRY MAY ONLY RESTYLE THE SAME LETTERS. `display` must normalise back
 *    to its own `key`, asserted below at module load, so the worst a wrong match
 *    can do is turn "ZAIDI" into "Zaidi". It is structurally incapable of
 *    showing one person another person's name.
 *
 * WHY THAT SECOND RULE EXISTS. Cross-game identity is not provable the way
 * within-game identity is. Inside one corpus "SONIC FOX" and "SonicFox" are the
 * same person — same channels, same normalised key. Across games there is no
 * such evidence, and the counter-examples are ordinary rather than exotic:
 * Cloud, Lucky, Mystic, Justice, Shine and Shiro each appear in three or four
 * games and are common enough words that different people picking them
 * independently is the expected case. Those are listed with
 * `status: 'unverified'` and never applied — recorded rather than omitted, so
 * nobody rediscovers them later and assumes they were an oversight.
 *
 * WHY THIS LIVES IN THE ENGINE — the first data in a layer that is otherwise
 * pure code. It was built as a separate package first, on the reasoning that
 * four pipelines needed to share it. They do not: a display concern never
 * touches a pipeline, and the engine is the shared display layer. Everything
 * downstream of provideRegistries() reads one normalised registry, so applying
 * it there reaches the player page, the search index, the typeahead, the filter
 * chips, the OG titles and the breadcrumbs at once, with no per-component
 * change and no way for search to drift from what is displayed.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Adding an entry: confirm it is one person first. A shared spelling is not
 * confirmation, and a shared spelling that is also a common word is a reason to
 * refuse. Anything uncertain goes in as `unverified` rather than being left out.
 */

export interface PlayerIdentity {
  /** Normalised join key. Not an id, and not addressable anywhere. */
  key: string;
  /** The canonical spelling. Must normalise back to `key`. */
  display: string;
  /** Only `confirmed` entries are ever applied. */
  status: 'confirmed' | 'unverified';
}

/**
 * The handle reduced to its alphanumerics — the key two spellings of one person
 * share. Mirrors the `idKey` each game's pipeline uses for the same job within
 * its own corpus.
 */
export function identityKey(handle: string): string {
  const lower = handle.normalize('NFKD').toLowerCase();
  const ascii = lower.replace(/[^a-z0-9]+/g, '');
  // A handle written in another script reduces to "" on the ASCII path; without
  // the fallback every non-Latin handle would share one key.
  if (ascii) return ascii;
  return lower.replace(/\p{M}+/gu, '').replace(/[^\p{L}\p{N}]+/gu, '');
}

/** The comment beside each entry is the spelling observed per game when it was written. */
const IDENTITIES: PlayerIdentity[] = [
  { key: 'chrisg', display: 'ChrisG', status: 'confirmed' }, // 2xko:CHRISG · sf6:Chrisg · tokon:ChrisG
  { key: 'cloud', display: 'Cloud', status: 'unverified' }, // sf6:CLOUD · tekken:Cloud · tokon:CLOUD
  { key: 'diaphone', display: 'Diaphone', status: 'confirmed' }, // 2xko:Diaphone · sf6:Diaphone · tokon:Diaphone
  { key: 'dizzy', display: 'Dizzy', status: 'unverified' }, // 2xko:Dizzy · sf6:Dizzy · tokon:DIZZY
  { key: 'fchamp', display: 'FChamp', status: 'confirmed' }, // 2xko:FCHAMP · sf6:FChamp · tokon:F.Champ
  { key: 'fchampryan', display: 'FChampryan', status: 'confirmed' }, // 2xko:FCHAMPRYAN · sf6:Fchampryan · tokon:FChampryan
  { key: 'fenritti', display: 'Fenritti', status: 'confirmed' }, // 2xko:FENRITTI · sf6:Fenritti · tokon:FENRITTI
  { key: 'filipinochamp', display: 'Filipino Champ', status: 'confirmed' }, // all three: Filipino Champ
  { key: 'hikari', display: 'Hikari', status: 'confirmed' }, // all four: Hikari
  { key: 'justice', display: 'Justice', status: 'unverified' }, // 2xko:JUSTICE · sf6:JUSTICE · tekken:Justice
  { key: 'justinwong', display: 'Justin Wong', status: 'confirmed' }, // 2xko/sf6:Justin Wong · tokon:JUSTIN WONG
  { key: 'k7showoff', display: 'K7 Showoff', status: 'confirmed' }, // 2xko:K7 Showoff · sf6:K7_Showoff · tokon:K7 showoff
  { key: 'kazunoko', display: 'Kazunoko', status: 'confirmed' }, // 2xko:KAZUNOKO · sf6:Kazunoko · tokon:KAZUNOKO
  { key: 'lordvenom', display: 'Lord Venom', status: 'confirmed' }, // 2xko:LORD VENOM · sf6:Lord Venom · tokon:LORD VENOM
  { key: 'lucky', display: 'Lucky', status: 'unverified' }, // sf6:Lucky · tekken:Lucky · tokon:Lucky
  { key: 'mystic', display: 'Mystic', status: 'unverified' }, // 2xko/sf6/tekken/tokon:Mystic
  { key: 'shine', display: 'Shine', status: 'unverified' }, // 2xko:Shine · sf6:Shine · tekken:Shine
  { key: 'shiro', display: 'Shiro', status: 'unverified' }, // 2xko:SHIRO · sf6:Shiro · tekken:Shiro
  { key: 'snakeeyez', display: 'Snake Eyez', status: 'confirmed' }, // 2xko:SNAKEEYEZ · sf6:Snake Eyez · tokon:Snake eyez
  { key: 'sonicfox', display: 'SonicFox', status: 'confirmed' }, // 2xko/sf6/tokon:SonicFox · tekken:Sonicfox
  { key: 'zaidi', display: 'Zaidi', status: 'confirmed' }, // 2xko:ZAIDI · sf6:Zaidi · tokon:ZAIDI
];

/**
 * key → canonical spelling, confirmed entries only.
 *
 * An entry whose `display` does not normalise back to its `key` is DROPPED, not
 * corrected: that is the invariant that keeps this incapable of renaming
 * anyone, and silently repairing a violation would defeat it. Reported once so
 * a bad edit is visible rather than merely inert.
 */
const CANONICAL: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  const rejected: string[] = [];
  for (const e of IDENTITIES) {
    if (e.status !== 'confirmed') continue;
    if (identityKey(e.display) !== e.key) {
      rejected.push(`${e.key} → ${e.display}`);
      continue;
    }
    m.set(e.key, e.display);
  }
  if (rejected.length) {
    console.warn(
      `[playerIdentity] ${rejected.length} entry(s) ignored — display must restyle the same ` +
        `letters as its key: ${rejected.join(', ')}`,
    );
  }
  return m;
})();

/**
 * The shared spelling for a handle, or undefined when there is none.
 *
 * Undefined for an unknown handle AND for anything `unverified` — for a common
 * word like "Mystic" the honest answer is "no shared spelling", not a guess.
 */
export function canonicalPlayerHandle(handle: string): string | undefined {
  return CANONICAL.get(identityKey(handle));
}

/** Every entry, for tooling that wants to show what is and is not resolved. */
export function playerIdentities(): readonly PlayerIdentity[] {
  return IDENTITIES;
}
