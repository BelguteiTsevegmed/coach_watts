<template>
  <section v-if="status" class="space-y-4">
    <div>
      <h2 class="font-medium">{{ headline }}</h2>
      <p class="mt-2 text-sm text-muted leading-relaxed">{{ description }}</p>
      <p v-if="status.workoutCount > 0 || status.wellnessCount > 0" class="mt-2 text-sm text-muted">
        {{
          t('setup_progress_data_summary', {
            workouts: status.workoutCount,
            wellness: status.wellnessCount
          })
        }}
      </p>
    </div>
    <div class="flex flex-wrap gap-3">
      <UButton
        v-if="status.importState === 'failed'"
        color="neutral"
        variant="outline"
        @click="emit('sync')"
        >{{ t('setup_progress_retry_sync') }}</UButton
      >
      <UButton
        v-else-if="status.hasFirstInsight && !status.activationComplete"
        color="neutral"
        variant="outline"
        @click="emit('complete')"
        >{{ t('setup_progress_view_insight') }}</UButton
      >
      <UButton
        v-else-if="!status.hasPrimaryGoal && !status.hasUsableData"
        to="/profile/goals?new=1&returnTo=/dashboard"
        color="neutral"
        variant="outline"
        >{{ td('journey_setup_goal_action') }}</UButton
      >
      <UButton
        v-else-if="!status.hasActivePlan && !status.hasUsableData"
        to="/plan?returnTo=/dashboard"
        color="neutral"
        variant="outline"
        >{{ td('journey_setup_plan_action') }}</UButton
      >
      <UButton
        v-else-if="!status.hasIntegration"
        to="/settings/apps"
        color="neutral"
        variant="outline"
        >{{ t('setup_progress_connect_apps') }}</UButton
      >
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { OnboardingStatus } from '#shared/onboarding-status'

  const props = defineProps<{
    status: OnboardingStatus | null
  }>()

  const emit = defineEmits<{
    sync: []
    complete: []
    dismiss: []
  }>()

  const { t } = useTranslate('onboarding')
  const { t: td } = useTranslate('dashboard')

  const headline = computed(() => {
    if (!props.status) return ''
    if (props.status.importState === 'importing') return t.value('setup_progress_importing_title')
    if (props.status.importState === 'failed') return t.value('setup_progress_failed_title')
    if (props.status.importState === 'empty') return t.value('setup_progress_empty_title')
    if (props.status.hasFirstInsight) return t.value('setup_progress_insight_ready_title')
    if (props.status.hasUsableData) return t.value('setup_progress_analysis_title')
    if (props.status.hasIntegration) return t.value('setup_progress_connected_title')
    return t.value('setup_progress_connect_title')
  })

  const description = computed(() => {
    if (!props.status) return ''
    if (props.status.importErrorMessage) return props.status.importErrorMessage
    if (props.status.importState === 'importing') {
      return t.value('setup_progress_importing_desc')
    }
    if (props.status.importState === 'empty') {
      return t.value('setup_progress_empty_desc')
    }
    if (props.status.hasFirstInsight) {
      return t.value('setup_progress_insight_ready_desc')
    }
    if (props.status.hasUsableData) {
      return t.value('setup_progress_analysis_desc')
    }
    if (props.status.hasIntegration) {
      return t.value('setup_progress_connected_desc')
    }
    return t.value('setup_progress_connect_desc')
  })
</script>
