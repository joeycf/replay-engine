<script setup lang="ts">
// Source-channel badge (generalizes the shipped ChannelBadge). The label comes
// from GameConfig.sourceChannels; styling is deterministic by the source's
// index in the config: the FIRST declared source wears the filled-primary
// treatment, the second the secondary outline, later ones the warning outline
// — semantic tokens only, so every game's sources pick up its theme.
const props = withDefaults(defineProps<{ source: string; size?: 'sm' | 'md' }>(), {
  size: 'sm',
});

const game = useGame();

const index = computed(() => game.sourceChannels.findIndex((s) => s.id === props.source));
const label = computed(
  () => game.sourceChannels.find((s) => s.id === props.source)?.name ?? props.source,
);
const styleClass = computed(() =>
  index.value <= 0
    ? 'border border-transparent bg-primary text-primary-contrast'
    : index.value === 1
      ? 'border border-secondary/50 bg-secondary/15 text-secondary'
      : 'border border-warning/50 bg-warning/15 text-warning',
);
</script>

<template>
  <span
    class="cut-bl-md whitespace-nowrap font-ui font-bold uppercase tracking-[.1em]"
    :class="[size === 'sm' ? 'px-2 py-1 text-[8.5px]' : 'px-[9px] py-1 text-[9px]', styleClass]"
    >{{ label }}</span
  >
</template>
