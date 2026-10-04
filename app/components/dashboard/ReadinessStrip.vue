<template>
  <section :aria-label="t('today_readiness_title')" data-testid="today-readiness">
    <h3 class="sr-only">{{ t('today_readiness_title') }}</h3>
    <div
      class="grid grid-cols-2 gap-px border-y border-default bg-accented sm:grid-cols-4 sm:gap-3 sm:border-0 sm:bg-transparent"
    >
      <component
        :is="tile.to ? NuxtLink : 'button'"
        v-for="tile in tiles"
        :key="tile.key"
        :to="tile.to"
        :type="tile.to ? undefined : 'button'"
        class="group flex min-h-24 flex-col items-start gap-1 bg-default p-4 text-left transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary sm:rounded-xl sm:shadow-sm sm:ring sm:ring-default"
        :data-testid="`readiness-${tile.key}`"
        @click="onTileClick(tile)"
      >
        <span class="flex w-full items-center justify-between gap-2">
          <span class="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            {{ tile.label }}
          </span>
          <UIcon :name="tile.icon" class="size-4 shrink-0 text-dimmed" />
        </span>

        <span v-if="loading && tile.key === 'form'" class="mt-1 block w-full">
          <USkeleton class="h-6 w-20" />
        </span>
        <template v-else>
          <span class="flex items-baseline gap-1.5">
            <span
              class="text-xl font-bold tabular-nums tracking-tight"
              :class="tile.value ? 'text-highlighted' : 'text-dimmed'"
            >
              {{ tile.value || '—' }}
            </span>
            <span v-if="tile.value && tile.unit" class="text-xs font-medium text-muted">
              {{ tile.unit }}
            </span>
            <span v-if="tile.word" class="text-sm font-semibold" :class="toneClass(tile.tone)">{{
              tile.word
            }}</span>
          </span>
          <span
            class="text-xs leading-snug"
            :class="tile.value ? (tile.hintTone ? toneClass(tile.hintTone) : 'text-muted') : ''"
          >
            <span v-if="!tile.value" class="text-primary group-hover:underline">
              {{ tile.emptyHint }}
            </span>
            <template v-else>{{ tile.hint }}</template>
          </span>
        </template>
      </component>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { NuxtLink } from '#components'
  import {
    formatSleepHours,
    getFormLevel,
    getFormTone,
    getHrvTrend,
    getSleepLevel,
    getSleepTone,
    type ReadinessTone
  } from '~/utils/readiness'
  import { daysBetweenKeys, utcDateKey } from '~/utils/today-plan'

  const props = defineProps<{
    /** `summary` from `/api/performance/pmc`; null when unavailable. */
    formSummary: { currentTSB?: number | null; currentCTL?: number | null } | null
    loading?: boolean
    todayKey: string
  }>()

  const emit = defineEmits<{
    'open-wellness': []
    'open-training-load': []
  }>()

  const { t } = useTranslate('dashboard')
  const { trackWidgetClick } = useAnalytics()
  const { formatDateUTC } = useFormat()
  const userStore = useUserStore()

  interface Tile {
    key: 'form' | 'hrv' | 'rhr' | 'sleep'
    label: string
    icon: string
    value: string | null
    unit?: string
    word?: string
    tone?: ReadinessTone
    hint?: string
    hintTone?: ReadinessTone
    emptyHint: string
    to?: string
    action?: 'wellness' | 'training-load'
  }

  const CONNECT_ROUTE = '/settings/apps'

  function freshness(value: string | Date | null | undefined, kind: 'day' | 'night' = 'day') {
    const key = utcDateKey(value)
    if (!key) return ''
    const diff = daysBetweenKeys(key, props.todayKey)
    if (diff <= 0)
      return kind === 'night'
        ? t.value('today_readiness_last_night')
        : t.value('today_readiness_today')
    if (diff === 1) return t.value('today_readiness_yesterday')
    return formatDateUTC(key, 'MMM d')
  }

  const formTile = computed<Tile>(() => {
    const summary = props.formSummary
    const hasLoad = !!summary && (summary.currentCTL ?? 0) > 0
    const tsb = hasLoad ? (summary?.currentTSB ?? null) : null
    const level = getFormLevel(tsb)
    const rounded = tsb === null ? null : Math.round(tsb)
    return {
      key: 'form',
      label: t.value('today_readiness_form'),
      icon: 'i-heroicons-battery-50',
      value:
        rounded === null
          ? null
          : `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)}`,
      word: level ? t.value(`today_readiness_form_${level}`) : undefined,
      tone: getFormTone(level),
      hint: level ? t.value(`today_readiness_form_hint_${level}`) : undefined,
      emptyHint: t.value('today_readiness_form_empty'),
      to: level ? undefined : CONNECT_ROUTE,
      action: level ? 'training-load' : undefined
    }
  })

  const hrvTile = computed<Tile>(() => {
    const profile = userStore.profile
    const hrv = profile?.recentHRV ?? null
    const trend = getHrvTrend(hrv, profile?.avgRecentHRV)
    let hint = freshness(profile?.latestWellnessDate)
    let hintTone: ReadinessTone | undefined
    if (trend?.direction === 'above') {
      hint = t.value('today_readiness_hrv_above', { pct: trend.deltaPct })
      hintTone = 'success'
    } else if (trend?.direction === 'below') {
      hint = t.value('today_readiness_hrv_below', { pct: trend.deltaPct })
      hintTone = 'warning'
    } else if (trend?.direction === 'normal') {
      hint = t.value('today_readiness_hrv_normal')
    }
    return {
      key: 'hrv',
      label: t.value('today_readiness_hrv'),
      icon: 'i-heroicons-heart',
      value: hrv ? String(Math.round(hrv)) : null,
      unit: 'ms',
      hint,
      hintTone,
      emptyHint: t.value('today_readiness_connect'),
      to: hrv ? undefined : CONNECT_ROUTE,
      action: hrv ? 'wellness' : undefined
    }
  })

  const rhrTile = computed<Tile>(() => {
    const profile = userStore.profile
    const rhr = profile?.restingHr ?? null
    return {
      key: 'rhr',
      label: t.value('today_readiness_rhr'),
      icon: 'i-tabler-heartbeat',
      value: rhr ? String(Math.round(rhr)) : null,
      unit: 'bpm',
      hint: profile?.latestWellnessDate
        ? freshness(profile.latestWellnessDate)
        : t.value('today_readiness_from_profile'),
      emptyHint: t.value('today_readiness_connect'),
      to: rhr ? undefined : CONNECT_ROUTE,
      action: rhr ? 'wellness' : undefined
    }
  })

  const sleepTile = computed<Tile>(() => {
    const profile = userStore.profile
    const hours = profile?.recentSleep ?? null
    const level = getSleepLevel(hours)
    const when = freshness(profile?.recentSleepDate, 'night')
    return {
      key: 'sleep',
      label: t.value('today_readiness_sleep'),
      icon: 'i-heroicons-moon',
      value: formatSleepHours(hours),
      word: level ? t.value(`today_readiness_sleep_${level}`) : undefined,
      tone: getSleepTone(level),
      hint: when,
      emptyHint: t.value('today_readiness_connect'),
      to: level ? undefined : CONNECT_ROUTE,
      action: level ? 'wellness' : undefined
    }
  })

  const tiles = computed(() => [formTile.value, hrvTile.value, rhrTile.value, sleepTile.value])

  function toneClass(tone?: ReadinessTone) {
    switch (tone) {
      case 'success':
        return 'text-success'
      case 'warning':
        return 'text-warning'
      case 'error':
        return 'text-error'
      default:
        return 'text-toned'
    }
  }

  function onTileClick(tile: Tile) {
    trackWidgetClick('today_readiness', tile.to ? `${tile.key}_empty` : tile.key)
    if (tile.action === 'training-load') emit('open-training-load')
    else if (tile.action === 'wellness') emit('open-wellness')
  }
</script>
