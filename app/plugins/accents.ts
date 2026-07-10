/**
 * Injects per-character accent colors as `--accent-<characterId>` CSS variables
 * from GameConfig.accents (PLAN.md §4b). Accents are the ONE place a game's
 * palette reaches components by character id; everything else is a semantic
 * token. Components read `var(--accent-<id>)` (never a raw hex), so this plugin
 * is the sole bridge from config → CSS.
 *
 * Injected via useHead (SSR-safe: no document access) so the variables are
 * present in the prerendered HTML, not just after hydration.
 */
export default defineNuxtPlugin(() => {
  const game = useGame();
  const entries = Object.entries(game.accents ?? {});
  if (!entries.length) return;

  // SSR-safe: character ids are slugs; keep only CSS-identifier-safe chars
  // (CSS.escape is a browser-only global and would crash the server render).
  const safeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const declarations = entries
    .map(([id, hex]) => `--accent-${safeId(id)}:${hex};`)
    .join('');

  useHead({
    style: [{ id: 'engine-accents', innerHTML: `:root{${declarations}}` }],
  });
});
