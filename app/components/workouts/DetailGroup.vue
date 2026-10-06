<template>
  <section :id="id" class="scroll-mt-20 flex flex-col gap-4 sm:gap-6" :data-testid="`group-${id}`">
    <div
      class="flex items-center justify-between gap-3 px-4 sm:px-0 pt-4 sm:pt-6 border-t border-gray-200 dark:border-white/5"
    >
      <div class="flex items-center gap-2 min-w-0">
        <UIcon v-if="icon" :name="icon" class="w-5 h-5 shrink-0 text-primary-500" />
        <h2 class="text-lg font-bold text-gray-900 dark:text-white truncate">{{ title }}</h2>
        <UBadge v-if="badge" color="warning" variant="soft" size="sm">{{ badge }}</UBadge>
      </div>
      <div v-if="$slots.actions" class="flex items-center gap-2 shrink-0">
        <slot name="actions" />
      </div>
    </div>
    <div class="flex flex-col gap-4 sm:gap-8">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
  /** A titled group of sections on the completed-workout page (see `~/utils/workout-detail`). */
  defineProps<{
    id: string
    title: string
    icon?: string
    badge?: string
  }>()
</script>
