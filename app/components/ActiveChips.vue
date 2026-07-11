<script setup lang="ts">
// Result count + removable active-filter chips + clear-all (design 1A).
const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();

const { pending } = useReplays();
const { chips, filtered } = props.filters;
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-3 border-b border-border-subtle bg-surface-sunken/60 px-4 py-[13px] md:px-[26px]"
  >
    <span class="font-mono text-[13px] text-text-secondary">
      <b data-testid="result-count" class="font-bold text-text">{{
        pending ? '…' : filtered.length.toLocaleString()
      }}</b>
      replays
    </span>
    <button
      v-for="chip in chips"
      :key="chip.key"
      type="button"
      class="inline-flex cursor-pointer items-center gap-[7px] border border-primary/40 bg-primary/15 px-2.5 py-[5px] font-ui text-[12px] font-semibold text-text"
      :aria-label="`Remove filter ${chip.label}`"
      @click="chip.remove()"
    >
      {{ chip.label }} <span class="opacity-65">✕</span>
    </button>
    <button
      v-if="chips.length"
      type="button"
      class="cursor-pointer px-1 py-[5px] font-ui text-[12px] font-semibold text-primary hover:text-primary-hover"
      @click="props.filters.clearAll()"
    >
      Clear all
    </button>
  </div>
</template>
