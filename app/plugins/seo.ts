import { withBase } from 'ufo';

/**
 * Site-wide SEO head defaults, driven entirely by useGame() (PLAN §5 seo.ts):
 *  - lang + default title/description (pages override via useSiteMeta)
 *  - the icon set: favicon .svg + .ico, PNG sizes, apple-touch-icon 180 —
 *    every href through withBase() (an un-prefixed icon link is the head-form
 *    of the absolute-path trap: browsers would fetch it from the origin root)
 *  - manifest.webmanifest link (file emitted at build by the static-artifacts
 *    module) + theme-color from GameConfig.manifest
 *
 * The WebSite and Organization JSON-LD used to be here too, which put them in
 * every page's <head>. They live on the home page now (pages/index.vue, v0.16.0).
 */
export default defineNuxtPlugin(() => {
  const game = useGame();
  const brand = useBrandName();
  const base = useRuntimeConfig().app.baseURL;

  useHead({
    htmlAttrs: { lang: 'en' },
    titleTemplate: (title?: string) => (title ? title : brand),
    meta: [
      ...(game.manifest?.themeColor
        ? [{ name: 'theme-color', content: game.manifest.themeColor }]
        : []),
    ],
    link: [
      { rel: 'icon', type: 'image/svg+xml', href: withBase('/favicon.svg', base) },
      { rel: 'icon', type: 'image/x-icon', sizes: 'any', href: withBase('/favicon.ico', base) },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '32x32',
        href: withBase('/icons/favicon-32.png', base),
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '48x48',
        href: withBase('/icons/favicon-48.png', base),
      },
      { rel: 'apple-touch-icon', sizes: '180x180', href: withBase('/icons/favicon-180.png', base) },
      { rel: 'manifest', href: withBase('/manifest.webmanifest', base) },
    ],
  });
});
