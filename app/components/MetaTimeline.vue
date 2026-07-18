<template>
  <div
    ref="root"
    data-testid="meta-timeline"
  >
    <svg
      :viewBox="`0 0 ${vbW} 232`"
      class="block h-auto w-full"
      role="img"
      :aria-label="`${capWord(terms.character)} usage rank by ${terms.patch}`"
    >
      <line
        v-for="(x, i) in xs"
        :key="`grid-${i}`"
        :x1="x"
        y1="14"
        :x2="x"
        y2="210"
        class="grid-line"
      />
      <g
        v-for="line in lines"
        :key="line.id"
      >
        <polyline
          :points="line.points"
          fill="none"
          :stroke="line.color"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          v-for="(p, i) in line.pts"
          :key="i"
          :cx="p.x"
          :cy="p.y"
          r="4.5"
          :fill="line.color"
          class="pt-ring"
          stroke-width="1.5"
        />
        <text
          class="line-label"
          :x="xs[xs.length - 1]! + 11"
          :y="line.labelY"
          :fill="line.color"
          font-size="11"
          font-weight="700"
          dominant-baseline="middle"
        >
          {{ line.name }}
        </text>
      </g>
      <text
        v-for="(p, i) in patches"
        :key="`axis-${p}`"
        :x="xs[i]"
        y="226"
        class="axis-label"
        font-size="10"
        text-anchor="middle"
      >
        {{ p.toUpperCase() }}
      </text>
    </svg>
  </div>
</template>

<script setup lang="ts">
// Meta over time (design Panel 3): usage-rank bump chart across the game's
// patches (the shipped "eras", generic). Lines/marks tinted with character
// accents via CSS classes + accentVar (SVG attrs can't leak literal families
// or hexes); lines draw in on reveal, circles + labels fade after.
const props = withDefaults(defineProps<{ topN?: number; wide?: boolean }>(), {
  topN: 5,
  wide: false,
});

const terms = useGameTerms();
const { patches, usageFor, patchRanks } = useStatsRows();
const { byId } = useCharacters();

// Geometry, parametric in topN + wide (v0.5.3). The viewBox HEIGHT is fixed —
// rank rows always fill the constant band [ROW_TOP, ROW_BOT], so any topN packs
// evenly. `wide` only widens the viewBox (and the plot within it): the SVG is
// w-full/h-auto, so at full width a wider box keeps the chart from rendering
// absurdly tall. `clamp` = max(topN, 8) preserves the historical 8-rank /
// 26-unit resolution for the default (topN 5) chart EXACTLY, and grows with
// larger top-N so ranks past the 8th no longer collapse onto one line.
const PLOT_L = 45;
const ROW_TOP = 20;
const ROW_BOT = 202;
const vbW = computed(() => (props.wide ? 760 : 384));
const plotW = computed(() => (props.wide ? 585 : 240));
const clamp = computed(() => Math.max(props.topN, 8));

const rankY = (rank: number) =>
  ROW_TOP + (Math.min(rank, clamp.value) - 1) * ((ROW_BOT - ROW_TOP) / (clamp.value - 1));

const xs = computed(() =>
  patches.value.map((_, i) => PLOT_L + i * (plotW.value / Math.max(1, patches.value.length - 1))),
);
const lines = computed(() => {
  const rows = usageFor(null)
    .slice(0, props.topN)
    .map((r) => {
      const pts = patches.value.map((p, i) => ({
        x: xs.value[i]!,
        y: rankY(patchRanks.value[p]?.[r.id] ?? clamp.value),
      }));
      return {
        id: r.id,
        name: byId(r.id)?.name ?? r.id,
        color: accentVar(r.id, 'var(--color-text-muted)'),
        pts,
        points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        labelY: pts[pts.length - 1]!.y,
      };
    });
  // de-overlap end labels (clamped ranks can collide): push apart to a minimum
  // gap, then — if the stack overflowed the bottom — slide the whole run back
  // up so every label stays inside the viewBox. A deep (top-10) chart clamps
  // several characters onto the bottom row at the final patch, which the
  // original push-down-only pass would spill past the floor.
  const GAP = 11;
  const LABEL_MAX = 224; // last baseline that still clears the viewBox floor (232)
  const pushDown = (arr: typeof rows) => {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i]!.labelY - arr[i - 1]!.labelY < GAP) arr[i]!.labelY = arr[i - 1]!.labelY + GAP;
    }
  };
  const sorted = [...rows].sort((a, b) => a.labelY - b.labelY);
  pushDown(sorted);
  const overflow = (sorted[sorted.length - 1]?.labelY ?? 0) - LABEL_MAX;
  if (overflow > 0) {
    for (const r of sorted) r.labelY = Math.max(ROW_TOP, r.labelY - overflow);
    pushDown(sorted); // re-resolve any collisions the upward shift reintroduced
  }
  return rows;
});

const root = ref<HTMLElement | null>(null);
useReveal(root, {
  prepare: (el) => {
    for (const line of el.querySelectorAll<SVGPolylineElement>('polyline')) {
      const len = line.getTotalLength();
      line.style.strokeDasharray = String(len);
      line.style.strokeDashoffset = String(len);
    }
    for (const n of el.querySelectorAll<SVGElement>('circle, .line-label')) n.style.opacity = '0';
  },
  reveal: (el, { animate, stagger }) => {
    animate(el.querySelectorAll('polyline'), {
      strokeDashoffset: 0,
      duration: 900,
      ease: SNAP_EASE,
      delay: stagger(120),
    });
    animate(el.querySelectorAll('circle, .line-label'), {
      opacity: 1,
      duration: 350,
      ease: 'outQuad',
      delay: stagger(28, { start: 420 }),
    });
  },
});
</script>

<style scoped>
/* SVG text/stroke styling via classes so families + colors stay semantic. */
.grid-line {
  stroke: var(--color-border-subtle);
}
.pt-ring {
  stroke: var(--color-surface);
}
.line-label {
  font-family: var(--font-ui);
}
.axis-label {
  font-family: var(--font-mono);
  fill: var(--color-text-muted);
}
</style>
