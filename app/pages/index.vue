<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <ClientOnly>
      <FilterBar
        :filters="f"
        class="hidden md:block"
      />
      <ActiveChips :filters="f" />

      <!-- grid -->
      <div
        v-if="pending"
        class="grid grid-cols-1 gap-4 px-4 pb-[30px] pt-[22px] sm:grid-cols-2 md:px-[26px] lg:grid-cols-3 xl:grid-cols-4"
      >
        <BrowseCardSkeleton
          v-for="i in 12"
          :key="i"
        />
      </div>
      <template v-else-if="f.filtered.value.length">
        <div
          class="grid grid-cols-1 gap-4 px-4 pb-[30px] pt-[22px] sm:grid-cols-2 md:px-[26px] lg:grid-cols-3 xl:grid-cols-4"
        >
          <BrowseCard
            v-for="r in shown"
            :key="r.id"
            :replay="r"
          />
        </div>
        <div
          v-if="shown.length < f.filtered.value.length"
          ref="sentinel"
          class="h-px"
          aria-hidden="true"
        />
      </template>
      <BrowseEmpty v-else />

      <FilterDrawer :filters="f" />
      <VideoModal />

      <!-- prerendered fallback: static skeletons (cards arrive client-side; SEO
           lives on the character/player/stats pages) -->
      <template #fallback>
        <div class="border-b border-border-subtle bg-surface-sunken/60 px-4 py-[13px] md:px-[26px]">
          <span class="font-mono text-[13px] text-text-secondary">Loading replays…</span>
        </div>
        <div
          class="grid grid-cols-1 gap-4 px-4 pb-[30px] pt-[22px] sm:grid-cols-2 md:px-[26px] lg:grid-cols-3 xl:grid-cols-4"
        >
          <BrowseCardSkeleton
            v-for="i in 8"
            :key="i"
          />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { withBase } from 'ufo';
// Browse — the design's 1A Broadcast Grid: filter bar → active chips + count →
// infinite-scroll card grid, with the mobile drawer and the video modal.
// Everything inside ClientOnly (replays are client-fetched); the prerendered
// fallback shows static skeletons — SEO lives on the registry pages.
const game = useGame();
const terms = useGameTerms();
const { pending } = useReplays();
const { totals } = useStatsRows();
const f = useFilters();

const visible = ref(GRID_PAGE_SIZE);
const sentinel = ref<HTMLElement | null>(null);
let io: IntersectionObserver | undefined;

const shown = computed(() => f.filtered.value.slice(0, visible.value));

watch(f.filterKey, () => {
  visible.value = GRID_PAGE_SIZE;
});
watch(sentinel, (el) => {
  if (!io) return;
  io.disconnect();
  if (el) io.observe(el);
});

onMounted(() => {
  io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (visible.value >= f.filtered.value.length) return;
      visible.value += GRID_PAGE_SIZE;
      // re-observe so a still-visible sentinel emits a fresh intersection record
      nextTick(() => {
        const el = sentinel.value;
        if (el && io) {
          io.unobserve(el);
          io.observe(el);
        }
      });
    },
    { rootMargin: '600px 0px' },
  );
  if (sentinel.value) io.observe(sentinel.value);
});
onBeforeUnmount(() => io?.disconnect());

useSiteMeta({
  title: `Browse — ${useBrandName()}`,
  description: `Browse ${totals.value.replays.toLocaleString('en-US')} competitive ${game.name} replays — filter by ${terms.character}, matchup, player, ${terms.patch}, and ${terms.source}.`,
});

// The site-wide WebSite (+SearchAction to Browse's real ?q= param) and
// Organization nodes, absolute via siteUrl + base. HOME PAGE ONLY: Google reads
// both from the home page, and while plugins/seo.ts emitted them they sat in
// every page's <head> — ~620 B in each prerendered file (v0.16.0).
const brand = useBrandName();
const site = useSiteOrigin();
const base = useRuntimeConfig().app.baseURL;
const abs = (path: string) => `${site}${withBase(path, base)}`;
useJsonLd([
  {
    '@type': 'WebSite',
    name: brand,
    url: `${abs('/')}`,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${abs('/')}?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  },
  {
    '@type': 'Organization',
    name: brand,
    url: `${abs('/')}`,
    logo: abs('/icons/favicon-512.png'),
  },
]);
</script>
