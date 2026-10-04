<template>
  <UCard v-if="!loading && (countdown || showEmpty)" :ui="cardUi" data-testid="today-goal">
    <NuxtLink
      v-if="countdown"
      to="/profile/goals"
      class="group flex items-center gap-4"
      @click="trackWidgetClick('today_goal', 'open_goal')"
    >
      <div
        class="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary/10 text-primary"
      >
        <span class="text-xl font-bold leading-none tabular-nums">{{ countdown.daysToGo }}</span>
        <span class="mt-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {{ t('today_goal_days_short', { count: countdown.daysToGo }) }}
        </span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {{ t('today_goal_label') }}
        </p>
        <p class="truncate text-base font-semibold text-highlighted group-hover:text-primary">
          {{ countdown.goal.title }}
        </p>
        <p class="text-sm text-muted">
          {{ t('today_goal_days_to_go', { count: countdown.daysToGo }) }}
          · {{ formatDateUTC(countdown.dateKey, 'EEE d MMM') }}
        </p>
      </div>
      <UIcon
        name="i-heroicons-chevron-right"
        class="size-5 shrink-0 text-dimmed group-hover:text-primary"
      />
    </NuxtLink>

    <div v-else class="flex items-center gap-4">
      <div
        class="flex size-14 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted"
      >
        <UIcon name="i-heroicons-flag" class="size-6" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-highlighted">{{ t('today_goal_empty_title') }}</p>
        <p class="text-sm text-muted">{{ t('today_goal_empty_desc') }}</p>
      </div>
      <UButton
        to="/profile/goals"
        color="neutral"
        variant="outline"
        size="sm"
        class="shrink-0"
        @click="trackWidgetClick('today_goal', 'add_goal')"
      >
        {{ t('today_goal_add') }}
      </UButton>
    </div>
  </UCard>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { pickCountdownGoal, type GoalLike } from '~/utils/today-plan'

  const props = defineProps<{
    todayKey: string
  }>()

  const { t } = useTranslate('dashboard')
  const { formatDateUTC } = useFormat()
  const { trackWidgetClick } = useAnalytics()

  const cardUi = {
    root: 'rounded-none sm:rounded-xl shadow-none sm:shadow-sm ring-0 sm:ring ring-default border-y border-default sm:border-y-0',
    body: 'p-4 sm:p-5'
  }

  const goals = ref<GoalLike[]>([])
  const loading = ref(true)
  const failed = ref(false)

  const countdown = computed(() => pickCountdownGoal(goals.value, props.todayKey))
  // Only nudge towards a goal when we know there is no active one; a failed
  // request or an active undated goal (e.g. "lose weight") hides the card.
  const showEmpty = computed(
    () =>
      !failed.value &&
      !goals.value.some((goal) => (goal.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
  )

  async function refresh() {
    try {
      const data = (await ($fetch as any)('/api/goals')) as { goals?: GoalLike[] } | null
      goals.value = Array.isArray(data?.goals) ? data.goals : []
      failed.value = false
    } catch {
      goals.value = []
      failed.value = true
    } finally {
      loading.value = false
    }
  }

  onMounted(() => {
    void refresh()
  })

  defineExpose({ refresh })
</script>
