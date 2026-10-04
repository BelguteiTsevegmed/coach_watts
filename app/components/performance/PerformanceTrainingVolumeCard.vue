<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0 flex-1 basis-56">
          <h2 class="text-base font-semibold text-highlighted">{{ t('volume_card_title') }}</h2>
          <p class="mt-1 text-sm text-muted">
            {{ t('volume_card_subtitle', { weeks: buckets.length }) }}
          </p>
        </div>
        <div
          v-if="metricOptions.length > 1"
          class="flex items-center gap-1 rounded-md bg-elevated p-0.5"
          role="group"
          :aria-label="t('volume_metric_label')"
        >
          <UButton
            v-for="option in metricOptions"
            :key="option.value"
            size="xs"
            :color="metric === option.value ? 'primary' : 'neutral'"
            :variant="metric === option.value ? 'solid' : 'ghost'"
            :aria-pressed="metric === option.value"
            @click="
              () => {
                metric = option.value
              }
            "
          >
            {{ option.label }}
          </UButton>
        </div>
      </div>
    </template>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-14 w-full" />
      <USkeleton class="h-[220px] w-full" />
    </div>

    <div v-else-if="!hasAnySessions" class="flex items-start gap-3 py-2">
      <UIcon name="i-heroicons-calendar-days" class="mt-0.5 size-5 shrink-0 text-dimmed" />
      <p class="text-sm text-muted">{{ t('volume_empty') }}</p>
    </div>

    <div v-else class="space-y-5">
      <!-- This week vs typical week -->
      <dl class="grid grid-cols-2 gap-2 sm:gap-3">
        <div class="rounded-lg bg-elevated/60 px-3 py-2.5">
          <dt class="text-xs text-muted">{{ t('volume_this_week') }}</dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums text-highlighted">
            {{ formatMetric(currentWeek ? metricValue(currentWeek) : 0) }}
          </dd>
          <dd class="text-xs text-muted">
            {{ t('volume_sessions_count', { count: currentWeek?.sessions ?? 0 }) }}
          </dd>
        </div>
        <div class="rounded-lg bg-elevated/60 px-3 py-2.5">
          <dt class="text-xs text-muted">
            {{ t('volume_typical_week', { weeks: averages.weeks }) }}
          </dt>
          <dd class="mt-0.5 text-lg font-semibold tabular-nums text-highlighted">
            {{ formatMetric(metricValue(averages)) }}
          </dd>
          <dd class="text-xs text-muted">
            {{ t('volume_sessions_avg', { rate: averages.sessions.toFixed(1) }) }}
          </dd>
        </div>
      </dl>

      <!-- Weekly volume by sport -->
      <div>
        <div class="h-[220px]">
          <ClientOnly>
            <Bar :data="chartData" :options="chartOptions" :height="220" />
            <template #fallback>
              <USkeleton class="h-full w-full" />
            </template>
          </ClientOnly>
        </div>
        <ul
          v-if="sports.length > 0"
          class="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          :aria-label="t('volume_legend_label')"
        >
          <li
            v-for="sport in sports"
            :key="sport"
            class="flex items-center gap-1.5 text-xs text-muted"
          >
            <span class="size-2 rounded-full" :class="SPORT_DOT_CLASSES[sport]" />
            {{ sportLabel(sport) }}
          </li>
        </ul>
      </div>

      <!-- Consistency: sessions per week -->
      <div>
        <div class="mb-2 flex items-baseline justify-between gap-3">
          <h3 class="text-sm font-medium text-highlighted">{{ t('volume_consistency_title') }}</h3>
          <span class="text-xs text-muted">{{ t('volume_consistency_hint') }}</span>
        </div>
        <ol
          class="grid gap-1"
          :style="{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }"
        >
          <li
            v-for="bucket in buckets"
            :key="bucket.weekStart"
            class="flex h-8 items-center justify-center rounded text-xs font-medium tabular-nums"
            :class="[
              consistencyCellClass(bucket.sessions),
              bucket.isCurrent ? 'ring-1 ring-inset ring-primary/60' : ''
            ]"
            :title="consistencyTitle(bucket)"
          >
            {{ bucket.sessions }}
          </li>
        </ol>
        <div class="mt-1 flex justify-between text-[11px] text-dimmed">
          <span>{{ weekLabel(buckets[0]?.weekStart) }}</span>
          <span>{{ t('volume_this_week_short') }}</span>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { Bar } from 'vue-chartjs'
  import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, Tooltip } from 'chart.js'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import { formatDateUTC } from '~/composables/useFormat'
  import {
    averageCompleteWeeks,
    buildWeeklyVolume,
    sportsInVolume,
    trimLeadingEmptyWeeks,
    type ProgressWorkout,
    type SportGroup,
    type VolumeTotals,
    type WeeklyVolumeBucket
  } from '~/utils/progress-summary'

  ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip)

  const METERS_PER_MILE = 1609.344

  // Validated categorical palette (adjacent-pair CVD ΔE ≥ 9 in both modes), in
  // SPORT_GROUP_ORDER so a sport keeps its colour whatever else is shown.
  const SPORT_COLORS: Record<SportGroup, { light: string; dark: string }> = {
    run: { light: '#eb6834', dark: '#d95926' },
    swim: { light: '#2a78d6', dark: '#3987e5' },
    ride: { light: '#1baf7a', dark: '#199e70' },
    strength: { light: '#4a3aa7', dark: '#9085e9' },
    other: { light: '#a1a1aa', dark: '#71717a' }
  }

  // Same colours as classes (light/dark) so the legend renders identically on the server.
  const SPORT_DOT_CLASSES: Record<SportGroup, string> = {
    run: 'bg-[#eb6834] dark:bg-[#d95926]',
    swim: 'bg-[#2a78d6] dark:bg-[#3987e5]',
    ride: 'bg-[#1baf7a] dark:bg-[#199e70]',
    strength: 'bg-[#4a3aa7] dark:bg-[#9085e9]',
    other: 'bg-[#a1a1aa] dark:bg-[#71717a]'
  }

  const props = defineProps<{
    workouts: ProgressWorkout[]
    loading?: boolean
    weeks?: number
    timeZone?: string
    distanceUnit: 'km' | 'mi'
  }>()

  const { t } = useTranslate('performance')
  const theme = useTheme()

  const buckets = computed(() =>
    trimLeadingEmptyWeeks(
      buildWeeklyVolume(props.workouts || [], {
        weeks: props.weeks ?? 12,
        timeZone: props.timeZone
      })
    )
  )
  const sports = computed(() => sportsInVolume(buckets.value))
  const averages = computed(() => averageCompleteWeeks(buckets.value))
  const currentWeek = computed(() => buckets.value[buckets.value.length - 1])
  const hasAnySessions = computed(() => buckets.value.some((bucket) => bucket.sessions > 0))
  const hasDistance = computed(() => buckets.value.some((bucket) => bucket.distanceMeters > 0))

  type Metric = 'time' | 'distance'
  const metric = ref<Metric>('time')

  // Runners think in distance; default to it when running is the main sport.
  watch(
    buckets,
    (value) => {
      const totals = sportsInVolume(value).map((sport) => ({
        sport,
        sessions: value.reduce((acc, bucket) => acc + bucket.bySport[sport].sessions, 0)
      }))
      const top = totals.sort((a, b) => b.sessions - a.sessions)[0]
      metric.value = top?.sport === 'run' && hasDistance.value ? 'distance' : 'time'
    },
    { immediate: true }
  )

  const metricOptions = computed(() => {
    const options: Array<{ value: Metric; label: string }> = [
      { value: 'time', label: t.value('volume_metric_time') }
    ]
    if (hasDistance.value) {
      options.push({ value: 'distance', label: t.value('volume_metric_distance') })
    }
    return options
  })

  function metricValue(totals: VolumeTotals) {
    if (metric.value === 'distance') {
      const divisor = props.distanceUnit === 'mi' ? METERS_PER_MILE : 1000
      return totals.distanceMeters / divisor
    }
    return totals.durationSec / 3600
  }

  function formatMetric(value: number) {
    if (metric.value === 'distance') {
      return `${value.toFixed(value >= 100 ? 0 : 1)} ${props.distanceUnit}`
    }
    const totalMinutes = Math.round(value * 60)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, '0')}m` : `${minutes}m`
  }

  function sportColor(sport: SportGroup) {
    return theme.isDark.value ? SPORT_COLORS[sport].dark : SPORT_COLORS[sport].light
  }

  function sportLabel(sport: SportGroup) {
    return t.value(`sport_${sport}`)
  }

  function weekLabel(weekStart?: string) {
    return weekStart ? formatDateUTC(weekStart, 'MMM d') : ''
  }

  const chartData = computed(() => {
    // Strength/other sessions have no distance; leave them out of the distance view.
    const visibleSports =
      metric.value === 'distance'
        ? sports.value.filter((sport) =>
            buckets.value.some((bucket) => bucket.bySport[sport].distanceMeters > 0)
          )
        : sports.value
    const surface = theme.isDark.value ? '#18181b' : '#ffffff'

    return {
      labels: buckets.value.map((bucket) =>
        bucket.isCurrent ? t.value('volume_this_week_short') : weekLabel(bucket.weekStart)
      ),
      datasets: visibleSports.map((sport) => ({
        label: sportLabel(sport),
        data: buckets.value.map(
          (bucket) => Math.round(metricValue(bucket.bySport[sport]) * 10) / 10
        ),
        backgroundColor: sportColor(sport),
        borderColor: surface,
        borderWidth: { top: 2 },
        borderSkipped: 'bottom' as const,
        borderRadius: 3,
        maxBarThickness: 28,
        stack: 'volume'
      }))
    }
  })

  const chartOptions = computed(() => {
    const tickColor = '#94a3b8'
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false as const,
      interaction: { mode: 'index' as const, intersect: false },
      plugins: {
        legend: { display: false },
        datalabels: { display: false },
        tooltip: {
          backgroundColor: theme.isDark.value ? '#111827' : '#ffffff',
          titleColor: theme.isDark.value ? '#f3f4f6' : '#111827',
          bodyColor: theme.isDark.value ? '#d1d5db' : '#374151',
          footerColor: theme.isDark.value ? '#f3f4f6' : '#111827',
          borderColor: theme.isDark.value ? '#374151' : '#e5e7eb',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          filter: (item: any) => item.parsed.y > 0,
          callbacks: {
            title: (items: any[]) => {
              const bucket = buckets.value[items[0]?.dataIndex ?? -1]
              return bucket
                ? t.value('volume_tooltip_week', { date: weekLabel(bucket.weekStart) })
                : ''
            },
            label: (context: any) => ` ${context.dataset.label}: ${formatMetric(context.parsed.y)}`,
            footer: (items: any[]) => {
              const bucket: WeeklyVolumeBucket | undefined =
                buckets.value[items[0]?.dataIndex ?? -1]
              if (!bucket) return ''
              return `${formatMetric(metricValue(bucket))} · ${t.value('volume_sessions_count', {
                count: bucket.sessions
              })}`
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
          border: { display: false },
          ticks: {
            color: tickColor,
            font: { size: 10 },
            autoSkip: true,
            maxRotation: 0,
            maxTicksLimit: 6
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          position: 'right' as const,
          border: { display: false },
          grid: {
            color: theme.isDark.value ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
            drawTicks: false
          },
          ticks: {
            color: tickColor,
            font: { size: 10 },
            maxTicksLimit: 5,
            callback: (value: any) =>
              metric.value === 'distance' ? `${value} ${props.distanceUnit}` : `${value}h`
          }
        }
      }
    }
  })

  // Sequential single-hue shading: more sessions → stronger primary tint.
  function consistencyCellClass(sessions: number) {
    if (sessions <= 0) return 'bg-elevated text-dimmed'
    if (sessions <= 2) return 'bg-primary/15 text-highlighted'
    if (sessions <= 4) return 'bg-primary/35 text-highlighted'
    return 'bg-primary/60 text-highlighted'
  }

  function consistencyTitle(bucket: WeeklyVolumeBucket) {
    return `${t.value('volume_tooltip_week', { date: weekLabel(bucket.weekStart) })}: ${t.value(
      'volume_sessions_count',
      { count: bucket.sessions }
    )}`
  }
</script>
