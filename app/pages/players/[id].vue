<template>
  <div class="mx-auto w-full max-w-[1440px]">
    <!-- HERO -->
    <div
      class="relative overflow-hidden border-b border-border-subtle px-4 py-8 md:px-10 md:py-[34px]"
    >
      <div class="player-glow absolute inset-0" />
      <div class="relative flex flex-wrap items-center gap-5 md:gap-[26px]">
        <div
          class="player-plate relative flex h-[92px] w-[92px] flex-none items-center justify-center border-2 border-primary/40 md:h-[120px] md:w-[120px]"
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
            <VerifiedMark
              :size="12"
              :title="featuredLabel"
            />
            <span class="font-ui text-[10px] font-bold uppercase tracking-label text-primary">{{
              featuredLabel
            }}</span>
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

    <!-- TOURNAMENT RESULTS (v0.17.0) — only when the pipeline set extra.titles -->
    <section
      v-if="titles.length"
      class="mx-4 mt-[22px] border border-border-subtle bg-surface p-5 md:mx-7"
      data-testid="player-titles"
    >
      <h2 class="mb-3 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
        Tournament results
      </h2>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="t in titles"
          :key="`${t.event}-${t.place}`"
          class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"
        >
          <span
            class="inline-flex w-[82px] flex-none items-center font-ui text-[10px] font-bold uppercase tracking-label"
            :class="t.place === 1 ? 'text-primary' : 'text-text-secondary'"
            >{{ t.place === 1 ? 'Winner' : 'Runner-up' }}</span
          >
          <a
            v-if="t.url"
            :href="t.url"
            target="_blank"
            rel="noopener noreferrer"
            class="font-ui text-[13px] font-semibold text-text hover:text-primary-hover"
            >{{ t.event }}</a
          >
          <span
            v-else
            class="font-ui text-[13px] font-semibold text-text"
            >{{ t.event }}</span
          >
          <span class="font-mono text-[11px] text-text-muted">{{ t.date }}</span>
        </li>
      </ul>
      <p class="mt-3 font-mono text-[10px] text-text-muted">
        Placements from
        <a
          href="https://liquipedia.net/fighters/"
          target="_blank"
          rel="noopener noreferrer"
          class="underline hover:text-text"
          >Liquipedia</a
        >, CC BY-SA 3.0.
      </p>
    </section>

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
              v-for="i in skeletons"
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
// Same arithmetic as utils/featuredRank.ts rankPlayers: ÷ perSide approximates
// replays, and any stats entry at all means at least one (a partially-known
// side must not round a real player down to zero).
const matches = computed(() => {
  const sum = charRows.value.reduce((n, r) => n + r.value, 0);
  return sum === 0 ? 0 : Math.max(1, Math.round(sum / perSide));
});
// Tournament placements set by the game's pipeline (extra.titles), newest first.
const titles = computed(() =>
  [...playerTitles(player)].sort((a, b) => b.date.localeCompare(a.date) || a.place - b.place),
);
const wins = computed(() => titles.value.filter((t) => t.place === 1).length);
const featuredLabel = computed(() =>
  wins.value
    ? `Featured player · ${wins.value} tournament ${wins.value === 1 ? 'win' : 'wins'}`
    : titles.value.length
      ? 'Featured player · tournament finalist'
      : 'Featured player',
);
const mainChar = computed(() => (charRows.value[0] ? charById(charRows.value[0].id) : undefined));
// One loading card per replay the grid will actually show, up to the four of a
// first row. It used to be four for everyone, and half the players on every game
// have exactly one replay: three phantom cards, ~1.7 KB, in each of those files.
const skeletons = computed(() => Math.min(4, Math.max(1, matches.value)));
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
// (`aliases` and `titles` are well-known keys with their own rendering.)
const extraRows = computed(() =>
  Object.entries(player.extra ?? {}).filter(
    ([k, v]) =>
      k !== 'aliases' && k !== 'titles' && (typeof v === 'string' || typeof v === 'number'),
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
  description: `${player.handle}${player.featured ? ' (featured player)' : ''} in competitive ${game.name}: ${matches.value.toLocaleString('en-US')} replays on file${mainChar.value ? `, main ${terms.character} ${mainChar.value.name}` : ''}${titles.value.length ? `, ${titles.value.length} tournament ${titles.value.length === 1 ? 'placement' : 'placements'}` : ''}, most-used ${terms.characters} and replay history.`,
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
