<template>
  <NuxtLayout>
    <NotFoundContent
      :code="code"
      :message="code === 404 ? undefined : (error?.message ?? 'Unexpected error.')"
    />
  </NuxtLayout>
</template>

<script setup lang="ts">
import type { NuxtError } from '#app';

// App-level error page: renders the designed NotFoundContent inside the shell
// for both 404s (catch-all) and genuine errors. Provided by the LAYER —
// verified inherited by consuming apps through the fixtures build.
const props = defineProps<{ error: NuxtError }>();

const code = computed(() => props.error?.statusCode ?? 500);

useHead({
  title: `${code.value} — ${useBrandName()}`,
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>
