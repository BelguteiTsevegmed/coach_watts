<template>
  <UDashboardPanel id="nutrition-strategy">
    <template #header>
      <UDashboardNavbar :title="t('page_title')">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <LayoutPageNavbarActions :overflow-items="nutritionOverflowItems">
            <UButton to="/nutrition/history" color="neutral" variant="link" size="sm">{{
              t('nav_history')
            }}</UButton>
            <UDropdownMenu :items="nutritionOverflowItems"
              ><UButton
                icon="i-lucide-ellipsis"
                color="neutral"
                variant="ghost"
                :aria-label="t('journey_more_actions')"
            /></UDropdownMenu>
          </LayoutPageNavbarActions>
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <main class="nutrition-journey quick-capture-inset">
        <header class="mb-7">
          <p class="text-sm text-muted">{{ todayLabel }}</p>
          <h1 class="text-2xl font-semibold tracking-tight mt-2">
            {{ t('journey_fueling_title') }}
          </h1>
          <p class="mt-3 text-sm text-muted leading-relaxed">
            {{ t('journey_fueling_description') }}
          </p>
        </header>
        <UTabs v-model="activeNutritionTab" :items="tabs" class="w-full">
          <template #strategy>
            <ClientOnly
              ><NutritionActiveFuelingFeed
                :feed="activeFeed"
                :loading="loadingActiveFeed"
                :error="activeFeedError"
                @open-ai-helper="openAiHelper"
                @retry="refreshData"
            /></ClientOnly>
            <p
              v-if="loadErrors.length > 0 && !activeFeedError"
              class="text-sm text-muted mb-5"
              role="status"
            >
              {{ t('load_partial_title') }}
              <UButton color="neutral" variant="link" size="xs" @click="refreshData">{{
                t('nav_refresh')
              }}</UButton>
            </p>
            <details class="nutrition-journey__disclosure">
              <summary>{{ t('journey_coming_up') }}</summary>
              <div class="py-4 pb-7">
                <NutritionUpcomingFuelingFeed
                  v-if="upcomingPlan?.windows?.length"
                  :windows="upcomingPlan.windows"
                  @suggest="openAiHelperForWindow"
                  @export-grocery="showGroceryList = true"
                />
                <p v-else class="text-sm text-muted">{{ t('journey_no_upcoming') }}</p>
              </div>
            </details>
            <details class="nutrition-journey__disclosure">
              <summary>{{ t('journey_energy_detail') }}</summary>
              <div id="top-section" class="py-4 pb-7 space-y-5">
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <h2 class="text-lg font-medium">{{ t('horizon_header') }}</h2>
                    <p class="mt-2 text-sm text-muted">{{ t('horizon_desc') }}</p>
                  </div>
                  <UButton
                    icon="i-heroicons-cog-6-tooth"
                    color="neutral"
                    variant="ghost"
                    :aria-label="t('journey_chart_settings')"
                    @click="openChartSettings('horizon')"
                  />
                </div>
                <p
                  v-if="intakeConfidenceNote"
                  class="text-sm text-muted"
                  data-testid="intake-confidence"
                >
                  {{ intakeConfidenceNote }}
                </p>
                <p v-if="loadingWave" class="text-sm text-muted" role="status">
                  {{ t('journey_fueling_loading') }}
                </p>
                <ClientOnly
                  ><NutritionMultiDayEnergyChart
                    v-if="!loadingWave && wavePoints.length"
                    :key="`horizon-${JSON.stringify(chartSettings.horizon)}`"
                    :points="wavePoints"
                    :journey-events="journeyEvents"
                    :workouts="waveWorkouts"
                    :highlighted-date="highlightedDate"
                    :settings="chartSettings.horizon"
                  />
                  <p v-else-if="!loadingWave" class="text-sm text-muted">
                    {{ t('horizon_empty') }}
                  </p></ClientOnly
                >
                <div class="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
                  <span class="inline-flex items-center gap-2"
                    ><span aria-hidden="true" class="size-2 rounded-full bg-blue-500" />{{
                      t('horizon_legend_glycogen')
                    }}</span
                  >
                  <span class="inline-flex items-center gap-2"
                    ><span
                      aria-hidden="true"
                      class="size-2 rounded-full border border-blue-500 border-dashed"
                    />{{ t('horizon_legend_projected') }}</span
                  >
                  <span class="inline-flex items-center gap-2"
                    ><span aria-hidden="true" class="size-2 rounded bg-error-500" />{{
                      t('horizon_legend_workout')
                    }}</span
                  >
                  <span class="inline-flex items-center gap-2"
                    ><span aria-hidden="true" class="size-2 rounded-full bg-primary-500" />{{
                      t('horizon_legend_meal')
                    }}</span
                  >
                  <span class="inline-flex items-center gap-2"
                    ><span
                      aria-hidden="true"
                      class="size-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-b-[6px] border-b-primary-400"
                    />{{ t('horizon_legend_multiple') }}</span
                  >
                </div>
                <div v-if="missingPlannedStartActivities.length" class="text-sm leading-relaxed">
                  <p>{{ t('horizon_alert_missing_start_title') }}</p>
                  <NuxtLink
                    v-for="activity in missingPlannedStartActivities"
                    :key="activity.id"
                    :to="`/workouts/planned/${activity.id}`"
                    class="block underline mt-2"
                    >{{ activity.title }}</NuxtLink
                  >
                  <p class="mt-2 text-muted">{{ t('horizon_alert_missing_start_footer') }}</p>
                </div>
                <h2 class="text-lg font-medium">{{ t('periodization_header') }}</h2>
                <NutritionWeeklyFuelingGrid
                  v-if="strategy"
                  :days="strategy.fuelingMatrix"
                  @hover-day="highlightedDate = $event"
                />
                <ul v-if="loadErrors.length" class="text-sm text-muted space-y-2">
                  <li v-for="message in loadErrors" :key="message">{{ message }}</li>
                </ul>
              </div>
            </details>
            <details class="nutrition-journey__disclosure">
              <summary>{{ t('hydration_header') }}</summary>
              <div class="py-4 pb-7 space-y-4">
                <p
                  v-if="strategy && Number.isFinite(strategy.hydrationDebt)"
                  class="text-lg tabular-nums"
                >
                  {{ (strategy.hydrationDebt / 1000).toFixed(1) }}L
                  <span class="text-sm text-muted">{{ t('hydration_status_debt') }}</span>
                </p>
                <p class="text-sm text-muted leading-relaxed">{{ hydrationAdvice }}</p>
                <div v-if="strategy?.showHydrationFlushPrompt">
                  <p class="text-sm">{{ strategy.hydrationFlushPrompt }}</p>
                  <UButton
                    color="neutral"
                    variant="outline"
                    class="mt-3"
                    @click="resetHydrationDebt"
                    >{{ t('hydration_reset_button') }}</UButton
                  >
                </div>
                <UButton
                  color="neutral"
                  variant="link"
                  :to="`/nutrition/${formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')}`"
                  >{{ t('journey_open_journal') }}</UButton
                >
              </div>
            </details>
            <details class="nutrition-journey__disclosure">
              <summary>{{ t('journey_coach_context') }}</summary>
              <div class="py-4 pb-7 space-y-5">
                <p v-if="strategy?.summary" class="text-sm leading-relaxed">
                  {{ strategy.summary }}
                </p>
                <p v-else class="text-sm text-muted">{{ t('journey_no_summary') }}</p>
                <h2 class="font-medium">{{ t('journey_recovery_context') }}</h2>
                <button
                  v-for="item in nutritionRecoveryItems"
                  :key="item.id"
                  type="button"
                  class="block w-full text-left border-b border-default py-4"
                  @click="openRecoveryItem(item)"
                >
                  <span class="block text-sm font-medium">{{ item.label }}</span
                  ><span class="block text-xs text-muted mt-1">{{
                    item.description || item.origin
                  }}</span>
                </button>
                <UButton color="neutral" variant="outline" @click="openCreateRecoveryEvent">{{
                  t('journey_log_recovery')
                }}</UButton>
                <UButton to="/chat" color="neutral" variant="link">{{
                  t('journey_ask_coach')
                }}</UButton>
              </div>
            </details>
          </template>
          <template #plan>
            <div class="pt-7 space-y-5">
              <h2 class="text-xl font-medium">{{ t('active_plan_header') }}</h2>
              <p class="text-sm text-muted">
                {{ isCurrentWeek ? t('active_plan_desc_current') : t('active_plan_desc_history') }}
              </p>
              <ClientOnly
                ><NutritionWeeklyPlanDashboard
                  ref="planDashboard"
                  :start-date="weekStartDate"
                  :end-date="weekEndDate"
                  :generating="generatingPlan"
                  @generate-draft="generatePlan"
                  @open-grocery="showGroceryList = true"
                  @suggest-window="openAiHelperForWindow"
                  @prev-week="prevWeek"
                  @next-week="nextWeek"
              /></ClientOnly>
            </div>
          </template>
        </UTabs>
        <UModal
          v-model:open="showGroceryList"
          :title="t('grocery_modal_title')"
          :description="t('grocery_modal_desc')"
          :ui="{ content: 'sm:max-w-2xl' }"
        >
          <template #content>
            <div class="p-6 space-y-4">
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-for="option in groceryRangeOptions"
                  :key="option.value"
                  size="xs"
                  :color="groceryRange === option.value ? 'primary' : 'neutral'"
                  :variant="groceryRange === option.value ? 'solid' : 'soft'"
                  @click="
                    () => {
                      groceryRange = option.value
                    }
                  "
                >
                  {{ option.label }}
                </UButton>
              </div>

              <div
                class="p-4 bg-primary-50 dark:bg-primary-900/20 rounded-xl border border-primary-100 dark:border-primary-800"
              >
                <div class="flex flex-wrap items-baseline gap-3">
                  <span class="text-3xl font-medium text-primary-700 dark:text-primary-300">
                    {{ groceryData.totals.ingredients }}
                  </span>
                  <span class="text-sm text-primary-600/70">ingredients</span>
                  <span class="text-xs text-primary-600/60">
                    from {{ groceryData.totals.meals }} planned meals
                  </span>
                </div>
                <p class="text-xs text-primary-600/60 mt-1 italic">
                  Built from selected planned meals in the chosen range.
                </p>
              </div>

              <div v-if="groceryLoading" class="py-10 flex items-center justify-center">
                <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-gray-400" />
              </div>

              <div v-else-if="!groceryData.items.length" class="py-8 text-center text-gray-500">
                <p>No planned meal ingredients found for this range yet.</p>
                <p class="mt-1 text-xs">
                  {{
                    groceryRange === 'week'
                      ? `The Week range covers the plan week you are viewing (${weekStartDate} – ${weekEndDate}).`
                      : 'The 24h/48h/7d ranges look forward from today — switch to Week to cover the plan week you are viewing.'
                  }}
                </p>
              </div>

              <ul v-else class="space-y-2">
                <li
                  v-for="item in groceryData.items"
                  :key="`${item.ingredient}-${item.unit}`"
                  class="rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2"
                >
                  <div class="flex items-center gap-3">
                    <span class="font-semibold">{{ item.ingredient }}</span>
                    <span class="text-sm text-primary-600 dark:text-primary-400 ml-auto">
                      {{ formatGroceryQuantity(item.quantity)
                      }}{{ item.unit ? ` ${item.unit}` : '' }}
                    </span>
                  </div>
                  <p class="mt-1 text-xs text-gray-500">
                    {{ formatGrocerySources(item.sourceMeals) }}
                  </p>
                </li>
              </ul>

              <div
                class="p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg text-xs text-primary-700 dark:text-primary-300"
              >
                <strong>{{ t('grocery_tip_title') }}</strong> Grocery rows only include ingredients
                from planned meals, not loose targets or recommendation candidates.
              </div>
            </div>
          </template>
        </UModal>

        <!-- AI Meal Helper Modal -->
        <NutritionFoodAiModal
          v-model:open="showAiHelper"
          :date="format(new Date(), 'yyyy-MM-dd')"
          :initial-context="aiHelperContext"
          @updated="refreshData"
        />

        <!-- Meal Recommendation Modal -->
        <NutritionMealRecommendationModal
          v-model:open="showRecommendations"
          :date="recommendationContext.date"
          :target-carbs="recommendationContext.targetCarbs"
          :target-protein="recommendationContext.targetProtein"
          :target-kcal="recommendationContext.targetKcal"
          :window-type="recommendationContext.windowType"
          :window-key="recommendationContext.windowKey"
          :slot-name="recommendationContext.slotName"
          :window-assignments="recommendationContext.windowAssignments"
          :day-target-carbs="recommendationContext.dayTargetCarbs"
          :day-planned-carbs="recommendationContext.dayPlannedCarbs"
          :current-assigned-carbs="recommendationContext.currentAssignedCarbs"
          @updated="refreshData"
        />
      </main>
    </template>
  </UDashboardPanel>

  <NutritionHorizonSettingsModal v-model:open="isHorizonSettingsModalOpen" />
  <RecoveryContextSlideover
    :open="isRecoveryContextOpen"
    :item="selectedRecoveryItem"
    :create-mode="isRecoveryCreateMode"
    @update:open="isRecoveryContextOpen = $event"
    @saved="refreshData"
    @deleted="refreshData"
  />
