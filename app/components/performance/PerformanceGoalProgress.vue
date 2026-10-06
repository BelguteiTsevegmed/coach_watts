<template>
  <UCard :ui="mobileListCardUi">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold text-highlighted">
          {{ entries.length > 1 ? t('goals_card_title_plural') : t('goals_card_title') }}
        </h2>
        <UButton
          v-if="entries.length > 0"
          to="/profile/goals"
          color="neutral"
          variant="link"
          size="sm"
          trailing-icon="i-heroicons-arrow-right"
          class="shrink-0 px-0"
        >
          {{ t('goals_manage') }}
        </UButton>
      </div>
    </template>

    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-5 w-48" />
      <USkeleton class="h-4 w-32" />
    </div>

    <div v-else-if="entries.length === 0" class="flex flex-col items-start gap-3 sm:flex-row">
      <div class="flex min-w-0 flex-1 items-start gap-3">
        <UIcon name="i-heroicons-flag" class="mt-0.5 size-5 shrink-0 text-dimmed" />
        <div>
          <p class="text-sm font-medium text-highlighted">{{ t('goals_empty_title') }}</p>
          <p class="mt-1 text-sm text-muted">{{ t('goals_empty_body') }}</p>
        </div>
      </div>
      <UButton to="/profile/goals?new=1" color="primary" size="sm" icon="i-heroicons-plus">
        {{ t('goals_empty_action') }}
      </UButton>
    </div>

    <ul v-else class="divide-y divide-default">
      <li v-for="entry in visibleEntries" :key="entry.goal.id" class="py-3 first:pt-0 last:pb-0">
        <div class="flex items-start gap-3">
          <div class="rounded-lg bg-elevated p-2">
            <UIcon :name="typeIcon(entry.goal.type)" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-highlighted">
                  {{ entry.goal.title }}
                </p>
                <p class="mt-0.5 text-xs text-muted">
                  {{ typeLabel(entry.goal.type) }}
                  <template v-if="entry.targetKey">
                    · {{ formatDateUTC(entry.targetKey, 'EEE d MMM yyyy') }}
                  </template>
                </p>
              </div>
              <div
                v-if="entry.daysLeft !== null"
                class="shrink-0 text-right text-sm font-semibold tabular-nums"
                :class="entry.daysLeft < 0 ? 'text-muted' : 'text-primary'"
              >
                {{ countdownLabel(entry.daysLeft) }}
              </div>
            </div>

            <div v-if="progressOf(entry.goal) !== null" class="mt-2 space-y-1">
              <UProgress :model-value="progressOf(entry.goal)" size="xs" color="primary" />
              <p class="text-xs text-muted">
                {{ t('goals_progress', { pct: progressOf(entry.goal) }) }}
              </p>
            </div>
            <p
              v-else-if="entry.daysLeft !== null && entry.daysLeft < 0"
              class="mt-1 text-xs text-muted"
            >
              {{ t('goals_passed_hint') }}
            </p>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="hiddenCount > 0" class="mt-3 text-xs text-muted">
      {{ t('goals_more', { count: hiddenCount }) }}
    </p>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import { formatDateUTC } from '~/composables/useFormat'
  import {
    describeCountdown,
    goalProgressPct,
    upcomingGoals,
    type ProgressGoal
  } from '~/utils/progress-summary'

  const MAX_VISIBLE = 3

  const props = defineProps<{
    goals: ProgressGoal[]
    loading?: boolean
  }>()

  const { t } = useTranslate('performance')
  const { getUserLocalDate } = useFormat()

  const todayKey = computed(() => getUserLocalDate().toISOString().slice(0, 10))
  const entries = computed(() => upcomingGoals(props.goals || [], todayKey.value))
  const visibleEntries = computed(() => entries.value.slice(0, MAX_VISIBLE))
  const hiddenCount = computed(() => Math.max(0, entries.value.length - MAX_VISIBLE))

  function progressOf(goal: ProgressGoal) {
    return goalProgressPct(goal)
  }

  function countdownLabel(days: number) {
    const { kind, value } = describeCountdown(days)
    switch (kind) {
      case 'weeks':
        return t.value('goals_countdown_weeks', { count: value })
      case 'days':
        return t.value('goals_countdown_days', { count: value })
      case 'tomorrow':
        return t.value('goals_countdown_tomorrow')
      case 'today':
        return t.value('goals_countdown_today')
      default:
        return t.value('goals_countdown_past')
    }
  }

  function typeIcon(type?: string | null) {
    switch (type) {
      case 'EVENT':
        return 'i-heroicons-flag'
      case 'PERFORMANCE':
        return 'i-heroicons-bolt'
      case 'CONSISTENCY':
        return 'i-heroicons-arrow-path'
      case 'BODY_COMPOSITION':
        return 'i-heroicons-scale'
      default:
        return 'i-heroicons-trophy'
    }
  }

  function typeLabel(type?: string | null) {
    switch (type) {
      case 'EVENT':
        return t.value('goals_type_event')
      case 'PERFORMANCE':
        return t.value('goals_type_performance')
      case 'CONSISTENCY':
        return t.value('goals_type_consistency')
      case 'BODY_COMPOSITION':
        return t.value('goals_type_body')
      default:
        return t.value('goals_type_other')
    }
  }
</script>
