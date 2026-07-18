<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <!-- HERO -->
    <div
      class="relative overflow-hidden border-b border-border-subtle px-4 py-8 md:px-10 md:py-[34px]"
    >
      <div
        class="absolute inset-0"
        style="
          background: radial-gradient(
            70% 130% at 20% 20%,
            color-mix(in srgb, var(--color-primary) 16%, transparent),
            transparent 60%
          );
        "
      />
      <div class="relative flex flex-wrap items-center gap-5 md:gap-[26px]">
        <div
          class="relative flex h-[92px] w-[92px] flex-none items-center justify-center border-2 border-primary/40 md:h-[120px] md:w-[120px]"
          style="
            background: repeating-linear-gradient(
              135deg,
              var(--color-surface),
              var(--color-surface) 10px,
              var(--color-surface-sunken) 10px,
              var(--color-surface-sunken) 20px
            );
            clip-path: polygon(
              0 0,
              calc(100% - 16px) 0,
              100% 16px,
              100% 100%,
              16px 100%,
              0 calc(100% - 16px)
            );
          "
          aria-hidden="true"
        >
          <span class="font-display text-[34px] font-bold text-primary/70 md:text-[44px]">{{
            initials
          }}</span>
        </div>
        <div class="min-w-0">
          <div
            v-if="player.featured"
            class="mb-2.5 inline-flex items-center gap-2 border border-primary/50 bg-primary/15 px-[11px] py-[5px]"
          >
            <VerifiedMark :size="12" />
            <span class="font-ui text-[10px] font-bold uppercase tracking-label text-primary"
              >Featured player</span
            >
          </div>
          <h1
            class="break-words font-display text-[38px] font-bold uppercase leading-[.9] tracking-[-.01em] text-text md:text-[60px]"
          >
            {{ player.handle }}
          </h1>
          <p class="mt-2 font-ui text-[14px] text-text-secondary md:text-[15px]">
            {{ game.name }} competitor · {{ matches.toLocaleString('en-US') }} matches on file
          </p>
          <dl
            v-if="extraRows.length"
            class="mt-2 flex flex-wrap gap-x-5 gap-y-1"
          >
            <div
              v-for="[k, v] in extraRows"
              :key="k"
              class="flex items-baseline gap-1.5"
            >
              <dt class="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                {{ k }}
              </dt>
              <dd class="font-ui text-[12px] font-semibold text-text-secondary">{{ v }}</dd>
            </div>
          </dl>
        </div>
        <div class="ml-auto flex gap-3.5">
          <div class="text-right">
            <div class="font-display text-[28px] font-bold text-primary md:text-[34px]">
              <span data-testid="player-matches">{{ matches.toLocaleString('en-US') }}</span>
            </div>
            <div class="font-ui text-[11px] text-text-muted">replays on file</div>
          </div>
          <div
            class="w-px bg-border"
            aria-hidden="true"
          />
          <div class="text-right">
            <div class="truncate font-display text-[28px] font-bold text-text md:text-[34px]">
              <NuxtLink
                v-if="mainChar"
                :to="terms.characterPath(mainChar.id)"
                class="hover:text-primary-hover"
                >{{ mainChar.name }}</NuxtLink
              >
              <template v-else>—</template>
            </div>
            <div class="font-ui text-[11px] text-text-muted">main {{ terms.character }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- STAT RAIL -->
    <div class="grid grid-cols-1 gap-4 px-4 py-[22px] md:grid-cols-2 md:px-7">
      <section class="border border-border-subtle bg-surface p-5">
        <h2 class="mb-4 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          Most-used {{ terms.characters }}
        </h2>
        <CharacterUsageBars
          :items="charRows"
          :limit="5"
          compact
          :link-player-id="player.id"
        />
      </section>
      <section
        v-if="showDuo"
        class="border border-border-subtle bg-surface p-5"
      >
        <h2 class="mb-4 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
          Signature pairings
        </h2>
        <PairingBars
          :items="pairRows"
          :limit="5"
          boxed
          :with-player="player.id"
        />
      </section>
    </div>

    <!-- REPLAY GRID -->
    <div class="px-4 pb-7 pt-1.5 md:px-7">
      <div class="mb-4 flex items-center gap-2.5">
        <span class="h-2 w-2 rotate-45 bg-primary" />
        <h2 class="font-display text-[17px] font-semibold text-text">
          {{ player.handle }} replays
        </h2>
        <span class="font-mono text-[12px] text-text-muted"
          >{{ matches.toLocaleString('en-US') }} matches</span
        >
      </div>
      <ClientOnly>
        <ReplayGrid
          :list="involved"
          :pending="pending"
        />
        <VideoModal />
        <template #fallback>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <BrowseCardSkeleton
              v-for="i in 4"
              :key="i"
            />
          </div>
        </template>
      </ClientOnly>
    </div>
  </div>
</template>

<script setup lang="ts">
import { withBase } from 'ufo';
// Player page — design template 5a. Hero + stat rail prerender with real
// numbers from the provided registries; replay grid is the client-side
// replays fetch. Signature pairings gate on charactersPerSide > 1.
const route = useRoute();
const game = useGame();
const terms = useGameTerms();
const { byId: playerById } = usePlayers();
const player = playerById(String(route.params.id));
if (!player) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Player not found',
    fatal: true,
  });
}

const { stats } = useStatsRows();
const { byId: charById } = useCharacters();

const perSide = Math.max(1, game.charactersPerSide);
const charRows = computed(() => toUsageRows(stats.value.playerCharacters?.[player.id]));
const pairRows = computed(() => toPairRows(stats.value.playerPairings?.[player.id]));
const matches = computed(() =>
  Math.round(charRows.value.reduce((n, r) => n + r.value, 0) / perSide),
);
const mainChar = computed(() => (charRows.value[0] ? charById(charRows.value[0].id) : undefined));
const showDuo = computed(() => game.charactersPerSide > 1 && pairRows.value.length > 0);

const initials = computed(() =>
  (
    player.handle
      .match(/\b[a-z0-9]/gi)
      ?.slice(0, 2)
      .join('') ?? player.handle.slice(0, 2)
  ).toUpperCase(),
);

// generic key/value strip for game-specific metadata
const extraRows = computed(() =>
  Object.entries(player.extra ?? {}).filter(
    ([k, v]) => k !== 'aliases' && (typeof v === 'string' || typeof v === 'number'),
  ),
);

// replays (client fetch, same as Browse)
const { replays, pending } = useReplays();
const involved = computed(() =>
  replays.value
    .filter((r) => r.sides.some((s) => sidePlayers(s).includes(player.id)))
    .sort((a, b) => b.date.localeCompare(a.date)),
);

useSiteMeta({
  title: `${player.handle} — ${matches.value.toLocaleString('en-US')} ${game.name} replays · ${useBrandName()}`,
  description: `${player.handle}${player.featured ? ' (featured player)' : ''} in competitive ${game.name}: ${matches.value.toLocaleString('en-US')} replays on file${mainChar.value ? `, main ${terms.character} ${mainChar.value.name}` : ''}, most-used ${terms.characters} and replay history.`,
});

const site = useSiteOrigin();
const base = useRuntimeConfig().app.baseURL;
const abs = (p: string) => `${site}${withBase(p, base)}`;
useJsonLd([
  {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: abs('/') },
      { '@type': 'ListItem', position: 2, name: 'Players', item: abs('/players') },
      { '@type': 'ListItem', position: 3, name: player.handle, item: abs(`/players/${player.id}`) },
    ],
  },
]);
</script>
