<script setup lang="ts">
// The two-letter character badge (generalizes the shipped ChampBadge).
// Accent tint resolves through the injected --accent-<id> variable
// (plugins/accents.ts) via accentGradient() — never a raw hex. Full-name
// tooltip on hover-capable pointers via the shared HoverTip build.
import type { Character } from '@engine/types';

const props = withDefaults(
  defineProps<{
    characterId?: string | null;
    /** square size in px (design: 20 related · 28 card · 30 mobile card · 38 drawer · 44 modal) */
    size?: number;
    /** corner-cut notch in px */
    notch?: number;
    /** override the auto (≈ size × 0.39) initials font size */
    fontSize?: number;
    /** modal variant: heavier border */
    strong?: boolean;
  }>(),
  {
    characterId: null,
    size: 28,
    notch: 7,
    fontSize: undefined,
    strong: false,
  },
);

const { byId } = useCharacters();
const { tip, showTip, hideTip } = useHoverTip<Character>({ clampX: 70 });

const character = computed(() => (props.characterId ? byId(props.characterId) : undefined));
const initials = computed(() => (character.value ? characterInitials(character.value) : '?'));
const style = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  background: props.characterId ? accentGradient(props.characterId) : 'var(--color-surface-raised)',
  fontSize: `${props.fontSize ?? Math.round(props.size * 0.39)}px`,
  clipPath:
    props.notch > 0
      ? `polygon(0 0, calc(100% - ${props.notch}px) 0, 100% ${props.notch}px, 100% 100%, ${props.notch}px 100%, 0 calc(100% - ${props.notch}px))`
      : undefined,
}));
</script>

<template>
  <span
    class="flex flex-none items-center justify-center font-display font-bold text-bg"
    :class="strong ? 'border-[1.5px] border-border' : 'border border-border'"
    :style="style"
    :aria-label="character?.name"
    @mouseenter="character && showTip($event, character)"
    @mouseleave="hideTip"
  >
    {{ initials }}
    <!-- teleports to body; only a placeholder stays in the span, keeping it
         the single root so caller attrs (class, etc.) still fall through -->
    <HoverTip :tip="tip">
      <span
        v-if="tip"
        class="font-ui text-[12px] font-semibold"
        :style="{ color: accentVar(tip.data.id, 'var(--color-primary)') }"
        >{{ tip.data.name }}</span
      >
    </HoverTip>
  </span>
</template>
