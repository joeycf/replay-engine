import { withBase } from 'ufo';

/**
 * Canonical URL + OG/Twitter card meta for a page. Character pages pass their
 * splash as `image`; everything else falls back to GameConfig.ogImage, then to
 * the 512 brand icon. Every URL is absolute (siteUrl) AND base-path-correct
 * (withBase) — a subpath game's canonicals point at /2xko/… automatically.
 */
export function useSiteMeta(opts: {
  title: string;
  description: string;
  image?: string;
  path?: string;
}) {
  const site = useSiteOrigin();
  const game = useGame();
  const base = useRuntimeConfig().app.baseURL;
  const route = useRoute();

  // route.path excludes the router base — re-prefix for the public URL
  const url = `${site}${withBase(opts.path ?? route.path, base)}`;
  const imagePath = opts.image ?? game.ogImage ?? '/icons/favicon-512.png';
  const image = imagePath.startsWith('http') ? imagePath : `${site}${withBase(imagePath, base)}`;

  useHead({ link: [{ rel: 'canonical', href: url }] });
  useSeoMeta({
    title: opts.title,
    description: opts.description,
    ogTitle: opts.title,
    ogDescription: opts.description,
    ogImage: image,
    ogUrl: url,
    ogType: 'website',
    ogSiteName: useBrandName(),
    twitterCard: 'summary_large_image',
    twitterTitle: opts.title,
    twitterDescription: opts.description,
    twitterImage: image,
  });
}
