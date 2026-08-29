import type { PartnerSite } from '@engine/types';

/**
 * The leaving-site interstitial's state (additive, v0.12.0).
 *
 * Pairs with LeavingSiteDialog.vue the way useHoverTip pairs with HoverTip: the
 * composable owns the state, one mounted component renders the chrome. State
 * lives in useState (the house pattern — see useState('filter-drawer-open')),
 * never a module-scope ref, which would leak across requests on the server.
 *
 * THE LINK STAYS A LINK. Interception is a click handler on a real
 * <a href target="_blank">, never a <button>. That keeps the outbound URL in the
 * prerendered HTML for crawlers, keeps "copy link address" working, and lets the
 * modified-click gestures below reach the browser untouched. A dialog that
 * replaced the href would break all three silently.
 */
export interface PendingExternalLink {
  href: string;
  partner: PartnerSite;
}

export interface ExternalLinkHandle {
  /** the link awaiting confirmation, or null when the dialog is closed */
  pending: Ref<PendingExternalLink | null>;
  confirm: (e: MouseEvent, href: string, partner: PartnerSite) => void;
  dismiss: () => void;
}

export function useExternalLink(): ExternalLinkHandle {
  const pending = useState<PendingExternalLink | null>('external-link-pending', () => null);

  /**
   * @click handler for a partner link. Intercepts ONLY a plain left click:
   * cmd/ctrl/shift/alt and middle-click already mean "open this your way", so
   * they fall through to the browser rather than being answered with a dialog
   * the visitor did not ask for. Mirrors ComboForge's own confirmNavigation, so
   * both sides of the partnership behave identically.
   */
  function confirm(e: MouseEvent, href: string, partner: PartnerSite): void {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    pending.value = { href, partner };
  }

  function dismiss(): void {
    pending.value = null;
  }

  return { pending, confirm, dismiss };
}
