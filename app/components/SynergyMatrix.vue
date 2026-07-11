<script setup lang="ts">
// N×N character synergy heatmap (design Panel 2 right) — mirrored across the
// diagonal, cell intensity = same-side pairing count. GENERIC duo analytics:
// pages render it only when charactersPerSide > 1. Cells deep-link to Browse
// with the useFilters schema (/?c=a,b&side=1). Cell tint = color-mix over the
// semantic primary; the grid sizes itself to the game's roster. Mobile: a
// contained horizontal scroll with a hint. Hover tooltip: shared HoverTip.
const { list: characters } = useCharacters();
const { pairingAlpha, pairCount } = useStatsRows();

// colId null → diagonal (same character, not a pairing)
const { tip, showTip, hideTip } = useHoverTip<{ rowId: string; colId: string | null }>();
const root = ref<HTMLElement | null>(null);

const name = (id: string) => characters.value.find((c) => c.id === id)?.name ?? id;
const goPair = (a: string, b: string) =>
  navigateTo({
    path: '/',
    query: {
      c: `${a},${b}`,
      side: '1',
    },
  });
const cellStyle = (rowId: string, colId: string) => ({
  background: `color-mix(in srgb, var(--color-primary) ${Math.round(pairingAlpha(rowId, colId) * 100)}%, transparent)`,
});
const gridSize = computed(() => characters.value.length);
useReveal(
  root,
  {
    prepare: (el) => {
      for (const cell of el.querySelectorAll<HTMLElement>('.mx-cell')) cell.style.opacity = '0';
    },
    reveal: (el, { animate, stagger }) => {
      animate(el.querySelectorAll<HTMLElement>('.mx-cell'), {
        opacity: 1,
        duration: 260,
        ease: 'outQuad',
        delay: stagger(3, {
          grid: [gridSize.value, gridSize.value],
          from: 'first',
        }),
      });
    },
  },
  { threshold: 0.2 },
);
</script>

<template>
  <div>
    <div class="mb-2 font-mono text-[10px] text-text-muted sm:hidden" aria-hidden="true">
      scroll →
    </div>
    <div class="overflow-x-auto">
      <div ref="root" data-testid="synergy-matrix" class="min-w-[280px]">
        <!-- column initials -->
        <div class="mb-[2px] flex gap-[2px] pl-6">
          <span
            v-for="c in characters"
            :key="c.id"
            class="flex-1 text-center font-display text-[8px] font-bold text-text-muted"
            >{{ characterInitials(c) }}</span
          >
        </div>
        <!-- rows -->
        <div v-for="row in characters" :key="row.id" class="mb-[2px] flex items-center gap-[2px]">
          <span class="w-[22px] flex-none font-display text-[8px] font-bold text-text-muted">{{
            characterInitials(row)
          }}</span>
          <template v-for="col in characters" :key="col.id">
            <div
              v-if="row.id === col.id"
              class="mx-cell aspect-square flex-1 border border-border-subtle/40"
              :data-diag="row.id"
              aria-hidden="true"
              @mouseenter="showTip($event, { rowId: row.id, colId: null })"
              @mouseleave="hideTip"
            />
            <button
              v-else
              type="button"
              class="mx-cell aspect-square flex-1 cursor-pointer border border-border-subtle/40 transition-shadow duration-instant hover:shadow-[inset_0_0_0_1.5px_var(--color-text)] focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-text)]"
              :data-pair="[row.id, col.id].sort().join('|')"
              :style="cellStyle(row.id, col.id)"
              :aria-label="`${name(row.id)} + ${name(col.id)} — ${pairCount(row.id, col.id).toLocaleString('en-US')} side appearances. Filter Browse to this pairing.`"
              @mouseenter="showTip($event, { rowId: row.id, colId: col.id })"
              @mouseleave="hideTip"
              @click="(hideTip(), goPair(row.id, col.id))"
            />
          </template>
        </div>
      </div>
    </div>

    <HoverTip :tip="tip" data-testid="synergy-tip">
      <template v-if="tip">
        <span
          class="font-ui text-[12px] font-semibold"
          :style="{ color: accentVar(tip.data.rowId, 'var(--color-primary)') }"
          >{{ name(tip.data.rowId) }}</span
        >
        <span v-if="tip.data.colId === null" class="ml-2 font-mono text-[10px] text-text-muted"
          >same character</span
        >
        <template v-else>
          <span class="mx-1 font-ui text-[12px] font-semibold text-text-muted">+</span>
          <span
            class="font-ui text-[12px] font-semibold"
            :style="{ color: accentVar(tip.data.colId, 'var(--color-primary)') }"
            >{{ name(tip.data.colId) }}</span
          >
          <span class="ml-2 font-mono text-[11px] text-text">
            {{
              pairCount(tip.data.rowId, tip.data.colId) === 0
                ? 'never paired'
                : `${pairCount(tip.data.rowId, tip.data.colId).toLocaleString('en-US')} side appearances`
            }}
          </span>
        </template>
      </template>
    </HoverTip>
  </div>
</template>
