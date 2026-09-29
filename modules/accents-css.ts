import { addTemplate, defineNuxtModule } from 'nuxt/kit';
import { loadMergedGameConfig } from '../lib/game-config';

/**
 * PER-CHARACTER ACCENTS, as `--accent-<characterId>` CSS variables from
 * GameConfig.accents (PLAN.md §4b). Accents are the ONE place a game's palette
 * reaches components by character id; everything else is a semantic token.
 * Components read `var(--accent-<id>)` (never a raw hex — see accentVar() in
 * app/utils/format.ts), so this module is the sole bridge from config → CSS.
 *
 * INTO THE SHARED STYLESHEET, NOT THE PAGE. Until v0.16.0 a plugin
 * (app/plugins/accents.ts) put them in every page's <head> as an inline
 * `<style id="engine-accents">` — up to ~1 KB of the same declarations, 34 of
 * them on GGST, repeated in every prerendered file of a build that writes one
 * file per player. Written here as a build template and added to `css`, they
 * compile into the one entry stylesheet every page already links: fetched once,
 * cached, and still present before first paint, which is what the inline block
 * was for.
 *
 * FIRST in `css`, because the inline block came before every stylesheet: a game
 * theme that defined an --accent-* of its own (none does today) keeps winning.
 *
 * Ids are slugs, but only CSS-identifier-safe characters are kept, the same
 * sanitizer as accentSafeId() in app/utils/format.ts.
 */
export default defineNuxtModule({
  meta: { name: 'replay-engine:accents-css' },
  setup(_options, nuxt) {
    const template = addTemplate({
      filename: 'engine-accents.css',
      write: true,
      async getContents() {
        const game = await loadMergedGameConfig(nuxt);
        const entries = Object.entries(game?.accents ?? {});
        if (!entries.length) return '';
        const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-');
        const declarations = entries.map(([id, hex]) => `--accent-${safeId(id)}:${hex};`).join('');
        return `:root{${declarations}}\n`;
      },
    });
    nuxt.options.css.unshift(template.dst);
  },
});
