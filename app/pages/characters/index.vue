<template>
  <section class="mx-auto max-w-6xl px-6 py-12">
    <h1 class="font-display text-d1 font-bold text-text">{{ capWord(terms.characters) }}</h1>
    <p class="mt-2 font-ui text-body text-text-secondary">
      {{ list.length }} {{ terms.characters }} on file — usage, pairings, and full replay histories.
    </p>
    <ul class="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
      <li
        v-for="c in list"
        :key="c.id"
      >
        <NuxtLink
          :to="terms.characterPath(c.id)"
          class="group block overflow-hidden border border-border-subtle bg-surface transition-colors cut-sm hover:border-primary/50"
        >
          <img
            v-if="c.imgPortrait && !failed.has(c.id)"
            :src="useAssetUrl(c.imgPortrait)"
            :alt="c.name"
            loading="lazy"
            class="aspect-[3/4] w-full object-cover"
            @error="markFailed(c.id)"
          />
          <div
            v-else
            class="relative grid aspect-[3/4] w-full place-items-center"
            :style="{ background: accentGradient(c.id) }"
          >
            <span class="font-display text-4xl font-black text-bg/70">{{
              characterInitials(c)
            }}</span>
          </div>
          <span
            class="block px-2 py-1.5 font-ui text-body text-text-secondary group-hover:text-text"
          >
            {{ c.name }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
// Roster grid — crawlable links into every character page. Portraits resolve
// through useAssetUrl (base-path-safe); missing art (fixtures) falls back to
// an accent-tinted placeholder.
const game = useGame();
const terms = useGameTerms();
const { list } = useCharacters();

const failed = ref(new Set<string>());
const markFailed = (id: string) => {
  failed.value.add(id);
  failed.value = new Set(failed.value);
};

useSiteMeta({
  title: `${capWord(terms.characters)} — ${useBrandName()}`,
  description: `The ${game.name} roster — usage stats${game.charactersPerSide > 1 ? ', top teammates,' : ''} top pilots, and every replay for all ${list.value.length} ${terms.characters}.`,
});
</script>
