<template>
  <div class="flex items-center gap-1.5">
    <span
      :class="labelClass"
      class="mr-1"
      >{{ capWord(terms.patch) }}</span
    >
    <template
      v-for="g in visibleGroups"
      :key="g.id"
    >
      <div class="flex items-stretch">
        <button
          type="button"
          class="h-[34px] cursor-pointer border px-3 font-mono text-[13px]"
          :class="parentClass(g)"
          :aria-pressed="ariaTriState(g)"
          :title="g.note"
          :data-testid="`patch-group-${g.id}`"
          @click="f.togglePatchGroup(g.id)"
        >
          {{ g.label ?? g.id
          }}<span
            v-if="stateOf(g).state === 'some'"
            class="ml-1.5 font-mono text-[10px] opacity-80"
            >{{ stateOf(g).selected }}/{{ stateOf(g).total }}</span
          >
        </button>
        <div
          v-if="presentChildren(g).length"
          class="relative"
        >
          <button
            type="button"
            class="h-[34px] cursor-pointer border border-l-0 px-1.5 font-mono text-[11px]"
            :class="parentClass(g)"
            :aria-expanded="openGroup === g.id"
            aria-haspopup="true"
            :aria-label="`${g.label ?? g.id} patches`"
            :data-testid="`patch-group-${g.id}-expander`"
            @click="openGroup = openGroup === g.id ? null : g.id"
          >
            ▾
          </button>
          <div
            v-if="openGroup === g.id"
            data-testid="patch-group-menu"
            class="absolute left-auto right-0 top-full z-30 mt-2 w-[240px] border border-border bg-surface p-2 shadow-lg"
            @keydown.esc.stop="openGroup = null"
          >
            <div
              class="mb-1.5 px-1.5 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted"
            >
              {{ g.label ?? g.id }} · {{ terms.patches }}
            </div>
            <button
              v-for="c in presentChildren(g)"
              :key="c.id"
              type="button"
              class="flex w-full cursor-pointer items-baseline gap-2 px-1.5 py-1.5 text-left font-mono text-[12.5px]"
              :class="
                f.isActive('patches', c.id)
                  ? 'bg-primary/15 text-text'
                  : 'text-text-secondary hover:text-text'
              "
              :aria-pressed="f.isActive('patches', c.id)"
              :data-testid="`patch-child-${c.id}`"
              @click="f.togglePatch(c.id)"
            >
              <span
                class="w-3 flex-none text-[11px]"
                aria-hidden="true"
                >{{ f.isActive('patches', c.id) ? '✓' : '' }}</span
              >
              <span>{{ c.label ?? c.id }}</span>
              <span
                v-if="c.note"
                class="ml-auto min-w-0 truncate font-ui text-[10px] text-text-muted"
                >{{ c.note }}</span
              >
            </button>
          </div>
        </div>
      </div>
    </template>
    <!-- data tokens the group table doesn't know yet (stale-boundaries fallback) -->
    <button
      v-for="p in ungrouped"
      :key="p"
      type="button"
      class="h-[34px] cursor-pointer border px-3 font-mono text-[13px]"
      :class="togClass(f.isActive('patches', p))"
      :aria-pressed="f.isActive('patches', p)"
      @click="f.togglePatch(p)"
    >
      {{ p }}
    </button>
  </div>
</template>

<script setup lang="ts">
// Grouped patch facet (GameConfig.patchGroups, v0.6.0) — desktop chip row.
// Parent chips are tri-state whole-era toggles (aria-pressed mixed + n/m count
// when partially selected); the attached ▾ expander opens a MatchupPicker-
// anatomy popover of child patches (outside-pointerdown / Esc to close).
// Groups are presence-gated on the data-derived options like every facet.
import type { PatchGroup } from '@engine/types';

const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();
const f = props.filters;

const game = useGame();
const terms = useGameTerms();
const groups = game.patchGroups ?? [];

const openGroup = ref<string | null>(null);

const present = computed(() => new Set(f.options.value.patches));
const visibleGroups = computed(() =>
  groups.filter(
    (g) => present.value.has(g.id) || (g.children ?? []).some((c) => present.value.has(c.id)),
  ),
);
const presentChildren = (g: PatchGroup) =>
  (g.children ?? []).filter((c) => present.value.has(c.id));
const ungrouped = computed(() => ungroupedPatchTokens(f.options.value.patches, groups));

const stateOf = (g: PatchGroup) =>
  patchGroupState(g, f.state.value.patches, f.options.value.patches);
const ariaTriState = (g: PatchGroup): 'true' | 'false' | 'mixed' => {
  const s = stateOf(g).state;
  return s === 'all' ? 'true' : s === 'some' ? 'mixed' : 'false';
};

const togClass = (on: boolean) =>
  on
    ? 'bg-primary text-primary-contrast border-primary'
    : 'bg-surface-raised text-text-secondary border-border hover:text-text';
// 'some' gets the indeterminate look: primary border + tint, but not filled
const parentClass = (g: PatchGroup) => {
  const s = stateOf(g).state;
  return s === 'all'
    ? 'bg-primary text-primary-contrast border-primary'
    : s === 'some'
      ? 'bg-primary/15 text-text border-primary'
      : 'bg-surface-raised text-text-secondary border-border hover:text-text';
};

const labelClass = 'font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted';

function onOutside(e: PointerEvent) {
  const t = e.target as HTMLElement | null;
  const inside =
    t?.closest?.('[data-testid="patch-group-menu"]') ||
    t?.closest?.('[data-testid^="patch-group-"][data-testid$="-expander"]');
  if (!inside) openGroup.value = null;
}
onMounted(() => document.addEventListener('pointerdown', onOutside, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));
</script>
