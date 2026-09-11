<template>
  <span
    class="cut-bl-md inline-block overflow-hidden text-ellipsis whitespace-nowrap align-middle font-ui font-bold uppercase"
    :class="[
      size === 'sm' ? 'px-2 py-1 text-[8.5px]' : 'px-[9px] py-1 text-[9px]',
      custom ? 'tracking-[.04em]' : 'tracking-[.1em]',
      styleClass,
    ]"
    :title="tip"
    >{{ label }}</span
  >
</template>

<script setup lang="ts">
// Source-channel badge (generalizes the shipped ChannelBadge). Styling is
// deterministic by the source's index in the config: the FIRST declared source
// wears the filled-primary treatment, the second the secondary outline, later
// ones the warning outline — semantic tokens only, so every game's sources pick
// up its theme.
//
// WHAT IT PRINTS (v0.13.0). The label is the most specific attribution the
// record carries, not always the channel:
//
//   event  →  channelName  →  GameConfig.sourceChannels name  →  the raw id
//
// An INDEX source (one token covering many uploaders — see the Replay Theater
// intakes) names the catalogue, which is the one thing a viewer never wants on
// a card: "Combo Breaker 2025 Top 8" says what the footage IS, "Replay Theater"
// says who filed it. Both upper rungs are per-record, so the badge takes them
// as props rather than reading Replay — the component stays usable anywhere a
// source id and a label can be handed to it.
//
// The STYLE stays positional on the source. Every event-bearing source on the
// platform today sits at index >= 2 and already wears the warning outline, so
// preferring the label changes no colour anywhere — the smallest claim this
// could make. A label on an index-0 source keeps the filled-primary treatment,
// which verify-event-chip.mjs pins so the behaviour is documented, not found.
const props = withDefaults(
  defineProps<{
    source: string;
    event?: string;
    channelName?: string;
    size?: 'sm' | 'md';
  }>(),
  { size: 'sm', event: undefined, channelName: undefined },
);

const game = useGame();

const index = computed(() => game.sourceChannels.findIndex((s) => s.id === props.source));
const configured = computed(
  () => game.sourceChannels.find((s) => s.id === props.source)?.name ?? props.source,
);

// `||`, not `??`: an emitter that publishes `event: ''` means "no event", and
// `??` would render an empty chip — a coloured smudge over the thumbnail that
// reads as a CSS bug, on exactly the records nobody spot-checks.
const override = computed(() => (props.event ?? '').trim() || (props.channelName ?? '').trim());
const custom = computed(() => override.value.length > 0);
const label = computed(() => override.value || configured.value);

// The label REPLACES the source name, so the card stops saying where a record
// came from. The native tooltip is where that fact survives, together with the
// full text of a label the ellipsis cut — no JS, no per-card state, and it
// costs nothing on the hundreds of badges a grid renders. Absent when the chip
// already prints the configured name in full.
const tip = computed(() =>
  custom.value
    ? [override.value, props.channelName?.trim(), configured.value]
        .filter((s, i, a) => s && a.indexOf(s) === i)
        .join(' · ')
    : undefined,
);

const styleClass = computed(() =>
  index.value <= 0
    ? 'border border-transparent bg-primary text-primary-contrast'
    : index.value === 1
      ? 'border border-secondary/50 bg-secondary/15 text-secondary'
      : 'border border-warning/50 bg-warning/15 text-warning',
);
</script>
