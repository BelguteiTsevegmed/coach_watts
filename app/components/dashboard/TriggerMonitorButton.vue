<template>
  <UTooltip v-if="visible" :text="t('navbar_tasks_tooltip')" :popper="{ placement: 'bottom' }">
    <UButton
      color="neutral"
      variant="outline"
      size="sm"
      class="font-bold"
      icon="i-heroicons-cpu-chip"
      :aria-label="t('navbar_tasks_tooltip')"
      @click="
        () => {
          void toggle()
        }
      "
    >
      <span class="hidden md:inline">{{ t('navbar_tasks') }}</span>
      <template v-if="activeRunCount > 0" #trailing>
        <UBadge color="primary" size="xs" :ui="{ base: 'rounded-full' }" class="-ml-1">
          {{ activeRunCount }}
        </UBadge>
      </template>
    </UButton>
  </UTooltip>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'

  const { t } = useTranslate('dashboard')
  const { activeRunCount } = useUserRunsState()
  const { toggle, isOpen } = useTriggerMonitor()
  const { data } = useAuth()

  // Background jobs are plumbing. Athletes only see this button while the
  // coach is actually working on something (or the panel is open); admins
  // keep it everywhere for debugging.
  const visible = computed(
    () => activeRunCount.value > 0 || isOpen.value || Boolean((data.value?.user as any)?.isAdmin)
  )
</script>
