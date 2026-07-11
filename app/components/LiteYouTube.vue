<script setup lang="ts">
// Lite-YouTube facade: thumbnail + play button first; the youtube-nocookie
// iframe is injected only on click, with the BrandSpinner as the pending
// indicator until the embed document loads. Grid cards never render this.
const props = defineProps<{ videoId: string; thumbnail?: string | null; title?: string }>();

const playing = ref(false);
const loaded = ref(false);

const embedSrc = computed(
  () => `https://www.youtube-nocookie.com/embed/${props.videoId}?autoplay=1&rel=0`,
);

watch(
  () => props.videoId,
  () => {
    playing.value = false;
    loaded.value = false;
  },
);
</script>

<template>
  <div
    class="relative aspect-video overflow-hidden border-b border-border-subtle"
    style="
      background: radial-gradient(circle at 50% 40%, var(--color-surface-raised), var(--color-bg));
    "
  >
    <template v-if="playing">
      <span
        v-if="!loaded"
        class="absolute inset-0 flex items-center justify-center"
        data-testid="embed-pending"
      >
        <BrandSpinner :size="64" label="Loading player" />
      </span>
      <iframe
        :src="embedSrc"
        class="absolute inset-0 h-full w-full border-0"
        :title="title ?? 'YouTube video'"
        allow="
          accelerometer;
          autoplay;
          clipboard-write;
          encrypted-media;
          gyroscope;
          picture-in-picture;
          web-share;
        "
        allowfullscreen
        @load="loaded = true"
      />
    </template>
    <button
      v-else
      type="button"
      class="group absolute inset-0 block h-full w-full cursor-pointer"
      :aria-label="`Play — ${title ?? 'replay'}`"
      @click="playing = true"
    >
      <img
        v-if="thumbnail"
        :src="thumbnail"
        :alt="title ?? ''"
        class="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
      <span class="absolute inset-0 flex items-center justify-center bg-bg/20">
        <span
          class="play-glow flex h-[72px] w-[72px] items-center justify-center rounded-full bg-primary transition-transform duration-normal ease-snap group-hover:scale-105"
        >
          <span
            class="ml-[5px] h-0 w-0 border-y-[13px] border-l-[21px] border-y-transparent border-l-primary-contrast"
          />
        </span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.play-glow {
  box-shadow: 0 8px 30px color-mix(in srgb, var(--color-primary) 50%, transparent);
}
</style>
