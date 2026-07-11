<script setup lang="ts">
import { withBase } from 'ufo';
// Character page — design template 4a, themed with the character accent
// (via --accent-<id>, never a hex). Hero + stat rail prerender with real
// numbers from the PROVIDED registries (the SEO requirement); the replay grid
// is the same client-side replays fetch as Browse. Duo panels gate on
// charactersPerSide > 1; `extra` renders as a generic key/value strip.
const route = useRoute();
const game = useGame();
const { byId } = useCharacters();
const character = byId(String(route.params.id));
if (!character) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Character not found',
    fatal: true,
  });
}
const accent = accentVar(character.id, 'var(--color-primary)');

const { patches, usageFor, patchRanks, pairsFor, stats } = useStatsRows();
const usage = computed(
  () =>
    usageFor(null).find((r) => r.id === character.id) ?? {
      id: character.id,
      value: 0,
      pct: 0,
      rank: 0,
    },
);
const latestPatch = computed(() => patches.value[patches.value.length - 1]);
const latestRank = computed(() =>
  latestPatch.value ? (patchRanks.value[latestPatch.value]?.[character.id] ?? 0) : 0,
);
const latestCount = computed(() =>
  latestPatch.value ? (stats.value.byPatchUsage?.[latestPatch.value]?.[character.id] ?? 0) : 0,
);
const firstPatch = computed(() =>
  patches.value.find((p) => (stats.value.byPatchUsage?.[p]?.[character.id] ?? 0) > 0),
);

const showDuo = computed(() => game.charactersPerSide > 1);
const teammates = computed(() => pairsFor(character.id).slice(0, 5));

// top pilots: playerCharacters inverted, featured first
const { byId: playerById } = usePlayers();
const pilots = computed(() =>
  Object.entries(stats.value.playerCharacters ?? {})
    .map(([pid, chars]) => ({
      id: pid,
      count: chars[character.id] ?? 0,
      player: playerById(pid),
    }))
    .filter((p) => p.count > 0 && p.player)
    .sort(
      (a, b) => (b.player!.featured ? 1 : 0) - (a.player!.featured ? 1 : 0) || b.count - a.count,
    )
    .slice(0, 6),
);

// the generic key/value strip for game-specific metadata (PLAN §3 `extra`) —
// the well-known aliases key is presentation plumbing, not display content
const extraRows = computed(() =>
  Object.entries(character.extra ?? {}).filter(
    ([k, v]) => k !== 'aliases' && (typeof v === 'string' || typeof v === 'number'),
  ),
);

// replays (client fetch, same as Browse)
const { replays, pending } = useReplays();
const involved = computed(() =>
  replays.value
    .filter((r) => r.sides.some((s) => s.characters.includes(character.id)))
    .sort((a, b) => b.date.localeCompare(a.date)),
);

const splash = character.imgSplash ? useAssetUrl(character.imgSplash) : '';

useSiteMeta({
  title: `${character.name} — ${usage.value.value.toLocaleString('en-US')} appearances · ${useBrandName()}`,
  description: `${character.name} in competitive ${game.name}: usage rank #${usage.value.rank}, ${usage.value.value.toLocaleString('en-US')} replay appearances${showDuo.value ? ', top teammates' : ''}, top pilots, and every ${character.name} replay on file.`,
  image: character.imgSplash ?? undefined,
});

const site = useSiteOrigin();
const base = useRuntimeConfig().app.baseURL;
const abs = (p: string) => `${site}${withBase(p, base)}`;
useJsonLd([
  {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
      { '@type': 'ListItem', position: 2, name: 'Characters', item: abs('/characters') },
      {
        '@type': 'ListItem',
        position: 3,
        name: character.name,
        item: abs(`/characters/${character.id}`),
      },
    ],
  },
  {
    '@type': 'CollectionPage',
    name: `${character.name} — ${game.name} replay collection`,
    url: abs(`/characters/${character.id}`),
    description: `${usage.value.value.toLocaleString('en-US')} competitive ${game.name} replay appearances featuring ${character.name} (all-time usage rank #${usage.value.rank}).`,
    isPartOf: { '@type': 'WebSite', name: useBrandName(), url: abs('/') },
  },
]);
</script>

