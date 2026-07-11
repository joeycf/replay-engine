<script setup lang="ts">
// Meta over time (design Panel 3): usage-rank bump chart across the game's
// patches (the shipped "eras", generic). Lines/marks tinted with character
// accents via CSS classes + accentVar (SVG attrs can't leak literal families
// or hexes); lines draw in on reveal, circles + labels fade after.
const props = withDefaults(defineProps<{ topN?: number }>(), { topN: 5 });

const { patches, usageFor, patchRanks } = useStatsRows();
const { byId } = useCharacters();

const RANK_CLAMP = 8;

const rankY = (rank: number) => 20 + (Math.min(rank, RANK_CLAMP) - 1) * 26;

const xs = computed(() =>
  patches.value.map((_, i) => 45 + i * (240 / Math.max(1, patches.value.length - 1))),
);
const lines = computed(() => {
  const rows = usageFor(null)
    .slice(0, props.topN)
    .map((r) => {
      const pts = patches.value.map((p, i) => ({
        x: xs.value[i]!,
        y: rankY(patchRanks.value[p]?.[r.id] ?? RANK_CLAMP),
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
  // de-overlap end labels (clamped ranks can collide)
  const sorted = [...rows].sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.labelY - sorted[i - 1]!.labelY < 11)
      sorted[i]!.labelY = sorted[i - 1]!.labelY + 11;
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

<template>
  <div ref="root" data-testid="meta-timeline">
    <svg
      viewBox="0 0 384 232"
      class="block h-auto w-full"
      role="img"
      aria-label="Character usage rank by patch"
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
      <g v-for="line in lines" :key="line.id">
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
