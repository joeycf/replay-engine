<template>
  <!-- accessible name comes from the visible content (players, characters,
       views) — an aria-label of the raw title would mismatch it (WCAG 2.5.3) -->
  <button
    type="button"
    class="group block w-full cursor-pointer border border-border-subtle bg-surface text-left transition-[transform,border-color] duration-normal ease-snap cut-md hover:border-primary/50 motion-safe:hover:-translate-y-1"
    :data-replay-id="replay.id"
    @click="open(replay.id)"
  >
    <!-- thumbnail -->
    <div
      class="relative aspect-video overflow-hidden"
      style="
        background: repeating-linear-gradient(
          135deg,
          var(--color-surface-raised),
          var(--color-surface-raised) 9px,
          var(--color-surface) 9px,
          var(--color-surface) 18px
        );
      "
    >
      <img
        v-if="!thumbFailed"
        :src="thumb"
        alt=""
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
        @error="thumbFailed = true"
      />
      <SourceBadge
        :source="replay.source"
        class="absolute left-[9px] top-[9px]"
      />
      <span
        v-if="(replay.durationSec ?? 0) > 0"
        class="absolute bottom-[9px] right-[9px] bg-bg/80 px-[7px] py-[3px] font-mono text-[11px] text-text"
        >{{ formatDuration(replay.durationSec!) }}</span
      >
      <span
        v-if="metaLine"
        class="absolute bottom-[9px] left-[9px] hidden font-mono text-[9px] tracking-[.08em] text-text-muted sm:block"
        >{{ metaLine }}</span
      >
      <!-- hover play affordance -->
      <span
        class="absolute inset-0 flex items-center justify-center bg-bg/30 opacity-0 transition-opacity duration-normal group-hover:opacity-100 group-focus-visible:opacity-100"
      >
        <span class="play-glow flex h-11 w-11 items-center justify-center rounded-full bg-primary">
          <span
            class="ml-[3px] h-0 w-0 border-y-8 border-l-[13px] border-y-transparent border-l-primary-contrast"
          />
        </span>
      </span>
    </div>

    <!-- body -->
    <div class="px-3.5 py-[13px]">
      <!-- matchup: sides render their character lists, length-agnostic -->
      <div class="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2.5">
        <div class="flex flex-wrap items-center justify-end gap-y-1">
          <CharacterBadge
            v-for="(c, i) in left!.characters"
            :key="c"
            :character-id="c"
            :size="badge.size"
            :font-size="badge.font"
            :notch="badge.notch"
            :class="i > 0 ? badge.overlap : ''"
          />
          <CharacterBadge
            v-if="left!.characters.length === 0"
            :size="badge.size"
            :font-size="badge.font"
            :notch="badge.notch"
          />
        </div>
        <span class="font-display text-[12px] font-bold text-text-muted">VS</span>
        <div class="flex flex-wrap items-center justify-start gap-y-1">
          <CharacterBadge
            v-for="(c, i) in right!.characters"
            :key="c"
            :character-id="c"
            :size="badge.size"
            :font-size="badge.font"
            :notch="badge.notch"
            :class="i > 0 ? badge.overlap : ''"
          />
          <CharacterBadge
            v-if="right!.characters.length === 0"
            :size="badge.size"
            :font-size="badge.font"
            :notch="badge.notch"
          />
        </div>
      </div>

      <!-- game-badge slot (v0.3.0): per-side or unbound accent chips — the
           override owns the row markup (2XKO renders fuse tags here) -->
      <GameReplayBadges
        :replay="replay"
        context="card"
      />

      <!-- players -->
      <div class="mt-[11px] flex items-center justify-between gap-2">
        <span class="inline-flex min-w-0 items-center gap-[5px]">
          <VerifiedMark v-if="isFeatured(left)" />
          <span class="truncate font-ui text-[12.5px] font-semibold text-text">{{
            playerLabel(left)
          }}</span>
        </span>
        <span class="inline-flex min-w-0 items-center justify-end gap-[5px]">
          <span class="truncate font-ui text-[12.5px] font-semibold text-text">{{
            playerLabel(right)
          }}</span>
          <VerifiedMark v-if="isFeatured(right)" />
        </span>
      </div>

      <!-- meta -->
      <div
        class="mt-2.5 flex items-center justify-between border-t border-border-subtle pt-2.5 font-mono text-[10px] text-text-muted"
      >
        <span>{{ formatViews(replay.views ?? 0) }} views</span>
        <span>{{ relativeDate(replay.date) }}</span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
// The browse grid card — faithful port of the shipped design, generalized:
// each side renders its full characters[] (1 badge for a 1v1 game, 2+ for tag
// games) with the badge sizing following the BIGGER side; a 1fr/auto/1fr grid
// keeps VS dead-center whatever the counts. Accents via --accent-<id> only.
import type { Replay, Side } from '@engine/types';

const props = defineProps<{ replay: Replay }>();

const { open } = useVideoModal();
const { byId: playerById } = usePlayers();
const game = useGame();

// a side may be a team of people (Side.players) — join like the shipped build
const playerLabel = (s?: Side) =>
  s
    ? sidePlayers(s)
        .map((id) => playerById(id)?.handle ?? id)
        .join(' + ')
    : '';
const isFeatured = (s?: Side) => !!s && sidePlayers(s).some((id) => playerById(id)?.featured);

const left = computed<Side | undefined>(() => props.replay.sides[0]);
const right = computed<Side | undefined>(() => props.replay.sides[1]);

// Replay.id is a YouTube id per the contract — derive the thumb when the
// pipeline didn't publish one; @error hides a dead image (fixtures) and the
// striped placeholder stands.
const thumbFailed = ref(false);
const thumb = computed(
  () => props.replay.thumb ?? `https://i.ytimg.com/vi/${props.replay.id}/hqdefault.jpg`,
);

// patchGroups (v0.6.0): cards stay era-compact — a child token renders as its
// parent ("S2", not "1.2.1"); identity for parents/unknowns/non-group apps
const cardPatch = computed(() => {
  const p = props.replay.patch;
  if (!p) return p;
  return parentOfPatchToken(p, game.patchGroups ?? []) ?? p;
});
const metaLine = computed(() =>
  [cardPatch.value, ...(props.replay.sides[0].rank ? [props.replay.sides[0].rank] : [])]
    .filter(Boolean)
    .join(' · '),
);

// badge sizing follows the BIGGER side so both clusters stay visually matched:
// 2 per side is the design's 28px; unions shrink toward 21px and wrap inside
// their own grid cell (footprint over full size)
const badge = computed(() => {
  const n = Math.max(left.value?.characters.length ?? 0, right.value?.characters.length ?? 0);
  if (n <= 2) return { size: 28, font: 11, notch: 7, overlap: '-ml-[7px]' };
  if (n === 3) return { size: 24, font: 10, notch: 6, overlap: '-ml-1.5' };
  return { size: 21, font: 9, notch: 5, overlap: '-ml-[5px]' };
});
</script>

<style scoped>
.play-glow {
  box-shadow: 0 6px 22px color-mix(in srgb, var(--color-primary) 50%, transparent);
}
</style>
