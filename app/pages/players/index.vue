<script setup lang="ts">
// Players index: featured players (featured flag or ≥ threshold appearances)
// as crawlable links into the prerendered profiles; the rest sit behind a
// client-side reveal so the prerendered HTML stays lean.
const { list } = usePlayers();
const { featured, rest } = useFeaturedPlayers();
const showAll = ref(false);

useSiteMeta({
  title: `Players — ${useBrandName()}`,
  description: `${list.value.length.toLocaleString('en-US')} ${useGame().name} players on file — featured competitors, most-used ${useGameTerms().characters}, and full replay histories.`,
});
</script>

<template>
  <section class="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-7">
    <h1 class="font-display text-d1 font-bold text-text">Players</h1>
    <p class="mt-2 font-ui text-body text-text-secondary">
      <span class="font-mono text-text">{{ list.length.toLocaleString('en-US') }}</span>
      players indexed —
      <span class="text-secondary">{{ featured.filter((p) => p.featured).length }} featured</span>.
      Every player has a profile; find anyone via
      <NuxtLink to="/" class="text-primary hover:underline">Browse search</NuxtLink>.
    </p>
    <h2 class="mt-8 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
      Featured players
    </h2>
    <div class="mt-3 flex flex-wrap gap-[7px]">
      <NuxtLink
        v-for="p in featured"
        :key="p.id"
        :to="`/players/${p.id}`"
        class="inline-flex items-center gap-1.5 border border-border bg-surface-raised px-[11px] py-1.5 font-ui text-[12px] font-semibold text-text transition-colors hover:border-primary/50"
      >
        <VerifiedMark v-if="p.featured" :size="10" />
        {{ p.handle }}
        <span class="font-mono text-[10px] text-text-muted">{{ p.appearances }}</span>
      </NuxtLink>
    </div>
    <h2 class="mt-8 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
      All players
    </h2>
    <button
      v-if="!showAll && rest.length"
      type="button"
      class="mt-3 h-9 cursor-pointer border border-border bg-surface-raised px-3.5 font-ui text-[12px] font-semibold text-text transition-colors hover:border-primary/50"
      @click="showAll = true"
    >
      Show {{ rest.length.toLocaleString('en-US') }} more players
    </button>
    <div v-else-if="showAll" class="mt-3 flex flex-wrap gap-[7px]">
      <NuxtLink
        v-for="p in rest"
        :key="p.id"
        :to="`/players/${p.id}`"
        :prefetch="false"
        class="inline-flex items-center gap-1.5 border border-border bg-surface-raised px-[11px] py-1.5 font-ui text-[12px] font-semibold text-text transition-colors hover:border-primary/50"
      >
        {{ p.handle }}
        <span class="font-mono text-[10px] text-text-muted">{{ p.appearances }}</span>
      </NuxtLink>
    </div>
    <p v-else class="mt-3 font-mono text-[11px] text-text-muted">Everyone on file is featured.</p>
  </section>
</template>
