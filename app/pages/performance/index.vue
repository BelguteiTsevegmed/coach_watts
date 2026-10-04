<template>
  <UDashboardPanel id="performance">
    <template #header>
      <UDashboardNavbar :title="t('progress_title')">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
            <UButton
              icon="i-heroicons-ellipsis-horizontal"
              color="neutral"
              variant="ghost"
              size="sm"
              :aria-label="t('menu_label')"
            />
          </UDropdownMenu>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-4 pb-24 sm:space-y-6 sm:p-6">
        <div v-if="isGarminConnected" class="flex justify-end px-4 pt-3 sm:px-0 sm:pt-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted">
              {{ tc('attribution_garmin') }}
            </span>
            <img
              src="/images/logos/Garmin-Tag-black-high-res.png"
              class="h-4 w-auto dark:hidden"
              alt="Garmin"
            />
            <img
              src="/images/logos/Garmin-Tag-white-high-res.png"
              class="hidden h-4 w-auto dark:block"
              alt="Garmin"
            />
          </div>
        </div>

        <!-- 1. Headline: how is training going, in plain words -->
        <PerformanceProgressHeadline
          :loading="pmcLoading || workoutsLoading"
          :fitness="fitnessTrend"
          :sessions="sessionRate"
          :current-tsb="currentTsb"
          :window-weeks="HEADLINE_WEEKS"
        />

        <!-- 2. Goal progress -->
        <PerformanceGoalProgress
          v-if="sections.goals.visible"
          :goals="goals"
          :loading="goalsLoading"
        />

        <!-- 3. Fitness, fatigue & form -->
        <PerformancePmcCard
          v-if="sections.pmc.visible"
          v-model:period="pmcPeriod"
          :period-options="pmcPeriodOptions"
          :settings="chartSettings.pmc"
          @settings="
            openChartSettings('pmc', t('pmc_card_title'), {
              max: 150,
              step: 5,
              showOverlays: false,
              showWellnessEventsOption: true
            })
          "
        />

        <!-- 4. Training volume & consistency -->
        <PerformanceTrainingVolumeCard
          v-if="sections.volume.visible"
          :workouts="recentWorkouts"
          :loading="workoutsLoading"
          :weeks="VOLUME_WEEKS"
          :time-zone="timezone"
          :distance-unit="distanceUnit"
        />

        <!-- 5. Intensity distribution (~80/20) -->
        <PerformanceIntensityDistributionCard
          v-if="sections.distribution.visible"
          v-model:period="distributionPeriod"
          v-model:scope="distributionScope"
          :period-options="distributionPeriodOptions"
          :scope-options="workoutScopeOptions"
          :sport="scopeToSport(distributionScope)"
          :tags="scopeToTags(distributionScope)"
          :settings="chartSettings.distribution"
          @settings="
            openChartSettings('distribution', t('intensity_card_title'), {
              unit: 'h',
              max: 50,
              step: 1,
              showOverlays: false
            })
          "
        />

        <!-- 6. Personal bests -->
        <PerformanceBestsSummary
          v-if="sections.records.visible"
          :personal-bests="profileData?.personalBests || []"
          :show-power="hasPower"
        />

        <!-- 7. Power-based cards: only for athletes who train with power -->
        <template v-if="hasPower">
          <PerformancePowerCurveCard
            v-if="sections.powerCurve.visible"
            v-model:period="powerCurvePeriod"
            v-model:scope="powerCurveScope"
            :period-options="periodOptions"
            :scope-options="workoutScopeOptions"
            :sport="scopeToSport(powerCurveScope)"
            :tags="scopeToTags(powerCurveScope)"
            :settings="chartSettings.powerCurve"
            @settings="
              openChartSettings('powerCurve', t('power_curve_card_title'), {
                unit: 'W',
                max: 1500,
                step: 50,
                showOverlays: false,
                showFreshnessBandsOption: true
              })
            "
          />

          <PerformanceFtpEvolutionCard
            v-if="sections.ftp.visible"
            v-model:period="ftpPeriod"
            v-model:scope="ftpScope"
            :period-options="ftpPeriodOptions"
            :scope-options="workoutScopeOptions"
            :sport="scopeToSport(ftpScope)"
            :tags="scopeToTags(ftpScope)"
            :settings="chartSettings.ftp"
            @settings="
              openChartSettings('ftp', t('ftp_card_title'), {
                unit: 'W',
                max: 500,
                step: 10,
                showOverlays: false,
                showEstimatedFtpOption: true
              })
            "
          />

          <PerformanceEfficiencyCard
            v-if="sections.efficiency.visible"
            v-model:period="efficiencyPeriod"
            v-model:scope="efficiencyScope"
            :period-options="periodOptions"
            :scope-options="workoutScopeOptions"
            :sport="scopeToSport(efficiencyScope)"
            :tags="scopeToTags(efficiencyScope)"
            :settings="chartSettings.efficiency"
            @settings="
              openChartSettings('efficiency', t('efficiency_card_title'), {
                max: 5,
                step: 0.1,
                showOverlays: false
              })
            "
          />
        </template>

        <!-- Go deeper: link out instead of duplicating other pages -->
        <nav class="px-4 sm:px-0" :aria-label="t('more_detail_label')">
          <h2 class="mb-2 text-sm font-semibold text-highlighted">{{ t('more_detail_title') }}</h2>
          <ul class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <li v-for="link in detailLinks" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="flex items-center gap-3 rounded-lg border border-default px-3 py-2.5 transition-colors hover:bg-elevated/60"
              >
                <UIcon :name="link.icon" class="size-5 shrink-0 text-muted" />
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium text-highlighted">{{ link.label }}</span>
                  <span class="block truncate text-xs text-muted">{{ link.description }}</span>
                </span>
                <UIcon name="i-heroicons-chevron-right" class="size-4 shrink-0 text-dimmed" />
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <!-- 8. Coach scores (beta): AI ratings, collapsed by default -->
        <section v-if="showCoachScores" class="space-y-4">
          <UCard :ui="mobileListCardUi">
            <button
              type="button"
              class="flex w-full items-center justify-between gap-3 text-left"
              :aria-expanded="coachScoresOpen"
              aria-controls="coach-scores-panel"
              @click="
                () => {
                  toggleCoachScores()
                }
              "
            >
              <span class="min-w-0">
                <span class="flex items-center gap-2">
                  <span class="text-base font-semibold text-highlighted">
                    {{ t('coach_scores_title') }}
                  </span>
                  <UBadge color="neutral" variant="soft" size="sm">
                    {{ t('coach_scores_beta') }}
                  </UBadge>
                </span>
                <span class="mt-1 block text-sm text-muted">{{ t('coach_scores_summary') }}</span>
              </span>
              <UIcon
                name="i-heroicons-chevron-down"
                class="size-5 shrink-0 text-muted transition-transform duration-200"
                :class="coachScoresOpen ? 'rotate-180' : ''"
              />
            </button>
          </UCard>

          <div v-if="coachScoresMounted" v-show="coachScoresOpen" id="coach-scores-panel">
            <PerformanceCoachScores
              :profile-scores="profileData?.scores"
              :nutrition-enabled="nutritionEnabled"
              :sections="{
                athleteProfile: sections.athleteProfile.visible,
                workoutScores: sections.workoutScores.visible,
                nutritionScores: sections.nutritionScores.visible
              }"
              :chart-settings="{
                performance: chartSettings.performance,
                nutrition: chartSettings.nutrition
              }"
              :scope-options="workoutScopeOptions"
              :period-options="periodOptions"
              @settings="(key, title, options) => openChartSettings(key, title, options)"
            />
          </div>
        </section>

        <PerformanceSettingsModal
          v-model:open="isPerformanceSettingsModalOpen"
          :show-power-sections="hasPower"
          :show-nutrition="nutritionEnabled"
        />

        <ChartSettingsModal
          v-if="activeMetricSettings"
          :metric-key="activeMetricSettings.key"
          :title="activeMetricSettings.title"
          :group-key="'performanceCharts'"
          :unit="activeMetricSettings.unit"
          :max="activeMetricSettings.max"
          :step="activeMetricSettings.step"
          :show-overlays="activeMetricSettings.showOverlays"
          :show-freshness-bands-option="activeMetricSettings.showFreshnessBandsOption"
          :show-estimated-ftp-option="activeMetricSettings.showEstimatedFtpOption"
          :show-wellness-events-option="activeMetricSettings.showWellnessEventsOption"
          :default-type="activeMetricSettings.defaultType"
          :open="!!activeMetricSettings"
          @update:open="activeMetricSettings = null"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import ChartSettingsModal from '~/components/charts/ChartSettingsModal.vue'
  import PerformanceBestsSummary from '~/components/performance/PerformanceBestsSummary.vue'
  import PerformanceCoachScores from '~/components/performance/PerformanceCoachScores.vue'
  import PerformanceEfficiencyCard from '~/components/performance/PerformanceEfficiencyCard.vue'
  import PerformanceFtpEvolutionCard from '~/components/performance/PerformanceFtpEvolutionCard.vue'
  import PerformanceGoalProgress from '~/components/performance/PerformanceGoalProgress.vue'
  import PerformanceIntensityDistributionCard from '~/components/performance/PerformanceIntensityDistributionCard.vue'
  import PerformancePmcCard from '~/components/performance/PerformancePmcCard.vue'
  import PerformancePowerCurveCard from '~/components/performance/PerformancePowerCurveCard.vue'
  import PerformanceProgressHeadline from '~/components/performance/PerformanceProgressHeadline.vue'
  import PerformanceSettingsModal from '~/components/performance/PerformanceSettingsModal.vue'
  import PerformanceTrainingVolumeCard from '~/components/performance/PerformanceTrainingVolumeCard.vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'
  import { addDaysToKey } from '~/utils/date-keys'
  import {
    computeFitnessTrend,
    hasPowerData,
    mondayOfKey,
    resolveSectionVisibility,
    sessionsPerWeek,
    type ProgressGoal,
    type ProgressWorkout
  } from '~/utils/progress-summary'

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  /** The headline compares the last 6 weeks; volume shows the last 12. */
  const HEADLINE_WEEKS = 6
  const VOLUME_WEEKS = 12

  const { t } = useTranslate('performance')
  const { t: tc } = useTranslate('common')

  const userStore = useUserStore()
  const integrationStore = useIntegrationStore()
  const { timezone, getUserLocalDate } = useFormat()

  useHead({
    title: () => t.value('progress_title'),
    meta: [
      {
        name: 'description',
        content: () => t.value('progress_meta_description')
      }
    ]
  })

  const isGarminConnected = computed(
    () =>
      integrationStore.integrationStatus?.integrations?.some((i: any) => i.provider === 'garmin') ??
      false
  )

  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  const distanceUnit = computed<'km' | 'mi'>(() =>
    userStore.profile?.distanceUnits === 'Miles' ? 'mi' : 'km'
  )

  // ---------------------------------------------------------------------------
  // Section visibility & chart settings (both user-customisable)
  // ---------------------------------------------------------------------------

  const sections = computed(() =>
    resolveSectionVisibility(userStore.user?.dashboardSettings?.performanceSections)
  )

  const defaultChartSettings: Record<string, Record<string, unknown>> = {
    pmc: {
      smooth: true,
      yScale: 'dynamic',
      yMin: 0,
      showWellnessEvents: true,
      showDailyCheckins: true
    },
    powerCurve: { smooth: true, showFreshnessBands: true, yScale: 'dynamic', yMin: 0 },
    efficiency: { smooth: true, showPoints: true, yScale: 'dynamic', yMin: 0 },
    ftp: {
      type: 'line',
      smooth: false,
      showPoints: true,
      showEstimatedFtp: true,
      yScale: 'dynamic',
      yMin: 0
    },
    distribution: { type: 'bar', yScale: 'dynamic', yMin: 0 },
    performance: { smooth: true, showPoints: false, yScale: 'dynamic', yMin: 0 },
    nutrition: { smooth: true, showPoints: false, yScale: 'dynamic', yMin: 0 }
  }

  const chartSettings = computed(() => {
    const userSettings = userStore.user?.dashboardSettings?.performanceCharts || {}
    const merged: Record<string, any> = {}
    for (const key in defaultChartSettings) {
      merged[key] = { ...defaultChartSettings[key], ...(userSettings[key] || {}) }
    }
    return merged
  })

  const activeMetricSettings = ref<{
    key: string
    title: string
    unit?: string
    max?: number
    step?: number
    showOverlays?: boolean
    showFreshnessBandsOption?: boolean
    showEstimatedFtpOption?: boolean
    showWellnessEventsOption?: boolean
    defaultType?: 'line' | 'bar'
  } | null>(null)

  function openChartSettings(key: string, title: string, options: Record<string, unknown> = {}) {
    activeMetricSettings.value = { key, title, ...options }
  }

  const isPerformanceSettingsModalOpen = ref(false)

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  interface AthleteProfile {
    personalBests?: Array<{
      id?: string
      type: string
      category: string
      value: number
      unit: string
      date: string
    }>
    scores?: Record<string, any> & { lastUpdated?: string }
  }

  const trainingLoadDisplayMode = computed(
    () => userStore.user?.dashboardSettings?.trainingLoad?.displayMode || 'adjusted'
  )

  // Enough history for 12 Monday–Sunday weeks (+1 day of time-zone slack).
  const todayKey = getUserLocalDate().toISOString().slice(0, 10)
  const workoutsStartDate = `${addDaysToKey(mondayOfKey(todayKey), -7 * (VOLUME_WEEKS - 1) - 1)}T00:00:00.000Z`

  // These requests are independent; start them together instead of creating a waterfall.
  const [sportsResult, tagsResult, profileResult, pmcResult, goalsResult, workoutsResult] =
    await Promise.all([
      useAsyncData<string[]>('workouts-sports', () => ($fetch as any)('/api/workouts/sports')),
      useAsyncData<Array<{ value: string; count: number }>>('workouts-tags', () =>
        ($fetch as any)('/api/workouts/tags')
      ),
      useAsyncData<AthleteProfile>('athlete-profile', () =>
        ($fetch as any)('/api/scores/athlete-profile')
      ),
      useAsyncData<any>(
        'progress-pmc-summary',
        () =>
          ($fetch as any)('/api/performance/pmc', {
            query: {
              days: String(HEADLINE_WEEKS * 7),
              displayMode: trainingLoadDisplayMode.value
            }
          }),
        { watch: [trainingLoadDisplayMode] }
      ),
      useAsyncData<{ goals?: ProgressGoal[] }>('progress-goals', () =>
        ($fetch as any)('/api/goals')
      ),
      useAsyncData<ProgressWorkout[]>('progress-recent-workouts', () =>
        ($fetch as any)('/api/workouts', {
          query: { startDate: workoutsStartDate, limit: 500 }
        })
      )
    ])

  const { data: sportsData } = sportsResult
  const { data: workoutTagsData } = tagsResult
  const { data: profileData } = profileResult
  const { data: pmcData, pending: pmcLoading } = pmcResult
  const { data: goalsData, pending: goalsLoading } = goalsResult
  const { data: workoutsData, pending: workoutsLoading } = workoutsResult

  const goals = computed(() => goalsData.value?.goals || [])
  const recentWorkouts = computed(() => workoutsData.value || [])

  const fitnessTrend = computed(() =>
    pmcData.value?.data
      ? computeFitnessTrend(pmcData.value.data, { currentCtl: pmcData.value.summary?.currentCTL })
      : null
  )
  const currentTsb = computed<number | null>(() => {
    const tsb = pmcData.value?.summary?.currentTSB
    return typeof tsb === 'number' ? tsb : null
  })
  const sessionRate = computed(() =>
    workoutsData.value
      ? sessionsPerWeek(recentWorkouts.value, {
          days: HEADLINE_WEEKS * 7,
          timeZone: timezone.value
        })
      : null
  )

  // FTP, W/kg and power charts are hidden unless the athlete has power data.
  const hasPower = computed(() =>
    hasPowerData(recentWorkouts.value, profileData.value?.personalBests || [])
  )

  // ---------------------------------------------------------------------------
  // Scope & period selectors
  // ---------------------------------------------------------------------------

  const scopeToSport = (scope: string) =>
    scope === 'all' || scope.startsWith('tag:') ? 'all' : scope
  const scopeToTags = (scope: string) => (scope.startsWith('tag:') ? [scope.slice(4)] : [])

  const workoutScopeOptions = computed(() => {
    const groups: Array<Array<{ label: string; value?: string; type?: 'label' }>> = [
      [
        { label: t.value('scope_group_sports'), type: 'label' },
        { label: t.value('highlights_all_sports'), value: 'all' },
        ...(sportsData.value || []).map((sport) => ({ label: sport, value: sport }))
      ]
    ]
    const tags = workoutTagsData.value || []
    if (tags.length > 0) {
      groups.push([
        { label: t.value('scope_group_tags'), type: 'label' },
        ...tags.map((tag) => ({ label: `${tag.value} (${tag.count})`, value: `tag:${tag.value}` }))
      ])
    }
    return groups
  })

  const periodOptions = computed(() => [
    { label: t.value('period_7_days'), value: 7 },
    { label: t.value('period_14_days'), value: 14 },
    { label: t.value('period_30_days'), value: 30 },
    { label: t.value('period_90_days'), value: 90 },
    { label: t.value('period_ytd'), value: 'YTD' },
    { label: t.value('period_all_time'), value: 3650 }
  ])

  const pmcPeriod = ref<number | string>(90)
  const pmcPeriodOptions = computed(() => [
    { label: t.value('period_30_days'), value: 30 },
    { label: t.value('period_60_days'), value: 60 },
    { label: t.value('period_90_days'), value: 90 },
    { label: t.value('period_180_days'), value: 180 },
    { label: t.value('period_ytd'), value: 'YTD' },
    { label: t.value('period_all_time'), value: 3650 }
  ])

  const distributionPeriod = ref<number | string>(12)
  const distributionScope = ref<string>('all')
  const distributionPeriodOptions = computed(() => [
    { label: t.value('period_4_weeks'), value: 4 },
    { label: t.value('period_8_weeks'), value: 8 },
    { label: t.value('period_12_weeks'), value: 12 },
    { label: t.value('period_24_weeks'), value: 24 },
    { label: t.value('period_ytd'), value: 'YTD' },
    { label: t.value('period_all_time'), value: 3650 }
  ])

  const powerCurvePeriod = ref<number | string>(90)
  const powerCurveScope = ref<string>('all')
  const efficiencyPeriod = ref<number | string>(90)
  const efficiencyScope = ref<string>('all')
  const ftpPeriod = ref<number | string>(12)
  const ftpScope = ref<string>('all')
  const ftpPeriodOptions = computed(() => [
    { label: t.value('period_3_months'), value: 3 },
    { label: t.value('period_6_months'), value: 6 },
    { label: t.value('period_12_months'), value: 12 },
    { label: t.value('period_24_months'), value: 24 },
    { label: t.value('period_ytd'), value: 'YTD' },
    { label: t.value('period_all_time'), value: 3650 }
  ])

  // ---------------------------------------------------------------------------
  // Coach scores (collapsed; mounted on first open so its data loads lazily)
  // ---------------------------------------------------------------------------

  const showCoachScores = computed(
    () =>
      sections.value.athleteProfile.visible ||
      sections.value.workoutScores.visible ||
      (nutritionEnabled.value && sections.value.nutritionScores.visible)
  )
  const coachScoresOpen = ref(false)
  const coachScoresMounted = ref(false)

  function toggleCoachScores() {
    coachScoresOpen.value = !coachScoresOpen.value
    if (coachScoresOpen.value) coachScoresMounted.value = true
  }

  // ---------------------------------------------------------------------------
  // Header overflow menu & outbound links
  // ---------------------------------------------------------------------------

  const menuItems = computed(() => [
    [
      { label: t.value('menu_goals'), icon: 'i-heroicons-flag', to: '/profile/goals' },
      { label: t.value('link_recovery_details'), icon: 'i-heroicons-heart', to: '/fitness' },
      { label: t.value('menu_reports'), icon: 'i-heroicons-document-text', to: '/reports' },
      {
        label: t.value('menu_all_bests'),
        icon: 'i-heroicons-trophy',
        to: '/performance/bests'
      }
    ],
    [
      {
        label: t.value('menu_customize'),
        icon: 'i-heroicons-adjustments-horizontal',
        onSelect: () => {
          isPerformanceSettingsModalOpen.value = true
        }
      }
    ]
  ])

  const detailLinks = computed(() => [
    {
      to: '/fitness',
      icon: 'i-heroicons-heart',
      label: t.value('link_recovery_details'),
      description: t.value('link_recovery_details_description')
    },
    {
      to: '/reports',
      icon: 'i-heroicons-document-text',
      label: t.value('menu_reports'),
      description: t.value('link_reports_description')
    },
    {
      to: '/workouts',
      icon: 'i-heroicons-list-bullet',
      label: t.value('link_workouts'),
      description: t.value('link_workouts_description')
    }
  ])
</script>
