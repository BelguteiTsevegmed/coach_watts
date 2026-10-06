<template>
  <UDashboardPanel id="dashboard">
    <template #body>
      <div class="quick-capture-inset">
        <ClientOnly>
          <div v-if="isLoading" class="today-page py-20" role="status">
            <USkeleton class="h-7 w-32 mb-10" />
            <USkeleton class="h-10 w-3/4 mb-4" />
            <USkeleton class="h-5 w-2/3" />
            <span class="sr-only">{{ t('journey_loading_title') }}</span>
          </div>

          <div v-else-if="showFullSetupHub && onboardingStatus" class="today-page">
            <DashboardOnboardingView
              :status="onboardingStatus"
              @sync="handleSync"
              @connect-later="handleConnectLater"
            />
          </div>

          <section v-else class="today-page" aria-label="Today">
            <header class="today-page__header">
              <div>
                <h1 class="text-xl font-semibold">{{ t('dashboard_title') }}</h1>
                <p class="text-sm text-muted mt-1">{{ todayLabel }}</p>
              </div>
              <div class="flex items-center gap-2">
                <UButton to="/activities" color="neutral" variant="link" size="sm">{{
                  t('journey_view_week')
                }}</UButton>
                <LayoutPageNavbarActions :overflow-items="dashboardOverflowItems">
                  <ClientOnly><NotificationDropdown /></ClientOnly>
                  <UDropdownMenu :items="dashboardOverflowItems">
                    <UButton
                      icon="i-heroicons-ellipsis-horizontal"
                      color="neutral"
                      variant="ghost"
                      :aria-label="t('journey_more_actions')"
                      class="min-h-11 min-w-11"
                    />
                  </UDropdownMenu>
                </LayoutPageNavbarActions>
              </div>
            </header>

            <DashboardTrainingRecommendationCard
              :completed-workouts="completedToday"
              :day-loading="loadingDay"
              :day-error="dayError"
              @open-details="openRecommendationModal"
              @open-checkin="openCheckinModal"
              @retry="retryToday"
            />

            <details
              v-if="nutritionEnabled"
              class="today-page__disclosure"
              @toggle="handleFuelingToggle"
            >
              <summary>{{ t('journey_fueling') }}</summary>
              <div v-if="fuelingDepthOpen" class="py-4 pb-7">
                <p class="text-sm text-muted leading-relaxed">
                  {{ t('journey_fueling_description') }}
                </p>
                <DashboardNutritionFuelingCard
                  v-if="todayNutrition || todayWorkouts.some((workout) => workout.type !== 'Rest')"
                  class="mt-5"
                  :nutrition="todayNutrition"
                  :workouts="todayWorkouts"
                  :settings="nutritionSettings"
                  :weight="userStore.currentWeightKg || undefined"
                  :loading="loadingNutrition"
                  @refresh="handleNutritionRefresh"
                />
                <UButton v-else to="/nutrition" color="neutral" variant="outline" class="mt-4">{{
                  t('journey_open_journal')
                }}</UButton>
              </div>
            </details>

            <details class="today-page__disclosure" @toggle="handleRecoveryToggle">
              <summary>{{ t('journey_recovery_trends') }}</summary>
              <div v-if="recoveryDepthOpen" class="space-y-5 py-4 pb-7">
                <p class="text-sm text-muted">{{ t('journey_trends_description') }}</p>
                <DashboardAthleteProfileCard
                  @open-wellness="openWellnessModal"
                  @open-training-load="openTrainingLoadModal"
                />
                <DashboardPerformanceScoresCard
                  ref="performanceScoresCard"
                  @open-score-modal="openScoreModal"
                  @open-training-load="openTrainingLoadModal"
                />
                <DashboardMonthlyComparisonCard v-if="canUseDashboardActions" />
                <UButton to="/performance" color="neutral" variant="link">{{
                  t('journey_open_progress')
                }}</UButton>
              </div>
            </details>

            <details class="today-page__disclosure">
              <summary>{{ t('journey_coming_up') }}</summary>
              <div class="py-4 pb-7">
                <p v-if="loadingUpcoming" class="text-sm text-muted" role="status">
                  {{ t('journey_loading_sessions') }}
                </p>
                <div v-else-if="upcomingWorkoutsError">
                  <p class="text-sm text-muted" role="alert">{{ upcomingWorkoutsError }}</p>
                  <UButton
                    class="mt-4"
                    color="neutral"
                    variant="outline"
                    @click="fetchUpcomingWorkouts"
                    >{{ t('upcoming_workouts_retry') }}</UButton
                  >
                </div>
                <div v-else-if="upcomingWorkouts.length === 0">
                  <p class="text-sm text-muted">{{ t('upcoming_workouts_empty') }}</p>
                  <UButton to="/plans" color="neutral" variant="link" class="mt-3">{{
                    t('journey_find_plan')
                  }}</UButton>
                </div>
                <div v-else class="divide-y divide-default">
                  <NuxtLink
                    v-for="workout in upcomingWorkouts.slice(0, 4)"
                    :key="workout.id"
                    :to="`/workouts/planned/${workout.id}`"
                    class="today-page__upcoming"
                    @click="trackWidgetClick('upcoming_workouts', 'open_workout')"
                  >
                    <span class="w-12 shrink-0 text-sm text-muted"
                      >{{ formatDayShort(workout.date) }} {{ formatDateDay(workout.date) }}</span
                    >
                    <UIcon
                      :name="getWorkoutIcon(workout.type)"
                      class="size-4 text-muted shrink-0"
                    />
                    <span class="flex-1 min-w-0">
                      <span class="block font-medium text-sm">{{ workout.title }}</span>
                      <span v-if="workout.durationSec" class="block mt-1 text-xs text-muted">{{
                        t('journey_duration', { minutes: Math.round(workout.durationSec / 60) })
                      }}</span>
                    </span>
                    <UIcon name="i-heroicons-chevron-right" class="size-4 text-muted" />
                  </NuxtLink>
                </div>
                <UButton to="/plan" color="neutral" variant="link" class="mt-4">{{
                  t('journey_view_week')
                }}</UButton>
              </div>
            </details>

            <details v-if="showCompactSetupCard && onboardingStatus" class="today-page__disclosure">
              <summary>{{ t('journey_continue_setup') }}</summary>
              <div class="py-4 pb-7">
                <DashboardSetupProgressCard
                  :status="onboardingStatus"
                  @sync="handleSync"
                  @complete="handleCompleteSetup"
                />
              </div>
            </details>

            <details v-if="missingFields.length" class="today-page__disclosure">
              <summary>{{ t('journey_profile_details') }}</summary>
              <div class="py-4 pb-7">
                <DashboardMissingDataBanner :missing-fields="missingFields" />
              </div>
            </details>

            <div v-if="integrationStore.syncingData" class="mt-6">
              <DashboardDataSyncStatusCard />
            </div>

            <footer class="today-page__footer">
              <div v-if="isGarminConnected" class="flex items-center gap-2 text-xs text-muted">
                <span>{{ t('attribution_garmin') }}</span>
                <img
                  src="/images/logos/Garmin-Tag-black-high-res.png"
                  class="h-4 w-auto dark:hidden"
                  alt="Garmin"
                />
                <img
                  src="/images/logos/Garmin-Tag-white-high-res.png"
                  class="h-4 w-auto hidden dark:block"
                  alt="Garmin"
                />
              </div>
              <UButton to="/settings/changelog" variant="link" color="neutral" size="xs">{{
                buildVersionDisplay
              }}</UButton>
            </footer>
          </section>
        </ClientOnly>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Wellness Modal -->
  <WellnessModal v-model:open="showWellnessModal" :date="wellnessModalDate" />

  <!-- Recommendation Modal -->
  <DashboardRecommendationDetailModal
    v-model:open="showRecommendationModal"
    :recommendation="recommendationStore.todayRecommendation"
  />

  <!-- Score Detail Modal -->
  <ScoreDetailModal
    v-if="showScoreModal"
    v-model="showScoreModal"
    :title="scoreModalData.title"
    :score="scoreModalData.score"
    :explanation="scoreModalData.explanation"
    :analysis-data="scoreModalData.analysisData"
    :color="scoreModalData.color"
  />

  <!-- Training Load Modal -->
  <TrainingLoadModal v-model:open="showTrainingLoadModal" />

  <!-- Daily Check-in Modal -->
  <DashboardDailyCheckinModal v-model:open="showCheckinModal" />

  <!-- Share Coach Watts Modal -->
  <DashboardShareCoachWattsModal v-model:open="showShareCoachWattsModal" />

  <DashboardTrialEndedModal />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { getWorkoutIcon } from '~/utils/activity-types'
  import type { CalendarActivity } from '~/types/calendar'
  import { getCalendarActivities } from '~/utils/calendar'
  import { showDashboardProgressToast } from '~/utils/dashboard-progress-toast'
  import DashboardTrialEndedModal from '~/components/dashboard/TrialEndedModal.vue'

  const { t } = useTranslate('dashboard')
  const { trackWidgetClick } = useAnalytics()

  const { formatDateUTC, getUserLocalDate } = useFormat()

  definePageMeta({
    middleware: 'auth'
  })

  const config = useRuntimeConfig()
  const route = useRoute()
  const buildVersionDisplay = computed(
    () =>
      (config.public.buildVersion as string) ||
      `v${config.public.version}+${config.public.buildDate}.${config.public.commitHash}.${config.public.buildCodename}`
  )
  const toast = useToast()

  const integrationStore = useIntegrationStore()
  const {
    status: onboardingStatus,
    activationComplete,
    showFullSetupHub,
    showCompactSetupCard,
    refresh: refreshOnboardingStatus,
    deferConnection,
    completeActivation
  } = useOnboardingStatus()
  const userStore = useUserStore()
  const { missingFields } = storeToRefs(userStore)

  const isGarminConnected = computed(() => {
    return (
      integrationStore.integrationStatus?.integrations?.some((i: any) => i.provider === 'garmin') ??
      false
    )
  })

  const recommendationStore = useRecommendationStore()

  const checkinStore = useCheckinStore()
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )
  const fuelingDepthOpen = ref(false)
  const recoveryDepthOpen = ref(false)
  const performanceScoresCard = ref<{ refresh: () => Promise<unknown> } | null>(null)

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  async function handleSync() {
    await integrationStore.syncAllData()
    refreshRuns()
  }

  async function handleIngestTaskComplete() {
    integrationStore.syncingData = false
    await integrationStore.fetchStatus()
    await refreshOnboardingStatus()
    await Promise.all([
      userStore.fetchProfile(),
      recommendationStore.fetchTodayRecommendation(),
      fetchUpcomingWorkouts(),
      fetchTodaySessions(),
      checkinStore.fetchToday(),
      nutritionEnabled.value && fuelingDepthOpen.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  async function handleIngestAllComplete(run: {
    output?: { success?: boolean; failedCount?: number; results?: any[] }
  }) {
    await handleIngestTaskComplete()
    await performanceScoresCard.value?.refresh()

    // Require an explicit success flag — missing output must not look like a full sync.
    const failedCount = Number(run.output?.failedCount || 0)
    const fullySuccessful = run.output?.success === true && failedCount === 0

    showDashboardProgressToast(
      toast,
      {
        title: fullySuccessful ? t.value('sync_toast_title') : t.value('sync_toast_partial_title'),
        description: fullySuccessful
          ? t.value('sync_toast_description')
          : t.value('sync_toast_partial_description', {
              count: failedCount > 0 ? failedCount : 1
            }),
        color: fullySuccessful ? 'success' : 'warning',
        icon: fullySuccessful ? 'i-heroicons-check-circle' : 'i-heroicons-exclamation-triangle',
        duration: 2500
      },
      'dashboard.sync.complete'
    )
  }

  async function handleIngestTaskFailed(run: { error?: { message?: string } }) {
    integrationStore.syncingData = false
    await integrationStore.fetchStatus()
    await refreshOnboardingStatus()
    toast.add({
      title: t.value('sync_toast_failed_title') || 'Sync Failed',
      description:
        run.error?.message || t.value('sync_toast_failed_description') || 'Data sync failed',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  }

  // Listen for sync completion
  onTaskCompleted('ingest-all', handleIngestAllComplete)
  onTaskCompleted('ingest-intervals', handleIngestTaskComplete)
  onTaskCompleted('ingest-strava', handleIngestTaskComplete)

  onTaskFailed('ingest-all', handleIngestTaskFailed)
  onTaskFailed('ingest-intervals', handleIngestTaskFailed)
  onTaskFailed('ingest-strava', handleIngestTaskFailed)

  const upcomingWorkouts = ref<any[]>([])
  const upcomingWorkoutsError = ref<string | null>(null)
  const todayWorkouts = ref<CalendarActivity[]>([])
  const dayError = ref<string | null>(null)
  const loadingDay = ref(false)
  const completedToday = computed(() =>
    todayWorkouts.value
      .filter((workout) => workout.source === 'completed')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  )
  const todayLabel = computed(() => formatDateUTC(getUserLocalDate(), 'EEEE, d MMMM'))
  const loadingUpcoming = ref(false)
  const isLoading = ref(true)
  const canUseDashboardActions = computed(
    () =>
      activationComplete.value ||
      onboardingStatus.value?.hasIntegration ||
      onboardingStatus.value?.hasUsableData ||
      false
  )
  const todayNutrition = ref<any>(null)
  const nutritionSettings = ref<any>(null)
  const loadingNutrition = ref(false)
  const hasLoadedDashboardWidgets = ref(false)

  async function loadDashboardWidgets() {
    if (hasLoadedDashboardWidgets.value) {
      return
    }

    hasLoadedDashboardWidgets.value = true
    await Promise.all([
      userStore.fetchProfile(),
      refreshOnboardingStatus(),
      recommendationStore.fetchTodayRecommendation(),
      fetchUpcomingWorkouts(),
      fetchTodaySessions(),
      checkinStore.fetchToday(),
      nutritionEnabled.value && fuelingDepthOpen.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  async function fetchTodaySessions() {
    loadingDay.value = true
    dayError.value = null
    try {
      const dateStr = formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
      const [calendar, planned] = await Promise.all([
        ($fetch as any)('/api/calendar', { query: { startDate: dateStr, endDate: dateStr } }),
        ($fetch as any)('/api/workouts/planned/today')
      ])
      todayWorkouts.value = getCalendarActivities(calendar).filter(
        (workout) =>
          (workout.source === 'completed' || workout.source === 'planned') &&
          workout.type !== 'Note'
      )
      recommendationStore.todayWorkouts = Array.isArray(planned) ? planned : []
    } catch (error: any) {
      dayError.value = t.value('journey_day_load_error')
      console.error('Failed to load today sessions:', error)
    } finally {
      loadingDay.value = false
    }
  }

  async function retryToday() {
    await Promise.all([fetchTodaySessions(), checkinStore.fetchToday()])
  }

  async function fetchTodayNutrition() {
    if (!nutritionEnabled.value) {
      todayNutrition.value = null
      nutritionSettings.value = null
      loadingNutrition.value = false
      return
    }
    loadingNutrition.value = true
    try {
      const dateStr = formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
      const [nData, sData] = await Promise.all([
        ($fetch as any)(`/api/nutrition/${dateStr}`),
        ($fetch as any)('/api/profile/nutrition')
      ])
      todayNutrition.value = nData
      nutritionSettings.value = sData.settings
    } catch (error: any) {
      if (error.statusCode !== 404) {
        console.error('Failed to fetch today nutrition:', error)
      }
    } finally {
      loadingNutrition.value = false
    }
  }

  function handleFuelingToggle(event: Event) {
    fuelingDepthOpen.value = (event.target as HTMLDetailsElement).open
    if (fuelingDepthOpen.value) void fetchTodayNutrition()
  }

  function handleRecoveryToggle(event: Event) {
    recoveryDepthOpen.value = (event.target as HTMLDetailsElement).open
  }

  function handleNutritionRefresh() {
    trackWidgetClick('nutrition_fueling', 'refresh')
    return fetchTodayNutrition()
  }

  async function fetchUpcomingWorkouts() {
    loadingUpcoming.value = true
    upcomingWorkoutsError.value = null
    try {
      const { workouts } = (await ($fetch as any)('/api/workouts/planned/upcoming')) as {
        workouts: any[]
      }
      if (workouts) {
        upcomingWorkouts.value = workouts
      }
    } catch (error: any) {
      console.error('Failed to fetch upcoming workouts:', error)
      upcomingWorkoutsError.value =
        error?.statusMessage || error?.message || t.value('upcoming_workouts_error')
    } finally {
      loadingUpcoming.value = false
    }
  }

  function formatDayShort(d: string) {
    return formatDateUTC(d, 'EEE')
  }

  function formatDateDay(d: string) {
    return formatDateUTC(d, 'd')
  }

  async function handleConnectLater() {
    await deferConnection()
  }

  async function handleCompleteSetup() {
    await completeActivation('dashboard_insight')
    await Promise.all([
      recommendationStore.fetchTodayRecommendation(),
      fetchUpcomingWorkouts(),
      fetchTodaySessions(),
      checkinStore.fetchToday(),
      nutritionEnabled.value && fuelingDepthOpen.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  // Initial data fetch
  onMounted(async () => {
    try {
      await Promise.all([
        integrationStore.fetchStatus(),
        userStore.fetchProfile(),
        refreshOnboardingStatus()
      ])
      await loadDashboardWidgets()
    } finally {
      isLoading.value = false
    }
  })

  watch(canUseDashboardActions, async (enabled) => {
    if (enabled) {
      await loadDashboardWidgets()
    }
  })

  watch(
    () => onboardingStatus.value?.hasFirstInsight,
    async (ready) => {
      if (ready && onboardingStatus.value?.hasUsableData && !activationComplete.value) {
        await refreshOnboardingStatus()
      }
    }
  )

  watch(
    () =>
      recommendationStore.todayWorkouts
        .map((workout: any) => `${workout.id}:${workout.completed}`)
        .join(','),
    async (_current, previous) => {
      if (previous) {
        const dateStr = formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
        try {
          const calendar = await ($fetch as any)('/api/calendar', {
            query: { startDate: dateStr, endDate: dateStr }
          })
          todayWorkouts.value = getCalendarActivities(calendar).filter(
            (workout) =>
              (workout.source === 'completed' || workout.source === 'planned') &&
              workout.type !== 'Note'
          )
        } catch {
          dayError.value = t.value('journey_day_load_error')
        }
      }
    }
  )

  // Recommendation state
  const showRecommendationModal = ref(false)

  // Wellness modal state
  const showWellnessModal = ref(false)
  const wellnessModalDate = ref<Date | null>(null)

  // Score detail modal state
  const showScoreModal = ref(false)
  const scoreModalData = ref<{
    title: string
    score: number | null
    explanation: string | null
    analysisData?: any
    color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  }>({
    title: '',
    score: null,
    explanation: null,
    analysisData: undefined,
    color: undefined
  })

  function openRecommendationModal() {
    trackWidgetClick('training_recommendation', 'open_details')
    showRecommendationModal.value = true
  }

  // Wellness modal handlers
  function openWellnessModal() {
    trackWidgetClick('athlete_profile', 'open_wellness')
    // Use today's date or the latest wellness date
    const latestDate = userStore.profile?.latestWellnessDate
      ? new Date(userStore.profile.latestWellnessDate)
      : getUserLocalDate()

    const today = getUserLocalDate()
    wellnessModalDate.value = latestDate > today ? today : latestDate
    showWellnessModal.value = true
  }

  // Function to open score detail modal
  function openScoreModal(data: any) {
    trackWidgetClick('performance_scores', data.title || 'open_score')
    scoreModalData.value = data
    showScoreModal.value = true
  }

  // Training Load modal
  const showTrainingLoadModal = ref(false)

  function openTrainingLoadModal() {
    trackWidgetClick('performance_scores', 'open_training_load')
    showTrainingLoadModal.value = true
  }

  // Daily Check-in Modal
  const showCheckinModal = ref(false)
  function openCheckinModal() {
    trackWidgetClick('training_recommendation', 'open_checkin')
    showCheckinModal.value = true
  }

  watch(
    () => route.query.focus,
    async (focus) => {
      if (focus !== 'checkin' && focus !== 'wellness') return

      if (focus === 'checkin') {
        openCheckinModal()
      } else {
        openWellnessModal()
      }

      const nextQuery = { ...route.query }
      delete nextQuery.focus
      await navigateTo({ path: route.path, query: nextQuery }, { replace: true })
    },
    { immediate: true }
  )

  // Share Coach Watts modal
  const showShareCoachWattsModal = ref(false)
  const { openReleaseModal } = useReleaseNotes()
  const { toggle: toggleTriggerMonitor } = useTriggerMonitor()

  const dashboardOverflowItems = computed(() => {
    const items: Array<{
      label: string
      icon?: string
      to?: string
      onSelect?: () => void
    }> = [
      {
        label: t.value('share_footer_button'),
        icon: 'i-lucide-heart',
        onSelect: () => {
          showShareCoachWattsModal.value = true
        }
      },
      {
        label: t.value('navbar_tasks'),
        icon: 'i-heroicons-cpu-chip',
        onSelect: () => {
          toggleTriggerMonitor()
        }
      },
      {
        label: t.value('navbar_notifications'),
        icon: 'i-heroicons-bell',
        to: '/notifications'
      },
      {
        label: t.value('navbar_whats_new'),
        icon: 'i-heroicons-gift',
        onSelect: () => {
          void openReleaseModal()
        }
      },
      {
        label: t.value('header_upload'),
        icon: 'i-heroicons-cloud-arrow-up',
        to: '/workouts/upload'
      }
    ]

    if (canUseDashboardActions.value)
      items.push({
        label: integrationStore.syncingData ? t.value('header_sync') : t.value('header_sync_data'),
        icon: 'i-heroicons-arrow-path',
        onSelect: () => {
          if (!integrationStore.syncingData) void handleSync()
        }
      })
    return [items]
  })

  useHead({
    title: 'Today',
    meta: [
      {
        name: 'description',
        content:
          'Your training overview, recovery status, and personalized AI coaching recommendations.'
      },
      { property: 'og:title', content: 'Today | Coach Watts' },
      {
        property: 'og:description',
        content:
          'Your training overview, recovery status, and personalized AI coaching recommendations.'
      }
    ]
  })
</script>

<style scoped>
  .today-page {
    width: 100%;
    max-width: 800px;
    margin-inline: auto;
    padding: 2rem 1.25rem 4rem;
  }
  .today-page__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--ui-border);
  }
  .today-page__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .today-page__disclosure summary {
    padding: 1.25rem 0;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
  }
  .today-page__disclosure summary::marker {
    color: var(--ui-text-muted);
  }
  .today-page__disclosure summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 4px;
  }
  .today-page__upcoming {
    display: flex;
    align-items: center;
    gap: 0.875rem;
    padding: 1.125rem 0;
  }
  .today-page__upcoming:hover {
    color: var(--ui-primary);
  }
  .today-page__upcoming:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
  .today-page__footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-top: 3rem;
    color: var(--ui-text-muted);
  }
  @media (min-width: 640px) {
    .today-page {
      padding: 2.5rem 2rem 4rem;
    }
  }
</style>
