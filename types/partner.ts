/**
 * A site we deliberately send visitors to (additive, v0.12.0).
 *
 * The registry itself is `PARTNERS` in app/utils/partners.ts — a platform
 * constant rather than GameConfig, because a partner's name and description are
 * the same on all four game sites and only the per-game URL varies.
 */
export interface PartnerSite {
  /** display name — the dialog title's CTA and the nav item, e.g. 'ComboForge' */
  name: string;
  /** completes the sentence "<name> …", so it reads as one line in the dialog.
   *  Mirrors how ComboForge describes us on their side of the link. */
  blurb: string;
}
