<script setup lang="ts">
/**
 * The ReplayDB loading spinner — ported from design/brand/replay-loader.svg.
 * The source SVG animates with SMIL and literal brand hexes; SMIL cannot
 * animate to `var()` values, so the choreography (ring draw-in teal→gold,
 * rewind-triangle glitch burst, loop) is re-expressed as CSS keyframes over
 * SEMANTIC tokens — the spinner re-tints under any game theme.
 *
 * `prefers-reduced-motion`: all animation drops and the static mark stands
 * (full ring + solid triangles), exactly like the chart-reveal discipline.
 *
 * Default pending indicator for async UI (modal embed load, in-page pending
 * states). Browse keeps its skeleton cards.
 */
withDefaults(defineProps<{ size?: number; label?: string }>(), {
  size: 48,
  label: 'Loading',
});
</script>

<template>
  <span role="status" :aria-label="label" class="inline-flex items-center justify-center">
    <svg :width="size" :height="size" viewBox="0 0 100 100" aria-hidden="true" class="block">
      <!-- track -->
      <circle cx="50" cy="50" r="40" fill="none" class="spinner-track" stroke-width="5" />
      <!-- draw-in ring: teal → gold flash → fade, per the brand loader -->
      <circle
        cx="50"
        cy="50"
        r="40"
        fill="none"
        class="spinner-ring"
        stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray="251.3"
        transform="rotate(-90 50 50)"
      />
      <!-- rewind triangles: glitch echoes behind the primary pair -->
      <g class="spinner-glitch-a">
        <path d="M69 34 L69 66 L52 50 Z" />
        <path d="M48 34 L48 66 L31 50 Z" />
      </g>
      <g class="spinner-glitch-b">
        <path d="M69 34 L69 66 L52 50 Z" />
        <path d="M48 34 L48 66 L31 50 Z" />
      </g>
      <g class="spinner-tris">
        <path d="M69 34 L69 66 L52 50 Z" />
        <path d="M48 34 L48 66 L31 50 Z" />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.spinner-track {
  stroke: color-mix(in srgb, var(--color-primary) 16%, transparent);
}
.spinner-ring {
  stroke: var(--color-primary);
  animation: spinner-ring 2s infinite;
}
.spinner-tris {
  fill: var(--color-primary);
  animation: spinner-jitter 2s infinite;
}
.spinner-glitch-a {
  fill: var(--color-secondary);
  opacity: 0;
  animation: spinner-glitch-a 2s infinite;
}
.spinner-glitch-b {
  fill: var(--color-text);
  opacity: 0;
  animation: spinner-glitch-b 2s infinite;
}

@keyframes spinner-ring {
  0% {
    stroke-dashoffset: 251.3;
    stroke: var(--color-primary);
    opacity: 1;
  }
  56% {
    stroke: var(--color-primary);
  }
  58% {
    stroke-dashoffset: 0;
  }
  62% {
    stroke: var(--color-secondary);
    opacity: 1;
  }
  82% {
    stroke-dashoffset: 0;
    stroke: var(--color-secondary);
    opacity: 1;
  }
  94%,
  100% {
    stroke-dashoffset: 0;
    stroke: var(--color-secondary);
    opacity: 0;
  }
}
/* main pair: hold, snap-scale pop, jitter burst, settle */
@keyframes spinner-jitter {
  0%,
  54% {
    transform: translate(0, 0);
    fill: var(--color-primary);
  }
  60% {
    transform: translate(-3px, 1px) scale(1.08);
    transform-origin: 50px 50px;
    fill: var(--color-text);
  }
  64% {
    transform: translate(3px, -1px);
    fill: var(--color-primary);
  }
  72% {
    transform: translate(-4px, 1px);
  }
  80% {
    transform: translate(3px, 1px);
  }
  88%,
  100% {
    transform: translate(0, 0);
    fill: var(--color-primary);
  }
}
@keyframes spinner-glitch-a {
  0%,
  58% {
    opacity: 0;
    transform: translate(0, 0);
  }
  64% {
    opacity: 0.9;
    transform: translate(6px, -1px);
  }
  72% {
    opacity: 0.65;
    transform: translate(-3px, 2px);
  }
  80% {
    opacity: 0.85;
    transform: translate(6px, 1px);
  }
  88%,
  100% {
    opacity: 0;
    transform: translate(0, 0);
  }
}
@keyframes spinner-glitch-b {
  0%,
  60% {
    opacity: 0;
    transform: translate(0, 0);
  }
  66% {
    opacity: 0.7;
    transform: translate(-5px, 1px);
  }
  74% {
    opacity: 0.5;
    transform: translate(4px, -2px);
  }
  82% {
    opacity: 0.6;
    transform: translate(-4px, 0);
  }
  90%,
  100% {
    opacity: 0;
    transform: translate(0, 0);
  }
}

/* Static fallback: the full mark simply stands. */
@media (prefers-reduced-motion: reduce) {
  .spinner-ring,
  .spinner-tris,
  .spinner-glitch-a,
  .spinner-glitch-b {
    animation: none;
  }
  .spinner-ring {
    stroke-dashoffset: 0;
  }
  .spinner-glitch-a,
  .spinner-glitch-b {
    opacity: 0;
  }
}
</style>