</template>

<script setup lang="ts">
  import { format, parseISO, addDays, startOfWeek, subDays, isSameWeek } from 'date-fns'
  import { useTranslate } from '@tolgee/vue'
  import RecoveryContextSlideover from '~/components/recovery/RecoveryContextSlideover.vue'
  import { getCalendarActivities } from '~/utils/calendar'
  import { getPlannedWorkoutsWithMissingStartTime } from '~/utils/nutrition-timeline'
  import ChartSettingsModal from '~/components/charts/ChartSettingsModal.vue'
  import NutritionHorizonSettingsModal from '~/components/nutrition/NutritionHorizonSettingsModal.vue'
  import type { RecoveryContextItem } from '~/types/recovery-context'

  const { t } = useTranslate('nutrition')
  const toast = useToast()
  const { trackNutritionView, trackTabFilterChange } = useAnalytics()
  const activeNutritionTab = ref('0')

  definePageMeta({
    middleware: ['auth', 'nutrition-enabled'],
    layout: 'default'
  })

  useHead({
    title: 'Fueling',
    meta: [
      {
        name: 'description',
        content: 'View your 7-day metabolic horizon, fueling periodization, and fluid balance.'
      }
    ]
  })

  const tabs = computed(() => [
    {
      label: t.value('tabs_strategy'),
      icon: 'i-lucide-activity',
      slot: 'strategy'
    },
    {
      label: t.value('tabs_plan'),
      icon: 'i-lucide-calendar-days',
      slot: 'plan'
    }
  ])

  const loadingWave = ref(true)
  const loadingStrategy = ref(true)
  const loadingActiveFeed = ref(true)
  const loadErrors = ref<string[]>([])
  const activeFeedError = ref<string | null>(null)
  const { formatDateUTC, getUserLocalDate } = useFormat()
  const todayLabel = computed(() => formatDateUTC(getUserLocalDate(), 'EEEE, MMM d'))
  const userStore = useUserStore()
  const generatingPlan = ref(false)
  const planDashboard = ref<any>(null)
  const wavePoints = ref<any[]>([])
  const intakeConfidence = ref<{
    measuredDays: number
    totalDays: number
    ratio: number
    level: string
  } | null>(null)

  /**
   * The horizon is mostly inference for most athletes, so it says so. Presenting an assumed curve
   * as a measured one is the difference between a useful projection and a misleading claim.
   */
  const intakeConfidenceNote = computed(() => {
    const c = intakeConfidence.value
    if (!c || c.totalDays === 0 || c.level === 'measured') return null

    const logged = `${c.measuredDays} of ${c.totalDays} days`
    if (c.level === 'inferred') {
      return `Assumes you followed your plan — food logged on ${logged}.`
    }
    return `Partly assumed — food logged on ${logged}.`
  })
  const journeyEvents = ref<any[]>([])
  const waveWorkouts = ref<any[]>([])
  const strategy = ref<any>(null)
  const activeFeed = ref<any>(null)
  const upcomingPlan = ref<any>(null)
  const showGroceryList = ref(false)
  const groceryLoading = ref(false)
  const groceryRange = ref<'week' | '24h' | '48h' | '7d'>('week')
  const groceryData = ref<{ items: any[]; totals: { ingredients: number; meals: number } }>({
    items: [],
    totals: { ingredients: 0, meals: 0 }
  })
  const highlightedDate = ref<string | null>(null)
  const missingPlannedStartActivities = ref<any[]>([])
  const selectedRecoveryItem = ref<RecoveryContextItem | null>(null)
  const isRecoveryContextOpen = ref(false)
  const isRecoveryCreateMode = ref(false)

  const isHorizonSettingsModalOpen = ref(false)

  const defaultChartSettings: any = {
    horizon: {
      smooth: true,
      yScale: 'fixed',
      showMarkers: true,
      showNowLine: true,
      showProjected: true,
      showWorkoutBars: true,
      opacity: 0.1
    }
  }

  const chartSettings = computed(() => {
    const userSettings = userStore.user?.dashboardSettings?.nutritionCharts || {}
    const merged: any = {}
    for (const key in defaultChartSettings) {
      merged[key] = {
        ...defaultChartSettings[key],
        ...(userSettings[key] || {})
      }
    }
    return merged
  })

  function openChartSettings(key: string) {
    if (key === 'horizon') {
      isHorizonSettingsModalOpen.value = true
    }
  }

  const showAiHelper = ref(false)
  const aiHelperContext = ref<any>(null)

  const showRecommendations = ref(false)
  const recommendationContext = ref({
    date: format(new Date(), 'yyyy-MM-dd'),
    targetCarbs: 0,
    targetProtein: 0,
    targetKcal: 0,
    windowType: '',
    windowKey: '',
    slotName: '',
    windowAssignments: [] as any[],
    dayTargetCarbs: 0,
    dayPlannedCarbs: 0,
    currentAssignedCarbs: 0
  })
  const baseDate = ref(new Date())
  const weekStartDate = computed(() =>
    format(startOfWeek(baseDate.value, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  )
  const weekEndDate = computed(() =>
    format(addDays(parseISO(weekStartDate.value), 6), 'yyyy-MM-dd')
  )

  const isCurrentWeek = computed(() => isSameWeek(baseDate.value, new Date(), { weekStartsOn: 1 }))

  function prevWeek() {
    baseDate.value = subDays(baseDate.value, 7)
  }

  function nextWeek() {
    baseDate.value = addDays(baseDate.value, 7)
  }

  const loading = computed(
    () => loadingWave.value || loadingStrategy.value || loadingActiveFeed.value
  )

  const { toggle: toggleTriggerMonitor } = useTriggerMonitor()

  const nutritionOverflowItems = computed(() => [
    [
      {
        label: t.value('nav_history'),
        icon: 'i-lucide-history',
        to: '/nutrition/history'
      },
      {
        label: t.value('journey_tasks'),
        icon: 'i-heroicons-cpu-chip',
        onSelect: () => toggleTriggerMonitor()
      },
      {
        label: t.value('nav_refresh'),
        icon: 'i-lucide-refresh-cw',
        onSelect: () => {
          void refreshData()
        }
      },
      {
        label: t.value('grocery_button'),
        icon: 'i-lucide-shopping-cart',
        onSelect: () => {
          showGroceryList.value = true
        }
      }
    ]
  ])

  const nutritionRecoveryItems = computed<RecoveryContextItem[]>(() =>
    journeyEvents.value.map((event: any) => ({
      id: `recovery:journey:${event.id}`,
      sourceRecordId: event.id,
      kind: 'journey_event',
      sourceType: 'manual_event',
      label: `${String(event.category || 'Event').replace(/_/g, ' ')} ${event.severity}/10`,
      description: event.description || 'Logged manually',
      severity: event.severity || null,
      startAt: new Date(event.timestamp).toISOString(),
      endAt: new Date(event.timestamp).toISOString(),
      isRange: false,
      editable: true,
      deletable: true,
      color: 'rgba(249, 115, 22, 0.18)',
      icon: 'i-lucide-heart-pulse',
      overlayStyle: 'marker',
      origin: 'Logged manually',
      category: event.category || null,
      metadata: {
        eventType: event.eventType,
        metabolicSnapshot: event.metabolicSnapshot
      }
    }))
  )

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

  function getWaveDateRange() {
    const dateKeys = wavePoints.value
      .map((p: any) => p?.dateKey)
      .filter((key: any) => typeof key === 'string')
      .sort()

    if (dateKeys.length > 0) {
      return {
        startDate: dateKeys[0],
        endDate: dateKeys[dateKeys.length - 1]
      }
    }

    return {
      startDate: format(addDays(new Date(), -1), 'yyyy-MM-dd'),
      endDate: format(addDays(new Date(), 3), 'yyyy-MM-dd')
    }
  }

  async function refreshMissingStartTimeWarning() {
    try {
      const { startDate, endDate } = getWaveDateRange()
      const calendarData = await ($fetch as any)('/api/calendar', {
        query: { startDate, endDate }
      })
      missingPlannedStartActivities.value = getPlannedWorkoutsWithMissingStartTime(
        getCalendarActivities(calendarData)
      )
    } catch (error) {
      console.error('Failed to evaluate planned workouts without start time:', error)
      missingPlannedStartActivities.value = []
    }
  }

  async function refreshData() {
    loadingWave.value = true
    loadingStrategy.value = true
    loadingActiveFeed.value = true
    loadErrors.value = []
    activeFeedError.value = null

    try {
      const [waveRes, strategyRes, feedRes, upcomingRes] = await Promise.allSettled([
        $fetch<any, string & {}>('/api/nutrition/extended-wave', { query: { daysAhead: 3 } }),
        $fetch<any, string & {}>('/api/nutrition/strategy'),
        $fetch<any, string & {}>('/api/nutrition/active-feed'),
        $fetch<any, string & {}>('/api/nutrition/upcoming-plan')
      ])

      if (waveRes.status === 'fulfilled') {
        wavePoints.value = (waveRes.value as any).points || []
        intakeConfidence.value = (waveRes.value as any).intakeConfidence || null
        journeyEvents.value = (waveRes.value as any).journeyEvents || []
        waveWorkouts.value = (waveRes.value as any).workouts || []
        await refreshMissingStartTimeWarning()
      } else {
        console.error('Failed to load extended wave:', waveRes.reason)
        wavePoints.value = []
        journeyEvents.value = []
        waveWorkouts.value = []
        missingPlannedStartActivities.value = []
        loadErrors.value.push(t.value('load_error_wave'))
      }

      if (strategyRes.status === 'fulfilled') {
        strategy.value = strategyRes.value
      } else {
        console.error('Failed to load strategy:', strategyRes.reason)
        strategy.value = null
        loadErrors.value.push(t.value('load_error_strategy'))
      }

      if (feedRes.status === 'fulfilled') {
        activeFeed.value = feedRes.value
      } else {
        console.error('Failed to load active feed:', feedRes.reason)
        activeFeed.value = null
        activeFeedError.value = t.value('load_error_feed')
        loadErrors.value.push(t.value('load_error_feed'))
      }

      if (upcomingRes.status === 'fulfilled') {
        upcomingPlan.value = upcomingRes.value
      } else {
        console.error('Failed to load upcoming plan:', upcomingRes.reason)
        upcomingPlan.value = null
        loadErrors.value.push(t.value('load_error_upcoming'))
      }
    } catch (e) {
      console.error('Failed to load nutrition strategy:', e)
    } finally {
      loadingWave.value = false
      loadingStrategy.value = false
      loadingActiveFeed.value = false
    }
  }

  async function generatePlan() {
    generatingPlan.value = true
    try {
      await $fetch<any, string & {}>('/api/nutrition/plan/generate', {
        method: 'POST',
        body: { startDate: weekStartDate.value, endDate: weekEndDate.value }
      })

      if (planDashboard.value) {
        planDashboard.value.refresh()
      }

      toast.add({
        title: t.value('plan_generate_success_title'),
        description: t.value('plan_generate_success_description'),
        color: 'success'
      })
    } catch (e: any) {
      console.error('Failed to generate plan:', e)
      toast.add({
        title: t.value('plan_generate_failed_title'),
        description: e?.data?.message || t.value('plan_generate_failed_description'),
        color: 'error'
      })
    } finally {
      generatingPlan.value = false
    }
  }

  onMounted(() => {
    trackNutritionView('index')
    refreshData()
  })

  watch(activeNutritionTab, (tab) => {
    trackTabFilterChange('nutrition', 'tab', tab === '0' ? 'strategy' : 'plan')
  })

  function openAiHelper(context: any) {
    // If we have targetCarbs and windowType, it's a recommendation request
    if ((context.carbs || context.targetCarbs) && (context.basedOnWindowType || context.type)) {
      recommendationContext.value = {
        date: context.date || format(new Date(), 'yyyy-MM-dd'),
        targetCarbs: context.carbs || context.targetCarbs,
        targetProtein: context.protein || context.targetProtein || 0,
        targetKcal: context.kcal || context.targetKcal || 0,
        windowType: context.basedOnWindowType || context.type,
        windowKey:
          context.windowKey ||
          context.basedOnWindowKey ||
          context.basedOnWindowType ||
          context.type,
        slotName: context.slotName || context.label || '',
        windowAssignments: Array.isArray(context.windowAssignments)
          ? context.windowAssignments
          : [],
        dayTargetCarbs: context.dayTargetCarbs || 0,
        dayPlannedCarbs: context.dayPlannedCarbs || 0,
        currentAssignedCarbs: context.currentAssignedCarbs || 0
      }
      showRecommendations.value = true
      return
    }

    // Otherwise, it's for general AI help/logging
    aiHelperContext.value = {
      type: 'suggestion',
      targetCarbs: context.carbs,
      windowType: context.basedOnWindowType,
      item: context.item
    }
    showAiHelper.value = true
  }

  function openAiHelperForWindow(window: any) {
    // This is the new recommendation flow
    const dateFromWindow =
      window.dateKey ||
      (typeof window.startTime === 'string' && window.startTime.length >= 10
        ? window.startTime.slice(0, 10)
        : format(new Date(), 'yyyy-MM-dd'))

    recommendationContext.value = {
      date: dateFromWindow,
      targetCarbs: window.targetCarbs,
      targetProtein: window.targetProtein || 0,
      targetKcal: window.targetKcal || 0,
      windowType: window.type,
      windowKey: window.windowKey || window.type,
      slotName: window.slotName || window.label || '',
      windowAssignments: Array.isArray(window.windowAssignments) ? window.windowAssignments : [],
      dayTargetCarbs: window.dayTargetCarbs || 0,
      dayPlannedCarbs: window.dayPlannedCarbs || 0,
      currentAssignedCarbs: window.currentAssignedCarbs || 0
    }
    showRecommendations.value = true
  }

  const hydrationAdvice = computed(() => {
    if (!strategy.value || !Number.isFinite(strategy.value.hydrationDebt)) {
      return t.value('hydration_advice_unavailable')
    }
    const debt = strategy.value.hydrationDebt
    if (debt > 2000) return t.value('hydration_advice_severe')
    if (debt > 1500) return t.value('hydration_advice_high')
    if (debt > 500) return t.value('hydration_advice_moderate')
    return t.value('hydration_advice_optimal')
  })

  const hydrationStatus = computed(() => strategy.value?.hydrationStatus || 'green')
  const hydrationRingClass = computed(() => {
    if (hydrationStatus.value === 'red') {
      return 'border-error-500 bg-error-50 dark:bg-error-900/20'
    }
    if (hydrationStatus.value === 'yellow') {
      return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20'
    }
    return 'border-success-500 bg-success-50 dark:bg-success-900/20'
  })

  async function resetHydrationDebt() {
    try {
      await $fetch<any, string & {}>('/api/nutrition/hydration-reset', { method: 'POST' })
      await refreshData()
      toast.add({
        title: t.value('hydration_reset_success_title'),
        description: t.value('hydration_reset_success_description'),
        color: 'success'
      })
    } catch (error: any) {
      console.error('Failed to reset hydration debt:', error)
      toast.add({
        title: t.value('hydration_reset_failed_title'),
        description: error?.data?.message || t.value('hydration_reset_failed_description'),
        color: 'error'
      })
    }
  }

  const groceryRangeOptions = [
    { value: 'week', label: 'Week' },
    { value: '24h', label: '24h' },
    { value: '48h', label: '48h' },
    { value: '7d', label: '7d' }
  ] as const

  function getGroceryRangeDates() {
    // 'week' covers the plan week currently shown in the dashboard; the hour-based
    // options roll forward from today. The API treats `end` as inclusive end-of-day.
    if (groceryRange.value === 'week') {
      return { start: weekStartDate.value, end: weekEndDate.value }
    }
    const start = format(new Date(), 'yyyy-MM-dd')
    if (groceryRange.value === '24h') {
      return { start, end: start }
    }
    if (groceryRange.value === '7d') {
      return { start, end: format(addDays(new Date(), 6), 'yyyy-MM-dd') }
    }
    return { start, end: format(addDays(new Date(), 1), 'yyyy-MM-dd') }
  }

  async function loadGroceryList() {
    groceryLoading.value = true
    try {
      const range = getGroceryRangeDates()
      const response = await $fetch<any, string & {}>('/api/nutrition/grocery', {
        query: range
      })
      groceryData.value = {
        items: (response as any).items || [],
        totals: (response as any).totals || { ingredients: 0, meals: 0 }
      }
    } catch (error: any) {
      console.error('Failed to load grocery list:', error)
      groceryData.value = {
        items: [],
        totals: { ingredients: 0, meals: 0 }
      }
      toast.add({
        title: t.value('grocery_load_failed_title'),
        description: error?.data?.message || t.value('grocery_load_failed_description'),
        color: 'error'
      })
    } finally {
      groceryLoading.value = false
    }
  }

  function formatGroceryQuantity(value: number) {
    if (!Number.isFinite(value)) return '0'
    return Math.round(value * 10) / 10
  }

  function formatGrocerySources(sourceMeals: Array<{ date: string; title: string }> = []) {
    return sourceMeals.map((meal) => `${meal.date} • ${meal.title}`).join(' · ')
  }

  watch(showGroceryList, (open) => {
    if (open) {
      loadGroceryList()
    }
  })

  watch(groceryRange, () => {
    if (showGroceryList.value) {
      loadGroceryList()
    }
  })
</script>

<style scoped>
  .nutrition-journey {
    width: 100%;
    max-width: 850px;
    margin-inline: auto;
    padding: 2rem 1.25rem 4rem;
  }
  .nutrition-journey__disclosure {
    border-top: 1px solid var(--ui-border);
  }
  .nutrition-journey__disclosure summary {
    padding-block: 1.25rem;
    cursor: pointer;
    font-size: 0.95rem;
    font-weight: 500;
  }
  summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 3px;
  }
  @media (min-width: 640px) {
    .nutrition-journey {
      padding-inline: 2rem;
    }
  }
</style>
