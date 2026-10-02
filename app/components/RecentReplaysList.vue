<template>
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
</template>

<script setup lang="ts">
import { withBase } from 'ufo';
import type { RecentReplay } from '@engine/types';
// The newest replays as plain text (v0.18.0) — what a Browse or character page
// shows until the client's replays.json fetch resolves, and therefore what a
// crawler reads in place of "Loading replays…". Entity links (players,
// characters) are real prerendered pages; the title opens the video modal,
// which is a ?v= query view and not a page, hence rel=nofollow.
defineProps<{ items: RecentReplay[] }>();

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
</script>
