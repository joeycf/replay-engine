<script setup lang="ts">
// Typeahead over the full player registry (featured + discovered), anchored
// under the "Search all N players" affordance. Click toggles; stays open for
// multi-select; closes on outside click / Esc. Player aliases come from the
// well-known extra.aliases key.
const emit = defineEmits<{ close: [] }>();

const props = defineProps<{ filters: ReturnType<typeof useFilters> }>();

const { ranked } = useFeaturedPlayers();

const q = ref('');
const root = ref<HTMLElement>();
const input = ref<HTMLInputElement>();

const playerAliases = (extra?: Record<string, unknown>): string[] => {
  const aliases = extra?.aliases;
  return Array.isArray(aliases) ? aliases.filter((a): a is string => typeof a === 'string') : [];
};

function onOutside(e: PointerEvent) {
  if (root.value && !root.value.contains(e.target as Node)) emit('close');
}

const results = computed(() => {
  const n = normalizeText(q.value.trim());
  const base = n
    ? ranked.value.filter(
        (p) =>
          normalizeText(p.handle).includes(n) ||
          playerAliases(p.extra).some((a) => normalizeText(a).includes(n)),
      )
    : ranked.value;
  return base.slice(0, 60);
});

onMounted(() => {
  input.value?.focus();
  document.addEventListener('pointerdown', onOutside, true);
});
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside, true));
</script>

<template>
  <div
    ref="root"
    data-testid="player-typeahead"
    class="absolute left-0 top-full z-30 mt-2 flex max-h-[340px] w-[300px] flex-col border border-border bg-surface shadow-lg"
    @keydown.esc.stop="emit('close')"
  >
    <div class="border-b border-border-subtle p-2">
      <input
        ref="input"
        v-model="q"
        type="search"
        placeholder="Type a player name…"
        aria-label="Search all players"
        class="w-full border border-border bg-surface-sunken px-2.5 py-2 font-ui text-[13px] text-text outline-none placeholder:text-text-muted"
      />
    </div>
    <div class="min-h-0 flex-1 overflow-y-auto p-1">
      <button
        v-for="p in results"
        :key="p.id"
        type="button"
        class="flex w-full cursor-pointer items-center gap-2 px-2.5 py-2 text-left font-ui text-[12.5px] font-semibold text-text hover:bg-surface-raised"
        :class="props.filters.isActive('players', p.id) ? 'bg-primary/15' : ''"
        :aria-pressed="props.filters.isActive('players', p.id)"
        @click="props.filters.togglePlayer(p.id)"
      >
        <VerifiedMark v-if="p.featured" :size="9" />
        <span class="min-w-0 truncate">{{ p.handle }}</span>
        <span class="ml-auto font-mono text-[10px] text-text-muted">{{ p.appearances }}</span>
      </button>
      <div v-if="results.length === 0" class="px-3 py-4 font-ui text-[12px] text-text-muted">
        No players match.
      </div>
    </div>
  </div>
</template>