<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <!-- HERO -->
    <div class="relative h-[280px] overflow-hidden border-b border-border-subtle md:h-[340px]">
      <div
        class="absolute inset-0"
        style="
          background: repeating-linear-gradient(
            135deg,
            var(--color-surface),
            var(--color-surface) 12px,
            var(--color-bg) 12px,
            var(--color-bg) 24px
          );
        "
      />
      <img
        v-if="splash"
        :src="splash"
        alt=""
        fetchpriority="high"
        class="absolute inset-0 h-full w-full object-cover object-[70%_25%]"
      />
      <div
        class="absolute inset-0"
        :style="{
          background: `radial-gradient(80% 120% at 78% 30%, color-mix(in srgb, ${accent} 22%, transparent), transparent 60%), linear-gradient(90deg, var(--color-bg) 25%, transparent 70%)`,
        }"
      />
      <div class="absolute bottom-7 left-4 md:bottom-[34px] md:left-10">
        <div class="mb-2 flex items-center gap-3">
          <CharacterBadge
            :character-id="character.id"
            :size="52"
            :notch="11"
            :font-size="20"
            strong
          />
          <span
            v-if="latestPatch"
            class="font-ui text-[11px] font-semibold uppercase tracking-[.18em]"
            :style="{ color: accent }"
          >
            {{ latestPatch }} ·
            {{ latestRank === 1 ? 'Most picked' : `#${latestRank} most picked` }}
          </span>
        </div>
        <h1
          class="font-display text-[52px] font-bold uppercase leading-[.9] tracking-[-.02em] text-text md:text-[76px]"
          :style="{ textShadow: `0 4px 30px color-mix(in srgb, ${accent} 30%, transparent)` }"
        >
          {{ character.name }}
        </h1>
        <p class="mt-2 font-ui text-[14px] text-text-secondary md:text-[15px]">
          #{{ usage.rank }} all-time ·
          <span data-testid="character-appearances">{{ usage.value.toLocaleString('en-US') }}</span>
          appearances<template v-if="firstPatch"> · first seen {{ firstPatch }}</template>
        </p>
      </div>
    </div>

    <!-- STAT RAIL -->
    <div
      class="grid grid-cols-1 gap-4 px-4 py-[22px] md:px-7"
      :class="showDuo ? 'md:grid-cols-[1.1fr_1fr_1fr]' : 'md:grid-cols-2'"
    >
      <section
        v-if="showDuo && teammates.length"
        class="border border-border-subtle bg-surface p-5"
        :style="{ borderTop: `2px solid ${accent}` }"
      >
        <h2 class="mb-4 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          Top teammates
        </h2>
        <PairingBars :items="teammates" :limit="5" :solo-for="character.id" />
      </section>

      <section class="border border-border-subtle bg-surface p-5">
        <h2 class="mb-4 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          Top pilots
        </h2>
        <div data-testid="top-pilots" class="flex flex-col gap-[9px]">
          <!-- entity link (player profile) rather than a filtered-Browse query
               URL: profiles are prerendered pages, so link equity lands there -->
          <NuxtLink
            v-for="p in pilots"
            :key="p.id"
            :to="`/players/${p.id}`"
            class="flex items-center gap-2 hover:text-primary-hover"
          >
            <VerifiedMark v-if="p.player!.featured" :size="10" />
            <span class="font-ui text-[13px] font-semibold text-text">{{ p.player!.handle }}</span>
            <span class="ml-auto font-mono text-[11px] text-text-muted"
              >{{ p.count.toLocaleString('en-US') }} played</span
            >
          </NuxtLink>
        </div>
      </section>

      <section class="border border-border-subtle bg-surface p-5">
        <h2 class="mb-4 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          At a glance
        </h2>
        <div class="flex flex-col gap-3.5">
          <div class="flex items-baseline gap-2">
            <span class="font-display text-[30px] font-bold" :style="{ color: accent }"
              >#{{ usage.rank }}</span
            >
            <span class="font-ui text-[12px] text-text-secondary">usage rank</span>
          </div>
          <div class="flex items-baseline gap-2">
            <span class="font-display text-[30px] font-bold text-text">{{
              usage.value.toLocaleString('en-US')
            }}</span>
            <span class="font-ui text-[12px] text-text-secondary">appearances</span>
          </div>
          <div v-if="latestPatch" class="flex items-baseline gap-2">
            <span class="font-display text-[30px] font-bold text-text">{{
              latestCount.toLocaleString('en-US')
            }}</span>
            <span class="font-ui text-[12px] text-text-secondary"
              >{{ latestPatch }} appearances</span
            >
          </div>
          <dl
            v-if="extraRows.length"
            class="mt-1 flex flex-col gap-1.5 border-t border-border-subtle pt-3"
          >
            <div
              v-for="[k, v] in extraRows"
              :key="k"
              class="flex items-center justify-between gap-3"
            >
              <dt class="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {{ k }}
              </dt>
              <dd class="font-ui text-[12px] font-semibold text-text-secondary">{{ v }}</dd>
            </div>
          </dl>
        </div>
      </section>
    </div>

    <!-- GAME-PANEL EXTENSION SLOT (per-character game analytics, Phase 3) -->
    <div class="px-4 md:px-7">
      <GameCharacterPanels :character-id="character.id" />
    </div>

    <!-- REPLAY GRID -->
    <div class="px-4 pb-7 pt-1.5 md:px-7">
      <div class="mb-4 flex items-center gap-2.5">
        <span class="h-2 w-2 rotate-45" :style="{ background: accent }" />
        <h2 class="font-display text-[17px] font-semibold text-text">
          {{ character.name }} replays
        </h2>
        <span class="font-mono text-[12px] text-text-muted"
          >{{ usage.value.toLocaleString('en-US') }} appearances</span
        >
      </div>
      <ClientOnly>
        <ReplayGrid :list="involved" :pending="pending" />
        <VideoModal />
        <template #fallback>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <BrowseCardSkeleton v-for="i in 4" :key="i" />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>
