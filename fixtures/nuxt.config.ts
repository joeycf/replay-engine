// The fixtures DEV-APP: the thinnest possible consuming app. It `extends` the
// engine exactly as a real game will (2xko-replay-database, tekken-…), which is
// why `npm run dev`/`generate` target this dir — it exercises the layer contract
// end-to-end AND lets the fixture game override the engine's neutral default
// (charactersPerSide 1 → 2, coOccurrence off → on) through the same app.config
// merge a game uses. See README "Running the engine standalone".
export default defineNuxtConfig({
  extends: ['..'],

  // The committed probe theme rides the SAME wiring a real game uses (an app
  // `css:` entry loading after the layer's CSS), so verify-override.mjs
  // exercises the true consumer path on the BUILT bundle. The file must stay
  // a plain `:root` block — that IS the contract under test (STACK §5.13).
  css: ['~/assets/theme.css'],

  nitro: {
    prerender: {
      // Same line every real app carries. /dev/index.vue (v0.8.0) guards itself
      // behind import.meta.dev and 404s outside `nuxt dev`, but the crawler
      // still finds it through the app manifest — so without this, `nuxt
      // generate fixtures` exits on a prerender error and EVERY browser gate
      // that builds first (verify-badges, verify-patch-groups, verify-subpath,
      // verify-segments) stops being runnable. The fixtures app is the thinnest
      // possible consumer; it has to carry what a consumer carries.
      ignore: ['/dev'],
    },
  },
});
