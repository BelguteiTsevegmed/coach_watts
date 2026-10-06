<template>
  <section class="today-flow" :aria-busy="journey.phase === 'loading'">
    <div class="today-flow__next" aria-live="polite">
      <div v-if="journey.phase === 'loading'" class="py-10 space-y-3" role="status">
        <USkeleton class="h-8 w-3/4" />
        <USkeleton class="h-5 w-2/3" />
        <span class="sr-only">{{ t('journey_loading_title') }}</span>
      </div>
      <template v-else>
        <p class="today-flow__step">{{ t('journey_next_step') }}</p>
        <h2 class="today-flow__title">{{ phaseTitle }}</h2>
        <p class="today-flow__description">{{ phaseDescription }}</p>

        <p v-if="journey.phase === 'error'" class="mt-3 text-sm text-muted" role="alert">
          {{ dayError }}
        </p>
        <p v-if="journey.phase === 'checkin' && checkinStore.error" class="mt-3 text-sm text-muted">
          {{ t('journey_checkin_error') }}
        </p>

        <div v-if="journey.phase === 'prepare' && nextWorkout" class="today-flow__session">
          <p class="text-sm text-muted">{{ nextWorkout.type }}</p>
          <h3 class="text-xl font-semibold mt-1">{{ nextWorkout.title }}</h3>
          <p v-if="nextWorkout.durationSec" class="text-sm text-muted mt-2">
            {{ t('journey_duration', { minutes: Math.round(nextWorkout.durationSec / 60) }) }}
          </p>
          <p
            v-if="nextWorkout.description"
            class="mt-4 text-sm leading-relaxed whitespace-pre-line line-clamp-4"
          >
            {{ nextWorkout.description }}
          </p>
          <MiniWorkoutChart
            v-if="nextWorkout.structuredWorkout"
            class="mt-4 h-20 w-full"
            :workout="nextWorkout"
            :sport-settings="getChartSportSettings(nextWorkout)"
            :preference="getChartPreference(nextWorkout)"
          />
          <p v-if="journey.remainingSessionCount > 1" class="mt-3 text-sm text-muted">
            {{ t('journey_more_sessions', { count: journey.remainingSessionCount - 1 }) }}
          </p>
        </div>

        <div v-if="journey.phase === 'reflect' && reflectionWorkout" class="today-flow__session">
          <h3 class="text-lg font-semibold">{{ reflectionWorkout.title }}</h3>
          <p v-if="reflectionWorkout.duration" class="mt-2 text-sm text-muted">
            {{ t('journey_duration', { minutes: Math.round(reflectionWorkout.duration / 60) }) }}
          </p>
        </div>

        <div class="mt-7">
          <UButton v-if="journey.phase === 'error'" size="lg" @click="emit('retry')">
            {{ t('journey_retry_today') }}
          </UButton>
          <UButton v-else-if="journey.phase === 'checkin'" size="lg" @click="emit('open-checkin')">
            {{ t('journey_start_checkin') }}
          </UButton>
          <UButton
            v-else-if="journey.phase === 'prepare' && nextWorkout"
            size="lg"
            :to="`/workouts/planned/${nextWorkout.id}`"
          >
            {{ t('journey_open_session') }}
          </UButton>
          <UButton
            v-else-if="journey.phase === 'reflect' && reflectionWorkout"
            size="lg"
            :to="`/workouts/${reflectionWorkout.id}#notes`"
          >
            {{ t('journey_reflect_action') }}
          </UButton>
          <UButton v-else-if="journey.phase === 'rest'" size="lg" to="/plan">
            {{ t('journey_rest_action') }}
          </UButton>
          <UButton v-else-if="journey.phase === 'complete'" size="lg" to="/plan">
            {{ t('journey_view_week') }}
          </UButton>
          <UButton v-else-if="journey.phase === 'unplanned'" size="lg" @click="openCreateAdHoc">
            {{ t('journey_create_session') }}
          </UButton>
        </div>
      </template>
    </div>

    <div
      v-if="journey.phase !== 'loading' && journey.phase !== 'error'"
      class="today-flow__continuation"
    >
      <div
        v-if="journey.phase === 'checkin' && nextWorkout"
        class="flex flex-wrap justify-between items-center gap-3 py-5"
      >
        <div>
          <p class="text-sm text-muted">{{ t('journey_after_checkin') }}</p>
          <p class="font-medium mt-1">{{ nextWorkout.title }}</p>
        </div>
        <UButton
          :to="`/workouts/planned/${nextWorkout.id}`"
          color="neutral"
          variant="link"
          size="sm"
        >
          {{ t('journey_preview_session') }}
        </UButton>
      </div>

      <details class="today-flow__disclosure">
        <summary>
          {{ hasRecommendation ? t('journey_coach_ready') : t('journey_coach_optional') }}
        </summary>
        <div class="today-flow__depth">
          <p v-if="analysisBusy" class="text-sm text-muted" role="status">{{ getLoadingText() }}</p>
          <template v-else-if="hasRecommendation">
            <div
              v-if="planChanged"
              class="mb-4 rounded-lg bg-warning/10 p-4 ring ring-warning/25"
              role="status"
              data-testid="today-plan-changed"
            >
              <p class="text-sm">{{ t('today_session_plan_changed') }}</p>
              <UButton
                class="mt-3"
                color="warning"
                variant="outline"
                :loading="analysisBusy"
                :disabled="analysisBusy"
                @click="handleAnalyzeClick"
              >
                {{ t('today_session_plan_changed_refresh') }}
              </UButton>
            </div>
            <p class="font-medium">
              {{ getRecommendationLabel(recommendationStore.todayRecommendation.recommendation) }}
            </p>
            <p class="mt-3 leading-relaxed">
              {{ recommendationStore.todayRecommendation.reasoning }}
            </p>
            <div
              v-if="suggestion"
              class="today-flow__proposal"
              data-testid="today-suggested-change"
            >
              <h4 class="font-medium">{{ t('training_recommendation_suggested_modification') }}</h4>
              <p
                v-if="suggestionSummary"
                class="mt-2 text-sm font-medium"
                data-testid="today-suggested-change-summary"
              >
                {{ suggestionSummary }}
              </p>
              <p class="mt-2 text-sm leading-relaxed">
                {{ suggestion.description }}
              </p>
              <p class="mt-2 text-sm text-muted">{{ t('journey_proposal_explanation') }}</p>
              <UButton v-if="canAccept" class="mt-4" :loading="accepting" @click="handleAccept">
                {{ t('training_recommendation_accept_button') }}
              </UButton>
              <p
                v-else-if="recommendationStore.todayRecommendation.userAccepted"
                class="mt-3 text-sm text-primary"
              >
                {{ t('training_recommendation_accepted') }}
              </p>
            </div>
          </template>
          <p v-else class="text-sm leading-relaxed text-muted">
            {{ t('journey_coach_description') }}
          </p>
          <div class="flex flex-wrap items-center gap-3 mt-5">
            <UButton
              v-if="hasRecommendation"
              color="neutral"
              variant="outline"
              @click="emit('open-details')"
            >
              {{ t('journey_recommendation_detail') }}
            </UButton>
            <UButton
              v-if="!planChanged"
              color="neutral"
              variant="outline"
              :loading="analysisBusy"
              :disabled="analysisBusy"
              @click="handleAnalyzeClick"
            >
              {{ getButtonLabel() }}
            </UButton>
            <UButton to="/chat" color="neutral" variant="link">{{
              t('journey_ask_coach')
            }}</UButton>
          </div>
          <AiFeedback
            v-if="recommendationStore.todayRecommendation?.llmUsageId"
            class="mt-5"
            :llm-usage-id="recommendationStore.todayRecommendation.llmUsageId"
            :initial-feedback="recommendationStore.todayRecommendation.feedback"
            :initial-feedback-text="recommendationStore.todayRecommendation.feedbackText"
          />
        </div>
      </details>

      <details class="today-flow__disclosure">
        <summary>{{ t('journey_checkin_context') }}</summary>
        <div class="today-flow__depth">
          <p class="text-sm leading-relaxed text-muted">
            {{
              checkinStore.isCompleted
                ? todayCheckinSummary
                : t('journey_checkin_context_description')
            }}
          </p>
          <UButton class="mt-4" color="neutral" variant="outline" @click="emit('open-checkin')">
            {{ checkinStore.isCompleted ? t('journey_edit_checkin') : t('journey_start_checkin') }}
          </UButton>
          <div v-if="activeRecoveryItems.length" class="mt-5 space-y-2">
            <button
              v-for="item in activeRecoveryItems"
              :key="item.id"
              type="button"
              class="today-flow__context"
              @click="openRecoveryItem(item)"
            >
              <UIcon :name="item.icon" class="size-4 shrink-0" />
              <span class="flex-1 text-left">{{ item.label }}</span>
              <span class="text-xs text-muted">{{ contextSourceLabel(item.sourceType) }}</span>
            </button>
          </div>
          <div class="mt-5 flex flex-wrap gap-3">
            <UButton to="/injuries" color="neutral" variant="link">{{
              t('today_body_report')
            }}</UButton>
            <UButton color="neutral" variant="link" @click="openCreateRecoveryEvent">{{
              t('journey_log_recovery')
            }}</UButton>
            <UButton to="/recovery" color="neutral" variant="link">{{
              t('journey_recovery_history')
            }}</UButton>
          </div>
        </div>
      </details>
    </div>
  </section>

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
  <RecoveryContextSlideover
    :open="isRecoveryContextOpen"
    :item="selectedRecoveryItem"
    :create-mode="isRecoveryCreateMode"
    @update:open="isRecoveryContextOpen = $event"
    @saved="refreshRecoveryContext"
    @deleted="refreshRecoveryContext"
  />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import DashboardCreateAdHocModal from '~/components/dashboard/DashboardCreateAdHocModal.vue'
  import DashboardRefineRecommendationModal from '~/components/dashboard/DashboardRefineRecommendationModal.vue'
  import RecoveryContextSlideover from '~/components/recovery/RecoveryContextSlideover.vue'
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import { resolveTodayJourney } from '#shared/athlete-journey'
  import type { CalendarActivity } from '~/types/calendar'
  import { showDashboardProgressToast } from '~/utils/dashboard-progress-toast'
  import { getMiniChartPreference, getMiniChartSportSettings } from '~/utils/mini-workout-chart'
  import type { RecoveryContextItem, RecoveryContextSourceType } from '~/types/recovery-context'

  const { t } = useTranslate('dashboard')
  const integrationStore = useIntegrationStore()
  const recommendationStore = useRecommendationStore()
  const userStore = useUserStore()
  const { handleLockedAction } = useQuotaPaywall()
  const checkinStore = useCheckinStore()
  const { checkProfileStale } = useDataStatus()
  const toast = useToast()
  const { trackRecommendationRequest, trackRecommendationAccept } = useAnalytics()

  const props = withDefaults(
    defineProps<{
      completedWorkouts?: CalendarActivity[]
      dayLoading?: boolean
      dayError?: string | null
    }>(),
    { completedWorkouts: () => [], dayLoading: false, dayError: null }
  )

  const journey = computed(() =>
    resolveTodayJourney({
      loading: props.dayLoading || recommendationStore.loadingWorkout || checkinStore.loading,
      loadError: props.dayError,
      checkinCompleted: checkinStore.isCompleted,
      planned: recommendationStore.todayWorkouts,
      completed: props.completedWorkouts
    })
  )
  const nextWorkout = computed(() =>
    recommendationStore.todayWorkouts.find(
      (workout: any) => workout.id === journey.value.nextWorkoutId
    )
  )
  const reflectionWorkout = computed(() =>
    props.completedWorkouts.find((workout) => workout.id === journey.value.reflectionWorkoutId)
  )
  const phaseTitle = computed(() => t.value(`journey_${journey.value.phase}_title`))
  const phaseDescription = computed(() => t.value(`journey_${journey.value.phase}_description`))
  const hasRecommendation = computed(() => !!recommendationStore.todayRecommendation)
  const planChanged = computed(() => !!recommendationStore.todayRecommendation?.planChanged)
  const suggestion = computed(() => {
    const mods = recommendationStore.todayRecommendation?.analysisJson?.suggested_modifications
    if (!mods?.description) return null
    return mods as {
      description: string
      new_title?: string
      new_type?: string
      new_duration_min?: number
      new_tss?: number
    }
  })
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
      typeof mods.new_duration_min === 'number' &&
      Number.isFinite(mods.new_duration_min) &&
      mods.new_duration_min > 0
    ) {
      parts.push(`${Math.round(mods.new_duration_min)} min`)
    }
    if (
      mods.new_type !== 'Rest' &&
      typeof mods.new_tss === 'number' &&
      Number.isFinite(mods.new_tss) &&
      mods.new_tss > 0
    ) {
      parts.push(t.value('today_session_suggestion_load', { load: Math.round(mods.new_tss) }))
    }
    return parts.length ? parts.join(' · ') : null
  })
  const analysisBusy = computed(
    () =>
      recommendationStore.generating ||
      recommendationStore.generatingAdHoc ||
      isSyncingForAnalysis.value
  )
  const emit = defineEmits(['open-details', 'open-checkin', 'retry'])

  const showCreateAdHoc = ref(false)
  const showRefine = ref(false)
  const accepting = ref(false)
  const isSyncingForAnalysis = ref(false)
  const selectedRecoveryItem = ref<RecoveryContextItem | null>(null)
  const isRecoveryContextOpen = ref(false)
  const isRecoveryCreateMode = ref(false)
  const { activeToday: activeRecoveryItems, refresh: refreshRecoveryContext } = useRecoveryContext(
    computed(() => 14)
  )

  const todayCheckinSummary = computed(() => {
    const questions = checkinStore.currentCheckin?.questions || []
    const answered = questions.filter(
      (question: any) => question.answer !== undefined && question.answer !== null
    )
    const summary = answered
      .slice(0, 2)
      .map((question: any) => `${question.text}: ${question.answer}`)
      .join('. ')

    if (summary && checkinStore.currentCheckin?.userNotes) {
      return `${summary}. ${checkinStore.currentCheckin.userNotes}`
    }

    return summary || checkinStore.currentCheckin?.userNotes || t.value('journey_checkin_saved')
  })

  const canAccept = computed(() => {
    return (
      suggestion.value &&
      !recommendationStore.todayRecommendation?.userAccepted &&
      !planChanged.value
    )
  })

  function getChartPreference(workout: any) {
    return getMiniChartPreference(workout)
  }

  function getChartSportSettings(workout: any) {
    return getMiniChartSportSettings(
      workout,
      userStore.profile?.sportSettings,
      userStore.currentFtp
    )
  }

  function openCreateAdHoc() {
    showCreateAdHoc.value = true
  }

  function openRecoveryItem(item: RecoveryContextItem) {
    selectedRecoveryItem.value = item
    isRecoveryCreateMode.value = false
    isRecoveryContextOpen.value = true
  }

  function openCreateRecoveryEvent() {
    selectedRecoveryItem.value = null
    isRecoveryCreateMode.value = true
    isRecoveryContextOpen.value = true
  }

  function contextSourceLabel(sourceType: RecoveryContextSourceType) {
    if (sourceType === 'imported') return 'Imported'
    if (sourceType === 'manual_event') return 'Manual'
    return 'Check-in'
  }

  function openRefineModal() {
    showRefine.value = true
  }

  async function handleAccept() {
    if (!canAccept.value || !recommendationStore.todayRecommendation?.id) return

    accepting.value = true
    try {
      const accepted = await recommendationStore.acceptRecommendation(
        recommendationStore.todayRecommendation.id
      )
      if (accepted)
        trackRecommendationAccept(
          recommendationStore.todayRecommendation.id,
          recommendationStore.todayRecommendation.recommendation
        )
    } finally {
      accepting.value = false
    }
  }

  async function checkProfileAndGenerate(feedback?: string) {
    // Check if profile needs update before generating recommendation
    const profileStatus = checkProfileStale(
      userStore.profile?.profileLastUpdated,
      userStore.profile?.latestWorkoutDate
    )

    if (profileStatus.isStale) {
      showDashboardProgressToast(
        toast,
        {
          title: 'Updating Profile First',
          description:
            'Your athlete profile is outdated. Updating it for better recommendations...',
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

  async function handleRefine(feedback: string) {
    showRefine.value = false
    await checkProfileAndGenerate(feedback)
  }

  async function handleCreateAdHoc(data: any) {
    showCreateAdHoc.value = false
    await recommendationStore.generateAdHocWorkout(data)
  }

  async function handleAnalyzeClick() {
    if (planChanged.value) {
      await handleLockedAction({
        operation: 'activity_recommendation',
        featureTitle: 'Activity Recommendation',
        onAllowed: () => checkProfileAndGenerate()
      })
      return
    }
    if (recommendationStore.todayRecommendation) {
      await handleLockedAction({
        operation: 'activity_recommendation',
        featureTitle: 'Activity Recommendation',
        onAllowed: () => openRefineModal()
      })
      return
    }

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

  function getButtonLabel() {
    if (isSyncingForAnalysis.value) return t.value('training_recommendation_syncing')
    if (userStore.generating) return t.value('training_recommendation_updating_profile')
    if (recommendationStore.generating) return t.value('training_recommendation_thinking')
    if (recommendationStore.todayRecommendation)
      return t.value('training_recommendation_refine_button')
    return t.value('training_recommendation_analyze_readiness_button')
  }

  function getLoadingText() {
    if (recommendationStore.generatingAdHoc)
      return t.value('training_recommendation_loading_designing')
    if (userStore.generating) return t.value('training_recommendation_loading_profile')
    if (recommendationStore.generating)
      return t.value('training_recommendation_loading_recommendation')
    return t.value('training_recommendation_loading_generic')
  }

  function getRecommendationLabel(rec: string) {
    const labels: Record<string, string> = {
      proceed: t.value('training_recommendation_label_proceed'),
      modify: t.value('training_recommendation_label_modify'),
      reduce_intensity: t.value('training_recommendation_label_reduce'),
      rest: t.value('training_recommendation_label_rest')
    }
    return labels[rec] || rec
  }
</script>

<style scoped>
  .today-flow__next {
    padding: 1.75rem 0 2.25rem;
  }
  .today-flow__step {
    color: var(--ui-text-muted);
    font-size: 0.875rem;
    margin-bottom: 0.875rem;
  }
  .today-flow__title {
    font-size: clamp(1.7rem, 4vw, 2.4rem);
    line-height: 1.18;
    font-weight: 600;
    letter-spacing: -0.035em;
    max-width: 28ch;
  }
  .today-flow__description {
    margin-top: 1rem;
    color: var(--ui-text-muted);
    max-width: 58ch;
    line-height: 1.7;
  }
  .today-flow__session {
    padding-left: 1.25rem;
    margin-top: 1.75rem;
    border-left: 2px solid var(--ui-primary);
    max-width: 38rem;
  }
  .today-flow__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .today-flow__disclosure summary {
    padding: 1.25rem 0;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
  }
  .today-flow__disclosure summary::marker {
    color: var(--ui-text-muted);
  }
  .today-flow__disclosure summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 4px;
  }
  .today-flow__depth {
    padding: 0.25rem 0 1.75rem;
    max-width: 66ch;
  }
  .today-flow__proposal {
    margin-top: 1.25rem;
    padding: 1.25rem;
    background: var(--ui-bg-elevated);
    border-radius: 0.5rem;
  }
  .today-flow__context {
    display: flex;
    width: 100%;
    gap: 0.75rem;
    align-items: center;
    padding: 0.875rem 0;
    border-bottom: 1px solid var(--ui-border);
    font-size: 0.875rem;
  }
  .today-flow__context:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
</style>
