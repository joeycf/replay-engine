<script setup lang="ts">
import type { Character } from '@engine/types';

/**
 * Roster card. The portrait path comes from the data (Character.imgPortrait,
 * "path under base") and is resolved through useAssetUrl → withBase, so it is
 * base-path-safe. Until real art exists it gracefully falls back to an
 * accent-tinted placeholder (the accent is a `var(--accent-<id>)`, never a hex).
 */
const props = defineProps<{ character: Character }>();

const src = computed(() => useAssetUrl(props.character.imgPortrait));
const accent = computed(() => `var(--accent-${props.character.id}, var(--color-primary))`);
const failed = ref(false);
</script>

<template>
  <NuxtLink
    :to="`/characters/${character.id}`"
    class="corner-cut group block overflow-hidden border border-border bg-surface transition-colors duration-normal ease-standard hover:border-primary/50"
  >
    <div class="relative aspect-[3/4] w-full">
      <div class="absolute inset-0" :style="{ backgroundColor: accent, opacity: 0.18 }" />
      <img
        v-if="!failed"
        :src="src"
        :alt="character.name"
        loading="lazy"
        class="absolute inset-0 size-full object-cover"
        @error="failed = true"
      />
      <span
        v-else
        class="absolute inset-0 flex items-center justify-center font-display text-4xl font-black text-text/30"
        >{{ character.name.slice(0, 1) }}</span
      >
      <span class="absolute inset-x-0 bottom-0 h-1" :style="{ backgroundColor: accent }" />
    </div>
    <div class="p-3">
      <p class="truncate font-display text-sm font-bold text-text">{{ character.name }}</p>
      <p class="truncate font-mono text-2xs text-text-muted">{{ character.id }}</p>
    </div>
  </NuxtLink>
</template>
