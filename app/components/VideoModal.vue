<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[70] md:flex md:items-center md:justify-center md:p-8"
        @keydown="onKeydown"
      >
        <div
          class="absolute inset-0 bg-bg/85 backdrop-blur-[6px]"
          aria-hidden="true"
          @click="close()"
        />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-label="replay?.title ?? 'Replay'"
          tabindex="-1"
          class="modal-panel relative h-full w-full overflow-y-auto bg-bg outline-none md:h-auto md:max-h-[85vh] md:w-[min(940px,100%)] md:border md:border-border md:bg-surface md:shadow-modal md:cut-lg"
        >
          <!-- mobile top bar -->
          <div class="flex items-center gap-3 px-4 py-3 md:hidden">
            <button
              type="button"
              class="flex h-[30px] w-[30px] cursor-pointer items-center justify-center border border-border bg-surface-raised text-[18px] leading-none text-text"
              aria-label="Back to browse"
              @click="close()"
            >
              ‹
            </button>
            <span class="font-display text-[15px] font-semibold text-text">Replay</span>
            <SourceBadge
              v-if="replay"
              :source="replay.source"
              class="ml-auto"
            />
          </div>

          <!-- desktop top bar -->
          <div class="hidden items-center gap-3 border-b border-border-subtle px-5 py-3.5 md:flex">
            <SourceBadge
              v-if="replay"
              :source="replay.source"
              size="md"
            />
            <span class="truncate font-mono text-[11px] text-text-muted">{{ metaLine }}</span>
            <a
              :href="youtubeUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="ml-auto whitespace-nowrap font-mono text-[11px] text-secondary hover:underline"
              >Watch on YouTube ↗</a
            >
            <button
              type="button"
              class="h-[34px] w-[34px] flex-none cursor-pointer border border-border bg-surface-raised text-[16px] leading-none text-text-secondary hover:text-text"
              aria-label="Close"
              @click="close()"
            >
              ✕
            </button>
          </div>

          <template v-if="replay">
            <LiteYouTube
              :video-id="replay.id"
              :thumbnail="thumbOf(replay)"
              :title="replay.title"
            />

            <!-- mobile meta line -->
            <div class="flex items-center justify-between gap-3 px-4 pt-4 md:hidden">
              <span class="font-mono text-[10px] tracking-[.04em] text-text-muted">{{
                metaLine
              }}</span>
              <a
                :href="youtubeUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="whitespace-nowrap font-mono text-[10px] text-secondary"
                >YouTube ↗</a
              >
            </div>

            <div class="px-4 py-5 md:px-6 md:py-[22px]">
              <!-- sides: desktop row -->
              <div class="hidden flex-wrap items-stretch gap-5 md:flex">
                <div class="min-w-[200px] flex-1">
                  <div class="flex items-center gap-2.5">
                    <div class="flex">
                      <CharacterBadge
                        v-for="(c, i) in sideA!.characters"
                        :key="c"
                        :character-id="c"
                        :size="44"
                        :notch="9"
                        :font-size="16"
                        strong
                        :class="i > 0 ? '-ml-2.5' : ''"
                      />
                    </div>
                    <div>
                      <div class="font-display text-[14px] font-semibold text-text">
                        {{ charNames(sideA) }}
                      </div>
                      <div class="mt-[3px] inline-flex items-center gap-1.5">
                        <VerifiedMark
                          v-if="isFeatured(sideA)"
                          :size="10"
                        />
                        <span class="font-ui text-[14px] font-semibold text-text-secondary">{{
                          playerLabel(sideA)
                        }}</span>
                      </div>
                      <GameSideBadge
                        :replay="replay"
                        :side="0"
                        context="modal"
                      />
                      <div
                        v-if="sideA?.rank"
                        class="mt-1 font-mono text-[11px] text-text-muted"
                      >
                        {{ sideA.rank }}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex items-center font-display text-[22px] font-bold text-primary">
                  VS
                </div>
                <div class="min-w-[200px] flex-1">
                  <div class="flex items-center justify-end gap-2.5">
                    <div class="text-right">
                      <div class="font-display text-[14px] font-semibold text-text">
                        {{ charNames(sideB) }}
                      </div>
                      <div class="mt-[3px] inline-flex items-center gap-1.5">
                        <span class="font-ui text-[14px] font-semibold text-text-secondary">{{
                          playerLabel(sideB)
                        }}</span>
                        <VerifiedMark
                          v-if="isFeatured(sideB)"
                          :size="10"
                        />
                      </div>
                      <GameSideBadge
                        :replay="replay"
                        :side="1"
                        context="modal"
                      />
                      <div
                        v-if="sideB?.rank"
                        class="mt-1 font-mono text-[11px] text-text-muted"
                      >
                        {{ sideB.rank }}
                      </div>
                    </div>
                    <div class="flex">
                      <CharacterBadge
                        v-for="(c, i) in sideB!.characters"
                        :key="c"
                        :character-id="c"
                        :size="44"
                        :notch="9"
                        :font-size="16"
                        strong
                        :class="i > 0 ? '-ml-2.5' : ''"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <!-- sides: mobile stacked -->
              <div class="md:hidden">
                <div class="mt-3.5 flex items-center gap-2.5">
                  <div class="flex">
                    <CharacterBadge
                      v-for="(c, i) in sideA!.characters"
                      :key="c"
                      :character-id="c"
                      :size="40"
                      :notch="8"
                      :font-size="14"
                      strong
                      :class="i > 0 ? '-ml-[9px]' : ''"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="font-display text-[13px] font-semibold text-text">
                      {{ charNames(sideA) }}
                    </div>
                    <div class="inline-flex items-center gap-[5px]">
                      <VerifiedMark v-if="isFeatured(sideA)" />
                      <span class="font-ui text-[13px] font-semibold text-text-secondary">{{
                        playerLabel(sideA)
                      }}</span>
                    </div>
                    <GameSideBadge
                      :replay="replay"
                      :side="0"
                      context="modal"
                      compact
                    />
                  </div>
                </div>
                <div class="my-2 text-center font-display text-[13px] font-bold text-primary">
                  VS
                </div>
                <div class="flex items-center gap-2.5">
                  <div class="flex">
                    <CharacterBadge
                      v-for="(c, i) in sideB!.characters"
                      :key="c"
                      :character-id="c"
                      :size="40"
                      :notch="8"
                      :font-size="14"
                      strong
                      :class="i > 0 ? '-ml-[9px]' : ''"
                    />
                  </div>
                  <div class="min-w-0">
                    <div class="font-display text-[13px] font-semibold text-text">
                      {{ charNames(sideB) }}
                    </div>
                    <div class="inline-flex items-center gap-[5px]">
                      <VerifiedMark v-if="isFeatured(sideB)" />
                      <span class="font-ui text-[13px] font-semibold text-text-secondary">{{
                        playerLabel(sideB)
                      }}</span>
                    </div>
                    <GameSideBadge
                      :replay="replay"
                      :side="1"
                      context="modal"
                      compact
                    />
                  </div>
                </div>
              </div>

              <!-- game-badge slot (v0.3.0): match-level/unbound chips — the
                   override owns the row (2XKO's unordered fuse pair) -->
              <GameReplayBadges
                :replay="replay"
                context="modal"
              />

              <!-- related replays -->
              <div
                v-if="related.length"
                class="mt-6"
              >
                <div
                  class="mb-3 font-ui text-[10px] font-semibold uppercase tracking-label text-text-muted"
                >
                  Related replays
                </div>
                <!-- desktop grid -->
                <div
                  data-testid="related-grid"
                  class="hidden grid-cols-5 gap-3 md:grid"
                >
                  <button
                    v-for="r in related.slice(0, 10)"
                    :key="r.id"
                    type="button"
                    class="cursor-pointer border border-border-subtle bg-surface text-left transition-colors hover:border-primary/50"
                    :aria-label="r.title"
                    @click="swap(r.id)"
                  >
                    <div
                      class="relative aspect-video overflow-hidden"
                      style="
                        background: repeating-linear-gradient(
                          135deg,
                          var(--color-surface-raised),
                          var(--color-surface-raised) 7px,
                          var(--color-surface) 7px,
                          var(--color-surface) 14px
                        );
                      "
                    >
                      <img
                        :src="thumbOf(r)"
                        alt=""
                        class="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        @error="($event.target as HTMLElement).style.display = 'none'"
                      />
                      <span
                        v-if="(r.durationSec ?? 0) > 0"
                        class="absolute bottom-[5px] right-[5px] bg-bg/80 px-[5px] py-[2px] font-mono text-[9px] text-text"
                        >{{ formatDuration(r.durationSec!) }}</span
                      >
                    </div>
                    <div class="flex items-center justify-center gap-1 p-2">
                      <CharacterBadge
                        v-for="c in r.sides[0].characters"
                        :key="`a${c}`"
                        :character-id="c"
                        :size="20"
                        :notch="0"
                        :font-size="8"
                      />
                      <span class="font-display text-[8px] font-bold text-text-muted">V</span>
                      <CharacterBadge
                        v-for="c in r.sides[1].characters"
                        :key="`b${c}`"
                        :character-id="c"
                        :size="20"
                        :notch="0"
                        :font-size="8"
                      />
                    </div>
                  </button>
                </div>
                <!-- mobile rows -->
                <div
                  data-testid="related-list"
                  class="flex flex-col gap-[9px] md:hidden"
                >
                  <button
                    v-for="r in related.slice(0, 5)"
                    :key="r.id"
                    type="button"
                    class="flex cursor-pointer items-center gap-[11px] border border-border-subtle bg-surface p-2 text-left"
                    :aria-label="r.title"
                    @click="swap(r.id)"
                  >
                    <div
                      class="relative aspect-video w-[104px] flex-none overflow-hidden"
                      style="
                        background: repeating-linear-gradient(
                          135deg,
                          var(--color-surface-raised),
                          var(--color-surface-raised) 7px,
                          var(--color-surface) 7px,
                          var(--color-surface) 14px
                        );
                      "
                    >
                      <img
                        :src="thumbOf(r)"
                        alt=""
                        class="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                        decoding="async"
                        @error="($event.target as HTMLElement).style.display = 'none'"
                      />
                    </div>
                    <div class="min-w-0 truncate font-ui text-[12px] font-semibold text-text">
                      {{ relPlayer(r, 0) }} <span class="text-text-muted">vs</span>
                      {{ relPlayer(r, 1) }}
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- mobile mini-disclaimer -->
            <div
              class="border-t border-border-subtle bg-surface-sunken px-4 py-3.5 font-ui text-[10px] text-text-muted md:hidden"
            >
              Unofficial fan project · not affiliated with {{ game.rightsHolder }}.
            </div>
          </template>

          <!-- pending / not-found states -->
          <template v-else>
            <div
              v-if="pending"
              class="flex aspect-video items-center justify-center border-b border-border-subtle bg-surface-raised"
              data-testid="modal-pending"
            >
              <BrandSpinner :size="64" />
            </div>
            <div
              v-if="pending"
              class="p-6 text-center font-mono text-[12px] text-text-muted"
            >
              Loading replay…
            </div>
            <div
              v-else
              class="p-10 text-center"
            >
              <div class="font-display text-[18px] font-semibold text-text-secondary">
                Replay not found
              </div>
              <button
                type="button"
                class="mt-4 cursor-pointer border border-border bg-surface-raised px-4 py-2 font-ui text-[13px] font-semibold text-text"
                @click="close()"
              >
                Back to browse
              </button>
            </div>
          </template>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
// Replay view — desktop modal / mobile full-screen (design VIDEO VIEW).
// Open state lives in ?v= (useVideoModal); Lite-YouTube facade inside; focus
// trap + Esc + scroll lock; related strip swaps ?v= in place. Sides render
// their character lists length-agnostic; the disclaimer comes from useGame().
import type { Replay, Side } from '@engine/types';

const { openId, replay, pending, close, swap, related } = useVideoModal();
const { byId: playerById } = usePlayers();
const { byId: charById } = useCharacters();
const game = useGame();

const panel = ref<HTMLElement>();
let lastFocus: HTMLElement | null = null;

// Esc lives on document (capture) — focus may sit inside the YouTube iframe,
// where a panel-level keydown would never fire.
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !panel.value) return;
  // visible elements only — hidden ones (e.g. the mobile top bar on desktop)
  // can't take focus, and wrapping onto them lets Tab escape the dialog
  const els = [
    ...panel.value.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => el.checkVisibility?.() ?? el.offsetParent !== null);
  if (!els.length) return;
  const first = els[0]!;
  const last = els[els.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    last.focus();
    e.preventDefault();
  } else if (!e.shiftKey && document.activeElement === last) {
    first.focus();
    e.preventDefault();
  }
}

