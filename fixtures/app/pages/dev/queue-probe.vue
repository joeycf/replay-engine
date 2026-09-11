<template>
  <section class="mx-auto w-full max-w-[900px] px-4 py-8 md:px-[26px]">
    <p class="font-mono text-label uppercase text-text-muted">Diagnostic — dev only</p>
    <h1 class="mt-1 font-display text-d2 font-bold text-text">Review queue probe</h1>
    <p class="mt-2 max-w-[720px] font-ui text-body text-text-secondary">
      The engine's own check that a layer can ship server code and that the
      <span class="font-mono text-text">/dev</span> index can read a queue's counts off it. The
      numbers below come from
      <span class="font-mono text-text">@engine/server/utils/reviewQueue</span> partitioning four
      synthetic rows; the index card for this page should agree with them.
    </p>

    <pre
      v-if="data"
      class="mt-6 overflow-x-auto border border-border-subtle bg-surface p-4 font-mono text-[12px] text-text-secondary"
      >{{ JSON.stringify(data, null, 2) }}</pre>
    <p
      v-else
      class="mt-6 font-mono text-[12px] text-danger"
    >
      {{ error?.message ?? 'no payload' }}
    </p>
  </section>
</template>

<script setup lang="ts">
// Dev-only, like every /dev surface. Exists so the engine can verify its own
// v0.14.0 contract without a game app: the route proves a layer server util
// resolves, and this page's `queue` key proves the index renders the counts.
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' });
}

definePageMeta({
  devTool: {
    title: 'Review queue probe',
    category: 'Diagnostic',
    description: "The engine's own check that a layer server util resolves and partitions.",
    queue: '/api/dev/queue-probe',
  },
});

const { data, error } = await useFetch('/api/dev/queue-probe');
</script>
