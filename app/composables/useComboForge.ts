/**
 * ComboForge cross-link resolution (additive, v0.11.0).
 *
 * ComboForge (https://comboforge.gg) is a combo database covering every game on
 * this platform, and it already links to us — its bundle carries a partner
 * registry mapping its game ids to our sites. This is the return link: the ONE
 * place that knows their origin and their URL shape, so no component hardcodes
 * either.
 *
 * Their ids are not ours. The game id diverges (our 'tokon' is their
 * 'marveltokon') and their character ids are `${gameId}-${suffix}` where the
 * suffix is the FULL name kebab-cased — 'ryu' but also 'a-k-i', 'marshall-law',
 * 'alisa-bosconovitch'. GameConfig.comboforge carries the divergences; see the
 * three-state `characters` contract documented on that field in types/game.ts.
 */
const COMBOFORGE_ORIGIN = 'https://comboforge.gg';

export interface ComboForgeTarget {
  /** absolute ComboForge URL, ready for an href */
  href: string;
  /** true → deep link to this character; false → the game hub fallback */
  character: boolean;
}

export interface ComboForgeHandle {
  /** true when the current game declares a ComboForge game id */
  enabled: boolean;
  /** null when this game isn't on ComboForge at all */
  targetFor: (characterId: string) => ComboForgeTarget | null;
}

export function useComboForge(): ComboForgeHandle {
  const cf = useGame().comboforge;
  const gameId = cf?.gameId;
  if (!gameId) return { enabled: false, targetFor: () => null };

  const hub = `${COMBOFORGE_ORIGIN}/browse?gameId=${encodeURIComponent(gameId)}`;

  return {
    enabled: true,
    targetFor: (characterId: string): ComboForgeTarget => {
      const map = cf.characters ?? {};
      // `in`, not a truthiness check: an explicit null (not on ComboForge) has
      // to stay distinguishable from an absent key (derive the suffix).
      const suffix = characterId in map ? map[characterId] : characterId.replace(/_/g, '-');
      if (!suffix) return { href: hub, character: false };
      return {
        href: `${hub}&characterId=${encodeURIComponent(`${gameId}-${suffix}`)}`,
        character: true,
      };
    },
  };
}
