import type { Replay, Side } from '@engine/types';

/**
 * The video modal's open state lives in `?v=<replayId>`:
 *  - open() pushes (Back closes the modal naturally)
 *  - close() pops the entry we pushed, or strips the param for direct loads
 *  - swap() replaces in place (related-replay clicks don't grow history)
 *
 * Related ranking, generalized from the shipped duo logic:
 *  - multi-character sides → same SIDE-COMBO first (a side fielding the same
 *    sorted character list — the 2XKO "team pairing");
 *  - 1v1 → same MATCHUP first (the same two characters opposing);
 *  - then replays sharing a player; newest first within each group.
 */
export function useVideoModal() {
  const route = useRoute();
  const router = useRouter();
  const { replays, pending, byId } = useReplays();
  // whether the current ?v= was pushed by us in-session (vs. loaded directly)
  const pushedInSession = useState('video-modal-pushed', () => false);

  const openId = computed(() => (typeof route.query.v === 'string' ? route.query.v : null));
  const replay = computed<Replay | null>(() =>
    openId.value ? (byId(openId.value) ?? null) : null,
  );

  const query = (patch: { v?: string }) => {
    const q: Record<string, string> = {};
    for (const [k, val] of Object.entries(route.query)) {
      if (k === 'v') continue;
      if (typeof val === 'string' && val !== '') q[k] = val;
    }
    if (patch.v) q.v = patch.v;
    return q;
  };

  function open(id: string) {
    pushedInSession.value = true;
    router.push({ query: query({ v: id }) });
  }
  function close() {
    if (pushedInSession.value) {
      pushedInSession.value = false;
      router.back();
    } else {
      router.replace({ query: query({}) });
    }
  }
  function swap(id: string) {
    router.replace({ query: query({ v: id }) });
  }

  /** Signature keys: sorted side-combos (multi) or the cross-side matchup (1v1). */
  const signaturesOf = (r: Replay): string[] => {
    const multi = r.sides
      .filter((s: Side) => s.characters.length > 1)
      .map((s: Side) => [...s.characters].sort().join('|'));
    if (multi.length) return multi;
    const a = r.sides[0].characters[0];
    const b = r.sides[1].characters[0];
    return a && b ? [[a, b].sort().join('~')] : [];
  };

  /** Same signature first, then shared players; newest first within each group. */
  const related = computed<Replay[]>(() => {
    const cur = replay.value;
    if (!cur) return [];
    const sigs = new Set(signaturesOf(cur));
    const people = new Set(cur.sides.flatMap(sidePlayers));
    const bySignature: Replay[] = [];
    const byPlayer: Replay[] = [];
    for (const r of replays.value) {
      if (r.id === cur.id) continue;
      if (sigs.size && signaturesOf(r).some((k) => sigs.has(k))) bySignature.push(r);
      else if (r.sides.some((s) => sidePlayers(s).some((p) => people.has(p)))) byPlayer.push(r);
    }
    const newest = (a: Replay, b: Replay) => b.date.localeCompare(a.date);
    return [...bySignature.sort(newest), ...byPlayer.sort(newest)].slice(0, RELATED_LIMIT);
  });

  return { openId, replay, pending, open, close, swap, related };
}
