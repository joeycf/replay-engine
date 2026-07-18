<template>
  <div
    ref="root"
    data-testid="matchup-picker"
    class="absolute left-0 top-full z-30 mt-2 w-[320px] border border-border bg-surface p-3.5 shadow-lg"
    @keydown.esc.stop="emit('close')"
  >
    <div class="mb-2 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted">
      Matchup · opposing sides
    </div>
    <div class="flex items-center gap-2.5">
      <div class="flex flex-1 flex-wrap gap-[5px]">
        <button
          v-for="c in characters"
          :key="`a-${c.id}`"
          type="button"
          :aria-label="`Side A: ${c.name}`"
          :aria-pressed="a === c.id"
          class="flex h-8 w-8 cursor-pointer items-center justify-center border-2 p-0 font-display text-[11px] font-bold text-bg transition-opacity duration-fast cut-xs"
          :class="chipClass(a === c.id)"
          :style="{
            background: accentGradient(c.id),
            borderColor: a === c.id ? accentVar(c.id, 'var(--color-text)') : 'var(--color-border)',
          }"
          @click="a = a === c.id ? null : c.id"
        >
          {{ characterInitials(c) }}
        </button>
      </div>
      <span class="font-display text-[12px] font-bold text-text-muted">VS</span>
      <div class="flex flex-1 flex-wrap justify-end gap-[5px]">
        <button
          v-for="c in characters"
          :key="`b-${c.id}`"
          type="button"
          :aria-label="`Side B: ${c.name}`"
          :aria-pressed="b === c.id"
          class="flex h-8 w-8 cursor-pointer items-center justify-center border-2 p-0 font-display text-[11px] font-bold text-bg transition-opacity duration-fast cut-xs"
          :class="chipClass(b === c.id)"
          :style="{
            background: accentGradient(c.id),
            borderColor: b === c.id ? accentVar(c.id, 'var(--color-text)') : 'var(--color-border)',
          }"
          @click="b = b === c.id ? null : c.id"
        >
          {{ characterInitials(c) }}
        </button>
      </div>
    </div>
    <div class="mt-3 flex gap-2">
      <button
        type="button"
        class="flex-1 cursor-pointer border border-border bg-surface-raised px-3 py-2 font-ui text-[12px] font-semibold text-text-secondary hover:text-text"
        @click="clear"
      >
        Clear
      </button>
      <button
        type="button"
        class="flex-[2] cursor-pointer bg-primary px-3 py-2 font-ui text-[12px] font-bold text-primary-contrast cut-bl-md disabled:cursor-not-allowed disabled:opacity-40"
        :disabled="!a || !b"
        data-testid="matchup-apply"
        @click="apply"
      >
        Apply matchup
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Matchup picker — the UI over the composable's mu=a:b facet (Phase 1 shipped
// the logic; this is the picker). Pick one character per side; Apply writes
// the order-agnostic opposing-sides filter. Anchored popover, outside-click /
// Esc to close — the PlayerTypeahead interaction pattern.
const emit = defineEmits<{ close: [] }>();

const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();

const { list: characters } = useCharacters();

const root = ref<HTMLElement>();
const a = ref<string | null>(props.filters.state.value.matchup?.[0] ?? null);
const b = ref<string | null>(props.filters.state.value.matchup?.[1] ?? null);

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close');
}

function apply() {
  props.filters.setMatchup(a.value, b.value);
  emit('close');
}
function clear() {
  a.value = null;
  b.value = null;
  props.filters.setMatchup(null, null);
  emit('close');
}

const chipClass = (selected: boolean) => (selected ? 'opacity-100' : 'opacity-45 hover:opacity-80');

onMounted(() => document.addEventListener('pointerdown', onOutside, true));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));
</script>
