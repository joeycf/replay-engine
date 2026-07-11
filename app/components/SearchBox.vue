<script setup lang="ts">
// Global header search. On Browse (/) it live-binds ?q= (debounced replace).
// On every other route it's a plain input that navigates to /?q=<query> on
// submit — global reach without triggering the replays fetch off-Browse.
withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

const route = useRoute();
const router = useRouter();

const onBrowse = computed(() => route.path === '/');

const fromQuery = () => (typeof route.query.q === 'string' ? route.query.q : '');
const local = ref(onBrowse.value ? fromQuery() : '');

let timer: ReturnType<typeof setTimeout> | undefined;

function onInput(e: Event) {
  local.value = (e.target as HTMLInputElement).value;
  if (!onBrowse.value) return; // off-Browse: only navigate on submit
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(route.query)) {
      if (typeof v === 'string' && v !== '') q[k] = v;
    }
    const val = local.value.trim();
    if (val) q.q = val;
    else delete q.q;
    router.replace({ query: q });
  }, SEARCH_DEBOUNCE_MS);
}
function onSubmit() {
  if (onBrowse.value) return;
  const val = local.value.trim();
  router.push({ path: '/', query: val ? { q: val } : {} });
}

watch(
  () => route.query.q,
  () => {
    if (!onBrowse.value) return;
    const s = fromQuery();
    if (s !== local.value) local.value = s;
  },
);
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});
</script>

<template>
  <form
    role="search"
    class="flex items-center gap-[9px] border border-border bg-surface-sunken"
    :class="compact ? 'px-3 py-[9px]' : 'px-3.5 py-2.5'"
    @submit.prevent="onSubmit"
  >
    <span
      class="relative h-3.5 w-3.5 flex-none rounded-full border-[1.6px] border-text-muted"
      aria-hidden="true"
    >
      <span class="absolute -bottom-[3px] -right-1 h-[1.6px] w-1.5 rotate-45 bg-text-muted" />
    </span>
    <input
      :value="local"
      type="search"
      placeholder="Search title, player, character…"
      aria-label="Search title, player, or character"
      class="w-full min-w-0 flex-1 border-none bg-transparent font-ui text-[13px] text-text outline-none placeholder:text-text-muted"
      @input="onInput"
    />
  </form>
</template>
