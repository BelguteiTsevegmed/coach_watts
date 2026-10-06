<template>
  <UDashboardPanel id="performance">
    <template #body>
      <div class="mx-auto w-full max-w-[52rem] space-y-10 px-5 py-8 sm:px-10 sm:py-12 pb-24">
        <PerformanceSettingsModal v-model:open="isPerformanceSettingsModalOpen" />
        <div class="flex flex-wrap items-start justify-between gap-6">
          <div class="max-w-xl">
            <h1
              class="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl"
            >
              {{ t('page_title') }}
            </h1>
            <p class="mt-3 text-base leading-7 text-gray-600 dark:text-gray-400">
              {{ t('journey_intro') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <ClientOnly><DashboardTriggerMonitorButton /></ClientOnly>
            <UButton
              icon="i-heroicons-adjustments-horizontal"
              color="neutral"
              variant="ghost"
              @click="
                () => {
                  isPerformanceSettingsModalOpen = true
                }
              "
              >{{ t('nav_customize') }}</UButton
            >
          </div>
          <div v-if="isGarminConnected" class="flex items-center gap-2 text-xs text-gray-500">
            <span>{{ tc('attribution_garmin') }}</span>
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

        <section :aria-label="t('overview_label')" class="space-y-6">
          <div class="flex flex-wrap gap-4">
            <div class="space-y-2">
              <label for="progress-period" class="block text-sm text-gray-600 dark:text-gray-400">{{
                t('filter_period')
              }}</label>
              <USelect
                id="progress-period"
                v-model="selectedPeriod"
                :items="periodOptions"
                class="w-40"
                color="neutral"
                variant="outline"
              />
            </div>
            <div class="space-y-2">
              <label for="progress-scope" class="block text-sm text-gray-600 dark:text-gray-400">{{
                t('filter_activity')
              }}</label>
              <USelectMenu
                id="progress-scope"
                v-model="workoutScope"
                :aria-label="t('filter_activity')"
                :items="workoutScopeOptions"
                value-key="value"
                label-key="label"
                class="w-52"
                color="neutral"
                variant="outline"
              />
            </div>
          </div>
          <div
            v-if="workoutLoading"
            role="status"
            aria-live="polite"
            class="py-6 text-gray-600 dark:text-gray-400"
          >
            {{ t('overview_loading') }}
          </div>
          <div v-else-if="workoutError" role="alert" class="space-y-3 py-6">
            <h2 id="progress-overview-title" class="text-xl font-medium">
              {{ t('overview_error') }}
            </h2>
            <p class="text-gray-600 dark:text-gray-400">{{ t('overview_error_help') }}</p>
            <UButton color="neutral" variant="outline" @click="refreshWorkouts()">{{
              t('retry')
            }}</UButton>
          </div>
          <div
            v-else-if="trainingSessionCount > 0"
            class="space-y-3 py-3"
            data-testid="progress-overview"
          >
            <h2
              id="progress-overview-title"
              class="text-2xl font-medium tracking-tight text-gray-900 dark:text-white sm:text-3xl"
            >
              {{ t('overview_sessions', { count: trainingSessionCount }) }}
            </h2>
            <p class="max-w-2xl leading-7 text-gray-600 dark:text-gray-400">
              {{
                hasScore(workoutData?.summary?.avgOverall)
                  ? t('overview_execution', { score: formatScore(workoutData.summary.avgOverall) })
                  : t('overview_unreviewed')
              }}
            </p>
            <p
              v-if="
                sectionSettings.athleteProfile?.visible !== false &&
                hasScore(profileData?.scores?.trainingConsistency)
              "
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              {{
                t('overview_consistency', {
                  score: formatScore(profileData.scores.trainingConsistency)
                })
              }}
            </p>
          </div>
          <div v-else class="space-y-3 py-3" data-testid="progress-empty">
            <h2 id="progress-overview-title" class="text-2xl font-medium tracking-tight">
              {{ t('overview_empty') }}
            </h2>
            <p class="max-w-xl leading-7 text-gray-600 dark:text-gray-400">
              {{ t('overview_empty_help') }}
            </p>
            <UButton to="/workouts" color="primary" variant="solid">{{
              t('view_training')
            }}</UButton>
          </div>
          <div
            class="flex flex-wrap items-center gap-4 border-t border-gray-200 pt-5 dark:border-gray-800"
          >
            <UButton
              :loading="generatingExplanations"
              color="primary"
              variant="solid"
              icon="i-heroicons-sparkles"
              @click="generateExplanations()"
            >
              {{ t('nav_generate_insights') }}
            </UButton>
            <span class="text-sm text-gray-500 dark:text-gray-400">{{ t('insights_help') }}</span>
          </div>
        </section>

        <div
          class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800"
        >
          <details
            v-if="hasTrainingTopic"
            class="group"
            data-testid="progress-training"
            @toggle="updateDisclosure($event, 'training')"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div>
                <h2 class="text-xl font-medium text-gray-900 dark:text-white">
                  {{ t('topic_training') }}
                </h2>
                <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {{ t('topic_training_help') }}
                </p>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="size-5 shrink-0 text-gray-400 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div v-if="openTopics.training" class="space-y-8 pb-8">
              <!-- 1. Activity Highlights (Big Numbers) -->
              <div v-if="sectionSettings.highlights?.visible !== false" class="space-y-4">
                <div
                  class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:px-0"
                >
                  <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ t('highlights_header') }}
                  </h2>
                  <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                    <USelectMenu
                      v-model="highlightsScope"
                      :items="workoutScopeOptions"
                      value-key="value"
                      label-key="label"
                      class="w-full sm:w-52"
                      size="xs"
                      color="neutral"
                      variant="outline"
                    />
                    <USelect
                      v-model="highlightsPeriod"
                      :items="periodOptions"
                      size="xs"
                      class="w-full sm:w-36"
                      color="neutral"
                      variant="outline"
                    />
                  </div>
                </div>
                <ActivityHighlights
                  :period="highlightsPeriod"
                  :sport="scopeToSport(highlightsScope)"
                  :tags="scopeToTags(highlightsScope)"
                />
              </div>

              <!-- 8. Training Intensity Distribution -->
              <div v-if="sectionSettings.distribution?.visible !== false" class="space-y-4">
                <PerformanceIntensityDistributionCard
                  v-model:period="distributionPeriod"
                  v-model:scope="distributionScope"
                  :period-options="distributionPeriodOptions"
                  :scope-options="workoutScopeOptions"
                  :sport="scopeToSport(distributionScope)"
                  :tags="scopeToTags(distributionScope)"
                  :settings="chartSettings.distribution"
                  @settings="
                    openChartSettings('distribution', t('intensity_dist_title'), {
                      unit: 'h',
                      max: 50,
                      step: 1,
                      showOverlays: false
                    })
                  "
                />
              </div>

              <section v-if="sectionSettings.workoutScores?.visible !== false" class="space-y-5">
                <h3 class="text-lg font-semibold">{{ t('workout_header') }}</h3>
                <p v-if="workoutLoading" role="status" class="text-gray-500">
                  {{ t('overview_loading') }}
                </p>
                <div v-else-if="workoutError" role="alert" class="space-y-3">
                  <p>{{ t('overview_error_help') }}</p>
                  <UButton color="neutral" variant="outline" @click="refreshWorkouts()">{{
                    t('retry')
                  }}</UButton>
                </div>
                <div v-else-if="trainingSessionCount > 0" class="space-y-8">
                  <div class="divide-y divide-gray-100 dark:divide-gray-800">
                    <button
                      v-for="metric in workoutMetrics"
                      :key="metric.key"
                      type="button"
                      :disabled="!hasScore(metric.score)"
                      class="flex w-full items-center justify-between gap-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                      @click="openWorkoutModal(metric.title, metric.score, metric.color)"
                    >
                      <span class="text-sm font-medium">{{ metric.label }}</span>
                      <span
                        class="flex items-center gap-3 text-sm tabular-nums text-gray-600 dark:text-gray-400"
                      >
                        {{
                          hasScore(metric.score)
                            ? `${formatScore(metric.score)} / 10`
                            : t('score_missing')
                        }}
                        <UIcon
                          v-if="hasScore(metric.score)"
                          name="i-heroicons-chevron-right"
                          class="size-4"
                          aria-hidden="true"
                        />
                      </span>
                    </button>
                  </div>
                  <PerformanceScoreTrajectoryCard
                    :title="t('trajectory_workout_title')"
                    :data="workoutData.workouts"
                    type="workout"
                    :settings="chartSettings.performance"
                    @settings="
                      openChartSettings('performance', t('trajectory_workout_title'), {
                        max: 10,
                        step: 1,
                        showOverlays: false
                      })
                    "
                  />

                  <details
                    :open="openComparisons.workout"
                    class="space-y-4"
                    @toggle="updateComparison($event, 'workout')"
                  >
                    <summary
                      class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {{ t('execution_balance_header') }}
                    </summary>
                    <div v-if="openComparisons.workout" class="h-[320px]">
                      <ClientOnly
                        ><RadarChart
                          :scores="{
                            overall: workoutData.summary?.avgOverall,
                            technical: workoutData.summary?.avgTechnical,
                            effort: workoutData.summary?.avgEffort,
                            pacing: workoutData.summary?.avgPacing,
                            execution: workoutData.summary?.avgExecution
                          }"
                          type="workout"
                      /></ClientOnly>
                    </div>
                  </details>
                </div>
                <p v-else class="leading-7 text-gray-500">{{ t('training_empty') }}</p>
              </section>
            </div>
          </details>

          <details
            v-if="hasFitnessTopic"
            class="group"
            data-testid="progress-fitness"
            @toggle="updateDisclosure($event, 'fitness')"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div>
                <h2 class="text-xl font-medium text-gray-900 dark:text-white">
                  {{ t('topic_fitness') }}
                </h2>
                <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {{ t('topic_fitness_help') }}
                </p>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="size-5 shrink-0 text-gray-400 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div v-if="openTopics.fitness" class="space-y-8 pb-8">
              <section v-if="sectionSettings.athleteProfile?.visible !== false" class="space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <h3 class="text-lg font-semibold">{{ t('profile_header') }}</h3>
                  <p v-if="profileData?.scores?.lastUpdated" class="text-xs text-gray-500">
                    {{
                      t('profile_sync', { date: formatDateLocal(profileData.scores.lastUpdated) })
                    }}
                  </p>
                </div>
                <p v-if="profileLoading" role="status" class="text-gray-500">
                  {{ t('profile_loading') }}
                </p>
                <div v-else-if="profileError" role="alert" class="space-y-3">
                  <p>{{ t('profile_error') }}</p>
                  <UButton color="neutral" variant="outline" @click="refreshProfile()">{{
                    t('retry')
                  }}</UButton>
                </div>
                <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
                  <button
                    v-for="metric in profileMetrics"
                    :key="metric.key"
                    type="button"
                    :disabled="!hasScore(metric.score)"
                    class="flex w-full items-center justify-between gap-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                    @click="openModalWithStructured(metric, metric.analysisData)"
                  >
                    <span class="text-sm font-medium">{{ metric.title }}</span>
                    <span
                      class="flex items-center gap-3 text-sm tabular-nums text-gray-600 dark:text-gray-400"
                    >
                      {{
                        hasScore(metric.score)
                          ? `${formatScore(metric.score)} / 10`
                          : t('score_missing')
                      }}
                      <UIcon
                        v-if="hasScore(metric.score)"
                        name="i-heroicons-chevron-right"
                        class="size-4"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                </div>
                <p
                  v-if="
                    !profileLoading &&
                    !profileError &&
                    !profileMetrics.some((metric) => hasScore(metric.score))
                  "
                  class="text-sm leading-6 text-gray-500"
                >
                  {{ t('profile_empty') }}
                </p>
              </section>
              <!-- 3. PMC Chart (Performance Management Chart) -->
              <div v-if="sectionSettings.pmc?.visible !== false" class="space-y-4">
                <PerformancePmcCard
                  v-model:period="pmcPeriod"
                  :period-options="pmcPeriodOptions"
                  :settings="chartSettings.pmc"
                  @settings="
                    openChartSettings('pmc', t('pmc_title'), {
                      max: 150,
                      step: 5,
                      showOverlays: false,
                      showWellnessEventsOption: true
                    })
                  "
                />
              </div>

              <!-- 4. Power Duration Curve -->
              <div v-if="sectionSettings.powerCurve?.visible !== false" class="space-y-4">
                <PerformancePowerCurveCard
                  v-model:period="powerCurvePeriod"
                  v-model:scope="powerCurveScope"
                  :period-options="periodOptions"
                  :scope-options="workoutScopeOptions"
                  :sport="scopeToSport(powerCurveScope)"
                  :tags="scopeToTags(powerCurveScope)"
                  :settings="chartSettings.powerCurve"
                  @settings="
                    openChartSettings('powerCurve', t('power_curve_title'), {
                      unit: 'W',
                      max: 1500,
                      step: 50,
                      showOverlays: false,
                      showFreshnessBandsOption: true
                    })
                  "
                />
              </div>

              <!-- 5. Efficiency & Decoupling -->
              <div v-if="sectionSettings.efficiency?.visible !== false" class="space-y-4">
                <PerformanceEfficiencyCard
                  v-model:period="efficiencyPeriod"
                  v-model:scope="efficiencyScope"
                  :period-options="periodOptions"
                  :scope-options="workoutScopeOptions"
                  :sport="scopeToSport(efficiencyScope)"
                  :tags="scopeToTags(efficiencyScope)"
                  :settings="chartSettings.efficiency"
                  @settings="
                    openChartSettings('efficiency', t('efficiency_title'), {
                      max: 5,
                      step: 0.1,
                      showOverlays: false
                    })
                  "
                />
              </div>

              <!-- 7. FTP Evolution Chart -->
              <div v-if="sectionSettings.ftp?.visible !== false" class="space-y-4">
                <PerformanceFtpEvolutionCard
                  v-model:period="ftpPeriod"
                  v-model:scope="ftpScope"
                  :period-options="ftpPeriodOptions"
                  :scope-options="workoutScopeOptions"
                  :sport="scopeToSport(ftpScope)"
                  :tags="scopeToTags(ftpScope)"
                  :settings="chartSettings.ftp"
                  @settings="
                    openChartSettings('ftp', t('ftp_evolution_title'), {
                      unit: 'W',
                      max: 500,
                      step: 10,
                      showOverlays: false,
                      showEstimatedFtpOption: true
                    })
                  "
                />
              </div>

              <section v-if="sectionSettings.records?.visible !== false" class="space-y-4">
                <h3 class="text-lg font-semibold">{{ t('bests_header') }}</h3>
                <PerformanceBestsSummary
                  v-if="hasPersonalBests"
                  :personal-bests="profileData?.personalBests || []"
                />
                <p v-else class="text-sm leading-6 text-gray-500">{{ t('records_empty') }}</p>
              </section>
            </div>
          </details>

          <details
            v-if="nutritionEnabled && sectionSettings.nutritionScores?.visible !== false"
            class="group"
            data-testid="progress-fueling"
            @toggle="updateDisclosure($event, 'fueling')"
          >
            <summary
              class="flex cursor-pointer list-none items-center justify-between gap-5 py-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
            >
              <div>
                <h2 class="text-xl font-medium text-gray-900 dark:text-white">
                  {{ t('topic_fueling') }}
                </h2>
                <p class="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {{ t('topic_fueling_help') }}
                </p>
              </div>
              <UIcon
                name="i-heroicons-chevron-down"
                class="size-5 shrink-0 text-gray-400 group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div v-if="openTopics.fueling" class="space-y-8 pb-8">
              <p v-if="nutritionLoading" role="status" class="text-gray-500">
                {{ t('nutrition_loading') }}
              </p>
              <div v-else-if="nutritionError" role="alert" class="space-y-3">
                <p>{{ t('nutrition_error') }}</p>
                <UButton color="neutral" variant="outline" @click="refreshNutrition()">{{
                  t('retry')
                }}</UButton>
              </div>
              <div
                v-else-if="nutritionMetrics.some((metric) => hasScore(metric.score))"
                class="space-y-8"
              >
                <div class="divide-y divide-gray-100 dark:divide-gray-800">
                  <button
                    v-for="metric in nutritionMetrics"
                    :key="metric.key"
                    type="button"
                    :disabled="!hasScore(metric.score)"
                    class="flex w-full items-center justify-between gap-5 py-4 text-left focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-default"
                    @click="openNutritionModal(metric.title, metric.score, metric.color)"
                  >
                    <span class="text-sm font-medium">{{ metric.label }}</span>
                    <span
                      class="flex items-center gap-3 text-sm tabular-nums text-gray-600 dark:text-gray-400"
                    >
                      {{
                        hasScore(metric.score)
                          ? `${formatScore(metric.score)} / 10`
                          : t('score_missing')
                      }}
                      <UIcon
                        v-if="hasScore(metric.score)"
                        name="i-heroicons-chevron-right"
                        class="size-4"
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                </div>
                <PerformanceScoreTrajectoryCard
                  :title="t('trajectory_nutrition_title')"
                  :data="nutritionData.nutrition"
                  type="nutrition"
                  :settings="chartSettings.nutrition"
                  @settings="
                    openChartSettings('nutrition', t('trajectory_nutrition_title'), {
                      max: 10,
                      step: 1,
                      showOverlays: false
                    })
                  "
                />

                <details
                  :open="openComparisons.nutrition"
                  class="space-y-4"
                  @toggle="updateComparison($event, 'nutrition')"
                >
                  <summary
                    class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {{ t('metabolic_balance_header') }}
                  </summary>
                  <div v-if="openComparisons.nutrition" class="h-[320px]">
                    <ClientOnly
                      ><RadarChart
                        :scores="{
                          overall: nutritionData.summary?.avgOverall,
                          macroBalance: nutritionData.summary?.avgMacroBalance,
                          quality: nutritionData.summary?.avgQuality,
                          adherence: nutritionData.summary?.avgAdherence,
                          hydration: nutritionData.summary?.avgHydration
                        }"
                        type="nutrition"
                    /></ClientOnly>
                  </div>
                </details>
              </div>
              <div v-else class="space-y-3">
                <p class="leading-7 text-gray-500">{{ t('nutrition_empty') }}</p>
                <UButton to="/nutrition" color="neutral" variant="outline">{{
                  t('view_fueling')
                }}</UButton>
              </div>
            </div>
          </details>
        </div>
        <p
          v-if="
            !hasTrainingTopic &&
            !hasFitnessTopic &&
            (!nutritionEnabled || sectionSettings.nutritionScores?.visible === false)
          "
          class="text-sm text-gray-500"
        >
          {{ t('topics_hidden') }}
        </p>
        <ScoreDetailModal
          v-model="showModal"
          :title="modalData.title"
          :score="modalData.score"
          :explanation="modalData.explanation"
          :analysis-data="modalData.analysisData"
          :color="modalData.color"
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
  import ActivityHighlights from '~/components/ActivityHighlights.vue'
  import ChartSettingsModal from '~/components/charts/ChartSettingsModal.vue'
  import PerformanceSettingsModal from '~/components/performance/PerformanceSettingsModal.vue'
  import PerformancePmcCard from '~/components/performance/PerformancePmcCard.vue'
  import PerformancePowerCurveCard from '~/components/performance/PerformancePowerCurveCard.vue'
  import PerformanceEfficiencyCard from '~/components/performance/PerformanceEfficiencyCard.vue'
  import PerformanceFtpEvolutionCard from '~/components/performance/PerformanceFtpEvolutionCard.vue'
  import PerformanceIntensityDistributionCard from '~/components/performance/PerformanceIntensityDistributionCard.vue'
  import PerformanceScoreTrajectoryCard from '~/components/performance/PerformanceScoreTrajectoryCard.vue'
  import PerformanceBestsSummary from '~/components/performance/PerformanceBestsSummary.vue'

  const { t } = useTranslate('performance')
  const { t: tc } = useTranslate('common')

  const userStore = useUserStore()
  const integrationStore = useIntegrationStore()
  const { formatDate: baseFormatDate } = useFormat()
  const isGarminConnected = computed(() => {
    return (
      integrationStore.integrationStatus?.integrations?.some((i: any) => i.provider === 'garmin') ??
      false
    )
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

  const defaultChartSettings: any = {
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
    const merged: any = {}
    for (const key in defaultChartSettings) {
      merged[key] = {
        ...defaultChartSettings[key],
        ...(userSettings[key] || {})
      }
    }
    return merged
  })

  const defaultSectionSettings = {
    highlights: { visible: true },
    athleteProfile: { visible: true },
    records: { visible: true },
    pmc: { visible: true },
    powerCurve: { visible: true },
    efficiency: { visible: true },
    ftp: { visible: true },
    distribution: { visible: true },
    workoutScores: { visible: true },
    nutritionScores: { visible: true }
  }

  const sectionSettings = computed(() => {
    const userSections = userStore.user?.dashboardSettings?.performanceSections || {}
    const merged: any = {}
    for (const key in defaultSectionSettings) {
      merged[key] = {
        ...defaultSectionSettings[key as keyof typeof defaultSectionSettings],
        ...(userSections[key] || {})
      }
    }
    return merged
  })

  const openTopics = reactive({ training: false, fitness: false, fueling: false })
  const openComparisons = reactive({ workout: false, nutrition: false })
  const updateDisclosure = (event: Event, topic: keyof typeof openTopics) => {
    openTopics[topic] = (event.currentTarget as HTMLDetailsElement).open
  }
  const updateComparison = (event: Event, topic: keyof typeof openComparisons) => {
    openComparisons[topic] = (event.currentTarget as HTMLDetailsElement).open
  }
  const hasTrainingTopic = computed(() =>
    ['highlights', 'distribution', 'workoutScores'].some(
      (key) => sectionSettings.value[key]?.visible !== false
    )
  )
  const hasFitnessTopic = computed(() =>
    ['athleteProfile', 'records', 'pmc', 'powerCurve', 'efficiency', 'ftp'].some(
      (key) => sectionSettings.value[key]?.visible !== false
    )
  )

  function openChartSettings(key: string, title: string, options: any = {}) {
    activeMetricSettings.value = { key, title, ...options }
  }

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  useHead(() => ({
    title: t.value('page_title'),
    meta: [
      {
        name: 'description',
        content: t.value('meta_description')
      },
      { property: 'og:title', content: `${t.value('page_title')} | Coach Watts` },
      {
        property: 'og:description',
        content: t.value('meta_description')
      }
    ]
  }))

  const selectedPeriod = ref<number | string>(30)
  const highlightsPeriod = ref<number | string>(30)
  const highlightsScope = ref<string>('all')
  const efficiencyPeriod = ref<number | string>(90)
  const efficiencyScope = ref<string>('all')
  const powerCurvePeriod = ref<number | string>(90)
  const powerCurveScope = ref<string>('all')
  const workoutScope = ref<string>('all')
  const scopeToSport = (scope: string) =>
    scope === 'all' || scope.startsWith('tag:') ? 'all' : scope
  const scopeToTags = (scope: string) => (scope.startsWith('tag:') ? [scope.slice(4)] : [])

  // These requests are independent; start them together instead of creating a waterfall.
  const [sportsResult, workoutTagsResult, profileResult, workoutResult, nutritionResult] =
    await Promise.all([
      useAsyncData<string[]>('workouts-sports', () => ($fetch as any)('/api/workouts/sports')),
      useAsyncData<Array<{ value: string; count: number }>>('workouts-tags', () =>
        ($fetch as any)('/api/workouts/tags')
      ),
      useAsyncData<AthleteProfile>('athlete-profile', () =>
        ($fetch as any)('/api/scores/athlete-profile')
      ),
      useAsyncData(
        'workout-trends',
        () =>
          ($fetch as any)('/api/scores/workout-trends', {
            query: {
              days: selectedPeriod.value,
              sport: scopeToSport(workoutScope.value),
              tags: scopeToTags(workoutScope.value).join(',')
            }
          }),
        { watch: [selectedPeriod, workoutScope] }
      ),
      useAsyncData(
        'nutrition-trends',
        () =>
          ($fetch as any)('/api/scores/nutrition-trends', {
            query: {
              days: selectedPeriod.value
            }
          }),
        { watch: [selectedPeriod] }
      )
    ])

  const { data: sportsData } = sportsResult as any
  const { data: workoutTagsData } = workoutTagsResult as any
  const sportOptions = computed(() => {
    const options = [{ label: t.value('highlights_all_sports'), value: 'all' }]
    if (sportsData.value) {
      sportsData.value.forEach((sport: string) => {
        options.push({ label: sport, value: sport })
      })
    }
    return options
  })

  const availableWorkoutTags = computed(() =>
    (workoutTagsData.value || []).map((tag: any) => ({
      label: `${tag.value} (${tag.count})`,
      value: tag.value
    }))
  )

  const workoutScopeOptions = computed(() => {
    const groups: Array<Array<{ label: string; value?: string; type?: 'label' }>> = [
      [
        { label: t.value('scope_sports'), type: 'label' },
        ...sportOptions.value.map((option) => ({ label: option.label, value: option.value }))
      ]
    ]

    if (availableWorkoutTags.value.length > 0) {
      groups.push([
        { label: t.value('scope_tags'), type: 'label' },
        ...availableWorkoutTags.value.map((tag: any) => ({
          label: tag.label,
          value: `tag:${tag.value}`
        }))
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

  const hasPersonalBests = computed(() => {
    return (profileData.value?.personalBests?.length || 0) > 0
  })

  interface AthleteProfile {
    personalBests?: any[]
    scores?: {
      lastUpdated?: string
      currentFitness?: number
      currentFitnessExplanation?: string
      currentFitnessExplanationJson?: any
      recoveryCapacity?: number
      recoveryCapacityExplanation?: string
      recoveryCapacityExplanationJson?: any
      nutritionCompliance?: number
      nutritionComplianceExplanation?: string
      nutritionComplianceExplanationJson?: any
      trainingConsistency?: number
      trainingConsistencyExplanation?: string
      trainingConsistencyExplanationJson?: any
    }
  }

  const {
    data: profileData,
    pending: profileLoading,
    error: profileError,
    refresh: refreshProfile
  } = profileResult as any
  const {
    data: workoutData,
    pending: workoutLoading,
    error: workoutError,
    refresh: refreshWorkouts
  } = workoutResult as any
  const {
    data: nutritionData,
    pending: nutritionLoading,
    error: nutritionError,
    refresh: refreshNutrition
  } = nutritionResult as any

  const hasScore = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)
  const formatScore = (value: number) => Number(value.toFixed(1)).toString()
  // The API's total counts real sessions; trend rows also contain synthesized rest days.
  const trainingSessionCount = computed(() => {
    const count = workoutData.value?.summary?.total
    return typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0
  })
  type ScoreColor = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
  const profileMetrics = computed(() =>
    [
      { key: 'currentFitness', titleKey: 'profile_fitness_title', color: 'blue' },
      { key: 'recoveryCapacity', titleKey: 'profile_recovery_title', color: 'green' },
      ...(nutritionEnabled.value
        ? [{ key: 'nutritionCompliance', titleKey: 'profile_nutrition_title', color: 'purple' }]
        : []),
      { key: 'trainingConsistency', titleKey: 'profile_consistency_title', color: 'orange' }
    ].map((metric) => ({
      key: metric.key,
      title: t.value(metric.titleKey),
      score: profileData.value?.scores?.[metric.key] ?? null,
      explanation:
        profileData.value?.scores?.[`${metric.key}Explanation`] ||
        t.value('profile_no_explanation'),
      analysisData: profileData.value?.scores?.[`${metric.key}ExplanationJson`],
      color: metric.color as ScoreColor
    }))
  )
  const workoutMetrics = computed(() =>
    [
      {
        key: 'avgOverall',
        label: 'workout_overall_title',
        title: 'workout_overall_full',
        color: 'yellow'
      },
      {
        key: 'avgTechnical',
        label: 'workout_technical_title',
        title: 'workout_technical_full',
        color: 'blue'
      },
      {
        key: 'avgEffort',
        label: 'workout_effort_title',
        title: 'workout_effort_full',
        color: 'red'
      },
      {
        key: 'avgPacing',
        label: 'workout_pacing_title',
        title: 'workout_pacing_full',
        color: 'green'
      },
      {
        key: 'avgExecution',
        label: 'workout_execution_title',
        title: 'workout_execution_full',
        color: 'purple'
      }
    ].map((metric) => ({
      key: metric.key,
      label: t.value(metric.label),
      title: t.value(metric.title),
      score: workoutData.value?.summary?.[metric.key] ?? null,
      color: metric.color
    }))
  )
  const nutritionMetrics = computed(() =>
    [
      {
        key: 'avgOverall',
        label: 'workout_overall_title',
        title: 'nutrition_overall_full',
        color: 'yellow'
      },
      {
        key: 'avgMacroBalance',
        label: 'nutrition_macro_title',
        title: 'nutrition_macro_full',
        color: 'blue'
      },
      {
        key: 'avgQuality',
        label: 'nutrition_quality_title',
        title: 'nutrition_quality_full',
        color: 'green'
      },
      {
        key: 'avgAdherence',
        label: 'nutrition_adherence_title',
        title: 'nutrition_adherence_full',
        color: 'purple'
      },
      {
        key: 'avgHydration',
        label: 'nutrition_hydration_title',
        title: 'nutrition_hydration_full',
        color: 'cyan'
      }
    ].map((metric) => ({
      key: metric.key,
      label: t.value(metric.label),
      title: t.value(metric.title),
      score: nutritionData.value?.summary?.[metric.key] ?? null,
      color: metric.color
    }))
  )
  // Modal state
  const showModal = ref(false)
  const loadingExplanation = ref(false)
  const generatingExplanations = ref(false)
  const modalData = ref<{
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

  // Cache for explanations to avoid refetching
  const workoutExplanations = ref<Record<string, any>>({})
  const nutritionExplanations = ref<Record<string, any>>({})

  // Toast for notifications
  const toast = useToast()

  // Handle score card click with structured data
  const openModalWithStructured = (
    data: {
      title: string
      score?: number | null
      explanation?: string | null
      color?: 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'
    },
    structuredData?: any
  ) => {
    modalData.value = {
      title: data.title,
      score: data.score ?? null,
      explanation: structuredData ? null : (data.explanation ?? null),
      analysisData: structuredData || undefined,
      color: data.color
    }
    showModal.value = true
  }

  // Map display titles to metric names
  const getWorkoutMetricName = (title: string): string => {
    const isTReady = typeof t.value === 'function'
    if (!isTReady) return 'overall'

    if (title === t.value('workout_overall_full')) return 'overall'
    if (title === t.value('workout_technical_full')) return 'technical'
    if (title === t.value('workout_effort_full')) return 'effort'
    if (title === t.value('workout_pacing_full')) return 'pacing'
    if (title === t.value('workout_execution_full')) return 'execution'

    return 'overall'
  }

  // Handle workout aggregate score click - fetch from database or trigger generation
  const openWorkoutModal = async (title: string, score: number | null, color?: string) => {
    if (!hasScore(score) || !workoutData.value) return

    modalData.value = {
      title,
      score,
      explanation: t.value('loading_insights'),
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true
    loadingExplanation.value = true

    if (scopeToTags(workoutScope.value).length > 0) {
      modalData.value.explanation = t.value('tag_insights_unavailable')
      loadingExplanation.value = false
      return
    }

    const metric = getWorkoutMetricName(title)
    const cacheKey = `${selectedPeriod.value}-${metric}`

    // Check memory cache first
    if (workoutExplanations.value[cacheKey]) {
      modalData.value.analysisData = workoutExplanations.value[cacheKey]
      modalData.value.explanation = null
      loadingExplanation.value = false
      return
    }

    try {
      // Fetch from database (or trigger generation if not available)
      const response: any = await $fetch<any, string & {}>('/api/scores/explanation', {
        query: {
          type: 'workout',
          period: selectedPeriod.value,
          metric
        }
      })

      if (response.cached && response.analysis) {
        // Explanation was found in database
        workoutExplanations.value[cacheKey] = response.analysis
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      } else if (response.generating) {
        // Explanation is being generated - show message
        modalData.value.explanation = t.value('generating_insights_wait')
        refreshRuns()
      } else {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation = response.message || t.value('no_insights_available')
      }
    } catch (error) {
      console.error('Error fetching workout explanation:', error)
      modalData.value.explanation = t.value('failed_to_load_explanation')
    } finally {
      if (!modalData.value.explanation?.includes('Generating')) {
        loadingExplanation.value = false
      }
    }
  }

  // Map display titles to metric names
  const getNutritionMetricName = (title: string): string => {
    const isTReady = typeof t.value === 'function'
    if (!isTReady) return 'overall'

    if (title === t.value('nutrition_overall_full')) return 'overall'
    if (title === t.value('nutrition_macro_full')) return 'macroBalance'
    if (title === t.value('nutrition_quality_full')) return 'quality'
    if (title === t.value('nutrition_adherence_full')) return 'adherence'
    if (title === t.value('nutrition_hydration_full')) return 'hydration'

    return 'overall'
  }

  // Handle nutrition aggregate score click - fetch from database or trigger generation
  const openNutritionModal = async (title: string, score: number | null, color?: string) => {
    if (!hasScore(score) || !nutritionData.value) return

    modalData.value = {
      title,
      score,
      explanation: t.value('loading_insights'),
      analysisData: undefined,
      color: color as any
    }
    showModal.value = true
    loadingExplanation.value = true

    const metric = getNutritionMetricName(title)
    const cacheKey = `${selectedPeriod.value}-${metric}`

    // Check memory cache first
    if (nutritionExplanations.value[cacheKey]) {
      modalData.value.analysisData = nutritionExplanations.value[cacheKey]
      modalData.value.explanation = null
      loadingExplanation.value = false
      return
    }

    try {
      // Fetch from database (or trigger generation if not available)
      const response: any = await $fetch<any, string & {}>('/api/scores/explanation', {
        query: {
          type: 'nutrition',
          period: selectedPeriod.value,
          metric
        }
      })

      if (response.cached && response.analysis) {
        // Explanation was found in database
        nutritionExplanations.value[cacheKey] = response.analysis
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      } else if (response.generating) {
        // Explanation is being generated - show message
        modalData.value.explanation = t.value('generating_insights_wait')
        refreshRuns()
      } else {
        // Not cached and not generating (manual trigger required)
        modalData.value.explanation = response.message || t.value('no_insights_available')
      }
    } catch (error) {
      console.error('Error fetching nutrition explanation:', error)
      modalData.value.explanation = t.value('failed_to_load_explanation')
    } finally {
      if (!modalData.value.explanation?.includes('Generating')) {
        loadingExplanation.value = false
      }
    }
  }

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  // Generate explanations function
  const generateExplanations = async () => {
    generatingExplanations.value = true
    try {
      await $fetch<any, string & {}>('/api/scores/generate-explanations', { method: 'POST' })
      refreshRuns()

      toast.add({
        title: t.value('toast_generation_started_title'),
        description: t.value('toast_generation_started_desc'),
        color: 'success',
        icon: 'i-heroicons-sparkles'
      })

      // Clear the caches so fresh explanations will be fetched
      workoutExplanations.value = {}
      nutritionExplanations.value = {}
    } catch (error: any) {
      generatingExplanations.value = false
      toast.add({
        title: 'Generation Failed',
        description: error.data?.message || error.message || 'Failed to start generation',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  const refreshCurrentModal = async () => {
    if (!showModal.value || !modalData.value) return

    // Identify if it is a workout or nutrition modal based on title/context
    const title = modalData.value.title
    const isWorkout = [
      t.value('workout_overall_full'),
      t.value('workout_technical_full'),
      t.value('workout_effort_full'),
      t.value('workout_pacing_full'),
      t.value('workout_execution_full')
    ].includes(title)

    if (isWorkout) {
      await openWorkoutModal(title, modalData.value.score, modalData.value.color)
    } else {
      await openNutritionModal(title, modalData.value.score, modalData.value.color)
    }
  }

  // Listen for completion
  onTaskCompleted('generate-score-explanations', async () => {
    generatingExplanations.value = false
    workoutExplanations.value = {}
    nutritionExplanations.value = {}

    toast.add({
      title: t.value('toast_insights_ready_title'),
      description: t.value('toast_insights_ready_desc'),
      color: 'success',
      icon: 'i-heroicons-check-badge'
    })

    if (showModal.value) {
      await refreshCurrentModal()
    }
  })

  onTaskFailed('generate-score-explanations', async (run) => {
    generatingExplanations.value = false
    toast.add({
      title: t.value('toast_generation_failed_title') || 'Generation Failed',
      description: run.error?.message || 'Failed to generate insights',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })

  // Watch for period changes and refetch
  watch(selectedPeriod, async () => {
    const refreshes = [refreshNuxtData('workout-trends')]
    if (nutritionEnabled.value) {
      refreshes.push(refreshNuxtData('nutrition-trends'))
    }
    await Promise.all(refreshes)
  })

  watch(workoutScope, async () => {
    await refreshNuxtData('workout-trends')
  })

  const formatDateLocal = (date: string) => {
    return baseFormatDate(date)
  }
  const isPerformanceSettingsModalOpen = ref(false)
</script>
