<script setup lang="ts">
  import { onBeforeUnmount, onMounted, ref } from 'vue'

  const containerRef = ref<HTMLElement | null>(null)
  const height = ref('100%')
  let stageObserver: ResizeObserver | null = null

  function updateHeight() {
    const container = containerRef.value
    if (!(container instanceof HTMLElement)) return
    const viewport = window.visualViewport
    const visibleBottom = (viewport?.height || window.innerHeight) + (viewport?.offsetTop || 0)
    const availableHeight = visibleBottom - container.getBoundingClientRect().top
    const stageHeight = container.parentElement?.clientHeight || window.innerHeight
    height.value = `${Math.max(0, Math.round(Math.min(stageHeight, availableHeight)))}px`
  }

  onMounted(() => {
    updateHeight()
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.visualViewport?.addEventListener('scroll', updateHeight)
    window.addEventListener('resize', updateHeight)
    const stage = containerRef.value?.parentElement
    if (stage instanceof HTMLElement && typeof ResizeObserver !== 'undefined') {
      stageObserver = new ResizeObserver(updateHeight)
      stageObserver.observe(stage)
    }
  })

  onBeforeUnmount(() => {
    window.visualViewport?.removeEventListener('resize', updateHeight)
    window.visualViewport?.removeEventListener('scroll', updateHeight)
    window.removeEventListener('resize', updateHeight)
    stageObserver?.disconnect()
  })
</script>

<template>
  <div ref="containerRef" class="flex min-h-0 min-w-0 flex-1 overflow-hidden" :style="{ height }">
    <slot />
  </div>
</template>
