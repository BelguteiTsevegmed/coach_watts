<template>
  <!-- Desktop: the week column of the month grid -->
  <div v-if="variant === 'column'" class="flex h-full flex-col gap-1.5" data-testid="week-summary">
    <div class="flex items-center justify-between gap-1">
      <span
        class="text-xs font-semibold"
        :class="isCurrentWeek ? 'text-primary-600 dark:text-primary-400' : 'text-muted'"
      >
        {{ isCurrentWeek ? t('week_this_week') : weekLabel }}
      </span>
    </div>

    <template v-if="!progress.isEmpty">
      <div v-if="progress.totalDuration > 0" class="text-xs leading-snug">
        <span v-if="plannedOnly" class="font-medium text-highlighted">
          {{ t('week_amount_planned', { amount: totalTime }) }}
        </span>
        <template v-else>
          <span class="font-semibold text-highlighted">{{ doneTime }}</span>
          <span v-if="progress.hasRemaining && totalTime" class="ms-1 text-muted">
            {{ t('week_of_total', { total: totalTime }) }}
          </span>
        </template>
      </div>

      <div
        v-if="!plannedOnly"
        class="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
        role="progressbar"
        :aria-valuenow="percent"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="t('week_progress_label')"
      >
        <div class="h-full rounded-full bg-green-500" :style="{ width: `${percent}%` }" />
      </div>

      <div v-if="progress.totalDistance > 0" class="text-[11px] leading-snug text-muted">
        {{ distanceText }}
      </div>

      <div
        v-if="settings.showSessionDetails && progress.totalTss > 0"
        class="text-[11px] text-muted"
      >
        {{ tssText }}
      </div>
    </template>
    <div v-else class="text-[11px] text-muted">{{ t('week_nothing_planned') }}</div>

    <div
      v-if="settings.showTrainingStress && summary.ctl != null"
      class="mt-auto space-y-0.5 border-t border-default pt-1.5 text-[11px]"
    >
      <div class="flex items-center justify-between gap-1">
        <span class="text-muted">{{ t('load_fitness') }}</span>
        <span class="font-semibold text-highlighted">{{ Math.round(summary.ctl) }}</span>
      </div>
      <div v-if="summary.tsb != null" class="flex items-center justify-between gap-1">
        <span class="text-muted">{{ t('load_form') }}</span>
        <span class="font-semibold" :class="getFormColorClass(summary.tsb)">
          {{ formatSigned(summary.tsb) }}
        </span>
      </div>
      <div
        v-if="summary.tsb != null"
        class="text-right text-[10px]"
        :class="getFormColorClass(summary.tsb)"
      >
        {{ formStateLabel(summary.tsb) }}
      </div>
    </div>
  </div>

  <!-- Mobile: the sticky week header of the agenda list -->
  <div v-else class="min-w-0" data-testid="week-summary">
    <div class="flex items-baseline justify-between gap-3">
      <span
        class="shrink-0 text-xs font-semibold"
        :class="isCurrentWeek ? 'text-primary-600 dark:text-primary-400' : 'text-highlighted'"
      >
        {{ isCurrentWeek ? t('week_this_week') : weekRangeLabel }}
      </span>
      <span class="min-w-0 truncate text-[11px] text-muted">{{ compactText }}</span>
    </div>
    <div
      v-if="!progress.isEmpty && !plannedOnly"
      class="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"
      role="progressbar"
      :aria-valuenow="percent"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-label="t('week_progress_label')"
    >
      <div class="h-full rounded-full bg-green-500" :style="{ width: `${percent}%` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import {
    distanceUnitLabel,
    formatDistanceValue,
    formatSessionDuration,
    formatSigned,
    getFormColorClass,
    getFormState,
    getWeekProgress,
    type ActivityCalendarSettings,
    type WeekSummaryTotals
  } from '~/utils/calendarDisplay'

  const props = withDefaults(
    defineProps<{
      summary: WeekSummaryTotals & { ctl: number | null; tsb: number | null }
      weekStart: Date
      weekEnd: Date
      weekNumber: number
      isCurrentWeek: boolean
      /** The week has not started yet: describe what is planned rather than progress. */
      isFutureWeek?: boolean
      settings: ActivityCalendarSettings
      distanceUnits?: string | null
      variant?: 'column' | 'bar'
    }>(),
    { distanceUnits: 'Kilometers', variant: 'column', isFutureWeek: false }
  )

  const { t } = useTranslate('activities')
  const { formatDateUTC } = useFormat()

  const progress = computed(() => getWeekProgress(props.summary))
  const percent = computed(() => Math.round(progress.value.ratio * 100))

  const weekLabel = computed(() => t.value('week_number', { week: props.weekNumber }))
  const weekRangeLabel = computed(
    () => `${formatDateUTC(props.weekStart, 'MMM d')} – ${formatDateUTC(props.weekEnd, 'MMM d')}`
  )

  const plannedOnly = computed(
    () =>
      props.isFutureWeek &&
      progress.value.doneDuration === 0 &&
      progress.value.doneDistance === 0 &&
      progress.value.doneTss === 0
  )

  const doneTime = computed(() => formatSessionDuration(progress.value.doneDuration) || '0m')
  const totalTime = computed(() => formatSessionDuration(progress.value.totalDuration))

  const timeText = computed(() => {
    if (progress.value.totalDuration <= 0) return ''
    if (plannedOnly.value) return t.value('week_amount_planned', { amount: totalTime.value })
    if (
      !progress.value.hasRemaining ||
      progress.value.totalDuration === progress.value.doneDuration
    )
      return doneTime.value
    return t.value('week_amount_of', { done: doneTime.value, total: totalTime.value })
  })

  const distanceText = computed(() => {
    const unit = distanceUnitLabel(props.distanceUnits)
    const done = formatDistanceValue(progress.value.doneDistance, props.distanceUnits)
    const total = formatDistanceValue(progress.value.totalDistance, props.distanceUnits)
    if (plannedOnly.value) return `${total} ${unit}`
    if (progress.value.totalDistance <= progress.value.doneDistance) return `${done} ${unit}`
    return t.value('week_distance_of', { done, total, unit })
  })

  const tssText = computed(() => {
    const done = Math.round(progress.value.doneTss)
    const total = Math.round(progress.value.totalTss)
    if (plannedOnly.value) return t.value('week_tss_done', { done: total })
    return done === total
      ? t.value('week_tss_done', { done })
      : t.value('week_tss_of', { done, total })
  })

  function formStateLabel(tsb: number): string {
    switch (getFormState(tsb)) {
      case 'detraining':
        return t.value('form_state_detraining')
      case 'fresh':
        return t.value('form_state_fresh')
      case 'neutral':
        return t.value('form_state_neutral')
      case 'building':
        return t.value('form_state_building')
      case 'tired':
        return t.value('form_state_tired')
      default:
        return t.value('form_state_very_tired')
    }
  }

  const compactText = computed(() => {
    if (progress.value.isEmpty) return t.value('week_nothing_planned')
    const parts = [timeText.value]
    if (progress.value.totalDistance > 0) parts.push(distanceText.value)
    if (props.settings.showSessionDetails && progress.value.totalTss > 0) parts.push(tssText.value)
    return parts.filter(Boolean).join(' · ')
  })
</script>
