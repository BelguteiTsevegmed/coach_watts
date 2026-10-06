<template>
  <UCard :ui="mobileListCardUi">
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-4 w-32" />
      <USkeleton class="h-7 w-full max-w-xl" />
      <div class="grid grid-cols-3 gap-2 pt-2">
        <USkeleton v-for="i in 3" :key="i" class="h-16" />
      </div>
    </div>

    <div v-else-if="isEmpty" class="flex items-start gap-3">
      <UIcon name="i-heroicons-chart-bar" class="mt-0.5 size-6 shrink-0 text-dimmed" />
      <div class="space-y-2">
        <p class="text-base font-semibold text-highlighted">{{ t('headline_empty_title') }}</p>
        <p class="text-sm text-muted">{{ t('headline_empty_body') }}</p>
        <UButton to="/settings/apps" color="neutral" variant="outline" size="sm">
          {{ t('headline_empty_action') }}
        </UButton>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-muted">
          {{ t('headline_window', { weeks: windowWeeks }) }}
        </p>
        <p class="mt-1 text-lg font-semibold leading-snug text-highlighted sm:text-xl">
          <template v-for="(part, index) in sentenceParts" :key="index">
            <span v-if="index > 0" class="text-dimmed" aria-hidden="true"> · </span>
            <span>{{ part }}</span>
          </template>
        </p>
      </div>

      <dl class="grid grid-cols-3 gap-2 sm:gap-3">
        <div class="rounded-lg bg-elevated/60 px-3 py-2.5">
          <dt class="text-xs text-muted">{{ t('headline_tile_fitness') }}</dt>
          <dd class="mt-0.5 flex items-baseline gap-1.5">
            <span class="text-xl font-semibold tabular-nums text-highlighted">
              {{ formatNumber(fitness?.end) }}
            </span>
            <span
              v-if="fitnessPct !== null"
              class="text-xs font-medium tabular-nums"
              :class="fitnessDeltaClass"
            >
              {{ signed(fitnessPct) }}%
            </span>
          </dd>
          <dd class="mt-0.5 text-xs text-muted">
            {{ fitnessCaption }}
          </dd>
        </div>

        <div class="rounded-lg bg-elevated/60 px-3 py-2.5">
          <dt class="text-xs text-muted">{{ t('headline_tile_sessions') }}</dt>
          <dd class="mt-0.5 text-xl font-semibold tabular-nums text-highlighted">
            {{ sessions ? sessions.perWeek.toFixed(1) : '–' }}
          </dd>
          <dd class="mt-0.5 text-xs text-muted">
            {{
              t('headline_sessions_caption', {
                count: sessions?.sessions ?? 0,
                weeks: windowWeeks
              })
            }}
          </dd>
        </div>

        <div class="rounded-lg bg-elevated/60 px-3 py-2.5">
          <dt class="text-xs text-muted">{{ t('headline_tile_form') }}</dt>
          <dd class="mt-0.5 flex items-center gap-1.5">
            <span class="text-xl font-semibold tabular-nums text-highlighted">
              {{ currentTsb === null ? '–' : signed(Math.round(currentTsb)) }}
            </span>
          </dd>
          <dd class="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <span v-if="formBand" class="size-1.5 shrink-0 rounded-full" :class="formDotClass" />
            <span>{{ formBand ? t(`form_hint_${formBand}`) : t('headline_no_data') }}</span>
          </dd>
        </div>
      </dl>

      <p class="text-xs text-dimmed">{{ t('headline_footnote') }}</p>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import {
    classifyForm,
    type FitnessTrend,
    type FormBand,
    type SessionRate
  } from '~/utils/progress-summary'

  const props = defineProps<{
    loading?: boolean
    fitness: FitnessTrend | null
    sessions: SessionRate | null
    currentTsb: number | null
    windowWeeks: number
  }>()

  const { t } = useTranslate('performance')

  const formBand = computed<FormBand | null>(() => classifyForm(props.currentTsb))

  const isEmpty = computed(
    () => (!props.fitness || props.fitness.kind === 'none') && !props.sessions?.sessions
  )

  function formatNumber(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value).toString() : '–'
  }

  function signed(value: number) {
    if (value > 0) return `+${value}`
    // Typographic minus reads better than a hyphen next to numbers.
    if (value < 0) return `−${Math.abs(value)}`
    return '0'
  }

  const fitnessSentence = computed(() => {
    const fitness = props.fitness
    if (!fitness) return t.value('headline_fitness_none')
    const weeks = fitness.weeks
    switch (fitness.kind) {
      case 'up':
        return t.value('headline_fitness_up', { pct: Math.abs(fitness.changePct ?? 0), weeks })
      case 'down':
        return t.value('headline_fitness_down', { pct: Math.abs(fitness.changePct ?? 0), weeks })
      case 'steady':
        return t.value('headline_fitness_steady', { weeks })
      case 'building':
        return t.value('headline_fitness_building', { weeks })
      default:
        return t.value('headline_fitness_none')
    }
  })

  const sentenceParts = computed(() => {
    const parts = [fitnessSentence.value]
    if (props.sessions) {
      parts.push(t.value('headline_sessions', { rate: props.sessions.perWeek.toFixed(1) }))
    }
    if (formBand.value) {
      parts.push(t.value('headline_form', { label: t.value(`form_label_${formBand.value}`) }))
    }
    return parts
  })

  const fitnessCaption = computed(() => {
    const fitness = props.fitness
    if (!fitness || fitness.kind === 'none') return t.value('headline_no_data')
    return t.value('headline_fitness_caption', {
      start: Math.round(fitness.start),
      weeks: fitness.weeks
    })
  })

  const fitnessPct = computed(() => props.fitness?.changePct ?? null)

  const fitnessDeltaClass = computed(() => {
    if (props.fitness?.kind === 'steady') return 'text-muted'
    return (fitnessPct.value ?? 0) > 0 ? 'text-success' : 'text-warning'
  })

  const formDotClass = computed(() => {
    switch (formBand.value) {
      case 'fresh':
      case 'neutral':
        return 'bg-success'
      case 'very_fresh':
      case 'tired':
        return 'bg-info'
      case 'very_tired':
        return 'bg-warning'
      default:
        return 'bg-error'
    }
  })
</script>
