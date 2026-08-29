<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="link"
        class="fixed inset-0 z-[75] flex items-center justify-center p-4"
        @keydown="onKeydown"
      >
        <div
          class="absolute inset-0 bg-bg/85 backdrop-blur-[6px]"
          aria-hidden="true"
          @click="dismiss()"
        />
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leaving-site-title"
          tabindex="-1"
          class="modal-panel relative w-[min(420px,100%)] border border-border bg-surface p-5 shadow-modal outline-none cut-lg md:p-6"
          data-testid="leaving-site-dialog"
        >
          <h2
            id="leaving-site-title"
            class="font-display text-[19px] font-bold text-text md:text-[21px]"
          >
            You're leaving Replay Database
          </h2>
          <p class="mt-2.5 font-ui text-[13px] leading-relaxed text-text-secondary md:text-[14px]">
            <span class="font-semibold text-text">{{ link.partner.name }}</span>
            {{ link.partner.blurb }}
          </p>
          <p class="mt-1.5 font-ui text-[12px] leading-relaxed text-text-muted md:text-[13px]">
            It opens in a new tab, so this page stays open here.
          </p>
          <div class="mt-5 flex flex-wrap items-center justify-end gap-2.5">
            <button
              ref="stay"
              type="button"
              class="cursor-pointer border border-border px-4 py-2 font-ui text-[13px] font-semibold text-text-secondary transition-colors duration-normal hover:border-border hover:text-text"
              @click="dismiss()"
            >
              Stay here
            </button>
            <a
              :href="link.href"
              target="_blank"
              rel="noopener noreferrer"
              class="bg-primary px-4 py-2 font-ui text-[13px] font-bold text-primary-contrast transition-colors duration-normal cut-bl-md hover:bg-primary-hover"
              data-testid="leaving-site-continue"
              @click="dismiss()"
            >
              Continue to {{ link.partner.name }} ↗
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The leaving-site interstitial (additive, v0.12.0) — one mounted instance
 * renders whatever useExternalLink() has pending, so a partner link anywhere on
 * the page needs only a @click handler, not chrome of its own.
 *
 * MOUNTED IN THE LAYOUT, not per page (app/layouts/default.vue). Both existing
 * overlays mount per page because their triggers are page content; this one's
 * trigger is the nav, which is on every route.
 *
 * Copy mirrors the dialog ComboForge already shows before sending someone to us,
 * so the two sides of the partnership read as one arrangement. "Replay Database"
 * is the platform name rather than a game noun — useBrandName() already composes
 * that exact suffix — and the second line says "this page" so it does not have to
 * repeat a name that reads "Street Fighter 6 Replay Database" in full.
 *
 * The lifecycle block below (focus capture/restore, Esc, scroll lock) is the
 * third copy of a shape VideoModal and FilterDrawer already share. Extracting a
 * useOverlay is the right cleanup and is deliberately NOT done here — it would
 * mean editing both shipped overlays to add a nav link (STACK §23).
 */
const { pending, dismiss } = useExternalLink();
const link = pending;

const panel = ref<HTMLElement>();
const stay = ref<HTMLElement>();
let lastFocus: HTMLElement | null = null;

/** Esc on document, matching VideoModal — focus may not be inside the panel. */
function onDocKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') dismiss();
}

/** Tab wrap. Only two focusables here, but the trap still matters: without it
 *  Tab walks into the page behind, which is still rendered and still clickable. */
function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab' || !panel.value) return;
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

watch(
  () => link.value !== null,
  (open) => {
    if (import.meta.server) return;
    if (open) {
      lastFocus = document.activeElement as HTMLElement | null;
      lockBodyScroll();
      document.addEventListener('keydown', onDocKeydown, true);
      // "Stay here" takes focus, not "Continue": the safe choice should be the
      // one a stray Enter lands on.
      nextTick(() => (stay.value ?? panel.value)?.focus());
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
  if (link.value) {
    unlockBodyScroll();
    document.removeEventListener('keydown', onDocKeydown, true);
  }
});
</script>

<style scoped>
/* Same transition shape as VideoModal: the wrapper fades, a named inner class
   carries the transform. */
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
