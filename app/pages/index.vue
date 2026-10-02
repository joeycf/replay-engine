<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <!-- the one <h1> and a sentence of context in the HTML itself (v0.18.0):
         before it, the prerendered Browse page was nav + "Loading replays…" -->
    <header class="border-b border-border-subtle px-4 py-[13px] md:px-[26px]">
      <h1 class="font-display text-[15px] font-semibold text-text">
        Browse {{ totals.replays.toLocaleString('en-US') }} {{ game.name }} replays
      </h1>
      <p class="mt-0.5 font-ui text-[12px] text-text-secondary">
        Competitive {{ game.name }} matches, newest first. Filter by {{ terms.character }}, matchup,
        player, {{ terms.patch }}, and {{ terms.source }}; every {{ terms.character }} and player
        has a page of their own.
      </p>
    </header>

    <ClientOnly>
      <FilterBar
        :filters="f"
        class="hidden md:block"
      />
      <ActiveChips :filters="f" />

      <!-- grid -->
      <template v-if="pending">
        <RecentReplaysList
          v-if="recent.length"
          :items="recent"
        />
        <div
          v-else
          class="grid grid-cols-1 gap-4 px-4 pb-[30px] pt-[22px] sm:grid-cols-2 md:px-[26px] lg:grid-cols-3 xl:grid-cols-4"
        >
          <BrowseCardSkeleton
            v-for="i in 12"
            :key="i"
          />
        </div>
      </template>
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

      <!-- prerendered fallback: the newest replays as real text (the same list
           the client shows until its fetch resolves), or static skeletons when
           the app has no replays.json -->
      <template #fallback>
        <RecentReplaysList
          v-if="recent.length"
          :items="recent"
        />
        <template v-else>
          <div
            class="border-b border-border-subtle bg-surface-sunken/60 px-4 py-[13px] md:px-[26px]"
          >
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
      </template>
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import { withBase } from 'ufo';
// Browse — the design's 1A Broadcast Grid: filter bar → active chips + count →
// infinite-scroll card grid, with the mobile drawer and the video modal.
// The grid lives inside ClientOnly (replays are client-fetched). What the
// prerendered HTML carries (v0.18.0): the <h1> + intro above, and the newest
// RECENT_LIMIT replays as text — built once per generate (lib/replay-index.ts),
// read here through useRecentReplays(), shown until the client fetch resolves.
const game = useGame();
const terms = useGameTerms();
const { pending } = useReplays();
const { totals } = useStatsRows();
const f = useFilters();
const recent = useRecentReplays();

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
