<template>
  <NotFoundContent />
</template>

<script setup lang="ts">
// The static host's not-found document: prerendered here, then copied over
// nitro's SPA-fallback 404.html by the engine's static-artifacts module
// (games inherit it with zero per-app scripting). Client-side unknown
// navigations go through the [...slug] catch-all → error.vue instead, which
// shows the same content.
useHead({
  title: `404 — ${useBrandName()}`,
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>
