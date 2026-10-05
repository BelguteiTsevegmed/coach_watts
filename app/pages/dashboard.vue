<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <UDashboardNavbar :title="t('today_title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #title>
          <span class="truncate">{{ t('today_title') }}</span>
          <span v-if="headerDate" class="truncate text-sm font-normal text-muted">
            {{ headerDate }}
          </span>
          <UButton
            v-if="showTrialChip"
            to="/settings/billing"
            color="primary"
            variant="soft"
            size="xs"
            class="ms-1 hidden rounded-full font-medium sm:inline-flex"
            data-testid="today-trial-chip"
          >
            {{ trialChipLabel }}
          </UButton>
        </template>
        <template #right>
          <LayoutPageNavbarActions :overflow-items="mobileOverflowItems">
            <ClientOnly>
              <UChip :show="unreadCount > 0" color="error" size="md" inset>
                <UButton
                  to="/notifications"
                  icon="i-heroicons-bell"
                  color="neutral"
                  variant="ghost"
                  size="md"
                  :aria-label="t('today_menu_notifications')"
                />
              </UChip>
            </ClientOnly>
            <UButton
              v-if="canUseDashboardActions"
              :loading="integrationStore.syncingData"
              :disabled="integrationStore.syncingData"
              color="neutral"
              variant="outline"
              icon="i-heroicons-arrow-path"
              size="md"
              :aria-label="t('header_sync_data')"
              @click="
                () => {
                  void handleSync()
                }
              "
            >
              {{ t('header_sync') }}
            </UButton>
            <UButton
              to="/chat"
              icon="i-heroicons-chat-bubble-left-right"
              color="primary"
              variant="solid"
              size="md"
              class="font-semibold"
              data-testid="today-ask-coach"
            >
              {{ t('today_ask_coach') }}
            </UButton>
            <UDropdownMenu :items="desktopOverflowItems" :content="{ align: 'end' }">
              <UButton
                icon="i-heroicons-ellipsis-horizontal"
                color="neutral"
                variant="ghost"
                size="md"
                :aria-label="t('today_more_actions')"
              />
            </UDropdownMenu>

            <template #mobile>
              <LayoutNavbarIconButton
                v-if="canUseDashboardActions"
                icon="i-heroicons-arrow-path"
                :label="t('header_sync_data')"
                :loading="integrationStore.syncingData"
                :disabled="integrationStore.syncingData"
                @click="
                  () => {
                    void handleSync()
                  }
                "
              />
              <LayoutNavbarIconButton
                to="/chat"
                icon="i-heroicons-chat-bubble-left-right"
                :label="t('today_ask_coach')"
                color="primary"
                variant="solid"
              />
            </template>
          </LayoutPageNavbarActions>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="quick-capture-inset">
        <ClientOnly>
          <!-- Loading State -->
          <div
            v-if="isLoading || onboardingStatusLoading"
            class="flex justify-center items-center py-24 min-h-[60vh]"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 animate-spin text-primary-500" />
          </div>

          <!-- Onboarding View (New User) -->
          <div
            v-else-if="showFullSetupHub && onboardingStatus"
            class="p-4 sm:p-6 max-w-6xl mx-auto"
          >
            <DashboardOnboardingView
              :status="onboardingStatus"
              @sync="handleSync"
              @connect-later="handleConnectLater"
            />
          </div>

          <!-- Today -->
          <div
            v-else
            class="mx-auto w-full max-w-6xl space-y-4 pt-4 pb-6 sm:space-y-6 sm:p-6"
            data-testid="today-page"
          >
            <!-- One notice at a time: setup > missing profile data > trial ending -->
            <DashboardTodayNotice
              :setup-status="onboardingStatus"
              :show-setup="showCompactSetupCard"
              :missing-fields="relevantMissingFields"
              :trial-ending-soon="userStore.isTrialActive && isTrialEndingSoon"
              :trial-ends-at="userStore.user?.trialEndsAt ?? null"
              :trial-ends-at-label="trialEndsAtLabel"
              @sync="handleSync"
              @complete-setup="handleCompleteSetup"
            />

            <!--
              Mobile: one column in reading order (session, readiness, body,
              week, goal, recent). Desktop: the session and plan on the left,
              goal, body status and history on the right.
            -->
            <div class="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
              <div class="contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
                <div class="order-1 lg:order-none">
                  <DashboardTodaySessionCard
                    :has-plan="hasPlan"
                    @open-details="openRecommendationModal"
                    @open-checkin="openCheckinModal"
                  />
                </div>
                <div class="order-2 lg:order-none">
                  <DashboardReadinessStrip
                    :form-summary="formSummary"
                    :loading="loadingForm"
                    :today-key="todayKey"
                    @open-wellness="openWellnessModal"
                    @open-training-load="openTrainingLoadModal"
                  />
                </div>
                <div class="order-4 lg:order-none">
                  <DashboardThisWeekCard
                    :activities="weekActivities"
                    :upcoming="upcomingWorkouts"
                    :today-key="todayKey"
                    :timezone="timezone"
                    :loading="loadingWeek"
                    :upcoming-loading="loadingUpcoming"
                    :error="weekError"
                    @retry="
                      () => {
                        void fetchWeek()
                      }
                    "
                  />
                </div>
                <div class="order-5 empty:hidden lg:order-none">
                  <DashboardSystemMessageCard />
                </div>
              </div>

              <div class="contents lg:flex lg:flex-col lg:gap-6">
                <div class="order-6 empty:hidden lg:order-none">
                  <DashboardGoalCountdownCard :today-key="todayKey" />
                </div>
                <div class="order-3 lg:order-none">
                  <DashboardBodyStatusCard :today-key="todayKey" />
                </div>
                <div class="order-7 empty:hidden lg:order-none">
                  <DashboardRecentActivityCard compact :limit="5">
                    <template v-if="isGarminConnected" #footer>
                      <div
                        class="flex items-center justify-end gap-1.5"
                        data-testid="garmin-attribution"
                      >
                        <span class="text-[10px] font-medium uppercase tracking-wider text-muted">
                          {{ t('attribution_garmin') }}
                        </span>
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
                    </template>
                  </DashboardRecentActivityCard>
                </div>
              </div>
            </div>

            <!-- Fueling (only when nutrition tracking is on) -->
            <DashboardNutritionFuelingCard
              v-if="nutritionEnabled"
              :nutrition="todayNutrition"
              :workouts="todayWorkouts"
              :settings="nutritionSettings"
              :weight="userStore.currentWeightKg || 75"
              :loading="loadingNutrition"
              @refresh="handleNutritionRefresh"
            />

            <!-- App Info Footer -->
            <div class="flex justify-center pt-4 pb-8 sm:pb-2">
              <UButton
                to="/settings/changelog"
                variant="link"
                color="neutral"
                size="xs"
                :padded="false"
                class="text-gray-400 dark:text-gray-500 font-normal hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
              >
                {{ buildVersionDisplay }}
              </UButton>
            </div>
          </div>
        </ClientOnly>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Wellness Modal (readiness tiles, ?focus=wellness) -->
  <WellnessModal v-model:open="showWellnessModal" :date="wellnessModalDate" />

  <!-- Recommendation Modal (session card "Read more") -->
  <DashboardRecommendationDetailModal
    v-model:open="showRecommendationModal"
    :recommendation="recommendationStore.todayRecommendation"
  />

  <!-- Training Load Modal (form tile) -->
  <TrainingLoadModal v-model:open="showTrainingLoadModal" />

  <!-- Daily Check-in Modal -->
  <DashboardDailyCheckinModal v-model:open="showCheckinModal" />

  <!-- Share Coach Watts Modal (overflow menu) -->
  <DashboardShareCoachWattsModal v-model:open="showShareCoachWattsModal" />

  <!-- Release notes modal (overflow menu "What's new") -->
  <DashboardReleaseNotification ref="releaseNotification" hide-trigger />

  <DashboardTrialEndedModal />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { DropdownMenuItem } from '@nuxt/ui'
  import type { CalendarActivity } from '~/types/calendar'
  import { getCalendarActivities, getCalendarActivityDateKey } from '~/utils/calendar'
  import { showDashboardProgressToast } from '~/utils/dashboard-progress-toast'
  import { getWeekDateKeys } from '~/utils/today-plan'
  import DashboardTrialEndedModal from '~/components/dashboard/TrialEndedModal.vue'

  const { t } = useTranslate('dashboard')
  const { trackWidgetClick } = useAnalytics()

  const format = useFormat()
  const { formatDate, formatDateUTC, getUserLocalDate } = format
  const timezone = computed(() => format.timezone?.value || 'UTC')

  definePageMeta({
    middleware: 'auth'
  })

  useHead({
    title: 'Today',
    meta: [
      {
        name: 'description',
        content:
          "Today's session and why, how recovered you are, and what's coming up this week — from your AI coach."
      },
      { property: 'og:title', content: 'Today | Coach Watts' },
      {
        property: 'og:description',
        content:
          "Today's session and why, how recovered you are, and what's coming up this week — from your AI coach."
      }
    ]
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
    isLoading: onboardingStatusLoading,
    activationComplete,
    showFullSetupHub,
    showCompactSetupCard,
    refresh: refreshOnboardingStatus,
    deferConnection,
    completeActivation
  } = useOnboardingStatus()
  const userStore = useUserStore()
  const { missingFields } = storeToRefs(userStore)
  const notificationStore = useNotificationStore()
  const { unreadCount } = storeToRefs(notificationStore)

  const recommendationStore = useRecommendationStore()
  const activityStore = useActivityStore()
  const checkinStore = useCheckinStore()

  /** The athlete's local calendar day, as `yyyy-MM-dd`. */
  const todayKey = computed(() => formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd'))
  const headerDate = computed(() => formatDateUTC(getUserLocalDate(), 'EEE d MMM'))

  const isGarminConnected = computed(() => {
    return (
      integrationStore.integrationStatus?.integrations?.some((i: any) => i.provider === 'garmin') ??
      false
    )
  })

  // --- Trial -----------------------------------------------------------------
  const isTrialEndingSoon = computed(() => {
    const daysRemaining = userStore.trialDaysRemaining || 0
    return daysRemaining > 0 && daysRemaining <= 2
  })
  const trialEndsAtLabel = computed(() => {
    if (!userStore.user?.trialEndsAt) return ''
    return formatDate(userStore.user.trialEndsAt)
  })
  const showTrialChip = computed(() => userStore.isTrialActive && !isTrialEndingSoon.value)
  const trialChipLabel = computed(() =>
    t.value('today_trial_chip', { count: userStore.trialDaysRemaining || 0 })
  )

  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  async function handleSync() {
    trackWidgetClick('today_header', 'sync')
    await integrationStore.syncAllData()
    refreshRuns()
  }

  async function handleIngestTaskComplete() {
    integrationStore.syncingData = false
    await integrationStore.fetchStatus()
    await refreshOnboardingStatus()
    await Promise.all([
      userStore.fetchProfile(true),
      recommendationStore.fetchTodayRecommendation(),
      recommendationStore.fetchTodayWorkout(),
      activityStore.fetchRecentActivity(),
      fetchUpcomingWorkouts(),
      fetchWeek(),
      fetchFormSummary(),
      checkinStore.fetchToday(),
      nutritionEnabled.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  async function handleIngestAllComplete(run: {
    output?: { success?: boolean; failedCount?: number; results?: any[] }
  }) {
    await handleIngestTaskComplete()

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

  const isLoading = ref(true)
  const canUseDashboardActions = computed(
    () =>
      activationComplete.value ||
      onboardingStatus.value?.hasIntegration ||
      onboardingStatus.value?.hasUsableData ||
      false
  )
  const hasLoadedDashboardWidgets = ref(false)

  async function loadDashboardWidgets() {
    if (!canUseDashboardActions.value || hasLoadedDashboardWidgets.value) {
      return
    }

    hasLoadedDashboardWidgets.value = true
    await Promise.all([
      userStore.fetchProfile(),
      refreshOnboardingStatus(),
      recommendationStore.fetchTodayRecommendation(),
      activityStore.fetchRecentActivity(),
      fetchUpcomingWorkouts(),
      fetchWeek(),
      fetchFormSummary(),
      checkinStore.fetchToday(),
      nutritionEnabled.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  // --- This week ---------------------------------------------------------------
  const weekActivities = ref<CalendarActivity[]>([])
  const loadingWeek = ref(false)
  const weekError = ref(false)

  async function fetchWeek() {
    const keys = getWeekDateKeys(todayKey.value)
    loadingWeek.value = true
    weekError.value = false
    try {
      const data = await ($fetch as any)('/api/calendar', {
        query: { startDate: keys[0], endDate: keys[keys.length - 1] }
      })
      weekActivities.value = getCalendarActivities(data)
    } catch (error) {
      console.error('Failed to fetch this week:', error)
      weekError.value = true
    } finally {
      loadingWeek.value = false
    }
  }

  // Training items for today (feeds the fueling card)
  const todayWorkouts = computed(() =>
    weekActivities.value.filter(
      (a) =>
        (a.source === 'completed' || a.source === 'planned') &&
        a.type !== 'Rest' &&
        a.type !== 'Note' &&
        getCalendarActivityDateKey(a, timezone.value) === todayKey.value
    )
  )

  const upcomingWorkouts = ref<any[]>([])
  const loadingUpcoming = ref(false)

  async function fetchUpcomingWorkouts() {
    loadingUpcoming.value = true
    try {
      const { workouts } = (await ($fetch as any)('/api/workouts/planned/upcoming')) as {
        workouts: any[]
      }
      upcomingWorkouts.value = workouts || []
    } catch (error: any) {
      console.error('Failed to fetch upcoming workouts:', error)
    } finally {
      loadingUpcoming.value = false
    }
  }

  const hasPlan = computed(
    () =>
      !!onboardingStatus.value?.hasActivePlan ||
      upcomingWorkouts.value.length > 0 ||
      weekActivities.value.some((a) => a.source === 'planned')
  )

  // --- Readiness ---------------------------------------------------------------
  const formSummary = ref<{ currentTSB?: number | null; currentCTL?: number | null } | null>(null)
  const loadingForm = ref(false)

  async function fetchFormSummary() {
    loadingForm.value = true
    try {
      const data = await ($fetch as any)('/api/performance/pmc', { query: { days: 7 } })
      formSummary.value = data?.summary ?? null
    } catch {
      formSummary.value = null
    } finally {
      loadingForm.value = false
    }
  }

  /**
   * FTP only matters to athletes who train with power. Don't nag a runner
   * (or anyone without power data) to enter it.
   */
  const POWER_SPORTS = new Set([
    'Ride',
    'VirtualRide',
    'GravelRide',
    'MountainBikeRide',
    'TrackRide',
    'EBikeRide'
  ])
  const athleteUsesPower = computed(() => {
    const recent: any[] = activityStore.recentActivity?.items || []
    if (
      recent.some(
        (item) =>
          item.type === 'workout' &&
          (POWER_SPORTS.has(item.activityType) ||
            item.details?.some((d: any) => d.label === 'Avg Power'))
      )
    ) {
      return true
    }
    return weekActivities.value.some(
      (a) => (a.averageWatts ?? 0) > 0 || POWER_SPORTS.has(a.type || '')
    )
  })
  const relevantMissingFields = computed(() =>
    missingFields.value.filter(
      (field) => athleteUsesPower.value || field !== 'Functional Threshold Power (FTP)'
    )
  )

  // --- Nutrition -----------------------------------------------------------------
  const todayNutrition = ref<any>(null)
  const nutritionSettings = ref<any>(null)
  const loadingNutrition = ref(false)

  async function fetchTodayNutrition() {
    if (!nutritionEnabled.value) {
      todayNutrition.value = null
      nutritionSettings.value = null
      loadingNutrition.value = false
      return
    }
    loadingNutrition.value = true
    try {
      const [nData, sData] = await Promise.all([
        ($fetch as any)(`/api/nutrition/${todayKey.value}`),
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

  function handleNutritionRefresh() {
    trackWidgetClick('nutrition_fueling', 'refresh')
    return Promise.all([fetchTodayNutrition(), fetchWeek()])
  }

  async function handleConnectLater() {
    await deferConnection()
  }

  async function handleCompleteSetup() {
    await completeActivation('dashboard_insight')
    await Promise.all([
      recommendationStore.fetchTodayRecommendation(),
      activityStore.fetchRecentActivity(),
      fetchUpcomingWorkouts(),
      fetchWeek(),
      checkinStore.fetchToday(),
      nutritionEnabled.value ? fetchTodayNutrition() : Promise.resolve()
    ])
  }

  // Initial data fetch
  onMounted(async () => {
    void notificationStore.fetchNotifications()
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

  // --- Modals ------------------------------------------------------------------
  const showRecommendationModal = ref(false)
  const showWellnessModal = ref(false)
  const wellnessModalDate = ref<Date | null>(null)
  const showTrainingLoadModal = ref(false)
  const showCheckinModal = ref(false)
  const showShareCoachWattsModal = ref(false)

  function openRecommendationModal() {
    trackWidgetClick('training_recommendation', 'open_details')
    showRecommendationModal.value = true
  }

  function openWellnessModal() {
    trackWidgetClick('today_readiness', 'open_wellness')
    // Use today's date or the latest wellness date
    const latestDate = userStore.profile?.latestWellnessDate
      ? new Date(userStore.profile.latestWellnessDate)
      : getUserLocalDate()

    const today = getUserLocalDate()
    wellnessModalDate.value = latestDate > today ? today : latestDate
    showWellnessModal.value = true
  }

  function openTrainingLoadModal() {
    trackWidgetClick('today_readiness', 'open_training_load')
    showTrainingLoadModal.value = true
  }

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

  // --- Header overflow menu ------------------------------------------------------
  const releaseNotification = ref<{ hasNewRelease: boolean; open: () => void } | null>(null)
  const { toggle: toggleTriggerMonitor } = useTriggerMonitor()

  function openWhatsNew() {
    if (releaseNotification.value?.hasNewRelease) {
      releaseNotification.value.open()
      return
    }
    void navigateTo('/settings/changelog')
  }

  function buildOverflowItems(options: { mobile: boolean }): DropdownMenuItem[][] {
    const hasNewRelease = !!releaseNotification.value?.hasNewRelease
    const primary: DropdownMenuItem[] = [
      {
        label: t.value('today_menu_upload'),
        icon: 'i-heroicons-cloud-arrow-up',
        to: '/workouts/upload'
      },
      {
        label: t.value('today_menu_whats_new'),
        icon: 'i-heroicons-gift',
        description: hasNewRelease ? t.value('today_menu_whats_new_badge') : undefined,
        color: hasNewRelease ? 'primary' : undefined,
        onSelect: openWhatsNew
      },
      {
        label: t.value('today_menu_tasks'),
        icon: 'i-heroicons-cpu-chip',
        onSelect: () => {
          toggleTriggerMonitor()
        }
      }
    ]

    if (options.mobile) {
      primary.push({
        label: t.value('today_menu_notifications'),
        icon: 'i-heroicons-bell',
        description:
          unreadCount.value > 0
            ? t.value('today_menu_notifications_unread', { count: unreadCount.value })
            : undefined,
        to: '/notifications'
      })
    }

    const secondary: DropdownMenuItem[] = [
      {
        label: t.value('share_footer_button'),
        icon: 'i-lucide-heart',
        onSelect: () => {
          showShareCoachWattsModal.value = true
        }
      }
    ]

    if (options.mobile && showTrialChip.value) {
      secondary.push({
        label: trialChipLabel.value,
        icon: 'i-heroicons-sparkles',
        to: '/settings/billing'
      })
    }

    return [primary, secondary]
  }

  const desktopOverflowItems = computed(() => buildOverflowItems({ mobile: false }))
  const mobileOverflowItems = computed(() => buildOverflowItems({ mobile: true }))
</script>
