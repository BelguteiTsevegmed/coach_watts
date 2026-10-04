<template>
  <UCard :ui="cardUi" data-testid="today-this-week">
    <div class="flex items-center justify-between gap-3">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
        <UIcon name="i-heroicons-calendar-days" class="size-5 text-primary" />
        {{ t('today_week_title') }}
      </h3>
      <UButton
        to="/activities"
        color="neutral"
        variant="link"
        size="xs"
        trailing-icon="i-heroicons-arrow-right"
        class="px-0"
        @click="trackWidgetClick('today_week', 'open_calendar')"
      >
        {{ t('today_week_open_calendar') }}
      </UButton>
    </div>

    <!-- Loading -->
    <div v-if="loading && !summary.hasActivity" class="mt-4 space-y-4">
      <USkeleton class="h-2 w-full rounded-full" />
      <div class="grid grid-cols-7 gap-2">
        <USkeleton v-for="i in 7" :key="i" class="h-14 rounded-lg" />
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span>{{ t('today_week_error') }}</span>
      <UButton
        color="neutral"
        variant="outline"
        size="xs"
        icon="i-heroicons-arrow-path"
        @click="emit('retry')"
      >
        {{ t('today_week_retry') }}
      </UButton>
    </div>

    <template v-else>
      <!-- Planned vs done -->
      <div v-if="summary.hasActivity" class="mt-4">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p class="text-sm text-default">
            <span class="text-lg font-bold tabular-nums text-highlighted">{{
              summary.sessionsDone
            }}</span>
            <span class="text-muted">
              {{ t('today_week_sessions_of', { total: summary.sessionsTotal }) }}</span
            >
          </p>
          <p v-if="totalTimeLabel" class="text-sm tabular-nums text-muted">
            {{ t('today_week_time', { done: doneTimeLabel, total: totalTimeLabel }) }}
          </p>
        </div>
        <UProgress
          :model-value="progressPct"
          :max="100"
          size="sm"
          color="primary"
          class="mt-2"
          :aria-label="t('today_week_progress_label')"
        />
      </div>
      <p v-else class="mt-3 text-sm text-muted">{{ t('today_week_nothing') }}</p>

      <!-- Mon..Sun strip -->
      <ol class="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
        <li v-for="day in summary.days" :key="day.dateKey">
          <UTooltip :text="dayTooltip(day)" :content="{ side: 'top' }">
            <div
              class="flex flex-col items-center gap-1 rounded-lg py-2"
              :class="day.isToday ? 'bg-primary/10 ring ring-primary/40' : ''"
              :aria-label="dayTooltip(day)"
            >
              <span
                class="text-[10px] font-bold uppercase tracking-wide"
                :class="day.isToday ? 'text-primary' : 'text-muted'"
              >
                {{ formatDateUTC(day.dateKey, 'EEEEE') }}
              </span>
              <span
                class="flex size-7 items-center justify-center rounded-full"
                :class="dayBadgeClass(day)"
              >
                <UIcon :name="dayIcon(day)" class="size-4" />
              </span>
            </div>
          </UTooltip>
        </li>
      </ol>

      <!-- Coming up -->
      <div v-if="comingUp.length" class="mt-5">
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {{ t('today_week_coming_up') }}
        </p>
        <ul class="mt-1 divide-y divide-default">
          <template v-for="row in comingUp" :key="row.dateKey">
            <li v-if="row.rest" class="flex items-center gap-3 py-2.5">
              <span class="w-16 shrink-0 text-xs font-semibold text-muted">
                {{ dayLabel(row.dateKey) }}
              </span>
              <UIcon name="i-tabler-zzz" class="size-4 text-dimmed" />
              <span class="text-sm text-muted">{{ t('today_week_rest_day') }}</span>
            </li>
            <li v-for="workout in row.workouts" v-else :key="workout.id">
              <NuxtLink
                :to="`/workouts/planned/${workout.id}`"
                class="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-elevated/60"
                @click="trackWidgetClick('upcoming_workouts', 'open_workout')"
              >
                <span class="w-16 shrink-0 text-xs font-semibold text-muted">
                  {{ dayLabel(row.dateKey) }}
                </span>
                <UIcon
                  :name="getWorkoutIcon(workout.type || '')"
                  class="size-5 shrink-0"
                  :class="getWorkoutColorClass(workout.type || '')"
                />
                <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
                  {{ workout.title }}
                </span>
                <span
                  v-if="formatTrainingDuration(workout.durationSec)"
                  class="shrink-0 text-xs tabular-nums text-muted"
                >
                  {{ formatTrainingDuration(workout.durationSec) }}
                </span>
                <UIcon
                  name="i-heroicons-chevron-right"
                  class="size-4 shrink-0 text-dimmed group-hover:text-primary"
                />
              </NuxtLink>
            </li>
          </template>
        </ul>
      </div>
      <div
        v-else-if="!upcomingLoading && !summary.hasActivity"
        class="mt-4 flex flex-wrap items-center gap-2"
      >
        <UButton to="/plan" color="primary" variant="soft" size="sm" icon="i-heroicons-map">
          {{ t('today_no_plan_action') }}
        </UButton>
      </div>
    </template>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { CalendarActivity } from '~/types/calendar'
  import { getWorkoutIcon, getWorkoutColorClass } from '~/utils/activity-types'
  import { daysBetweenKeys } from '~/utils/date-keys'
  import {
    buildComingUp,
    formatTrainingDuration,
    summarizeWeek,
    type UpcomingWorkoutLike,
    type WeekDaySummary
  } from '~/utils/today-plan'

  const props = defineProps<{
    activities: CalendarActivity[]
    upcoming: UpcomingWorkoutLike[]
    todayKey: string
    timezone: string
    loading?: boolean
    upcomingLoading?: boolean
    error?: boolean
  }>()

  const emit = defineEmits<{ retry: [] }>()

  const { t } = useTranslate('dashboard')
  const { formatDateUTC } = useFormat()
  const { trackWidgetClick } = useAnalytics()

  const cardUi = {
    root: 'rounded-none sm:rounded-xl shadow-none sm:shadow-sm ring-0 sm:ring ring-default border-y border-default sm:border-y-0',
    body: 'p-4 sm:p-6'
  }

  const summary = computed(() =>
    summarizeWeek(props.activities || [], props.todayKey, props.timezone || 'UTC')
  )

  const comingUp = computed(() =>
    buildComingUp(props.upcoming || [], props.todayKey, { maxDays: 7, maxSessions: 4 })
  )

  const doneTimeLabel = computed(
    () => formatTrainingDuration(summary.value.doneDurationSec) || '0 min'
  )
  const totalTimeLabel = computed(() => formatTrainingDuration(summary.value.totalDurationSec))

  const progressPct = computed(() => {
    const s = summary.value
    const ratio =
      s.totalDurationSec > 0
        ? s.doneDurationSec / s.totalDurationSec
        : s.sessionsTotal > 0
          ? s.sessionsDone / s.sessionsTotal
          : 0
    return Math.round(Math.min(1, Math.max(0, ratio)) * 100)
  })

  function dayLabel(dateKey: string) {
    if (daysBetweenKeys(props.todayKey, dateKey) === 1) return t.value('today_week_tomorrow')
    return formatDateUTC(dateKey, 'EEE d')
  }

  function dayIcon(day: WeekDaySummary) {
    if (day.state === 'done') return 'i-heroicons-check'
    if (day.state === 'missed') return 'i-heroicons-minus'
    if (day.state === 'planned') return getWorkoutIcon(day.sessions[0]?.type || '')
    return 'i-tabler-zzz'
  }

  function dayBadgeClass(day: WeekDaySummary) {
    switch (day.state) {
      case 'done':
        return 'bg-primary text-inverted'
      case 'planned':
        return 'bg-default ring ring-accented text-toned'
      case 'missed':
        return 'bg-elevated text-dimmed'
      default:
        return 'text-dimmed'
    }
  }

  function dayTooltip(day: WeekDaySummary) {
    const date = formatDateUTC(day.dateKey, 'EEE d MMM')
    if (day.state === 'rest') return `${date} · ${t.value('today_week_rest_day')}`
    const titles = day.sessions.map((s) => s.title).join(', ')
    const status = t.value(`today_week_state_${day.state}`)
    return `${date} · ${status}: ${titles}`
  }
</script>
