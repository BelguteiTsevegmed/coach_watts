<template>
  <UCard :ui="cardUi" data-testid="today-session-card">
    <!-- Loading skeleton -->
    <div v-if="isLoadingSession" class="space-y-4" aria-busy="true">
      <USkeleton class="h-3 w-28" />
      <div class="flex items-center gap-3">
        <USkeleton class="size-12 rounded-xl" />
        <div class="flex-1 space-y-2">
          <USkeleton class="h-5 w-3/4" />
          <USkeleton class="h-3 w-1/2" />
        </div>
      </div>
      <USkeleton class="h-16 w-full rounded-xl" />
      <USkeleton class="h-10 w-full rounded-lg" />
    </div>

    <div v-else class="space-y-5">
      <!-- Label + verdict -->
      <div class="flex items-center justify-between gap-3">
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {{ t('today_session_label') }}
        </p>
        <UBadge
          v-if="verdict"
          :color="verdict.color"
          :icon="verdict.icon"
          variant="subtle"
          size="md"
          class="font-semibold"
          data-testid="today-session-verdict"
        >
          {{ verdict.label }}
        </UBadge>
      </div>

      <!-- Designing an ad-hoc session -->
      <div
        v-if="recommendationStore.generatingAdHoc"
        class="flex items-center gap-3 rounded-xl bg-elevated/60 p-4 text-sm text-muted"
      >
        <UIcon name="i-heroicons-arrow-path" class="size-5 animate-spin text-primary" />
        {{ t('today_session_generating') }}
      </div>

      <!-- The session -->
      <div v-else-if="sessionState === 'session' && primaryWorkout" class="space-y-4">
        <NuxtLink
          :to="sessionLink"
          class="group flex items-start gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-primary"
          @click="trackWidgetClick('today_session', 'open_title')"
        >
          <div
            class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-elevated ring ring-default"
          >
            <UIcon
              :name="getWorkoutIcon(primaryWorkout.type)"
              class="size-6"
              :class="getWorkoutColorClass(primaryWorkout.type)"
            />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-start gap-2">
              <h2
                class="text-xl font-bold leading-tight tracking-tight text-highlighted group-hover:text-primary sm:text-2xl"
              >
                {{ primaryWorkout.title }}
              </h2>
              <UBadge
                v-if="primaryWorkout.completed"
                color="success"
                variant="subtle"
                size="sm"
                icon="i-heroicons-check"
                class="mt-1 shrink-0"
              >
                {{ t('today_session_done') }}
              </UBadge>
            </div>
            <ul
              v-if="sessionStats.length"
              class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted"
            >
              <li
                v-for="stat in sessionStats"
                :key="stat.key"
                class="flex items-center gap-1.5 tabular-nums"
              >
                <UIcon :name="stat.icon" class="size-4 shrink-0 text-dimmed" />
                <span v-if="stat.label">{{ stat.label }}</span>
                <span class="font-medium text-default">{{ stat.value }}</span>
              </li>
            </ul>
          </div>
        </NuxtLink>

        <MiniWorkoutChart
          v-if="hasStructure"
          :workout="primaryWorkout"
          :sport-settings="chartSportSettings"
          :preference="chartPreference"
          class="h-10 w-full opacity-80"
        />

        <p v-if="primaryWorkout.completed" class="text-sm text-muted">
          {{ t('today_session_completed_desc') }}
        </p>
      </div>

      <!-- Rest day -->
      <div v-else-if="sessionState === 'rest'" class="flex items-start gap-3">
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-elevated ring ring-default"
        >
          <UIcon name="i-tabler-zzz" class="size-6 text-muted" />
        </div>
        <div class="min-w-0">
          <h2 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
            {{ t('today_rest_title') }}
          </h2>
          <p class="mt-1 text-sm text-muted">{{ t('today_rest_desc') }}</p>
        </div>
      </div>

      <!-- Nothing scheduled -->
      <div v-else class="flex items-start gap-3">
        <div
          class="flex size-12 shrink-0 items-center justify-center rounded-xl bg-elevated ring ring-default"
        >
          <UIcon
            :name="sessionState === 'no-plan' ? 'i-heroicons-map' : 'i-heroicons-calendar'"
            class="size-6 text-muted"
          />
        </div>
        <div class="min-w-0">
          <h2 class="text-xl font-bold tracking-tight text-highlighted sm:text-2xl">
            {{
              sessionState === 'no-plan' ? t('today_no_plan_title') : t('today_no_session_title')
            }}
          </h2>
          <p class="mt-1 text-sm text-muted">
            {{ sessionState === 'no-plan' ? t('today_no_plan_desc') : t('today_no_session_desc') }}
          </p>
        </div>
      </div>

      <!-- Coach's take -->
      <div
        v-if="showCoachTake"
        class="rounded-xl border-l-2 border-primary bg-elevated/50 px-4 py-3"
        data-testid="today-coach-take"
      >
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {{ t('today_session_coach_take') }}
        </p>

        <div
          v-if="recommendationStore.generating"
          class="mt-2 flex items-center gap-2 text-sm text-muted"
        >
          <UIcon name="i-heroicons-arrow-path" class="size-4 animate-spin text-primary" />
          {{ t('today_session_thinking') }}
        </div>

        <template v-else-if="recommendation">
          <p class="mt-1.5 line-clamp-3 text-sm leading-relaxed text-default break-words">
            {{ recommendation.reasoning }}
          </p>
          <div class="mt-2 flex items-center justify-between gap-2">
            <UButton
              variant="link"
              color="primary"
              size="xs"
              class="px-0 font-semibold"
              trailing-icon="i-heroicons-arrow-right"
              @click="emit('open-details')"
            >
              {{ t('today_session_read_more') }}
            </UButton>
            <AiFeedback
              v-if="recommendation.llmUsageId"
              :llm-usage-id="recommendation.llmUsageId"
              :initial-feedback="recommendation.feedback"
              :initial-feedback-text="recommendation.feedbackText"
            />
          </div>
          <div
            v-if="recommendation.planChanged"
            class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning/10 px-3 py-2 ring ring-warning/25"
            data-testid="today-plan-changed"
          >
            <p class="text-xs text-default">{{ t('today_session_plan_changed') }}</p>
            <UButton
              color="warning"
              variant="soft"
              size="xs"
              icon="i-heroicons-arrow-path"
              :loading="isSyncingForAnalysis"
              :disabled="isSyncingForAnalysis || recommendationStore.generatingAdHoc"
              @click="
                () => {
                  void handleGetTake()
                }
              "
            >
              {{ t('today_session_plan_changed_refresh') }}
            </UButton>
          </div>
        </template>

        <template v-else>
          <p class="mt-1.5 text-sm text-muted">{{ t('today_session_no_take') }}</p>
          <div class="mt-3 flex items-center gap-2">
            <UButton
              color="primary"
              variant="soft"
              size="sm"
              :icon="isRecommendationLocked ? 'i-heroicons-lock-closed' : 'i-heroicons-sparkles'"
              :loading="isSyncingForAnalysis"
              :disabled="isSyncingForAnalysis || recommendationStore.generatingAdHoc"
              @click="
                () => {
                  void handleGetTake()
                }
              "
            >
              {{ t('today_session_get_take') }}
            </UButton>
            <UBadge
              v-if="isRecommendationLocked"
              color="warning"
              variant="subtle"
              size="xs"
              class="font-semibold"
            >
              {{ lockedTierLabel }}
            </UBadge>
            <UBadge
              v-else-if="recommendationRemainingLabel"
              color="neutral"
              variant="subtle"
              size="xs"
            >
              {{ recommendationRemainingLabel }}
            </UBadge>
          </div>
        </template>
      </div>

      <!-- Suggested change (only applied on accept) -->
      <div
        v-if="suggestion"
        class="rounded-xl bg-info/5 p-4 ring ring-info/25"
        data-testid="today-suggested-change"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-highlighted">
              {{ t('today_session_suggestion') }}
            </p>
            <p
              v-if="suggestionSummary"
              class="mt-1 text-sm font-medium text-highlighted"
              data-testid="today-suggested-change-summary"
            >
              {{ suggestionSummary }}
            </p>
            <p class="mt-1 text-sm text-default break-words">{{ suggestion.description }}</p>
            <p class="mt-1.5 text-xs text-muted">{{ t('today_session_suggestion_note') }}</p>
          </div>
          <UBadge
            v-if="recommendation?.userAccepted"
            color="success"
            variant="subtle"
            size="sm"
            icon="i-heroicons-check"
            class="shrink-0"
          >
            {{ t('today_session_accepted') }}
          </UBadge>
          <UButton
            v-else
            color="info"
            variant="solid"
            size="sm"
            class="shrink-0"
            :loading="accepting"
            @click="
              () => {
                void handleAccept()
              }
            "
          >
            {{ t('today_session_accept') }}
          </UButton>
        </div>
      </div>

      <!-- Other sessions today -->
      <div v-if="otherWorkouts.length" class="space-y-1">
        <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
          {{ t('today_session_also_today') }}
        </p>
        <NuxtLink
          v-for="workout in otherWorkouts"
          :key="workout.id"
          :to="`/workouts/planned/${workout.id}`"
          class="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-elevated/60"
        >
          <UIcon
            :name="getWorkoutIcon(workout.type)"
            class="size-5 shrink-0"
            :class="getWorkoutColorClass(workout.type)"
          />
          <span class="min-w-0 flex-1 truncate text-sm font-medium text-highlighted">
            {{ workout.title }}
          </span>
          <span
            v-if="formatTrainingDuration(workout.durationSec)"
            class="text-xs text-muted tabular-nums"
          >
            {{ formatTrainingDuration(workout.durationSec) }}
          </span>
          <UIcon
            v-if="workout.completed"
            name="i-heroicons-check-circle"
            class="size-4 text-success"
          />
        </NuxtLink>
      </div>

      <!-- Actions -->
      <div
        v-if="primaryAction || secondaryActions.length || checkinDone"
        class="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <UButton
          v-if="primaryAction"
          :to="primaryAction.to"
          :icon="primaryAction.icon"
          :trailing-icon="primaryAction.trailingIcon"
          color="primary"
          variant="solid"
          size="lg"
          class="justify-center font-semibold sm:min-w-44"
          :data-testid="`today-action-${primaryAction.key}`"
          @click="primaryAction.onClick?.()"
        >
          {{ primaryAction.label }}
        </UButton>
        <div v-if="secondaryActions.length" class="flex gap-2">
          <UButton
            v-for="action in secondaryActions"
            :key="action.key"
            :to="action.to"
            :icon="action.icon"
            :trailing-icon="action.trailingIcon"
            color="neutral"
            variant="outline"
            size="lg"
            class="flex-1 justify-center sm:flex-none"
            :data-testid="`today-action-${action.key}`"
            @click="action.onClick?.()"
          >
            {{ action.label }}
          </UButton>
        </div>
        <UButton
          v-if="checkinDone"
          color="success"
          variant="ghost"
          size="sm"
          icon="i-heroicons-check-circle"
          class="self-start sm:ms-auto sm:self-center"
          @click="emit('open-checkin')"
        >
          {{ t('today_session_checkin_done') }}
        </UButton>
      </div>
    </div>
  </UCard>

  <DashboardCreateAdHocModal
    v-model:open="showCreateAdHoc"
    :loading="recommendationStore.generatingAdHoc"
    @submit="handleCreateAdHoc"
  />

  <DashboardRefineRecommendationModal
    v-model:open="showRefine"
    :loading="recommendationStore.generating"
    @submit="handleRefine"
  />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import DashboardCreateAdHocModal from '~/components/dashboard/DashboardCreateAdHocModal.vue'
  import DashboardRefineRecommendationModal from '~/components/dashboard/DashboardRefineRecommendationModal.vue'
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import { getWorkoutIcon, getWorkoutColorClass } from '~/utils/activity-types'
  import { getMiniChartPreference, getMiniChartSportSettings } from '~/utils/mini-workout-chart'
  import { formatTrainingDistance, formatTrainingDuration } from '~/utils/today-plan'
  import { showDashboardProgressToast } from '~/utils/dashboard-progress-toast'

  const props = defineProps<{
    /** The athlete has an active plan or anything scheduled ahead. */
    hasPlan: boolean
  }>()

  const emit = defineEmits<{
    'open-details': []
    'open-checkin': []
  }>()

  const { t } = useTranslate('dashboard')
  const recommendationStore = useRecommendationStore()
  const checkinStore = useCheckinStore()
  const userStore = useUserStore()
  const integrationStore = useIntegrationStore()
  const toast = useToast()
  const { checkProfileStale } = useDataStatus()
  const { trackWidgetClick, trackRecommendationRequest, trackRecommendationAccept } = useAnalytics()
  const { handleLockedAction, useOperationLockState } = useQuotaPaywall()
  const {
    locked: isRecommendationLocked,
    lockedTierLabel,
    remainingLabel: recommendationRemainingLabel
  } = useOperationLockState('activity_recommendation')

  const cardUi = {
    root: 'rounded-none sm:rounded-xl shadow-none sm:shadow-sm ring-0 sm:ring ring-default border-y border-default sm:border-y-0',
    body: 'p-4 sm:p-6'
  }

  const showCreateAdHoc = ref(false)
  const showRefine = ref(false)
  const accepting = ref(false)
  const isSyncingForAnalysis = ref(false)
  const hasFetchedWorkouts = ref(false)

  onMounted(async () => {
    try {
      await recommendationStore.fetchTodayWorkout()
    } finally {
      hasFetchedWorkouts.value = true
    }
  })

  const isLoadingSession = computed(
    () =>
      (!hasFetchedWorkouts.value || recommendationStore.loadingWorkout) &&
      recommendationStore.todayWorkouts.length === 0
  )

  const recommendation = computed(() => recommendationStore.todayRecommendation)
  const workouts = computed<any[]>(() => recommendationStore.todayWorkouts || [])
  const trainingWorkouts = computed(() => workouts.value.filter((w) => w.type !== 'Rest'))

  /** The session to lead with: the first one not yet done, else the first one. */
  const primaryWorkout = computed<any | null>(() => {
    const list = trainingWorkouts.value
    return list.find((w) => !w.completed) || list[0] || null
  })

  const otherWorkouts = computed(() =>
    trainingWorkouts.value.filter((w) => w.id !== primaryWorkout.value?.id)
  )

  type SessionState = 'session' | 'rest' | 'none' | 'no-plan'
  const sessionState = computed<SessionState>(() => {
    if (primaryWorkout.value) return 'session'
    if (workouts.value.some((w) => w.type === 'Rest')) return 'rest'
    return props.hasPlan ? 'none' : 'no-plan'
  })

  const sessionLink = computed(() =>
    primaryWorkout.value ? `/workouts/planned/${primaryWorkout.value.id}` : undefined
  )

  const sessionStats = computed(() => {
    const w = primaryWorkout.value
    if (!w) return []
    const stats: Array<{ key: string; icon: string; value: string; label?: string }> = []
    const duration = formatTrainingDuration(w.durationSec)
    if (duration) stats.push({ key: 'duration', icon: 'i-heroicons-clock', value: duration })
    const distance = formatTrainingDistance(w.distanceMeters, userStore.profile?.distanceUnits)
    if (distance) stats.push({ key: 'distance', icon: 'i-tabler-route', value: distance })
    if (w.tss) {
      stats.push({
        key: 'load',
        icon: 'i-tabler-flame',
        label: t.value('today_session_load_label'),
        value: String(Math.round(w.tss))
      })
    }
    return stats
  })

  const hasStructure = computed(
    () =>
      !!primaryWorkout.value?.structuredWorkout &&
      Array.isArray(primaryWorkout.value.structuredWorkout?.steps) &&
      primaryWorkout.value.structuredWorkout.steps.length > 0
  )
  const chartPreference = computed(() => getMiniChartPreference(primaryWorkout.value))
  const chartSportSettings = computed(() =>
    getMiniChartSportSettings(
      primaryWorkout.value,
      userStore.profile?.sportSettings,
      userStore.currentFtp
    )
  )

  const VERDICTS: Record<
    string,
    { key: string; color: 'success' | 'warning' | 'error' | 'neutral'; icon: string }
  > = {
    proceed: { key: 'today_verdict_proceed', color: 'success', icon: 'i-heroicons-check-circle' },
    modify: { key: 'today_verdict_modify', color: 'warning', icon: 'i-heroicons-pencil-square' },
    reduce_intensity: {
      key: 'today_verdict_reduce',
      color: 'warning',
      icon: 'i-heroicons-arrow-trending-down'
    },
    rest: { key: 'today_verdict_rest', color: 'error', icon: 'i-heroicons-moon' }
  }

  const verdict = computed(() => {
    if (recommendationStore.generating) return null
    const value = recommendation.value?.recommendation
    const config = value ? VERDICTS[value] : null
    if (!config) return null
    return { color: config.color, icon: config.icon, label: t.value(config.key) }
  })

  const suggestion = computed(() => {
    const mods = recommendation.value?.analysisJson?.suggested_modifications
    if (!mods?.description) return null
    return mods as {
      description: string
      new_title?: string
      new_type?: string
      new_duration_min?: number
      new_tss?: number
    }
  })

  // The structured numbers of the suggested change, so the athlete sees exactly
  // what "Accept" will put in the plan rather than only the coach's prose.
  const suggestionSummary = computed(() => {
    const mods = suggestion.value
    if (!mods) return null
    const parts: string[] = []
    if (mods.new_title) parts.push(mods.new_title)
    if (mods.new_type && mods.new_type !== 'Rest' && !mods.new_title?.includes(mods.new_type)) {
      parts.push(mods.new_type)
    }
    if (
      mods.new_type !== 'Rest' &&
      Number.isFinite(mods.new_duration_min) &&
      mods.new_duration_min! > 0
    ) {
      parts.push(`${Math.round(mods.new_duration_min!)} min`)
    }
    if (mods.new_type !== 'Rest' && Number.isFinite(mods.new_tss) && mods.new_tss! > 0) {
      parts.push(t.value('today_session_suggestion_load', { load: Math.round(mods.new_tss!) }))
    }
    return parts.length ? parts.join(' · ') : null
  })

  const checkinDone = computed(() => checkinStore.isCompleted)

  const showCoachTake = computed(
    () =>
      !!recommendation.value ||
      recommendationStore.generating ||
      sessionState.value === 'session' ||
      sessionState.value === 'rest'
  )

  interface HeroAction {
    key: string
    label: string
    icon?: string
    trailingIcon?: string
    to?: string
    onClick?: () => void
  }

  const checkinAction = computed<HeroAction>(() => ({
    key: 'checkin',
    label: t.value('today_session_start_checkin'),
    icon: 'i-heroicons-clipboard-document-check',
    onClick: () => emit('open-checkin')
  }))

  const openAction = computed<HeroAction>(() => ({
    key: 'open',
    label: t.value('today_session_open'),
    trailingIcon: 'i-heroicons-arrow-right',
    to: sessionLink.value,
    onClick: () => trackWidgetClick('today_session', 'open_session')
  }))

  const adjustAction = computed<HeroAction>(() => ({
    key: 'adjust',
    label: t.value('today_session_adjust'),
    icon: 'i-heroicons-adjustments-horizontal',
    onClick: () => {
      void openRefine()
    }
  }))

  const askForSessionAction = computed<HeroAction>(() => ({
    key: 'ask-session',
    label: t.value('today_no_session_action'),
    icon: 'i-heroicons-sparkles',
    onClick: () => {
      trackWidgetClick('today_session', 'ask_for_session')
      showCreateAdHoc.value = true
    }
  }))

  const buildPlanAction = computed<HeroAction>(() => ({
    key: 'build-plan',
    label: t.value('today_no_plan_action'),
    icon: 'i-heroicons-map',
    to: '/plan',
    onClick: () => trackWidgetClick('today_session', 'build_plan')
  }))

  const primaryAction = computed<HeroAction | null>(() => {
    switch (sessionState.value) {
      case 'session':
        return checkinDone.value ? openAction.value : checkinAction.value
      case 'rest':
        return checkinDone.value ? null : checkinAction.value
      case 'none':
        return askForSessionAction.value
      default:
        return buildPlanAction.value
    }
  })

  const secondaryActions = computed<HeroAction[]>(() => {
    const actions: HeroAction[] = []
    if (sessionState.value === 'session') {
      if (!primaryWorkout.value?.completed) actions.push(adjustAction.value)
      if (primaryAction.value?.key !== 'open') actions.push(openAction.value)
    } else if (sessionState.value === 'none' || sessionState.value === 'no-plan') {
      if (sessionState.value === 'no-plan') actions.push(askForSessionAction.value)
      if (!checkinDone.value) actions.push(checkinAction.value)
    }
    return actions
  })

  async function openRefine() {
    trackWidgetClick('today_session', 'adjust')
    await handleLockedAction({
      operation: 'activity_recommendation',
      featureTitle: 'Activity Recommendation',
      onAllowed: () => {
        showRefine.value = true
      }
    })
  }

  async function checkProfileAndGenerate(feedback?: string) {
    const profileStatus = checkProfileStale(
      userStore.profile?.profileLastUpdated,
      userStore.profile?.latestWorkoutDate
    )

    if (profileStatus.isStale) {
      showDashboardProgressToast(
        toast,
        {
          title: t.value('today_toast_profile_title'),
          description: t.value('today_toast_profile_desc'),
          color: 'info',
          icon: 'i-heroicons-user-circle'
        },
        'dashboard.profile.precheck.stale'
      )

      try {
        await userStore.generateProfile()
      } catch (e) {
        console.error('Profile generation failed, proceeding with recommendation anyway', e)
      }
    }

    trackRecommendationRequest(!!feedback, !!feedback)
    await recommendationStore.generateTodayRecommendation(feedback)
  }

  async function handleGetTake() {
    trackWidgetClick('today_session', 'get_coach_take')
    await handleLockedAction({
      operation: 'activity_recommendation',
      featureTitle: 'Activity Recommendation',
      onAllowed: async () => {
        isSyncingForAnalysis.value = true
        try {
          await integrationStore.syncAllData()
        } finally {
          isSyncingForAnalysis.value = false
        }
        await checkProfileAndGenerate()
      }
    })
  }

  async function handleRefine(feedback: string) {
    showRefine.value = false
    await checkProfileAndGenerate(feedback)
  }

  async function handleCreateAdHoc(data: any) {
    showCreateAdHoc.value = false
    await recommendationStore.generateAdHocWorkout(data)
  }

  async function handleAccept() {
    const rec = recommendation.value
    if (!rec?.id) return
    accepting.value = true
    try {
      await recommendationStore.acceptRecommendation(rec.id)
      trackRecommendationAccept(rec.id, rec.recommendation)
    } finally {
      accepting.value = false
    }
  }
</script>
