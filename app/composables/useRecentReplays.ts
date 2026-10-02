import type { RecentReplay } from '@engine/types';

interface RecentIndex {
  recent: RecentReplay[];
  recentByCharacter: Record<string, RecentReplay[]>;
}

/**
 * The newest replays — site-wide, or for one character — as PRERENDERED data
 * (v0.18.0). Resolved at generate time from the build template that
 * modules/replay-index.ts writes, inlined into the page payload, and read back
 * from it on hydration; it is what the Browse and character pages show in
 * place of skeletons until the client's replays.json fetch resolves.
 *
 * Server only, deliberately: the handler returns nothing on the client, so a
 * client-side navigation never downloads the index (the replays fetch is
 * already cached by then and the list would be replaced on arrival anyway),
 * and the dynamic import is dead code in the client bundle.
 */
export function useRecentReplays(characterId?: string): Ref<RecentReplay[]> {
  const key = characterId ? `recent:${characterId}` : 'recent';
  const { data } = useAsyncData<RecentReplay[]>(
    key,
    async () => {
      if (!import.meta.server) return [];
      const index = (await import('#build/replay-engine/recent.json')).default as RecentIndex;
      return characterId ? (index.recentByCharacter[characterId] ?? []) : index.recent;
    },
    { default: () => [] },
  );
  return data as Ref<RecentReplay[]>;
}
