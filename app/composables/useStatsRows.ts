import type { KnownStats } from '@engine/types';

/**
 * Ranked-row analytics over the provided stats (the KnownStats shape, see
 * types/stats.ts) — the port of the shipped stats derivations, patch-generic:
 * 2XKO's "eras" (beta/S0/S1/S2) become the game's patch keys, in the order the
 * pipeline emitted them (byPatchUsage key order = timeline order).
 */

export interface UsageRow {
  id: string;
  value: number;
  /** bar width %, design rule: max(4, …) for non-zero values */
  pct: number;
  rank: number;
}

export interface PairRow {
  /** sorted "a|b" key as stored in pairingUsage */
  key: string;
  a: string;
  b: string;
  value: number;
  pct: number;
  rank: number;
}

function rankRows(usage: Record<string, number>, ids: string[]): UsageRow[] {
  const rows = ids
    .map((id) => ({ id, value: usage[id] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const max = rows[0]?.value || 1;
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    pct: r.value === 0 ? 0 : Math.max(4, Math.round((r.value / max) * 100)),
  }));
}

/** Arbitrary usage record (e.g. playerCharacters[id]) → ranked UsageRow[]. */
export function toUsageRows(usage: Record<string, number> | undefined): UsageRow[] {
  const rows = Object.entries(usage ?? {})
    .map(([id, value]) => ({ id, value }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
  const max = rows[0]?.value || 1;
  return rows.map((r, i) => ({
    ...r,
    rank: i + 1,
    pct: r.value === 0 ? 0 : Math.max(4, Math.round((r.value / max) * 100)),
  }));
}

/** Arbitrary pairing record (e.g. playerPairings[id]) → ranked PairRow[]. */
export function toPairRows(pairings: Record<string, number> | undefined): PairRow[] {
  const rows = Object.entries(pairings ?? {})
    .map(([key, value]) => {
      const [a = '', b = ''] = key.split('|');
      return { key, a, b, value };
    })
    .sort((x, y) => y.value - x.value || x.key.localeCompare(y.key));
  const max = rows[0]?.value || 1;
  return rows.map((p, i) => ({
    ...p,
    rank: i + 1,
    pct: Math.max(6, Math.round((p.value / max) * 100)),
  }));
}

export function useStatsRows() {
  const { stats } = useStats();
  const { list: characters } = useCharacters();

  const characterIds = computed(() => characters.value.map((c) => c.id));
  const safeStats = computed<KnownStats>(
    () => stats.value ?? { totals: { replays: 0, characters: 0, players: 0 } },
  );

  /** Patch keys in timeline order (pipeline emission order). */
  const patches = computed(() => Object.keys(safeStats.value.byPatchUsage ?? {}));

  const usageAllTime = computed(() =>
    rankRows(safeStats.value.characterUsage ?? {}, characterIds.value),
  );
  const usageByPatch = computed(
    () =>
      new Map(
        patches.value.map((p) => [
          p,
          rankRows(safeStats.value.byPatchUsage?.[p] ?? {}, characterIds.value),
        ]),
      ),
  );

  /** ranked usage rows for a patch key, or all-time when null */
  const usageFor = (patch: string | null): UsageRow[] =>
    patch === null ? usageAllTime.value : (usageByPatch.value.get(patch) ?? []);

  const pairsRanked = computed<PairRow[]>(() => toPairRows(safeStats.value.pairingUsage));
  const maxPairing = computed(() => pairsRanked.value[0]?.value ?? 1);

  const pairCount = (a: string, b: string): number =>
    safeStats.value.pairingUsage?.[[a, b].sort().join('|')] ?? 0;

  /** heatmap cell alpha per the design: 0.05 + intensity × 0.9 (0.03 floor for zero) */
  const pairingAlpha = (a: string, b: string): number => {
    if (a === b) return 0;
    const n = pairCount(a, b);
    return n === 0 ? 0.03 : Math.min(0.95, 0.05 + (n / maxPairing.value) * 0.9);
  };

  /** All pairings featuring a character, re-normalized to the subset max. */
  const pairsFor = (characterId: string): PairRow[] => {
    const subset = pairsRanked.value.filter((p) => p.a === characterId || p.b === characterId);
    const max = subset[0]?.value || 1;
    return subset.map((p, i) => ({
      ...p,
      rank: i + 1,
      pct: Math.max(6, Math.round((p.value / max) * 100)),
    }));
  };

  /** patch → characterId → rank (1-based, among all characters by that patch's usage) */
  const patchRanks = computed<Record<string, Record<string, number>>>(() =>
    Object.fromEntries(
      patches.value.map((p) => [
        p,
        Object.fromEntries((usageByPatch.value.get(p) ?? []).map((r) => [r.id, r.rank])),
      ]),
    ),
  );

  return {
    stats: safeStats,
    totals: computed(() => safeStats.value.totals),
    patches,
    usageFor,
    pairsRanked,
    pairCount,
    maxPairing,
    pairingAlpha,
    pairsFor,
    patchRanks,
  };
}
