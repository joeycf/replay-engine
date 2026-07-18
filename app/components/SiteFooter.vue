<template>
  <footer
    class="sticky bottom-0 z-40 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-6 border-t border-border-subtle bg-surface-sunken px-4 py-4 font-ui text-[11px] text-text-muted sm:px-7"
  >
    <p class="col-start-1 hidden min-w-0 truncate lg:block">
      {{ brand }} was built with passion and love for the game.
    </p>

    <a
      :href="BMC_URL"
      target="_blank"
      rel="noopener noreferrer nofollow"
      aria-label="Support the site (opens in a new tab)"
      class="col-start-2 -mx-2 -my-2.5 flex flex-none items-center gap-1.5 justify-self-center px-2 py-2.5 font-semibold transition-colors duration-normal hover:text-text-secondary"
    >
      <svg
        class="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M10 2v2" />
        <path d="M14 2v2" />
        <path
          d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1"
        />
        <path d="M6 2v2" />
      </svg>
      Help support the site
    </a>

    <p class="col-start-3 hidden justify-self-end font-mono text-[10px] sm:block">
      © {{ year }} {{ brand }}
    </p>
  </footer>
</template>

<script setup lang="ts">
/**
 * The shared site footer — a STICKY bottom bar (the browse grid scrolls
 * forever, so the footer pins to the viewport instead of waiting at an
 * unreachable page end). Three regions, brand-templated via useBrandName() so
 * every consumer — 2XKO, Tekken, the umbrella shell — renders the same footer
 * with its own name and needs no override:
 *   • the brand tagline (left, revealed at lg — the pinned bar stays one line)
 *   • the Buy Me a Coffee support link (center)
 *   • the copyright (right, from sm up)
 * The fan-project disclaimer lives in the VideoModal's mobile mini-disclaimer.
 */
const brand = useBrandName();
const year = new Date().getFullYear();

/** Buy Me a Coffee page linked from the site footer. */
const BMC_URL = 'https://buymeacoffee.com/whatdaflip';
</script>
