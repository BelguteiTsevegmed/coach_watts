<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <PerformanceCardHeader
        :title="t('intensity_card_title')"
        :description="t('intensity_card_guideline')"
      >
        <PerformanceChartControls
          v-model:scope="scope"
          v-model:period="period"
          :scope-options="scopeOptions"
          :period-options="periodOptions"
          @settings="$emit('settings')"
        />
      </PerformanceCardHeader>
    </template>

    <div v-if="split" class="mb-6 space-y-3">
      <p class="text-sm text-default">
        {{ verdictText }}
      </p>

      <!-- Easy / moderate / hard share: labelled, so colour is never the only cue -->
      <div
        class="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        :aria-label="splitAriaLabel"
      >
        <div
          v-for="segment in segments"
          v-show="segment.pct > 0"
          :key="segment.key"
          class="h-full"
          :class="segment.barClass"
          :style="{ width: `${segment.pct}%` }"
        />
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <div v-for="segment in segments" :key="segment.key" class="min-w-0">
          <div class="flex items-center gap-1.5 text-muted">
            <span class="size-2 shrink-0 rounded-full" :class="segment.barClass" />
            <span class="truncate">{{ segment.label }}</span>
          </div>
          <div class="mt-0.5 text-base font-semibold tabular-nums text-highlighted">
            {{ segment.pct }}%
          </div>
        </div>
      </div>
      <p class="text-xs text-dimmed">
        {{
          split.source === 'hr'
            ? t('intensity_source_hr', { hours: split.totalHours })
            : t('intensity_source_power', { hours: split.totalHours })
        }}
      </p>
    </div>

    <WeeklyZoneChart
      :weeks="period"
      :sport="sport"
      :tags="tags"
      :settings="settings"
      @update:type="onZoneTypeChange"
      @loaded="onZonesLoaded"
    >
      <template #empty>
        <div class="mx-auto max-w-sm space-y-2 px-2">
          <UIcon name="i-heroicons-heart" class="mx-auto size-8 text-dimmed" />
          <p class="text-sm font-medium text-highlighted">{{ t('intensity_empty_title') }}</p>
          <p class="text-sm text-muted">{{ t('intensity_empty_body') }}</p>
        </div>
      </template>
    </WeeklyZoneChart>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import WeeklyZoneChart from '~/components/WeeklyZoneChart.vue'
  import PerformanceCardHeader from './PerformanceCardHeader.vue'
  import PerformanceChartControls from './PerformanceChartControls.vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import {
    computeIntensitySplit,
    intensityVerdict,
    type ZoneSource
  } from '~/utils/progress-summary'

  defineProps<{
    settings: any
    scopeOptions: any[]
    periodOptions: any[]
    sport?: string
    tags?: string[]
  }>()

  const scope = defineModel<string>('scope')
  const period = defineModel<number | string>('period')

  defineEmits(['settings'])

  const { t } = useTranslate('performance')

  const zoneType = ref<ZoneSource>('power')
  const zoneWeeks = ref<Array<{ hrZones?: number[]; powerZones?: number[] }>>([])

  function onZoneTypeChange(type: ZoneSource) {
    zoneType.value = type
  }

  function onZonesLoaded(
    data: { weeks?: Array<{ hrZones?: number[]; powerZones?: number[] }> } | null
  ) {
    zoneWeeks.value = data?.weeks || []
  }

  // Follows the zone type shown in the chart so the sentence and bars agree.
  const split = computed(() => computeIntensitySplit(zoneWeeks.value, zoneType.value))

  const verdictText = computed(() => {
    if (!split.value) return ''
    const params = { easy: split.value.easyPct }
    switch (intensityVerdict(split.value)) {
      case 'polarised':
        return t.value('intensity_verdict_polarised', params)
      case 'close':
        return t.value('intensity_verdict_close', params)
      default:
        return t.value('intensity_verdict_too_hard', params)
    }
  })

  const segments = computed(() => {
    if (!split.value) return []
    return [
      {
        key: 'easy',
        label: t.value('intensity_easy'),
        pct: split.value.easyPct,
        barClass: 'bg-emerald-500'
      },
      {
        key: 'moderate',
        label: t.value('intensity_moderate'),
        pct: split.value.moderatePct,
        barClass: 'bg-amber-500'
      },
      {
        key: 'hard',
        label: t.value('intensity_hard'),
        pct: split.value.hardPct,
        barClass: 'bg-red-500'
      }
    ]
  })

  const splitAriaLabel = computed(() =>
    segments.value.map((segment) => `${segment.label} ${segment.pct}%`).join(', ')
  )
</script>
