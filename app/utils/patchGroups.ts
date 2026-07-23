import type { PatchGroup } from '@engine/types';

/**
 * Pure helpers for the grouped patch facet (GameConfig.patchGroups, v0.6.0) —
 * framework-free like filterReplays, unit-tested in scripts/test-filters.mjs.
 *
 * THE URL/STATE CONTRACT: `?patch=` carries the CANONICAL (collapsed) token
 * list; FilterState.patches carries the EXPANDED list. Decode expands (a
 * parent token becomes itself + every declared child, so the untouched
 * predicate matches child-token replays AND era-token replays — "season
 * known, patch unknown"); every write collapses back. With no groups both
 * directions are the identity, which is the byte-stability guarantee for
 * apps that don't declare a hierarchy.
 *
 * collapsePatchTokens expects EXPANDED input (state, or expand() of a URL).
 * That makes one deliberate asymmetry safe: a bare parent token WITH declared
 * children but zero selected children collapses away — the only way that
 * shape arises is unchecking a group's last child, where clearing the group
 * is the intent. A parent-intent selection always passes through expansion
 * first and therefore keeps its children.
 */

const childIds = (g: PatchGroup): string[] => (g.children ?? []).map((c) => c.id);

/** URL → state: parent tokens become themselves + all declared children;
 *  child/unknown tokens pass through. Deduped, order-preserving. */
export function expandPatchTokens(tokens: string[], groups: PatchGroup[]): string[] {
  if (!groups.length) return tokens;
  const byId = new Map(groups.map((g) => [g.id, g]));
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };
  for (const token of tokens) {
    push(token);
    const group = byId.get(token);
    if (group) for (const id of childIds(group)) push(id);
  }
  return out;
}

/** State → URL: canonical form. Per group in declared order: all declared
 *  children selected → the parent token alone; a partial selection → its
 *  child tokens (a stale bare parent token is dropped); zero selected
 *  children → nothing (see the header note); childless parents pass through.
 *  Tokens outside every group trail in first-seen order. */
export function collapsePatchTokens(tokens: string[], groups: PatchGroup[]): string[] {
  if (!groups.length) return tokens;
  const selected = new Set(tokens);
  const grouped = new Set<string>();
  const out: string[] = [];
  for (const g of groups) {
    grouped.add(g.id);
    const kids = childIds(g);
    kids.forEach((id) => grouped.add(id));
    if (!kids.length) {
      if (selected.has(g.id)) out.push(g.id);
    } else {
      const picked = kids.filter((id) => selected.has(id));
      if (picked.length === kids.length) out.push(g.id);
      else out.push(...picked);
    }
  }
  return [...out, ...tokens.filter((t) => !grouped.has(t))];
}

export type PatchGroupSelection = 'none' | 'some' | 'all';

/** Tri-state of one group against the EXPANDED selection, judged over the
 *  children actually present in the data (presentTokens = options.patches) —
 *  the UI truth. Childless parents are binary: their own token in/out. */
export function patchGroupState(
  group: PatchGroup,
  expandedTokens: string[],
  presentTokens: string[],
): { state: PatchGroupSelection; selected: number; total: number } {
  const kids = childIds(group).filter((id) => presentTokens.includes(id));
  if (!kids.length) {
    const on = expandedTokens.includes(group.id);
    return { state: on ? 'all' : 'none', selected: 0, total: 0 };
  }
  const selected = kids.filter((id) => expandedTokens.includes(id)).length;
  return {
    state: selected === 0 ? 'none' : selected === kids.length ? 'all' : 'some',
    selected,
    total: kids.length,
  };
}

/** The parent (era) token of a CHILD token, else null. */
export function parentOfPatchToken(token: string, groups: PatchGroup[]): string | null {
  for (const g of groups) if (childIds(g).includes(token)) return g.id;
  return null;
}

/** Display parts for a patch token: ['S2', '1.2.1'] for a child, [token]
 *  for parents/unknowns — and the identity with no groups (byte-stable). */
export function patchTokenParts(token: string, groups: PatchGroup[]): string[] {
  const parent = parentOfPatchToken(token, groups);
  return parent ? [parent, token] : [token];
}

/** Data tokens no group accounts for (stale-boundaries fallback): rendered
 *  as trailing plain chips so fresh data stays reachable before the group
 *  table catches up. */
export function ungroupedPatchTokens(presentTokens: string[], groups: PatchGroup[]): string[] {
  const known = new Set<string>();
  for (const g of groups) {
    known.add(g.id);
    childIds(g).forEach((id) => known.add(id));
  }
  return presentTokens.filter((t) => !known.has(t));
}