const charNames = (s?: Side) => s?.characters.map((c) => charById(c)?.name ?? c).join(' + ') ?? '';
// a side may be a team of people (Side.players) — join like the shipped build
const playerLabel = (s?: Side) =>
  s
    ? sidePlayers(s)
        .map((id) => playerById(id)?.handle ?? id)
        .join(' + ')
    : '';
const isFeatured = (s?: Side) => !!s && sidePlayers(s).some((id) => playerById(id)?.featured);
const relPlayer = (r: Replay, i: number) => {
  const side = r.sides[i];
  if (!side) return '—';
  return (
    sidePlayers(side)
      .map((id) => playerById(id)?.handle ?? id)
      .join(' + ') || '—'
  );
};

const isOpen = computed(() => openId.value !== null);

const sideA = computed<Side | undefined>(() => replay.value?.sides[0]);
const sideB = computed<Side | undefined>(() => replay.value?.sides[1]);

const metaLine = computed(() => {
  const r = replay.value;
  if (!r) return '';
  return [
    r.patch,
    ...(sideA.value?.rank ? [sideA.value.rank] : []),
    ...((r.durationSec ?? 0) > 0 ? [formatDuration(r.durationSec!)] : []),
    relativeDate(r.date),
    `${formatViews(r.views ?? 0)} views`,
  ]
    .filter(Boolean)
    .join(' · ');
});
const youtubeUrl = computed(() =>
  openId.value ? `https://www.youtube.com/watch?v=${openId.value}` : '#',
);
const thumbOf = (r: Replay) => r.thumb ?? `https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`;

watch(
  isOpen,
  (v) => {
    if (import.meta.server) return;
    if (v) {
      lastFocus = document.activeElement as HTMLElement | null;
      lockBodyScroll();
      document.addEventListener('keydown', onDocKeydown, true);
      nextTick(() => panel.value?.focus());
    } else {
      unlockBodyScroll();
      document.removeEventListener('keydown', onDocKeydown, true);
      lastFocus?.focus?.();
      lastFocus = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (isOpen.value) {
    unlockBodyScroll();
    document.removeEventListener('keydown', onDocKeydown, true);
  }
});
</script>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s;
}
.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.2s var(--ease-snap);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translateY(8px) scale(0.985);
}
</style>
