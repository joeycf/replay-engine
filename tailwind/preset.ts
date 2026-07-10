/**
 * tailwind/preset.ts — the canonical map from the engine's *semantic* design
 * tokens to Tailwind theme keys.
 *
 * NOTE ON TAILWIND v4: this engine runs Tailwind v4 (CSS-first) via
 * `@tailwindcss/vite`. The *active* token → utility mapping is expressed
 * directly in CSS `@theme` blocks (structural.css + theme-default.css); there
 * is no JS preset in the v4 build pipeline. This module is the typed,
 * framework-agnostic *mirror* of that mapping — a single documented source of
 * truth for tooling/tests and for any consumer still on the v3 `presets: []`
 * API. Keep it in sync with the CSS token files.
 *
 * Design leak guard (PLAN.md §11): the only color/font tokens the engine
 * exposes are these *semantic* names. Components reference `bg-surface`,
 * `text-text-muted`, `font-display`, … — never a raw hex or a literal family.
 */

/** Semantic palette tokens → CSS variables `--color-<token>`. */
export const semanticColorTokens = [
  'bg',
  'surface',
  'surface-raised',
  'border',
  'border-subtle',
  'text',
  'text-muted',
  'primary',
  'primary-contrast',
  'focus',
] as const;

/** Font-family tokens → CSS variables `--font-<token>`. */
export const fontFamilyTokens = ['display', 'ui', 'mono'] as const;

export type SemanticColorToken = (typeof semanticColorTokens)[number];
export type FontFamilyToken = (typeof fontFamilyTokens)[number];

/** Semantic name ↔ the CSS variable a Tailwind theme key resolves to. */
export const tailwindThemeMap = {
  colors: Object.fromEntries(
    semanticColorTokens.map((t) => [t, `var(--color-${t})`]),
  ) as Record<SemanticColorToken, string>,
  fontFamily: Object.fromEntries(
    fontFamilyTokens.map((t) => [t, `var(--font-${t})`]),
  ) as Record<FontFamilyToken, string>,
};

/**
 * v3-compatible preset object. Unused by the v4 pipeline; provided so a
 * consumer on Tailwind v3 could `presets: [replayEnginePreset]` and get the
 * same semantic utility surface. On v4, the CSS `@theme` blocks are authoritative.
 */
export const replayEnginePreset = {
  theme: { extend: tailwindThemeMap },
};

export default replayEnginePreset;
