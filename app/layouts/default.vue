<script setup lang="ts">
/**
 * The app shell: pinned header (Wordmark + primary nav), the themed dark
 * surface, and the templated SiteFooter. Nav uses <NuxtLink> exclusively so it
 * is base-path-aware. All colors/fonts are semantic tokens.
 */
const route = useRoute();

const nav = [
  { to: '/', label: 'Browse' },
  { to: '/stats', label: 'Stats' },
  { to: '/characters', label: 'Characters' },
  { to: '/players', label: 'Players' },
];

// Home ('/') matches exactly; section links match their subtree.
const isActive = (to: string) =>
  to === '/' ? route.path === '/' : route.path.startsWith(to);
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg font-ui text-text">
    <header
      class="sticky top-0 z-40 border-b border-border-subtle bg-bg/80 backdrop-blur"
    >
      <div
        class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4"
      >
        <Wordmark />
        <nav class="flex items-center gap-0.5 text-sm">
          <NuxtLink
            v-for="link in nav"
            :key="link.to"
            :to="link.to"
            class="rounded-md px-3 py-1.5 transition-colors duration-fast ease-standard"
            :class="
              isActive(link.to)
                ? 'bg-surface text-text'
                : 'text-text-muted hover:bg-surface/60 hover:text-text'
            "
          >
            {{ link.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <main class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>

    <SiteFooter />
  </div>
</template>
