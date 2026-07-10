<script setup lang="ts">
/** Per-player detail stub. Fleshed out in Phase 2. */
const route = useRoute();
const game = useGame();
const { data: players } = usePlayers();

const player = computed(() =>
  (players.value ?? []).find((p) => p.id === route.params.id),
);
const extra = computed(() => Object.entries(player.value?.extra ?? {}));

useHead({ title: () => `${player.value?.handle ?? 'Player'} · ${game.name}` });
</script>

<template>
  <div v-if="player" class="space-y-5">
    <NuxtLink to="/players" class="font-mono text-2xs text-text-muted hover:text-text"
      >← Players</NuxtLink
    >
    <div class="flex items-center gap-3">
      <h1 class="font-display text-3xl font-black text-text">{{ player.handle }}</h1>
      <span
        v-if="player.featured"
        class="rounded-xs bg-primary px-1.5 py-0.5 text-2xs font-semibold text-primary-contrast"
        >Featured</span
      >
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
  <p v-else class="text-sm text-text-muted">Player not found.</p>
</template>
