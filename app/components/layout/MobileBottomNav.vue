<script setup lang="ts">
  import type { AppBottomTab } from '~/composables/useAppNavigation'

  /**
   * Runna-style bottom tab bar for phones and tablets (< lg). Shows the primary
   * destinations plus a "More" button that opens the navigation drawer.
   *
   * Height is h-16 (4rem) + the bottom safe-area inset; the default layout
   * reserves exactly that via `--app-bottom-nav-height` so page content and
   * floating elements stay clear of the bar. Keep the two in sync.
   */
  defineProps<{
    tabs: AppBottomTab[]
    moreLabel: string
    /** The current page lives behind "More". */
    moreActive?: boolean
    /** The drawer the "More" button controls is open. */
    moreOpen?: boolean
    /** Accessible name of the <nav> landmark. */
    label: string
  }>()

  const emit = defineEmits<{
    more: []
  }>()

  const itemClass =
    'group flex h-full w-full flex-col items-center justify-center gap-1 rounded-lg text-[11px] font-medium leading-none transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'

  function iconWrapClass(active: boolean) {
    return [
      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
      active ? 'bg-primary/10 dark:bg-primary/15' : 'group-hover:bg-elevated'
    ]
  }
</script>

<template>
  <nav
    :aria-label="label"
    class="fixed inset-x-0 bottom-0 z-30 border-t border-default bg-default/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md lg:hidden print:hidden"
    data-testid="mobile-bottom-nav"
  >
    <ul class="mx-auto grid h-16 max-w-xl grid-cols-5 px-1">
      <li v-for="tab in tabs" :key="tab.id" class="min-w-0">
        <NuxtLink
          :to="tab.to"
          :aria-current="tab.active ? 'page' : undefined"
          :class="[itemClass, tab.active ? 'text-primary' : 'text-muted hover:text-highlighted']"
          @click="tab.onSelect()"
        >
          <span :class="iconWrapClass(tab.active)">
            <UIcon :name="tab.icon" class="size-5 shrink-0" aria-hidden="true" />
          </span>
          <span class="max-w-full truncate px-0.5">{{ tab.label }}</span>
        </NuxtLink>
      </li>
      <li class="min-w-0">
        <button
          type="button"
          aria-haspopup="dialog"
          :aria-expanded="moreOpen ? 'true' : 'false'"
          :class="[
            itemClass,
            moreActive || moreOpen ? 'text-primary' : 'text-muted hover:text-highlighted'
          ]"
          @click="emit('more')"
        >
          <span :class="iconWrapClass(!!(moreActive || moreOpen))">
            <UIcon name="i-lucide-menu" class="size-5 shrink-0" aria-hidden="true" />
          </span>
          <span class="max-w-full truncate px-0.5">{{ moreLabel }}</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
