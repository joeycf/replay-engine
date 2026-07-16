<script setup lang="ts">
// The designed 404/error content. The "No data at this route" heading doubles
// as the marker string the static-artifacts module asserts when it copies the
// prerendered /not-found page over the host's 404.html — keep them in sync.
withDefaults(defineProps<{ code?: number; message?: string }>(), {
  code: 404,
  message: undefined,
});

const terms = useGameTerms();
const back = () => clearError({ redirect: '/' });
</script>

<template>
  <section class="mx-auto max-w-2xl px-6 py-20 text-center md:py-28">
    <div
      class="mx-auto flex h-24 w-24 items-center justify-center bg-primary cut-md"
      aria-hidden="true"
    >
      <span class="font-display text-[26px] font-bold text-primary-contrast">{{ code }}</span>
    </div>
    <h1 class="mt-7 font-display text-d2 font-bold text-text">
      {{ code === 404 ? 'No data at this route' : 'Something broke the combo' }}
    </h1>
    <p class="mt-3 font-mono text-[12px] text-text-muted">
      {{ message ?? `That ${terms.character}, player, or page isn’t in the database.` }}
    </p>
    <button
      type="button"
      class="mt-8 cursor-pointer bg-primary px-5 py-3 font-ui text-[14px] font-bold text-primary-contrast cut-bl-lg"
      @click="back"
    >
      Back to Browse
    </button>
  </section>
</template>
