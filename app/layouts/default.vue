<template>
  <div class="flex min-h-screen flex-col bg-bg font-ui text-text">
    <a
      href="#main"
      class="skip-link"
      >Skip to content</a
    >

    <header
      class="sticky top-0 z-50 border-b border-border-subtle bg-surface-sunken/90 backdrop-blur"
    >
      <div class="flex items-center gap-4 px-4 py-3 md:gap-[26px] md:px-7 md:py-4">
        <BrandWordmark />

        <nav
          class="hidden gap-[22px] font-ui text-[14px] font-semibold md:flex"
          aria-label="Primary"
        >
          <template
            v-for="item in nav"
            :key="item.to ?? item.href"
          >
            <!-- partner link: a real <a> so the URL is in the prerendered HTML;
                 the dialog is a click handler, not a replacement for the href -->
            <a
              v-if="item.href"
              :href="item.href"
              target="_blank"
              rel="noopener noreferrer"
              :aria-label="`${item.label} on ${item.partner!.name} (opens in a new tab)`"
              data-testid="nav-combos"
              class="relative py-1 text-text-muted transition-colors duration-normal hover:text-text-secondary"
              @click="confirmExternal($event, item.href, item.partner!)"
            >
              {{ item.label }} ↗
            </a>
            <NuxtLink
              v-else
              :to="item.to!"
              class="relative py-1 transition-colors duration-normal"
              :class="
                isActive(item.to!) ? 'text-text' : 'text-text-muted hover:text-text-secondary'
              "
            >
              {{ item.label }}
              <span
                v-if="isActive(item.to!)"
                class="absolute inset-x-0 -bottom-[19px] h-0.5 bg-primary"
              />
            </NuxtLink>
          </template>
        </nav>

        <!-- search everywhere: live on Browse, submit→/?q= elsewhere -->
        <SearchBox class="ml-auto hidden w-[340px] md:flex" />
        <SearchBox
          compact
          class="ml-auto min-w-0 max-w-[220px] flex-1 md:hidden"
        />
        <button
          v-if="isBrowse"
          type="button"
          class="relative flex flex-none cursor-pointer items-center gap-1.5 bg-primary px-3 py-[9px] font-ui text-[12px] font-bold text-primary-contrast cut-bl-sm md:hidden"
          aria-label="Open filters"
          @click="drawerOpen = true"
        >
          <span
            class="flex flex-col gap-[2.5px]"
            aria-hidden="true"
          >
            <span class="h-0.5 w-3.5 bg-primary-contrast" />
            <span class="h-0.5 w-2.5 bg-primary-contrast" />
            <span class="h-0.5 w-1.5 bg-primary-contrast" />
          </span>
          Filters
          <ClientOnly>
            <span
              v-if="activeFilterCount > 0"
              class="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-primary bg-bg px-1 font-mono text-[10px] text-primary"
              >{{ activeFilterCount }}</span
            >
          </ClientOnly>
        </button>
      </div>

      <nav
        class="flex gap-5 overflow-x-auto px-4 pb-2.5 font-ui text-[13px] font-semibold md:hidden"
        aria-label="Primary mobile"
      >
        <template
          v-for="item in nav"
          :key="item.to ?? item.href"
        >
          <a
            v-if="item.href"
            :href="item.href"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`${item.label} on ${item.partner!.name} (opens in a new tab)`"
            class="whitespace-nowrap text-text-muted"
            @click="confirmExternal($event, item.href, item.partner!)"
          >
            {{ item.label }} ↗
          </a>
          <NuxtLink
            v-else
            :to="item.to!"
            class="whitespace-nowrap"
            :class="isActive(item.to!) ? 'text-text' : 'text-text-muted'"
          >
            {{ item.label }}
          </NuxtLink>
        </template>
      </nav>
    </header>

    <main
      id="main"
      class="flex-1"
    >
      <slot />
    </main>

    <SiteFooter />

    <!-- One mount for every partner link on the page — the nav's is on every
         route, so this belongs in the layout rather than per page. -->
    <ClientOnly>
      <LeavingSiteDialog />
    </ClientOnly>
  </div>
</template>

<script setup lang="ts">
import type { PartnerSite } from '@engine/types';
// The app shell — port of the shipped layout, config-driven: skip link,
// sticky header (BrandWordmark + primary nav + global SearchBox + mobile
// Filters button with the active-filter count badge), mobile nav row, footer
// with the templated disclaimer. Semantic tokens only.
const route = useRoute();
const drawerOpen = useState('filter-drawer-open', () => false);
const terms = useGameTerms();

const comboforge = useComboForge();
const { confirm: confirmExternal } = useExternalLink();

/** Internal routes carry `to`; a partner link carries `href` + `partner` and
 *  renders as a plain <a> (additive, v0.12.0). Exactly one of the two is set. */
const nav: { label: string; to?: string; href?: string; partner?: PartnerSite }[] = [
  { label: 'Browse', to: '/' },
  { label: 'Stats', to: '/stats' },
  { label: capWord(terms.characters), to: terms.charactersBase },
  { label: 'Players', to: '/players' },
  // ComboForge's combo list for THIS game. Absent unless the game declares a
  // comboforge block, so a game they don't cover never shows a dead nav item.
  ...(comboforge.enabled
    ? [{ label: 'Combos', href: comboforge.hubHref!, partner: PARTNERS.comboforge }]
    : []),
  // The /dev tool index, reachable without typing the URL. `import.meta.dev`
  // constant-folds to false in a production build, so the entry — and with it
  // the only crawlable link to /dev — is absent from the shipped output.
  ...(import.meta.dev ? [{ label: 'Dev', to: '/dev' }] : []),
];

const isActive = (to: string) =>
  to === '/' ? route.path === '/' : route.path === to || route.path.startsWith(`${to}/`);

const isBrowse = computed(() => route.path === '/');

// Lightweight active-filter count (mirrors useFilters' chips without pulling
// in the data composables — the layout must not trigger the replays fetch).
const activeFilterCount = computed(() => {
  const q = route.query;
  const csvLen = (v: unknown) =>
    typeof v === 'string' && v ? v.split(',').filter(Boolean).length : 0;
  let n = csvLen(q.c) + csvLen(q.p) + csvLen(q.src) + csvLen(q.patch) + csvLen(q.rank);
  if (q.side === '1') n++;
  if (typeof q.mu === 'string' && q.mu) n++;
  if (typeof q.from === 'string' && q.from) n++;
  if (typeof q.to === 'string' && q.to) n++;
  if (typeof q.q === 'string' && q.q) n++;
  return n;
});
</script>
