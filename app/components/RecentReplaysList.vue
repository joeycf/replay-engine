<template>
  <div class="relative">
    <ol
      data-testid="recent-replays"
      class="divide-y divide-border-subtle border-b border-border-subtle"
    >
      <li
        v-for="r in items"
        :key="r.id"
        class="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-baseline md:gap-x-4 md:px-[26px]"
      >
        <a
          :href="watchHref(r.id)"
          rel="nofollow"
          class="min-w-0 font-ui text-[13px] font-semibold text-text hover:text-primary-hover md:flex-1"
          @click.prevent="open(r.id)"
          >{{ r.title }}</a
        >
        <span class="font-ui text-[12px] text-text-secondary">
          <template
            v-for="(side, i) in r.sides"
            :key="i"
            >{{ i ? ' vs ' : ''
            }}<template
              v-for="(pid, j) in side.players"
              :key="pid"
              >{{ j ? ' + ' : ''
              }}<NuxtLink
                :to="`/players/${pid}`"
                class="hover:text-text"
                >{{ handle(pid) }}</NuxtLink
              ></template
            ><template v-if="side.characters.length"
              >{{ ' ('
              }}<template
                v-for="(cid, j) in side.characters"
                :key="cid"
                >{{ j ? ' / ' : ''
                }}<NuxtLink
                  :to="terms.characterPath(cid)"
                  class="hover:text-text"
                  >{{ charName(cid) }}</NuxtLink
                ></template
              >{{ ')' }}</template
            ></template
          >
        </span>
        <span class="font-mono text-[11px] text-text-muted md:ml-auto md:flex-none">
          <template v-if="r.event">{{ r.event }} · </template>
          <template v-if="r.patch">{{ r.patch }} · </template>
          <time :datetime="r.date">{{ r.date.slice(0, 10) }}</time>
        </span>
      </li>
    </ol>

    <!-- the skeleton grid painted OVER the list while the replays load (v0.18.1);
         display:none unless the head script below has run (structural.css) -->
    <div
      class="recent-cover grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      :class="[coverClass, { 'is-live': live }]"
      aria-hidden="true"
    >
      <BrowseCardSkeleton
        v-for="i in skeletons"
        :key="i"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { withBase } from 'ufo';
import type { RecentReplay } from '@engine/types';
// The newest replays as plain text (v0.18.0) — what a Browse or character page
// shows until the client's replays.json fetch resolves, and therefore what a
// crawler reads in place of "Loading replays…". Entity links (players,
// characters) are real prerendered pages; the title opens the video modal,
// which is a ?v= query view and not a page, hence rel=nofollow.
//
// A visitor doesn't see it (v0.18.1): a skeleton grid covers it until the list
// is replaced. The cover is drawn OVER the list, never instead of it, so the
// text stays in the DOM and is never display:none or visibility:hidden, even in
// a renderer that runs JS. And only JS turns the cover on: the head script below
// adds html.rdb-js before the body is parsed, so a crawler that doesn't run
// scripts gets no cover at all. If the app never mounts (a stale page whose
// hashed chunks 404), a CSS failsafe lifts the cover after 8 s and the list
// shows; `live` cancels the failsafe once Vue is running, so a slow
// replays.json keeps the skeletons up instead.
// `skeletons` and `coverClass` (the padding) match the grid that replaces the
// list, so the swap doesn't jump: Browse's own grid by default; the character
// page passes 4 and ReplayGrid's (none, plus the page gutter the list's
// negative margins cancel).
withDefaults(defineProps<{ items: RecentReplay[]; skeletons?: number; coverClass?: string }>(), {
  skeletons: 8,
  coverClass: 'px-4 pb-[30px] pt-[22px] md:px-[26px]',
});

const terms = useGameTerms();
const route = useRoute();
const base = useRuntimeConfig().app.baseURL;
const { byId: playerById } = usePlayers();
const { byId: charById } = useCharacters();

const handle = (id: string) => playerById(id)?.handle ?? id;
const charName = (id: string) => charById(id)?.name ?? id;
// withBase('/', '/2xko/') is '/2xko' — no trailing-slash hop for a crawler
const watchHref = (id: string) => `${withBase('/', base)}?v=${encodeURIComponent(id)}`;
// keep whatever filters are in the URL (Browse); a character page has none
const open = (id: string) => navigateTo({ path: '/', query: { ...route.query, v: id } });

// false on the server and through hydration, so the markup matches
const live = ref(false);
onMounted(() => (live.value = true));

// in this component, not the app head, so only the pages that carry the list
// carry the script; player pages stay byte-identical
useHead({
  script: [
    {
      key: 'rdb-js',
      tagPriority: 'critical',
      innerHTML: "document.documentElement.classList.add('rdb-js')",
    },
  ],
});
</script>
