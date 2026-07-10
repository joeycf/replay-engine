// The fixtures DEV-APP: the thinnest possible consuming app. It `extends` the
// engine exactly as a real game will (2xko-replay-database, tekken-…), which is
// why `npm run dev`/`generate` target this dir — it exercises the layer contract
// end-to-end AND lets the fixture game override the engine's neutral default
// (charactersPerSide 1 → 2, coOccurrence off → on) through the same app.config
// merge a game uses. See README "Running the engine standalone".
export default defineNuxtConfig({
  extends: ['..'],
});
