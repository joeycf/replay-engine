<template>
  <section class="mx-auto w-full max-w-[900px] px-4 py-8 md:px-[26px]">
    <p class="font-mono text-label uppercase text-text-muted">Index — dev only</p>
    <h1 class="mt-1 font-display text-d2 font-bold text-text">Dev tools</h1>
    <p class="mt-2 font-ui text-body text-text-secondary">
      The hand-curation and diagnostic pages {{ brand }} ships. All of them are
      <span class="font-mono text-text">nuxt dev</span> only — the page and every
      <span class="font-mono text-text">/api/dev/*</span> route it uses 404 outside it, and nothing
      public links here.
    </p>

    <p
      v-if="!groups.length"
      class="mt-8 font-mono text-body text-text-muted"
    >
      This app ships no dev tools.
    </p>

    <section
      v-for="group in groups"
      :key="group.category"
      class="mt-10"
    >
      <h2 class="mb-3 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
        {{ group.category }}
      </h2>
      <ul class="grid gap-3">
        <li
          v-for="tool in group.tools"
          :key="tool.to"
        >
          <NuxtLink
            :to="tool.to"
            class="group block border border-border-subtle bg-surface p-4 transition-colors cut-md hover:border-primary/50"
          >
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 class="font-display text-title font-bold text-text group-hover:text-primary">
                {{ tool.title }}
              </h3>
              <code class="font-mono text-[12px] text-text-muted">{{ tool.to }}</code>
            </div>
            <p class="mt-1 font-ui text-body text-text-secondary">{{ tool.description }}</p>
            <p
              v-if="tool.writes"
              class="mt-2 font-mono text-[11px] text-text-faint"
            >
              writes → {{ tool.writes }}
            </p>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
// The /dev index: every dev page in the merged route table, grouped and
// described. Nothing here is per-game — it reads what each page declares about
// itself — so the engine owns the one copy and all four games inherit it.
//
// Same guard as every tool it lists (2XKO's README states the contract): the
// page 404s outside `nuxt dev`, and each app's nitro.prerender.ignore ['/dev']
// keeps the whole prefix out of the static output.
if (!import.meta.dev) {
  throw createError({ statusCode: 404, statusMessage: 'Not Found' });
}

/**
 * What a dev page declares about itself:
 *
 * ```ts
 * definePageMeta({
 *   devTool: {
 *     title: 'Fuse review',
 *     category: 'Diagnostic',
 *     description: 'Manual fuse workbench — adjudicate every gap the CV could not settle.',
 *     writes: 'data/overrides.json',
 *   },
 * });
 * ```
 *
 * Every value MUST be a plain quoted literal — see the extraction note on
 * `experimental.extraPageMetaExtractionKeys` in the engine's nuxt.config.
 */
interface DevTool {
  title?: string;
  category?: string;
  description?: string;
  /** The committed JSON the tool writes back to, if it writes at all. */
  writes?: string;
}

/** Listed first, in this order; anything else sorts in alphabetically after. */
const CATEGORY_ORDER = ['Curation', 'Diagnostic', 'Authoring'];
const UNCATEGORIZED = 'Other';

/** Last-resort label for a page that never declared itself: /dev/fuse-gaps → Fuse gaps. */
const humanize = (path: string) => {
  const slug = path.slice('/dev/'.length).replace(/[-/]/g, ' ');
  return slug.charAt(0).toUpperCase() + slug.slice(1);
};

const brand = useBrandName();

// getRoutes() is the whole mechanism: the merged table already holds the
// engine's pages AND the consuming app's, so a new dev page lists itself with
// no edit here. A page with no devTool meta still shows up — wearing the
// fallback copy, which is the nudge to go and declare it.
const tools = useRouter()
  .getRoutes()
  .filter((route) => route.path.startsWith('/dev/'))
  .map((route) => {
    const meta = route.meta.devTool as DevTool | undefined;
    return {
      to: route.path,
      title: meta?.title ?? humanize(route.path),
      category: meta?.category ?? UNCATEGORIZED,
      description: meta?.description ?? 'No description yet — add devTool meta to this page.',
      writes: meta?.writes,
    };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

const groups = computed(() => {
  const byCategory = new Map<string, typeof tools>();
  for (const tool of tools) {
    const bucket = byCategory.get(tool.category);
    if (bucket) bucket.push(tool);
    else byCategory.set(tool.category, [tool]);
  }

  const rank = (category: string) => {
    const i = CATEGORY_ORDER.indexOf(category);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };

  return [...byCategory.entries()]
    .map(([category, list]) => ({ category, tools: list }))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.category.localeCompare(b.category));
});

useHead({
  title: `Dev tools (dev) — ${brand}`,
  meta: [{ name: 'robots', content: 'noindex' }],
});
</script>
