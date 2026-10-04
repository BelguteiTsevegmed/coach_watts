<template>
  <div
    ref="dayCell"
    data-testid="calendar-day-cell"
    :data-date="dayDateKey"
    :data-fuel-state="fuelState ?? ''"
    :data-today="isToday ? 'true' : undefined"
    class="group/day min-h-[140px] p-1.5 transition-colors flex flex-col relative"
    :class="[
      isDayDragOver
        ? 'bg-gray-100 dark:bg-gray-800 ring-2 ring-primary-500 ring-inset'
        : isToday
          ? 'today-cell bg-primary-50 dark:bg-primary-500/10 ring-2 ring-inset ring-primary-500/60 z-10'
          : 'bg-white dark:bg-gray-900',
      isOtherMonth ? 'opacity-50' : ''
    ]"
    @dragover.prevent="onDayDragOver"
    @dragenter.prevent="onDayDragEnter"
    @dragleave="onDayDragLeave"
    @drop="onDayDrop"
  >
    <!-- Date number (+ optional fuel state and wellness) -->
    <div class="flex items-start justify-between gap-1 mb-1.5 min-h-6">
      <div class="flex items-center gap-1.5 shrink-0">
        <div class="relative">
          <span
            class="text-xs font-semibold flex items-center justify-center min-w-6 h-6 px-1 rounded-full"
            :class="{
              'bg-primary-500 text-white shadow-sm': isToday,
              'text-gray-400 dark:text-gray-500': isOtherMonth && !isToday,
              'text-gray-700 dark:text-gray-300': !isOtherMonth && !isToday
            }"
          >
            {{ dayNumber }}
          </span>

          <!-- Fuel State Dot (opt-in, nutrition only) -->
          <div
            v-if="fuelState && display.showFuelState"
            class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900"
            :class="{
              'bg-blue-500': fuelState === 1,
              'bg-orange-500': fuelState === 2,
              'bg-red-500': fuelState === 3
            }"
            :title="`Fuel State ${fuelState}`"
          />
        </div>
        <span
          v-if="isToday"
          class="text-[10px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400"
        >
          {{ t('day_today') }}
        </span>
        <UButton
          v-if="canAddSession"
          icon="i-heroicons-plus"
          color="neutral"
          variant="ghost"
          size="xs"
          class="h-6 w-6 justify-center p-0 opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100"
          :aria-label="t('day_add_session')"
          :title="t('day_add_session')"
          data-testid="calendar-day-add"
          @click.stop="$emit('add-session', date)"
        />
      </div>

      <!-- Wellness Metrics (opt-in) -->
      <button
        v-if="dayWellness && display.showWellness"
        type="button"
        class="ml-auto flex flex-wrap justify-end items-center gap-x-1.5 gap-y-0.5 text-[10px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
        :title="t('day_wellness_details')"
        @click="
          () => {
            void $emit('wellness-click', date)
          }
        "
      >
        <span v-if="dayWellness.hrv != null" class="flex items-center gap-0.5" title="HRV">
          <UIcon name="i-heroicons-heart" class="w-2.5 h-2.5" />
          <span class="font-medium">{{ Math.round(dayWellness.hrv) }}</span>
        </span>
        <span v-if="dayWellness.hoursSlept != null" class="flex items-center gap-0.5">
          <UIcon name="i-heroicons-moon" class="w-2.5 h-2.5" />
          <span class="font-medium">{{ dayWellness.hoursSlept.toFixed(1) }}</span>
        </span>
        <span v-if="dayWellness.restingHr != null" class="flex items-center gap-0.5">
          <UIcon name="i-heroicons-heart-20-solid" class="w-2.5 h-2.5" />
          <span class="font-medium">{{ dayWellness.restingHr }}</span>
        </span>
        <span v-if="dayWellness.weight != null" class="flex items-center gap-0.5">
          <UIcon name="i-heroicons-scale" class="w-2.5 h-2.5" />
          <span class="font-medium">{{ formatWeight(dayWellness.weight, false) }}</span>
        </span>
      </button>
    </div>

    <!-- Sessions (flex-1 pushes the optional fuel targets to the bottom) -->
    <div class="flex-1 flex flex-col min-h-0">
      <template v-for="(group, gIdx) in layoutGroups" :key="gIdx">
        <div v-if="group.type === 'spacer'" :class="group.class" aria-hidden="true" />

        <div v-else class="flex flex-col gap-1 shrink-0">
          <div
            v-for="activity in group.activities"
            :key="activity.id"
            role="button"
            tabindex="0"
            data-testid="calendar-session"
            :data-status="getSessionStatus(activity)"
            class="group/session relative w-full shrink-0 text-left rounded-md border-l-[3px] px-1.5 py-1 text-xs transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary-500"
            :class="[
              getSessionStatusStyle(getSessionStatus(activity)).card,
              isDragOver === activity.id ? 'ring-2 ring-primary-500 ring-offset-1' : ''
            ]"
            @click="
              () => {
                void $emit('activity-click', activity)
              }
            "
            @keydown.enter.self.prevent="$emit('activity-click', activity)"
            @keydown.space.self.prevent="$emit('activity-click', activity)"
            @dragover.prevent="onDragOver"
            @dragleave="onDragLeave"
            @drop.stop="(e) => onDrop(e, activity)"
          >
            <!-- Hover actions: save to library, drag to move/link/merge -->
            <div
              class="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 rounded-md bg-white/95 dark:bg-gray-900/95 p-0.5 shadow-sm ring-1 ring-black/5 dark:ring-white/10 opacity-0 transition-opacity group-hover/session:opacity-100 focus-within:opacity-100"
            >
              <UButton
                v-if="activity.source === 'planned' || activity.source === 'completed'"
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-document-plus"
                :loading="savingActivityId === activity.id"
                :disabled="savingActivityId === activity.id"
                :title="
                  activity.source === 'planned'
                    ? t('session_save_plan_to_library')
                    : t('session_save_to_library')
                "
                :aria-label="
                  activity.source === 'planned'
                    ? t('session_save_plan_to_library')
                    : t('session_save_to_library')
                "
                class="h-6 w-6 p-0 justify-center"
                @click.stop="$emit('save-to-library', activity)"
                @keydown.stop
              />
              <div
                v-if="
                  activity.source === 'completed' ||
                  (activity.source === 'planned' && activity.status !== 'completed')
                "
                class="cursor-grab rounded p-1 hover:bg-black/5 dark:hover:bg-white/10 active:cursor-grabbing"
                :draggable="true"
                :title="t('session_drag_hint')"
                @dragstart.stop="(e) => onDragStart(e, activity)"
                @click.stop
              >
                <UIcon name="i-heroicons-bars-2" class="w-3 h-3 text-gray-400" />
              </div>
            </div>

            <div class="flex items-start gap-1.5">
              <UIcon
                :name="getEntryIcon(activity)"
                class="w-3.5 h-3.5 mt-px shrink-0"
                :class="getSessionStatusStyle(getSessionStatus(activity)).icon"
              />

              <div class="flex-1 min-w-0">
                <!-- Title (wraps to two lines) + status mark -->
                <div class="flex items-start gap-1">
                  <span
                    class="flex-1 min-w-0 font-medium leading-snug line-clamp-2 break-words text-gray-900 dark:text-gray-100"
                    :title="activity.title"
                  >
                    {{ activity.title }}
                  </span>
                  <UIcon
                    v-if="getSessionStatus(activity) === 'completed'"
                    name="i-heroicons-check-circle-solid"
                    class="w-3.5 h-3.5 mt-px shrink-0 text-green-500"
                    :aria-label="t('status_done')"
                  />
                  <UIcon
                    v-if="activity.isWeeklyNote"
                    name="i-heroicons-calendar-days"
                    class="w-3 h-3 mt-0.5 shrink-0 text-primary-500"
                    :title="t('session_weekly_note')"
                  />
                </div>

                <!-- Note Category -->
                <div
                  v-if="activity.source === 'note' && activity.category"
                  class="text-[9px] uppercase tracking-wider text-gray-400 font-bold"
                >
                  {{ activity.category }}
                </div>

                <!-- Duration · distance (+ details when enabled) -->
                <div
                  v-if="getSessionMeta(activity).length > 0"
                  class="flex flex-wrap items-center gap-x-1 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5"
                >
                  <template v-for="(item, i) in getSessionMeta(activity)" :key="i">
                    <span v-if="i > 0" class="opacity-50" aria-hidden="true">·</span>
                    <span class="inline-flex items-center gap-0.5" :class="item.class">
                      <UIcon v-if="item.icon" :name="item.icon" class="w-2.5 h-2.5" />
                      <span>{{ item.label }}</span>
                    </span>
                  </template>
                </div>

                <!-- The plan this workout completed -->
                <div
                  v-if="getLinkedPlanTitle(activity)"
                  class="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400"
                  :title="t('session_planned_as', { title: getLinkedPlanTitle(activity) })"
                >
                  <UIcon name="i-heroicons-link" class="w-2.5 h-2.5 shrink-0" />
                  <span class="truncate">{{ getLinkedPlanTitle(activity) }}</span>
                </div>

                <!-- Fitness / fatigue / form after this workout (opt-in) -->
                <div
                  v-if="
                    display.showTrainingStress &&
                    activity.source === 'completed' &&
                    (activity.ctl || activity.atl)
                  "
                  class="flex flex-wrap items-center gap-x-1.5 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5"
                >
                  <UTooltip v-if="activity.ctl" :text="t('load_fitness_hint')">
                    <span>
                      {{ t('load_fitness') }}
                      <span class="font-semibold text-gray-700 dark:text-gray-200">{{
                        Math.round(activity.ctl)
                      }}</span>
                    </span>
                  </UTooltip>
                  <UTooltip v-if="activity.atl" :text="t('load_fatigue_hint')">
                    <span>
                      {{ t('load_fatigue') }}
                      <span class="font-semibold text-gray-700 dark:text-gray-200">{{
                        Math.round(activity.atl)
                      }}</span>
                    </span>
                  </UTooltip>
                  <UTooltip v-if="activity.ctl && activity.atl" :text="t('load_form_hint')">
                    <span>
                      {{ t('load_form') }}
                      <span
                        class="font-semibold"
                        :class="getFormColorClass(activity.ctl - activity.atl)"
                        >{{ formatSigned(activity.ctl - activity.atl) }}</span
                      >
                    </span>
                  </UTooltip>
                </div>

                <!-- Mini Workout Chart (Structured Planned) -->
                <div
                  v-if="activity.source === 'planned' && hasActivityChartPreview(activity)"
                  class="mt-1.5"
                >
                  <MiniWorkoutChart
                    :workout="activity"
                    :sport-settings="getActivityZones(activity)"
                    :preference="getActivityChartPreference(activity)"
                    class="w-full h-6 opacity-75"
                  />
                </div>

                <!-- Mini Zone Chart (Completed Streams) -->
                <div v-if="activity.source === 'completed' && activity.hasStreams" class="mt-1.5">
                  <MiniZoneChart
                    :workout-id="activity.id"
                    :auto-load="false"
                    :stream-data="streams?.[activity.id]"
                    :user-zones="getActivityZones(activity)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Milestones Section (Goals, Thresholds, PBs) - Shown under workouts -->
      <div v-if="milestones.length > 0" class="mt-1 space-y-0.5">
        <button
          v-for="m in milestones.slice(0, 2)"
          :key="m.id"
          type="button"
          class="w-full flex items-center gap-1.5 px-1.5 py-0.5 rounded transition-colors text-left mb-0.5 last:mb-0"
          :class="{
            'bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50':
              m.source === 'goal',
            'bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50':
              m.source === 'threshold',
            'bg-teal-50 dark:bg-teal-900/30 hover:bg-teal-100 dark:hover:bg-teal-900/50':
              m.source === 'pb'
          }"
          @click.stop="$emit('activity-click', m)"
        >
          <UIcon
            :name="getEntryIcon(m)"
            class="w-3 h-3 shrink-0"
            :class="{
              'text-yellow-600 dark:text-yellow-400': m.source === 'goal',
              'text-purple-600 dark:text-purple-400': m.source === 'threshold',
              'text-teal-600 dark:text-teal-400': m.source === 'pb'
            }"
          />
          <span
            class="text-[10px] font-bold line-clamp-2 break-words"
            :class="{
              'text-yellow-700 dark:text-yellow-300': m.source === 'goal',
              'text-purple-700 dark:text-purple-300': m.source === 'threshold',
              'text-teal-700 dark:text-teal-300': m.source === 'pb'
            }"
          >
            {{ m.title }}
          </span>
        </button>

        <!-- More Milestones Indicator -->
        <button
          v-if="milestones.length > 2"
          type="button"
          class="w-full px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors text-left"
          @click.stop="$emit('activity-click', milestones[2]!)"
        >
          {{ t('day_more_milestones', { count: milestones.length - 2 }) }}
        </button>
      </div>
    </div>

    <!-- Fuel targets (opt-in, nutrition only) - mt-auto pushes to bottom -->
    <div
      v-if="dayNutrition && display.showNutrition"
      class="mt-auto pt-2 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-500 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-b"
      :title="dayNutrition.isEstimate ? 'View estimated fueling plan' : 'View nutrition details'"
      @click.stop="$emit('nutrition-click', date)"
    >
      <div class="grid grid-cols-2 gap-x-2 gap-y-0.5">
        <div v-if="dayNutrition.caloriesGoal != null" class="flex items-center gap-1">
          <UIcon name="i-tabler-flame" class="w-3 h-3" :class="getNutritionClass('calories')" />
          <span class="font-medium" :class="getNutritionClass('calories')">
            {{
              dayNutrition.isEstimate
                ? dayNutrition.caloriesGoal
                : `${dayNutrition.calories ?? 0}/${dayNutrition.caloriesGoal}`
            }}
          </span>
        </div>
        <div v-if="dayNutrition.proteinGoal != null" class="flex items-center gap-1">
          <UIcon name="i-tabler-egg" class="w-3 h-3" :class="getNutritionClass('protein')" />
          <span class="font-medium" :class="getNutritionClass('protein')">
            {{
              dayNutrition.isEstimate
                ? Math.round(dayNutrition.proteinGoal)
                : `${Math.round(dayNutrition.protein ?? 0)}/${Math.round(dayNutrition.proteinGoal)}`
            }}g
          </span>
        </div>
        <div v-if="dayNutrition.carbsGoal != null" class="flex items-center gap-1">
          <UIcon name="i-tabler-bread" class="w-3 h-3" :class="getNutritionClass('carbs')" />
          <span class="font-medium" :class="getNutritionClass('carbs')">
            {{
              dayNutrition.isEstimate
                ? Math.round(dayNutrition.carbsGoal)
                : `${Math.round(dayNutrition.carbs ?? 0)}/${Math.round(dayNutrition.carbsGoal)}`
            }}g
          </span>
        </div>
        <div v-if="dayNutrition.fatGoal != null" class="flex items-center gap-1">
          <UIcon name="i-tabler-droplet" class="w-3 h-3" :class="getNutritionClass('fat')" />
          <span class="font-medium" :class="getNutritionClass('fat')">
            {{
              dayNutrition.isEstimate
                ? Math.round(dayNutrition.fatGoal)
                : `${Math.round(dayNutrition.fat ?? 0)}/${Math.round(dayNutrition.fatGoal)}`
            }}g
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import type { CalendarActivity } from '~/types/calendar'
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import MiniZoneChart from '~/components/MiniZoneChart.vue'
  import { getSportSettingsForActivity } from '~/utils/sportSettings'
  import { getWorkoutChartPreference } from '~/utils/workoutChartContext'
  import {
    getStructuredWorkoutObject,
    hasStructuredWorkoutPreviewData
  } from '~/utils/structuredWorkout'
  import {
    formatSessionDistance,
    formatSessionDuration,
    formatSigned,
    getEntryIcon,
    getFormColorClass,
    getSessionDistanceMeters,
    getSessionDurationSeconds,
    getSessionStatus,
    getSessionStatusStyle,
    resolveActivityCalendarSettings,
    type ActivityCalendarSettings
  } from '~/utils/calendarDisplay'

  const { t } = useTranslate('activities')
  const { formatDate, formatDateUTC, formatTime, getUserLocalDate, formatWeight } = useFormat()
  const userStore = useUserStore()

  const props = defineProps<{
    date: Date
    activities: CalendarActivity[]
    isOtherMonth: boolean
    streams?: Record<string, any>
    userZones?: any
    allSportSettings?: any[]
    settings?: Partial<ActivityCalendarSettings> | null
    savingActivityId?: string | null
  }>()

  // Calm by default: anything not explicitly switched on in the calendar settings stays hidden.
  const display = computed(() => resolveActivityCalendarSettings(props.settings))

  const emit = defineEmits<{
    'activity-click': [activity: CalendarActivity]
    'wellness-click': [date: Date]
    'nutrition-click': [date: Date]
    'merge-activity': [data: { source: CalendarActivity; target: CalendarActivity }]
    'link-activity': [data: { planned: CalendarActivity; completed: CalendarActivity }]
    'reschedule-activity': [data: { activity: { id: string; source: string }; date: Date }]
    'schedule-template': [data: { template: any; date: Date }]
    'save-to-library': [activity: CalendarActivity]
    'add-session': [date: Date]
  }>()

  function getActivityZones(activity: CalendarActivity) {
    if (!props.allSportSettings) return props.userZones

    const settings = getSportSettingsForActivity(props.allSportSettings, activity.type || '')
    if (!settings) return props.userZones

    return {
      ...settings,
      hrZones: settings.hrZones,
      powerZones: settings.powerZones,
      paceZones: settings.paceZones,
      ftp: settings.ftp,
      lthr: settings.lthr,
      maxHr: settings.maxHr,
      thresholdPace: settings.thresholdPace,
      targetPolicy: settings.targetPolicy,
      loadPreference: settings.loadPreference
    }
  }

  function hasActivityChartPreview(activity: CalendarActivity) {
    return hasStructuredWorkoutPreviewData(activity)
  }

  function collectStructuredMetricAvailability(activity: CalendarActivity) {
    const structuredWorkout = getStructuredWorkoutObject(activity)
    const steps = Array.isArray(structuredWorkout?.steps) ? structuredWorkout.steps : []

    const visit = (nodes: any[]): { hasHr: boolean; hasPower: boolean; hasPace: boolean } => {
      let hasHr = false
      let hasPower = false
      let hasPace = false

      nodes.forEach((step: any) => {
        if (step?.heartRate) hasHr = true
        if (step?.power) hasPower = true
        if (step?.pace) hasPace = true

        if (Array.isArray(step?.steps) && step.steps.length > 0) {
          const nested = visit(step.steps)
          hasHr = hasHr || nested.hasHr
          hasPower = hasPower || nested.hasPower
          hasPace = hasPace || nested.hasPace
        }
      })

      return { hasHr, hasPower, hasPace }
    }

    return visit(steps)
  }

  function getActivityChartPreference(activity: CalendarActivity): 'hr' | 'power' | 'pace' {
    return getWorkoutChartPreference(
      activity,
      getActivityZones(activity),
      collectStructuredMetricAvailability(activity)
    )
  }

  const dayNumber = computed(() => formatDateUTC(props.date, 'd'))
  const isDragOver = ref<string | null>(null)
  const isDayDragOver = ref(false)

  function onDragStart(event: DragEvent, activity: CalendarActivity) {
    if (event.dataTransfer) {
      event.dataTransfer.setData(
        'application/json',
        JSON.stringify({
          id: activity.id,
          title: activity.title,
          source: activity.source,
          date: activity.date // Include date to check if it's a reschedule
        })
      )
      event.dataTransfer.effectAllowed = 'move' // Use move since we can also reschedule
    }
  }

  function onDragOver(event: DragEvent) {
    // Logic could be improved to check if valid target, but for now allow visual feedback
  }

  function onDragLeave(event: DragEvent) {
    // Reset specific drag over state if implemented per-card
  }

  function onDrop(event: DragEvent, targetActivity: CalendarActivity) {
    if (event.dataTransfer) {
      const data = event.dataTransfer.getData('application/json')
      if (data) {
        try {
          const sourceActivity = JSON.parse(data)

          if (sourceActivity.source === 'library-template' && sourceActivity.template) {
            emit('schedule-template', {
              template: sourceActivity.template,
              date: props.date
            })
            return
          }

          if (sourceActivity.id === targetActivity.id) return

          // Case 1: Linking a planned workout to a completed workout
          if (sourceActivity.source === 'planned' && targetActivity.source === 'completed') {
            emit('link-activity', {
              planned: sourceActivity,
              completed: targetActivity
            })
            return
          }

          // Case 2: Merging two completed workouts
          if (sourceActivity.source === 'completed' && targetActivity.source === 'completed') {
            emit('merge-activity', {
              source: sourceActivity,
              target: targetActivity
            })
          }
        } catch (e) {
          console.error('Error parsing drop data', e)
        }
      }
    }
  }

  // Day cell drag handlers for rescheduling
  function onDayDragOver(event: DragEvent) {
    // Check if dragging a planned workout (optional: inspect DataTransfer items if needed)
    // For now, just allow dropping
    // isDayDragOver.value = true // Handled in DragEnter to avoid flickering?
    // dragover fires continuously
  }

  function onDayDragEnter(event: DragEvent) {
    isDayDragOver.value = true
  }

  function onDayDragLeave(event: DragEvent) {
    // Check if we are really leaving the element and not entering a child
    if (
      event.relatedTarget &&
      (event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)
    ) {
      return
    }
    isDayDragOver.value = false
  }

  function onDayDrop(event: DragEvent) {
    isDayDragOver.value = false
    if (event.dataTransfer) {
      const data = event.dataTransfer.getData('application/json')
      if (data) {
        try {
          const sourceActivity = JSON.parse(data)

          if (sourceActivity.source === 'library-template' && sourceActivity.template) {
            emit('schedule-template', {
              template: sourceActivity.template,
              date: props.date
            })
            return
          }

          // Only allow rescheduling planned workouts
          if (sourceActivity.source === 'planned') {
            const targetDateStr = formatDateUTC(props.date, 'yyyy-MM-dd')
            const sourceDateStr = sourceActivity.date
              ? formatDateUTC(new Date(sourceActivity.date), 'yyyy-MM-dd')
              : ''

            // Only emit if the date has changed
            if (sourceDateStr !== targetDateStr) {
              emit('reschedule-activity', {
                activity: sourceActivity,
                date: props.date
              })
            }
          }
        } catch (e) {
          console.error('Error parsing drop data', e)
        }
      }
    }
  }

  const isToday = computed(() => {
    return (
      formatDateUTC(props.date, 'yyyy-MM-dd') === formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
    )
  })

  // Sessions can be added from today onwards; past days are logged by uploading a workout.
  const canAddSession = computed(
    () => formatDateUTC(props.date, 'yyyy-MM-dd') >= formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
  )

  // Filter out wellness dummy activities and milestones for display in the main activity list
  const displayActivities = computed(() => {
    return props.activities
      .filter((a) => a.type !== 'wellness' && !['goal', 'threshold', 'pb'].includes(a.source))
      .sort((a, b) => {
        return getActivityStartTimeSortKey(a).localeCompare(getActivityStartTimeSortKey(b))
      })
  })

  // Milestones (Goals, Thresholds, PBs) shown below workouts
  const milestones = computed(() => {
    return props.activities
      .filter((a) => ['goal', 'threshold', 'pb'].includes(a.source))
      .sort((a, b) => {
        // Prioritize FTP changes at the top
        const isAFtp = a.source === 'threshold' && a.metric === 'FTP'
        const isBFtp = b.source === 'threshold' && b.metric === 'FTP'
        if (isAFtp && !isBFtp) return -1
        if (!isAFtp && isBFtp) return 1

        // Then Goals (Events)
        if (a.source === 'goal' && b.source !== 'goal') return -1
        if (a.source !== 'goal' && b.source === 'goal') return 1

        // Then by importance (Priority)
        if (a.priority === 'HIGH' && b.priority !== 'HIGH') return -1
        if (a.priority !== 'HIGH' && b.priority === 'HIGH') return 1

        return 0
      })
  })

  const timeBuckets = computed(() => {
    const buckets = {
      morning: [] as CalendarActivity[],
      midday: [] as CalendarActivity[],
      evening: [] as CalendarActivity[]
    }

    displayActivities.value.forEach((activity) => {
      // Parse time
      let hour = 12 // Default to midday if unknown

      const sortKey = getActivityStartTimeSortKey(activity)
      if (sortKey.includes(':')) {
        hour = parseInt(sortKey.split(':')[0] || '12')
      }

      if (hour < 11) {
        buckets.morning.push(activity)
      } else if (hour < 16) {
        buckets.midday.push(activity)
      } else {
        buckets.evening.push(activity)
      }
    })

    return buckets
  })

  const layoutGroups = computed(() => {
    if (display.value.alignActivitiesByTime) {
      return [
        { type: 'bucket' as const, activities: timeBuckets.value.morning },
        { type: 'spacer' as const, class: 'flex-1 min-h-1' },
        { type: 'bucket' as const, activities: timeBuckets.value.midday },
        { type: 'spacer' as const, class: 'flex-1 min-h-1' },
        { type: 'bucket' as const, activities: timeBuckets.value.evening }
      ]
    }

    return [{ type: 'bucket' as const, activities: displayActivities.value }]
  })

  // Get nutrition data from any activity on this day (they all have same nutrition data)
  const dayNutrition = computed(() => {
    const activityWithNutrition = props.activities.find((a) => a.nutrition)
    return activityWithNutrition?.nutrition || null
  })

  // Get wellness data from any activity on this day (they all have same wellness data)
  const dayWellness = computed(() => {
    const activityWithWellness = props.activities.find((a) => a.wellness)
    return activityWithWellness?.wellness || null
  })

  const dayDateKey = computed(() => {
    const d = props.date
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${d.getFullYear()}-${month}-${day}`
  })

  const fuelState = computed(() => {
    const nutrition = dayNutrition.value as any
    const plan = nutrition?.fuelingPlan
    if (!plan) return null

    // The plan states the day's fuel state outright.
    const fromPlan = Number(plan.dailyTotals?.fuelState)
    if (Number.isFinite(fromPlan) && fromPlan >= 1) return fromPlan

    // Older plans only carried it inside the intra-workout window's description. Sessions that
    // need no in-session carbohydrate produce no such window, so this is a fallback, not the rule.
    const intraWindow = plan.windows?.find((w: any) => w.type === 'INTRA_WORKOUT')
    if (intraWindow?.description?.includes('Fuel State 3')) return 3
    if (intraWindow?.description?.includes('Fuel State 2')) return 2
    if (intraWindow?.description?.includes('Fuel State 1')) return 1

    return null
  })

  const isNutritionCompliant = computed(() => {
    const nutrition = dayNutrition.value as any
    if (!nutrition || nutrition.isEstimate) return false
    const score = nutrition.overallScore || 0
    return score >= 85
  })

  const isNutritionNonCompliant = computed(() => {
    const nutrition = dayNutrition.value as any
    if (!nutrition || nutrition.isEstimate) return false
    const score = nutrition.overallScore
    return score !== null && score < 70
  })

  interface SessionMetaItem {
    label: string
    icon?: string
    class?: string
  }

  function getSessionMeta(activity: CalendarActivity): SessionMetaItem[] {
    const items: SessionMetaItem[] = []
    const showDetails = display.value.showSessionDetails

    if (getSessionStatus(activity) === 'missed') {
      items.push({
        label: t.value('status_missed'),
        class: 'font-medium text-red-600 dark:text-red-400'
      })
    }

    if (showDetails) {
      const startTime = getActivityStartTime(activity)
      if (startTime) {
        items.push({
          label: startTime,
          icon: 'i-heroicons-clock',
          class: 'text-primary-600 dark:text-primary-400'
        })
      }
    }

    const duration = formatSessionDuration(getSessionDurationSeconds(activity))
    if (duration) items.push({ label: duration })

    const distance = formatSessionDistance(
      getSessionDistanceMeters(activity),
      userStore.profile?.distanceUnits
    )
    if (distance) items.push({ label: distance })

    if (showDetails) {
      if (activity.averageHr) {
        items.push({
          label: Math.round(activity.averageHr).toString(),
          icon: 'i-heroicons-heart',
          class: 'text-red-500 dark:text-red-400'
        })
      }
      const load = activity.tss ?? activity.trimp ?? activity.plannedTss
      if (load) items.push({ label: `${Math.round(load)} TSS` })
    }

    return items
  }

  /** Title of the planned session this workout completed, when it differs from its own. */
  function getLinkedPlanTitle(activity: CalendarActivity): string {
    const title = activity.linkedPlannedWorkout?.title?.trim()
    if (!title || title === activity.title?.trim()) return ''
    return title
  }

  function getActivityStartTime(activity: CalendarActivity): string {
    if (activity.source === 'planned' && activity.startTime) {
      return formatTime(activity.startTime)
    }

    if (activity.source === 'completed' && activity.date) {
      return formatTime(activity.date)
    }

    return ''
  }

  function getActivityStartTimeSortKey(activity: CalendarActivity): string {
    if (activity.startTime && activity.startTime.includes(':')) {
      return activity.startTime.length >= 5 ? activity.startTime.slice(0, 5) : activity.startTime
    }

    return formatDate(activity.date, 'HH:mm') || '12:00'
  }

  function getNutritionClass(metric: 'calories' | 'protein' | 'carbs' | 'fat'): string {
    const nutrition = dayNutrition.value as any
    if (!nutrition) return ''

    // Force gray for all future dates to be subtle
    const todayStr = formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
    const dateStr = formatDateUTC(props.date, 'yyyy-MM-dd')
    if (dateStr > todayStr) {
      return 'text-gray-400 dark:text-gray-500'
    }

    // For estimates on today or past (unlikely but safe), use primary color
    if (nutrition.isEstimate) {
      return 'text-primary-500'
    }

    const actual = nutrition[metric] ?? 0
    const goal = nutrition[`${metric}Goal` as keyof typeof nutrition]

    if (goal == null) return ''

    const percentage = actual / (goal as number)

    // Within 90-110% of goal is good (green)
    if (percentage >= 0.9 && percentage <= 1.1) {
      return 'text-green-600 dark:text-green-400'
    }
    // Within 80-120% is okay (amber)
    else if (percentage >= 0.8 && percentage <= 1.2) {
      return 'text-amber-600 dark:text-amber-400'
    }
    // Outside range is concerning (red)
    else {
      return 'text-red-600 dark:text-red-400'
    }
  }
</script>
