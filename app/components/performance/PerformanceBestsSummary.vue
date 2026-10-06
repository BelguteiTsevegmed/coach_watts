<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-base font-semibold text-highlighted">{{ t('bests_card_title') }}</h2>
          <p class="mt-1 text-sm text-muted">{{ t('bests_card_subtitle') }}</p>
        </div>
        <UButton
          to="/performance/bests"
          color="neutral"
          variant="link"
          size="sm"
          trailing-icon="i-heroicons-arrow-right"
          class="shrink-0 px-0"
        >
          {{ t('bests_view_all') }}
        </UButton>
      </div>
    </template>

    <ul v-if="items.length > 0" class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <li
        v-for="item in items"
        :key="item.id"
        class="flex items-baseline justify-between gap-3 rounded-lg border border-default px-3 py-2.5"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2 text-sm font-medium text-highlighted">
            <UIcon :name="item.icon" class="size-4 shrink-0 text-muted" />
            <span class="truncate">{{ item.label }}</span>
            <UBadge v-if="item.isRecent" color="primary" variant="soft" size="xs">
              {{ t('bests_new_badge') }}
            </UBadge>
          </div>
          <div class="mt-0.5 text-xs text-muted" :title="formatDate(item.date)">
            {{ formatRelativeTime(item.date) }}
          </div>
        </div>
        <div class="shrink-0 text-right">
          <span class="text-lg font-semibold tabular-nums text-highlighted">{{ item.value }}</span>
          <span v-if="item.unit" class="ml-1 text-xs text-muted">{{ item.unit }}</span>
        </div>
      </li>
    </ul>

    <div v-else class="flex items-start gap-3 py-2">
      <UIcon name="i-heroicons-trophy" class="mt-0.5 size-5 shrink-0 text-dimmed" />
      <p class="text-sm text-muted">{{ t('bests_empty') }}</p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'

  interface PersonalBest {
    id?: string
    type: string
    category: string
    value: number
    unit: string
    date: string
  }

  const props = defineProps<{
    personalBests: PersonalBest[]
    /** Power bests are only shown to athletes who train with power. */
    showPower: boolean
  }>()

  const { t } = useTranslate('performance')
  const { formatDate, formatRelativeTime } = useFormat()

  const RUN_ORDER = ['RUN_5K', 'RUN_10K', 'RUN_HM', 'RUN_MARATHON', 'RUN_1MI', 'RUN_1K', 'RUN_400M']
  const POWER_ORDER = ['POWER_20M', 'POWER_5M', 'POWER_1M', 'POWER_60M', 'POWER_5S']

  function pick(pbs: PersonalBest[], order: string[], limit: number) {
    return [...pbs]
      .sort((a, b) => {
        const ai = order.indexOf(a.type)
        const bi = order.indexOf(b.type)
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
      })
      .slice(0, limit)
  }

  const items = computed(() => {
    const all = props.personalBests || []
    const runTimes = all.filter((pb) => pb.category === 'RUN' && pb.unit === 's')
    const power = props.showPower ? all.filter((pb) => pb.unit === 'W') : []
    const swims = all.filter((pb) => pb.category === 'SWIM')

    return [
      ...pick(runTimes, RUN_ORDER, 3).map((pb) => ({ pb, icon: 'i-tabler-run' })),
      ...pick(power, POWER_ORDER, 2).map((pb) => ({ pb, icon: 'i-heroicons-bolt' })),
      ...pick(swims, [], 1).map((pb) => ({ pb, icon: 'i-tabler-swimming' }))
    ].map(({ pb, icon }) => ({
      id: pb.id || pb.type,
      icon,
      label: labelFor(pb),
      value: pb.unit === 's' ? formatTime(pb.value) : `${Math.round(pb.value)}`,
      unit: pb.unit === 's' ? '' : pb.unit,
      date: pb.date,
      isRecent: isRecent(pb.date)
    }))
  })

  function labelFor(pb: PersonalBest) {
    const runLabels: Record<string, string> = {
      RUN_400M: t.value('bests_run_400m'),
      RUN_1K: t.value('bests_run_1k'),
      RUN_1MI: t.value('bests_run_1mi'),
      RUN_5K: t.value('bests_run_5k'),
      RUN_10K: t.value('bests_run_10k'),
      RUN_HM: t.value('bests_run_hm'),
      RUN_MARATHON: t.value('bests_run_marathon')
    }
    if (runLabels[pb.type]) return runLabels[pb.type]!
    if (pb.type.startsWith('POWER_')) {
      return t.value('bests_power_duration', { duration: pb.type.slice(6).toLowerCase() })
    }
    return pb.type
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase())
  }

  function formatTime(totalSeconds: number) {
    const seconds = Math.round(totalSeconds)
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    const ss = s.toString().padStart(2, '0')
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`
  }

  function isRecent(date: string) {
    const time = new Date(date).getTime()
    return Number.isFinite(time) && Date.now() - time < 30 * 24 * 60 * 60 * 1000
  }
</script>
