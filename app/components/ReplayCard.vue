<script setup lang="ts">
import type { Replay, Side } from '@engine/types';

/**
 * A single replay in the browse grid. Renders the two sides generically — one
 * character chip or many, driven purely by the data (a side's character list),
 * so 1v1 (Tekken) and 2-per-side (2XKO) both render without special-casing.
 *
 * Character chips tint from `--accent-<id>` (injected by plugins/accents.ts),
 * falling back to a neutral token — never a raw hex.
 */
const props = defineProps<{
  replay: Replay;
  charName?: Record<string, string>;
  playerHandle?: Record<string, string>;
}>();

const displayChar = (id: string) => props.charName?.[id] ?? id;
const displayPlayer = (id: string) => props.playerHandle?.[id] ?? id;
const accentVar = (id: string) => `var(--accent-${id}, var(--color-border))`;

const dateLabel = computed(() => {
  const d = new Date(props.replay.date);
  return Number.isNaN(d.getTime()) ? props.replay.date : d.toISOString().slice(0, 10);
});
</script>

<template>
  <article
    class="corner-cut flex flex-col gap-3 border border-border bg-surface p-4 shadow-sm transition-colors duration-normal ease-standard hover:border-primary/50 hover:bg-surface-raised"
  >
    <h3 class="line-clamp-2 text-sm font-semibold text-text">{{ replay.title }}</h3>

    <div class="flex items-stretch gap-2 text-xs">
      <div
        v-for="(side, i) in replay.sides"
        :key="i"
        class="flex-1 space-y-1.5"
        :class="i === 1 ? 'text-right' : ''"
      >
        <p class="truncate font-mono text-2xs text-text-muted">
          {{ displayPlayer((side as Side).player) }}
          <span
            v-if="(side as Side).rank"
            class="ml-1 rounded-xs bg-surface-raised px-1 text-text-muted"
            >{{ (side as Side).rank }}</span
          >
        </p>
        <ul class="flex flex-wrap gap-1" :class="i === 1 ? 'justify-end' : ''">
          <li
            v-for="cid in (side as Side).characters"
            :key="cid"
            class="inline-flex items-center gap-1 rounded-sm border border-border-subtle bg-bg/40 px-1.5 py-0.5 font-ui text-text"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: accentVar(cid) }"
            />
            {{ displayChar(cid) }}
          </li>
        </ul>
        <p v-if="i === 0" class="text-2xs font-semibold uppercase tracking-widest text-text-muted">
          vs
        </p>
      </div>
    </div>

    <div
      class="mt-auto flex items-center justify-between gap-2 border-t border-border-subtle pt-2 text-2xs text-text-muted"
    >
      <span class="font-mono">{{ dateLabel }}</span>
      <span v-if="replay.patch" class="rounded-xs bg-surface-raised px-1.5 py-0.5">{{
        replay.patch
      }}</span>
    </div>
  </article>
</template>
