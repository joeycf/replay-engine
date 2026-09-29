<template>
  <!-- Every part is one skel-* class (tailwind/structural.css) rather than a
       utility list: this card is prerendered into every player page's fallback
       grid, and the lists were most of its bytes. -->
  <div
    class="skel-card"
    aria-hidden="true"
  >
    <div class="skel aspect-video" />
    <div class="skel-body">
      <div class="skel-vs">
        <div class="skel-pair">
          <span class="skel skel-chip" />
          <span class="skel skel-chip" />
        </div>
        <span class="skel h-3 w-5" />
        <div class="skel-pair">
          <span class="skel skel-chip" />
          <span class="skel skel-chip" />
        </div>
      </div>
      <div class="skel-row mt-[11px]">
        <span class="skel h-3 w-20" />
        <span class="skel h-3 w-16" />
      </div>
      <div class="skel-row skel-foot">
        <span class="skel h-2.5 w-14" />
        <span class="skel h-2.5 w-12" />
      </div>
    </div>
  </div>
</template>
