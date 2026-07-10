<script setup lang="ts">
/** Per-character detail stub. Renders the generic `extra` key/value strip
 *  (PLAN.md §3) so game-specific metadata shows without the engine reasoning
 *  about it. Fleshed out in Phase 2. */
const route = useRoute();
const game = useGame();
const { data: characters } = useCharacters();

const character = computed(() => (characters.value ?? []).find((c) => c.id === route.params.id));
const accent = computed(() => `var(--accent-${route.params.id as string}, var(--color-primary))`);
const extra = computed(() => Object.entries(character.value?.extra ?? {}));

useHead({ title: () => `${character.value?.name ?? 'Character'} · ${game.name}` });
</script>

<template>
  <div v-if="character" class="space-y-5">
    <NuxtLink to="/characters" class="font-mono text-2xs text-text-muted hover:text-text"
      >← Characters</NuxtLink
    >
    <div class="flex items-center gap-3">
      <span class="size-4 rounded-full" :style="{ backgroundColor: accent }" />
      <h1 class="font-display text-3xl font-black text-text">{{ character.name }}</h1>
    </div>
    <dl
      v-if="extra.length"
      class="corner-cut divide-y divide-border-subtle border border-border bg-surface text-sm"
    >
      <div
        v-for="[k, v] in extra"
        :key="k"
        class="flex items-center justify-between gap-4 px-4 py-2"
      >
        <dt class="font-mono text-2xs text-text-muted">{{ k }}</dt>
        <dd class="text-right text-text">{{ v }}</dd>
      </div>
    </dl>
  </div>
  <p v-else class="text-sm text-text-muted">Character not found.</p>
</template>
