import type { PartnerSite } from '@engine/types';

/**
 * The partner registry (additive, v0.12.0) — every site we deliberately send
 * visitors to, and the words the leaving-site dialog says about it.
 *
 * A PLATFORM constant, not GameConfig: a partner's name and blurb read the same
 * on all four game sites, and the only per-game part is the URL, which the
 * partner's own composable owns (useComboForge().hubHref / targetFor()).
 *
 * ADDING A COLLABORATION is one entry here plus `confirm()` on the link — see
 * README "Partner links and the leaving-site dialog". The dialog is deliberately
 * partner-only: the YouTube watch links and the Buy Me a Coffee link stay plain,
 * because interrupting a visitor who just clicked "Watch on YouTube" is friction,
 * not care.
 */
export const PARTNERS = {
  comboforge: {
    name: 'ComboForge',
    // reads as "ComboForge is our partner combo database." — the mirror of the
    // line ComboForge already carries about us ("Replay Database is our partner
    // archive of recorded FGC matches.")
    blurb: 'is our partner combo database.',
  },
} as const satisfies Record<string, PartnerSite>;
