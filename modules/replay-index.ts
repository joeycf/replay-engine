import { addTemplate, defineNuxtModule } from 'nuxt/kit';
import { loadReplayIndex } from '../lib/replay-index';

/**
 * THE RECENT-REPLAYS TEMPLATE (v0.18.0): `#build/replay-engine/recent.json`,
 * the newest records overall and per character, derived once from the app's
 * replays.json by lib/replay-index.ts. useRecentReplays() imports it on the
 * SERVER ONLY, so the Browse and character pages prerender real replay text
 * (title, players, characters, patch, date) in place of "Loading replays…",
 * while the client bundle never carries the file — the client's own fetch of
 * replays.json supersedes the list the moment it resolves.
 */
export default defineNuxtModule({
  meta: { name: 'replay-engine:replay-index' },
  setup(_options, nuxt) {
    addTemplate({
      filename: 'replay-engine/recent.json',
      write: true,
      getContents() {
        const { recent, recentByCharacter } = loadReplayIndex(nuxt);
        return JSON.stringify({ recent, recentByCharacter });
      },
    });
  },
});
