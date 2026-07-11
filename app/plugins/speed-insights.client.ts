// Vercel Speed Insights (dashboard side enabled per deployment).
//
// The v2.0.0 Nuxt module (`modules: ['@vercel/speed-insights/nuxt']`) accepts
// no options — its generated client plugin calls injectSpeedInsights() bare —
// so this registers the same public runtime directly to pass one:
//
//   sampleRate 0.5 — Hobby-plan projects have a monthly event cap and these
//   niche sites can spike (tournament weekends); reporting half the page
//   views keeps Core Web Vitals statistics sound while staying under the cap.
//
// Client-only (.client.ts): nothing is injected into prerendered HTML; the
// script attaches in the browser. Dev-inert and no-op off-Vercel by design.
import { injectSpeedInsights } from '@vercel/speed-insights/nuxt/runtime';

export default defineNuxtPlugin(() => {
  injectSpeedInsights({ sampleRate: 0.5 });
});
