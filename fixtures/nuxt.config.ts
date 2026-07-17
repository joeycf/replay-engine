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
});
