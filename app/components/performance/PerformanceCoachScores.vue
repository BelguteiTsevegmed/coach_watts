<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-3 px-4 sm:flex-row sm:items-start sm:justify-between sm:px-0">
      <p class="max-w-2xl text-sm text-muted">
        {{ nutritionEnabled ? t('coach_scores_explainer_nutrition') : t('coach_scores_explainer') }}
      </p>
      <UButton
        :loading="generatingExplanations"
        color="neutral"
        variant="outline"
        icon="i-heroicons-sparkles"
        size="sm"
        class="shrink-0 self-start"
        @click="
          () => {
            void generateExplanations()
          }
        "
      >
        {{ t('coach_scores_refresh') }}
      </UButton>
    </div>

    <!-- Athlete profile scores -->
    <section v-if="sections.athleteProfile" class="space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-0">
        <h3 class="text-sm font-semibold text-highlighted">{{ t('profile_header') }}</h3>
        <span v-if="profileScores?.lastUpdated" class="text-xs text-muted">
          {{ t('coach_scores_updated', { date: formatDate(profileScores.lastUpdated) }) }}
        </span>
      </div>
      <div class="space-y-0">
        <button
          v-for="card in profileCards"
          :key="card.key"
          type="button"
          class="flex w-full items-center justify-between gap-4 border-b border-default py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60"
          :disabled="!hasScore(card.score)"
          @click="openModalWithStructured(card, card.structured)"
        >
          <span class="text-sm font-medium text-highlighted">{{ card.title }}</span>
          <span class="shrink-0 text-sm tabular-nums text-muted"
            >{{ hasScore(card.score) ? formatScore(card.score) : '–' }} / 10</span
          >
        </button>
      </div>
    </section>

    <!-- Workout execution scores -->
    <section v-if="sections.workoutScores" class="space-y-3">
      <div class="flex flex-col gap-2 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-0">
        <h3 class="text-sm font-semibold text-highlighted">{{ t('workout_header') }}</h3>
        <div class="flex w-full gap-2 sm:w-auto">
          <USelectMenu
            v-model="workoutScope"
            :items="scopeOptions"
            value-key="value"
            label-key="label"
            class="min-w-0 flex-1 sm:w-44 sm:flex-none"
            size="xs"
            color="neutral"
            variant="outline"
            :aria-label="t('scope_label')"
          />
          <USelect
            v-model="selectedPeriod"
            :items="periodOptions"
            class="min-w-0 flex-1 sm:w-36 sm:flex-none"
            size="xs"
            color="neutral"
            variant="outline"
            :aria-label="t('period_label')"
          />
        </div>
      </div>

      <div v-if="workoutLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin text-primary" />
      </div>

      <div v-else-if="workoutError" role="alert" class="space-y-3">
        <p>{{ t('overview_error_help') }}</p>
        <UButton color="neutral" variant="outline" @click="refreshWorkouts()">{{
          t('retry')
        }}</UButton>
      </div>
      <div v-else-if="workoutData?.summary?.total > 0" class="space-y-4">
        <div class="space-y-0">
          <button
            v-for="card in workoutCards"
            :key="card.key"
            type="button"
            class="flex w-full items-center justify-between gap-4 border-b border-default py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60"
            :disabled="!hasScore(card.score)"
            @click="openWorkoutModal(card.fullTitle, card.score ?? null, card.color)"
          >
            <span class="text-sm font-medium text-highlighted">{{ card.title }}</span>
            <span class="shrink-0 text-sm tabular-nums text-muted"
              >{{ hasScore(card.score) ? formatScore(card.score) : '–' }} / 10</span
            >
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <PerformanceScoreTrajectoryCard
              :title="t('trajectory_workout_title')"
              :data="workoutData.workouts"
              type="workout"
              :settings="chartSettings.performance"
              @settings="
                $emit('settings', 'performance', t('trajectory_workout_title'), {
                  max: 10,
                  step: 1,
                  showOverlays: false
                })
              "
            />
          </div>
          <UCard :ui="mobileListCardUi">
            <template #header>
              <h4 class="text-sm font-semibold text-highlighted">
                {{ t('execution_balance_header') }}
              </h4>
            </template>
            <div class="h-[280px]">
              <ClientOnly>
                <RadarChart
                  :scores="{
                    overall: workoutData.summary?.avgOverall,
                    technical: workoutData.summary?.avgTechnical,
                    effort: workoutData.summary?.avgEffort,
                    pacing: workoutData.summary?.avgPacing,
                    execution: workoutData.summary?.avgExecution
                  }"
                  type="workout"
                />
              </ClientOnly>
            </div>
          </UCard>
        </div>
      </div>
      <p v-else class="text-sm text-muted">{{ t('overview_empty_help') }}</p>
    </section>

    <!-- Nutrition scores (only when nutrition tracking is on) -->
    <section v-if="nutritionEnabled && sections.nutritionScores" class="space-y-3">
      <div class="px-4 sm:px-0">
        <h3 class="text-sm font-semibold text-highlighted">{{ t('nutrition_header') }}</h3>
      </div>

      <div v-if="nutritionLoading" class="flex justify-center py-8">
        <UIcon name="i-heroicons-arrow-path" class="size-6 animate-spin text-primary" />
      </div>

      <div v-else-if="nutritionError" role="alert" class="space-y-3">
        <p>{{ t('overview_error_help') }}</p>
        <UButton color="neutral" variant="outline" @click="refreshNutrition()">{{
          t('retry')
        }}</UButton>
      </div>
      <div v-else-if="nutritionData" class="space-y-4">
        <div class="space-y-0">
          <button
            v-for="card in nutritionCards"
            :key="card.key"
            type="button"
            class="flex w-full items-center justify-between gap-4 border-b border-default py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary disabled:cursor-default disabled:opacity-60"
            :disabled="!hasScore(card.score)"
            @click="openNutritionModal(card.fullTitle, card.score ?? null, card.color)"
          >
            <span class="text-sm font-medium text-highlighted">{{ card.title }}</span>
            <span class="shrink-0 text-sm tabular-nums text-muted"
              >{{ hasScore(card.score) ? formatScore(card.score) : '–' }} / 10</span
            >
          </button>
        </div>

        <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div class="lg:col-span-2">
            <PerformanceScoreTrajectoryCard
              :title="t('trajectory_nutrition_title')"
              :data="nutritionData.nutrition"
              type="nutrition"
              :settings="chartSettings.nutrition"
              @settings="
                $emit('settings', 'nutrition', t('trajectory_nutrition_title'), {
                  max: 10,
                  step: 1,
                  showOverlays: false
                })
              "
            />
          </div>
          <UCard :ui="mobileListCardUi">
            <template #header>
              <h4 class="text-sm font-semibold text-highlighted">
                {{ t('metabolic_balance_header') }}
              </h4>
            </template>
            <div class="h-[280px]">
              <ClientOnly>
                <RadarChart
                  :scores="{
                    overall: nutritionData.summary?.avgOverall,
                    macroBalance: nutritionData.summary?.avgMacroBalance,
                    quality: nutritionData.summary?.avgQuality,
                    adherence: nutritionData.summary?.avgAdherence,
                    hydration: nutritionData.summary?.avgHydration
                  }"
                  type="nutrition"
                />
              </ClientOnly>
            </div>
          </UCard>
        </div>
      </div>
    </section>

    <ScoreDetailModal
      v-model="showModal"
      :title="modalData.title"
      :score="modalData.score"
      :explanation="modalData.explanation"
      :analysis-data="modalData.analysisData"
      :color="modalData.color"
    />
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import PerformanceScoreTrajectoryCard from '~/components/performance/PerformanceScoreTrajectoryCard.vue'
  import { mobileListCardUi } from '~/utils/mobile-surface-ui'

  type ScoreColor = 'gray' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'cyan'

  interface ProfileScores {
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

  const props = defineProps<{
    profileScores?: ProfileScores | null
    nutritionEnabled: boolean
    sections: { athleteProfile: boolean; workoutScores: boolean; nutritionScores: boolean }
    chartSettings: { performance: any; nutrition: any }
    scopeOptions: any[]
    periodOptions: any[]
  }>()

  defineEmits<{
    settings: [key: string, title: string, options: Record<string, unknown>]
  }>()

  const { t } = useTranslate('performance')
  const { formatDate } = useFormat()
  const toast = useToast()

  const hasScore = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value)
  const formatScore = (value: number) => Number(value.toFixed(1)).toString()

  const selectedPeriod = ref<number | string>(30)
  const workoutScope = ref<string>('all')
  const scopeToSport = (scope: string) =>
    scope === 'all' || scope.startsWith('tag:') ? 'all' : scope
  const scopeToTags = (scope: string) => (scope.startsWith('tag:') ? [scope.slice(4)] : [])

  // Fetched only once this section is opened (the parent mounts it lazily).
  const {
    data: workoutData,
    pending: workoutLoading,
    error: workoutError,
    refresh: refreshWorkouts
  } = useAsyncData<any>(
    'performance-workout-trends',
    () =>
      ($fetch as any)('/api/scores/workout-trends', {
        query: {
          days: selectedPeriod.value,
          sport: scopeToSport(workoutScope.value),
          tags: scopeToTags(workoutScope.value).join(',')
        }
      }),
    { watch: [selectedPeriod, workoutScope], server: false }
  )

  const {
    data: nutritionData,
    pending: nutritionLoading,
    error: nutritionError,
    refresh: refreshNutrition
  } = useAsyncData<any>(
    'performance-nutrition-trends',
    () =>
      props.nutritionEnabled
        ? ($fetch as any)('/api/scores/nutrition-trends', {
            query: { days: selectedPeriod.value }
          })
        : Promise.resolve(null),
    { watch: [selectedPeriod, () => props.nutritionEnabled], server: false }
  )

  const profileCards = computed(() => {
    const scores = props.profileScores || {}
    const card = (
      key: string,
      title: string,
      score: number | undefined,
      text: string | undefined,
      structured: any,
      icon: string,
      color: ScoreColor
    ) => ({
      key,
      title,
      score,
      explanation: structured ? t.value('profile_click_detailed') : text,
      structured,
      icon,
      color
    })
    const cards = [
      card(
        'fitness',
        t.value('profile_fitness_title'),
        scores.currentFitness,
        scores.currentFitnessExplanation,
        scores.currentFitnessExplanationJson,
        'i-heroicons-bolt',
        'blue'
      ),
      card(
        'recovery',
        t.value('profile_recovery_title'),
        scores.recoveryCapacity,
        scores.recoveryCapacityExplanation,
        scores.recoveryCapacityExplanationJson,
        'i-heroicons-heart',
        'green'
      ),
      card(
        'nutrition',
        t.value('profile_nutrition_title'),
        scores.nutritionCompliance,
        scores.nutritionComplianceExplanation,
        scores.nutritionComplianceExplanationJson,
        'i-heroicons-cake',
        'purple'
      ),
      card(
        'consistency',
        t.value('profile_consistency_title'),
        scores.trainingConsistency,
        scores.trainingConsistencyExplanation,
        scores.trainingConsistencyExplanationJson,
        'i-heroicons-calendar',
        'orange'
      )
    ]
    return props.nutritionEnabled ? cards : cards.filter((c) => c.key !== 'nutrition')
  })

  const workoutCards = computed(() => {
    const summary = workoutData.value?.summary || {}
    return [
      {
        key: 'overall',
        title: t.value('workout_overall_title'),
        fullTitle: t.value('workout_overall_full'),
        score: summary.avgOverall as number | undefined,
        icon: 'i-heroicons-star',
        color: 'yellow' as ScoreColor
      },
      {
        key: 'technical',
        title: t.value('workout_technical_title'),
        fullTitle: t.value('workout_technical_full'),
        score: summary.avgTechnical as number | undefined,
        icon: 'i-heroicons-cog',
        color: 'blue' as ScoreColor
      },
      {
        key: 'effort',
        title: t.value('workout_effort_title'),
        fullTitle: t.value('workout_effort_full'),
        score: summary.avgEffort as number | undefined,
        icon: 'i-heroicons-fire',
        color: 'red' as ScoreColor
      },
      {
        key: 'pacing',
        title: t.value('workout_pacing_title'),
        fullTitle: t.value('workout_pacing_full'),
        score: summary.avgPacing as number | undefined,
        icon: 'i-heroicons-chart-bar',
        color: 'green' as ScoreColor
      },
      {
        key: 'execution',
        title: t.value('workout_execution_title'),
        fullTitle: t.value('workout_execution_full'),
        score: summary.avgExecution as number | undefined,
        icon: 'i-heroicons-check-circle',
        color: 'purple' as ScoreColor
      }
    ]
  })

  const nutritionCards = computed(() => {
    const summary = nutritionData.value?.summary || {}
    return [
      {
        key: 'overall',
        title: t.value('workout_overall_title'),
        fullTitle: t.value('nutrition_overall_full'),
        score: summary.avgOverall as number | undefined,
        icon: 'i-heroicons-star',
        color: 'yellow' as ScoreColor
      },
      {
        key: 'macroBalance',
        title: t.value('nutrition_macro_title'),
        fullTitle: t.value('nutrition_macro_full'),
        score: summary.avgMacroBalance as number | undefined,
        icon: 'i-heroicons-scale',
        color: 'blue' as ScoreColor
      },
      {
        key: 'quality',
        title: t.value('nutrition_quality_title'),
        fullTitle: t.value('nutrition_quality_full'),
        score: summary.avgQuality as number | undefined,
        icon: 'i-heroicons-sparkles',
        color: 'green' as ScoreColor
      },
      {
        key: 'adherence',
        title: t.value('nutrition_adherence_title'),
        fullTitle: t.value('nutrition_adherence_full'),
        score: summary.avgAdherence as number | undefined,
        icon: 'i-heroicons-check-badge',
        color: 'purple' as ScoreColor
      },
      {
        key: 'hydration',
        title: t.value('nutrition_hydration_title'),
        fullTitle: t.value('nutrition_hydration_full'),
        score: summary.avgHydration as number | undefined,
        icon: 'i-heroicons-beaker',
        color: 'cyan' as ScoreColor
      }
    ]
  })

  // ---------------------------------------------------------------------------
  // Score detail modal
  // ---------------------------------------------------------------------------

  const showModal = ref(false)
  const generatingExplanations = ref(false)
  const modalData = ref<{
    title: string
    score: number | null
    explanation: string | null
    analysisData?: any
    color?: ScoreColor
    kind?: 'workout' | 'nutrition'
    metric?: string
  }>({
    title: '',
    score: null,
    explanation: null
  })

  // Cache explanations so reopening a card does not refetch.
  const workoutExplanations = ref<Record<string, any>>({})
  const nutritionExplanations = ref<Record<string, any>>({})

  function openModalWithStructured(
    data: { title: string; score?: number | null; explanation?: string | null; color?: ScoreColor },
    structuredData?: any
  ) {
    modalData.value = {
      title: data.title,
      score: data.score ?? null,
      explanation: structuredData ? null : (data.explanation ?? null),
      analysisData: structuredData || undefined,
      color: data.color
    }
    showModal.value = true
  }

  const workoutMetricByTitle = computed<Record<string, string>>(() => ({
    [t.value('workout_overall_full')]: 'overall',
    [t.value('workout_technical_full')]: 'technical',
    [t.value('workout_effort_full')]: 'effort',
    [t.value('workout_pacing_full')]: 'pacing',
    [t.value('workout_execution_full')]: 'execution'
  }))

  const nutritionMetricByTitle = computed<Record<string, string>>(() => ({
    [t.value('nutrition_overall_full')]: 'overall',
    [t.value('nutrition_macro_full')]: 'macroBalance',
    [t.value('nutrition_quality_full')]: 'quality',
    [t.value('nutrition_adherence_full')]: 'adherence',
    [t.value('nutrition_hydration_full')]: 'hydration'
  }))

  async function openExplanation(
    kind: 'workout' | 'nutrition',
    title: string,
    score: number | null,
    color?: ScoreColor
  ) {
    if (!hasScore(score)) return
    const metric =
      (kind === 'workout' ? workoutMetricByTitle.value : nutritionMetricByTitle.value)[title] ||
      'overall'

    modalData.value = {
      title,
      score,
      explanation: t.value('loading_insights'),
      analysisData: undefined,
      color,
      kind,
      metric
    }
    showModal.value = true

    if (kind === 'workout' && scopeToTags(workoutScope.value).length > 0) {
      modalData.value.explanation = t.value('insights_unavailable_for_tags')
      return
    }

    const cache = kind === 'workout' ? workoutExplanations : nutritionExplanations
    const cacheKey = `${selectedPeriod.value}-${metric}`
    if (cache.value[cacheKey]) {
      modalData.value.analysisData = cache.value[cacheKey]
      modalData.value.explanation = null
      return
    }

    try {
      const response: any = await $fetch<any, string & {}>('/api/scores/explanation', {
        query: { type: kind, period: selectedPeriod.value, metric }
      })

      if (response.cached && response.analysis) {
        cache.value[cacheKey] = response.analysis
        modalData.value.analysisData = response.analysis
        modalData.value.explanation = null
      } else if (response.generating) {
        modalData.value.explanation = t.value('generating_insights_wait')
        refreshRuns()
      } else {
        modalData.value.explanation = response.message || t.value('no_insights_available')
      }
    } catch (error) {
      console.error(`Error fetching ${kind} explanation:`, error)
      modalData.value.explanation = t.value('failed_to_load_explanation')
    }
  }

  const openWorkoutModal = (title: string, score: number | null, color?: ScoreColor) =>
    openExplanation('workout', title, score, color)
  const openNutritionModal = (title: string, score: number | null, color?: ScoreColor) =>
    openExplanation('nutrition', title, score, color)

  // ---------------------------------------------------------------------------
  // Regenerate insights (background task)
  // ---------------------------------------------------------------------------

  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  async function generateExplanations() {
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
      workoutExplanations.value = {}
      nutritionExplanations.value = {}
    } catch (error: any) {
      generatingExplanations.value = false
      toast.add({
        title: t.value('toast_generation_failed_title'),
        description:
          error.data?.message || error.message || t.value('toast_generation_failed_desc'),
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

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

    const { kind, title, score, color } = modalData.value
    if (showModal.value && kind) {
      await openExplanation(kind, title, score, color)
    }
  })

  onTaskFailed('generate-score-explanations', async (run) => {
    generatingExplanations.value = false
    toast.add({
      title: t.value('toast_generation_failed_title'),
      description: run.error?.message || t.value('toast_generation_failed_desc'),
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })
</script>
