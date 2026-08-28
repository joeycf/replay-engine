<template>
  <a
    v-if="target"
    :href="target.href"
    target="_blank"
    rel="noopener noreferrer"
    :aria-label="`${headline} on ComboForge (opens in a new tab)`"
    data-testid="comboforge-link"
    class="cf group flex items-center gap-3.5 border border-l-2 border-border-subtle bg-surface px-4 py-3.5 transition-colors duration-normal md:gap-4 md:px-5"
  >
    <img
      :src="mark"
      alt=""
      width="80"
      height="80"
      loading="lazy"
      decoding="async"
      class="h-8 w-8 flex-none md:h-9 md:w-9"
    />
    <span class="min-w-0">
      <span class="cf-word block text-[19px] leading-none tracking-wide md:text-[21px]">
        ComboForge
      </span>
      <span
        class="mt-1.5 block font-ui text-[12px] leading-snug text-text-secondary md:text-[13px]"
      >
        {{ headline }}, notation and guides<span class="hidden md:inline">
          on our partner combo database</span
        >
      </span>
    </span>
    <span
      class="cf-cta ml-auto flex-none cut-bl-md px-3 py-2 font-ui text-[12px] font-bold transition-colors duration-normal md:px-4"
    >
      <span class="hidden md:inline">Browse combos ↗</span>
      <span class="md:hidden">Combos ↗</span>
    </span>
  </a>
</template>

<script setup lang="ts">
/**
 * The ComboForge partner band on a character page (additive, v0.11.0).
 *
 * Renders nothing unless the game declares GameConfig.comboforge — the same
 * empty-by-default stance as the GameStatsPanels / GameCharacterPanels slots,
 * so a game on an older pin (or one ComboForge doesn't cover) is unaffected.
 *
 * The CHASSIS is ours — surface, border, the bottom-left corner cut, the type
 * scale — so the band sits in the page rhythm. The IDENTITY is theirs: their
 * hammer, their Impact-italic wordmark, their orange. A visitor should read it
 * as "another site, linked from here", not as one of our own panels.
 */
const props = defineProps<{ characterId: string; characterName: string }>();

const game = useGame();
const { targetFor } = useComboForge();
const target = computed(() => targetFor(props.characterId));

/** Character combos when ComboForge carries them, the game's otherwise. */
const headline = computed(() =>
  target.value?.character ? `${props.characterName} combos` : `${game.name} combos`,
);

// Engine public/ merges into every consuming app, but the URL still needs the
// base — the shell serves each game under a subpath (PLAN §11 base-path traps).
const mark = useAssetUrl('/partners/comboforge.webp');
</script>

<style scoped>
/* ComboForge's OWN brand values, as literal hex and a literal font stack.
   This is the one sanctioned exception to the engine's no-raw-hex /
   no-literal-font rule (PLAN §4b): a partner's wordmark has to render
   identically on all four game sites, so these must NOT be theme tokens that a
   game's theme.css could retint. Transcribed from comboforge.gg's own
   --color-primary-500 / --color-primary-400 and --font-display. */
.cf {
  --cf: #f97316;
  --cf-hi: #fb923c;
  border-left-color: var(--cf);
}
.cf:hover {
  border-color: color-mix(in srgb, var(--cf) 40%, var(--color-border-subtle));
  border-left-color: var(--cf-hi);
}
.cf-word {
  font-family: Impact, 'Arial Black', 'Arial Narrow', sans-serif;
  font-style: italic;
  text-transform: uppercase;
  color: var(--cf);
}
.cf-cta {
  background: var(--cf);
  /* their own on-orange ink: near-black, not our themed primary-contrast */
  color: #1a1206;
}
.cf:hover .cf-cta {
  background: var(--cf-hi);
}
</style>
