import { withBase } from 'ufo';

/**
 * Base-aware head defaults. Without an explicit icon link, browsers request
 * /favicon.ico at the ORIGIN ROOT — escaping the base path entirely under
 * subpath deployment (PLAN.md §11's absolute-path trap, in head form). Declaring
 * it through withBase keeps every request under the app's base. A consuming
 * game replaces the icon by shipping its own public/favicon.ico (and may extend
 * head links further in its own app).
 */
export default defineNuxtPlugin(() => {
  const base = useRuntimeConfig().app.baseURL;
  useHead({
    link: [{ rel: 'icon', href: withBase('/favicon.ico', base), sizes: 'any' }],
  });
});
