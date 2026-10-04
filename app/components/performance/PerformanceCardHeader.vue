<template>
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 flex-1 basis-56">
      <component :is="as" class="text-base font-semibold text-highlighted">
        <slot name="title">{{ title }}</slot>
      </component>
      <p v-if="description || $slots.description" class="mt-1 text-sm text-muted">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
  withDefaults(
    defineProps<{
      title?: string
      description?: string
      as?: 'h2' | 'h3' | 'h4'
    }>(),
    { title: '', description: '', as: 'h2' }
  )
</script>
