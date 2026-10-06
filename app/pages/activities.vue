<template>
  <UDashboardPanel id="activities">
    <template #body>
      <div class="h-full flex flex-col quick-capture-inset">
        <Head>
          <Title>{{ t('meta_title') }}</Title>
          <Meta name="description" :content="t('meta_description')" />
        </Head>

        <div
          class="space-y-7 px-5 pt-8 sm:px-10 sm:pt-10"
          :class="viewMode === 'calendar' ? '' : 'mx-auto w-full max-w-[52rem]'"
        >
          <div class="flex flex-wrap items-end justify-between gap-5">
            <div class="max-w-xl">
              <h1
                class="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-4xl"
              >
                {{ t('activities_title') }}
              </h1>
              <p class="mt-3 leading-7 text-gray-600 dark:text-gray-400">
                {{ t('training_intro') }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <ClientOnly><DashboardTriggerMonitorButton /></ClientOnly>
              <UButton
                icon="i-heroicons-plus"
                color="primary"
                variant="solid"
                data-testid="calendar-add-session"
                @click="openAddSession()"
                >{{ t('header_add_session') }}</UButton
              >
              <UDropdownMenu :items="activitiesOverflowItems"
                ><UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-heroicons-ellipsis-horizontal"
                  :aria-label="t('header_more_actions')"
                  data-testid="calendar-more-actions"
                  >{{ t('training_actions') }}</UButton
                ></UDropdownMenu
              >
              <UButton
                v-if="viewMode === 'week' && nextWeekSession"
                color="neutral"
                variant="outline"
                :to="`/workouts/planned/${nextWeekSession.id}`"
                >{{ t('review_next_session') }}</UButton
              >
              <UButton v-else-if="viewMode === 'week'" to="/plan" color="primary">{{
                t('plan_week')
              }}</UButton>
            </div>
          </div>
          <div
            class="flex flex-wrap items-center justify-between gap-4"
            data-testid="calendar-toolbar"
          >
            <div class="flex flex-wrap items-center gap-2">
              <label for="training-view" class="sr-only">{{ t('training_view') }}</label>
              <USelect
                id="training-view"
                v-model="viewMode"
                :items="trainingViewOptions"
                value-key="value"
                class="w-32"
                color="neutral"
                variant="outline"
              />
              <UButton
                icon="i-heroicons-chevron-left"
                color="neutral"
                variant="ghost"
                :aria-label="
                  viewMode === 'week' ? t('previous_week') : t('controls_previous_month')
                "
                @click="
                  () => {
                    viewMode === 'week' ? navigateWeek(-1) : prevMonth()
                  }
                "
              />
              <span
                class="min-w-40 text-center text-sm font-medium"
                data-testid="calendar-month-label"
                aria-live="polite"
                >{{ viewMode === 'week' ? currentWeekLabel : currentMonthLabel }}</span
              >
              <UButton
                icon="i-heroicons-chevron-right"
                color="neutral"
                variant="ghost"
                :aria-label="viewMode === 'week' ? t('next_week') : t('controls_next_month')"
                @click="
                  () => {
                    viewMode === 'week' ? navigateWeek(1) : nextMonth()
                  }
                "
              />
              <UButton
                v-if="!isCurrentMonth || (viewMode === 'week' && !isSelectedCurrentWeek)"
                color="neutral"
                variant="ghost"
                data-testid="calendar-today"
                @click="goToToday()"
                >{{ t('controls_today') }}</UButton
              >
            </div>
            <div v-if="viewMode === 'list'" class="flex flex-wrap items-center gap-3">
              <UInput
                v-model="tableSearch"
                icon="i-heroicons-magnifying-glass"
                :placeholder="t('controls_filter_placeholder')"
                :aria-label="t('controls_filter_placeholder')"
                class="w-52"
              />
              <UDropdownMenu
                :items="columnMenuItems"
                :content="{ align: 'end' }"
                :disabled="columnMenuItems.length === 0"
                ><UButton
                  color="neutral"
                  variant="ghost"
                  trailing-icon="i-heroicons-chevron-down"
                  :disabled="columnMenuItems.length === 0"
                  >{{ t('controls_columns') }}</UButton
                ></UDropdownMenu
              >
            </div>
            <div v-else class="flex flex-wrap gap-1">
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-rectangle-stack"
                @click="
                  () => {
                    if (isWorkoutDrawerVisible) isWorkoutDrawerVisible = false
                    else openWorkoutLibrary()
                  }
                "
                >{{ t('controls_workout_library') }}</UButton
              >
              <UButton
                color="neutral"
                variant="ghost"
                icon="i-heroicons-cog-6-tooth"
                :aria-label="t('controls_calendar_settings')"
                data-testid="calendar-settings-button"
                @click="
                  () => {
                    showCalendarSettingsModal = true
                  }
                "
              />
            </div>
          </div>
          <details v-if="viewMode === 'calendar'" class="text-sm">
            <summary
              class="cursor-pointer text-gray-500 focus-visible:outline-2 focus-visible:outline-primary"
            >
              {{ t('calendar_key') }}
            </summary>
            <div class="flex flex-wrap gap-x-6 gap-y-3 py-4 text-gray-600 dark:text-gray-400">
              <span v-for="item in legendItems" :key="item.key" class="flex items-center gap-2"
                ><span class="size-2 rounded-full" :class="item.dot" />{{ item.label }}</span
              >
              <span v-if="calendarSettings.showFuelState">{{ tl('fuel_states') }}</span>
            </div>
          </details>
        </div>

        <!-- Content Area -->
        <div
          class="flex-1 min-h-0 overflow-hidden px-5 py-6 sm:px-10"
          :class="[
            viewMode !== 'list' && isWorkoutDrawerVisible ? 'pb-28 lg:pb-36' : '',
            viewMode === 'list' ? 'mx-auto w-full max-w-[52rem]' : ''
          ]"
        >
          <div v-if="status === 'error'" role="alert" class="space-y-3 py-6">
            <p>{{ t('errors_load_failed') }}</p>
            <UButton color="neutral" variant="outline" @click="handleRefresh()">{{
              t('header_refresh')
            }}</UButton>
          </div>

          <ClientOnly>
            <section
              v-if="viewMode === 'week'"
              class="mx-auto max-w-[52rem] space-y-6 overflow-y-auto h-full"
              :aria-label="t('view_week')"
              data-testid="training-week"
            >
              <p
                v-if="status === 'pending'"
                role="status"
                aria-live="polite"
                class="py-6 text-gray-500"
              >
                {{ t('week_loading') }}
              </p>
              <template v-else-if="status !== 'error'">
                <p class="text-sm leading-6 text-gray-500 dark:text-gray-400">
                  {{
                    t('week_summary', {
                      count: selectedWeekSessionCount,
                      duration: formatDuration(
                        selectedWeekSummary.duration + selectedWeekSummary.plannedDuration
                      )
                    })
                  }}
                </p>
                <div
                  class="divide-y divide-gray-200 border-y border-gray-200 dark:divide-gray-800 dark:border-gray-800"
                >
                  <div
                    v-for="day in selectedWeekDays"
                    :key="getDateKey(day.date)"
                    class="grid grid-cols-1 gap-3 py-5 sm:grid-cols-[140px_1fr] sm:gap-6"
                    :class="isTodayDate(day.date) ? 'text-primary' : ''"
                  >
                    <div>
                      <h2 class="text-sm font-medium">{{ formatDateUTC(day.date, 'EEEE') }}</h2>
                      <p class="mt-1 text-xs text-gray-500">
                        {{ formatDateUTC(day.date, 'MMM d')
                        }}<span v-if="isTodayDate(day.date)">, {{ t('controls_today') }}</span>
                      </p>
                    </div>
                    <div class="space-y-3">
                      <button
                        v-for="activity in day.activities.filter(
                          (a) => a.id && a.type !== 'wellness'
                        )"
                        :key="activity.id"
                        type="button"
                        class="flex w-full items-center justify-between gap-4 py-1 text-left text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary dark:text-white"
                        @click="openWeekActivity(activity)"
                      >
                        <span class="min-w-0"
                          ><span class="block text-sm font-medium">{{ activity.title }}</span
                          ><span class="mt-1 block text-xs text-gray-500"
                            >{{
                              activity.source === 'completed'
                                ? tl('completed')
                                : activity.source === 'planned'
                                  ? tl('plan')
                                  : activity.type
                            }}<span v-if="activity.duration || activity.plannedDuration"
                              >,
                              {{
                                formatDurationCompact(
                                  activity.duration || activity.plannedDuration || 0
                                )
                              }}</span
                            ></span
                          ></span
                        >
                        <UIcon
                          name="i-heroicons-chevron-right"
                          class="size-4 shrink-0 text-gray-400"
                          aria-hidden="true"
                        />
                      </button>
                      <p
                        v-if="
                          day.activities.filter((a) => a.id && a.type !== 'wellness').length === 0
                        "
                        class="text-sm text-gray-500"
                      >
                        {{ t('week_open_day') }}
                      </p>
                      <div
                        v-if="day.activities.some((a) => a.wellness || a.nutrition)"
                        class="flex flex-wrap gap-2"
                      >
                        <UButton
                          v-if="
                            calendarSettings.showWellness && day.activities.some((a) => a.wellness)
                          "
                          color="neutral"
                          variant="link"
                          size="xs"
                          @click="openWellnessModal(day.date)"
                          >{{ t('week_recovery') }}</UButton
                        >
                        <UButton
                          v-if="
                            nutritionEnabled &&
                            calendarSettings.showNutrition &&
                            day.activities.some((a) => a.nutrition)
                          "
                          color="neutral"
                          variant="link"
                          size="xs"
                          @click="openNutrition(day.date)"
                          >{{ t('week_fueling') }}</UButton
                        >
                      </div>
                    </div>
                  </div>
                </div>
                <details>
                  <summary
                    class="cursor-pointer text-sm text-gray-600 focus-visible:outline-2 focus-visible:outline-primary dark:text-gray-400"
                  >
                    {{ t('week_detail') }}
                  </summary>
                  <div class="flex flex-wrap items-center gap-5 py-4 text-sm text-gray-500">
                    <span>{{
                      t('week_load', {
                        load: Math.round(selectedWeekSummary.tss + selectedWeekSummary.plannedTss)
                      })
                    }}</span
                    ><UButton
                      color="neutral"
                      variant="ghost"
                      @click="openWeekZoneDetail(selectedWeekDays)"
                      >{{ t('week_zones') }}</UButton
                    >
                  </div>
                </details>
              </template>
            </section>
            <!-- Calendar View -->
            <div
              v-if="viewMode === 'calendar'"
              class="overflow-x-hidden overflow-y-auto h-full relative lg:overflow-x-auto"
            >
              <!-- Loading Overlay -->
              <div
                v-if="status === 'pending'"
                class="absolute inset-0 z-50 flex items-center justify-center bg-white/50 dark:bg-gray-900/50 backdrop-blur-[1px]"
              >
                <div class="flex flex-col items-center gap-2">
                  <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
                  <span class="text-xs font-medium text-gray-500">{{ t('state_loading') }}</span>
                </div>
              </div>

              <!-- Desktop Grid View (hidden on mobile) -->
              <div
                class="hidden lg:grid grid-cols-[116px_repeat(7,minmax(124px,1fr))] gap-px bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden min-w-[1000px]"
                data-testid="calendar-grid"
              >
                <!-- Header Row -->
                <div
                  class="bg-gray-50 dark:bg-gray-800 px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400"
                >
                  {{ t('controls_week') }}
                </div>
                <div
                  v-for="day in weekDays"
                  :key="day"
                  class="bg-gray-50 dark:bg-gray-800 px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 text-center"
                >
                  {{ day }}
                </div>

                <!-- Week Rows -->
                <template
                  v-for="({ week, summary }, weekIdx) in orderedCalendarWeeksWithSummary"
                  :key="weekIdx"
                >
                  <!-- Week Summary Cell -->
                  <div
                    role="button"
                    tabindex="0"
                    class="bg-gray-50 dark:bg-gray-800/60 p-2 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
                    :title="t('week_open_details')"
                    @click="
                      () => {
                        void openWeekZoneDetail(week)
                      }
                    "
                    @keydown.enter.prevent="openWeekZoneDetail(week)"
                    @keydown.space.prevent="openWeekZoneDetail(week)"
                  >
                    <CalendarWeekSummary
                      v-if="week[0]"
                      :summary="summary"
                      :week-start="week[0].date"
                      :week-end="week[week.length - 1]!.date"
                      :week-number="getWeekNumber(week[0].date)"
                      :is-current-week="isCurrentWeek(week[0].date)"
                      :is-future-week="isFutureWeek(week[0].date)"
                      :settings="calendarSettings"
                      :distance-units="distanceUnits"
                    />
                  </div>

                  <!-- Day Cells -->
                  <CalendarDayCell
                    v-for="day in week"
                    :key="day.date.toISOString()"
                    :date="day.date"
                    :activities="day.activities"
                    :is-other-month="day.isOtherMonth"
                    :is-today="isTodayDate(day.date)"
                    :streams="streamsMap"
                    :user-zones="userZones"
                    :all-sport-settings="allSportSettings"
                    :settings="calendarSettings"
                    :saving-activity-id="savingToLibraryId"
                    @activity-click="openActivity"
                    @wellness-click="openWellnessModal"
                    @nutrition-click="openNutrition"
                    @merge-activity="onMergeActivity"
                    @link-activity="onLinkActivity"
                    @reschedule-activity="onRescheduleActivity"
                    @schedule-template="onScheduleTemplate"
                    @save-to-library="saveActivityToLibrary"
                    @add-session="openAddSession"
                  />

                  <!-- Metabolic Horizon Wave -->
                  <div
                    v-if="calendarSettings.showMetabolicWave"
                    class="col-span-8 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
                  >
                    <CalendarMetabolicWave
                      :week="week"
                      :week-index="weekIdx"
                      :points="metabolicWavePoints"
                      :loading="metabolicWaveStatus === 'pending'"
                    />
                  </div>

                  <!-- Week Spacer -->
                  <div
                    v-if="calendarSettings.showWeekSeparator"
                    class="col-span-8 h-2 bg-gray-100 dark:bg-gray-950"
                  />
                </template>
              </div>

              <!-- Mobile agenda list (calendar view below lg) -->
              <div class="lg:hidden quick-capture-inset" data-testid="calendar-agenda">
                <section
                  v-for="({ week, summary, days, isCurrent }, weekIdx) in agendaWeeks"
                  :key="'mob-week-' + weekIdx"
                  class="pb-2"
                  :data-current-week="isCurrent ? 'true' : undefined"
                >
                  <!-- Sticky week header: opaque, above the cards, never covering them on load -->
                  <div
                    v-if="week[0]"
                    role="button"
                    tabindex="0"
                    class="sticky top-0 z-20 block w-full px-3 py-2 text-left cursor-pointer bg-white dark:bg-gray-900 border-y border-gray-200 dark:border-gray-800"
                    data-testid="calendar-agenda-week-header"
                    :title="t('week_open_details')"
                    @click="
                      () => {
                        void openWeekZoneDetail(week)
                      }
                    "
                    @keydown.enter.prevent="openWeekZoneDetail(week)"
                    @keydown.space.prevent="openWeekZoneDetail(week)"
                  >
                    <CalendarWeekSummary
                      variant="bar"
                      :summary="summary"
                      :week-start="week[0].date"
                      :week-end="week[week.length - 1]!.date"
                      :week-number="getWeekNumber(week[0].date)"
                      :is-current-week="isCurrent"
                      :is-future-week="isFutureWeek(week[0].date)"
                      :settings="calendarSettings"
                      :distance-units="distanceUnits"
                    />
                  </div>

                  <div class="px-3 pt-2 space-y-1">
                    <template v-for="day in days" :key="'mob-day-' + day.key">
                      <div
                        v-if="day.entries.length > 0 || day.isToday || mobileDraggingActivity"
                        :id="day.isToday ? 'mobile-today-anchor' : undefined"
                        :data-mobile-day-key="day.key"
                        :data-today="day.isToday ? 'true' : undefined"
                        class="flex gap-2.5 rounded-lg scroll-mt-14"
                        :class="{
                          'ring-2 ring-primary-500/40 ring-inset':
                            mobileDragTargetDateKey === day.key && mobileDraggingActivity,
                          'opacity-60': day.isOtherMonth
                        }"
                      >
                        <div class="w-11 text-center shrink-0 pt-1">
                          <div
                            class="text-[10px] font-semibold uppercase"
                            :class="
                              day.isToday
                                ? 'text-primary-600 dark:text-primary-400'
                                : 'text-gray-500'
                            "
                          >
                            {{ day.isToday ? t('day_today') : formatDateUTC(day.date, 'EEE') }}
                          </div>
                          <div
                            class="w-8 h-8 mx-auto flex items-center justify-center rounded-full text-sm font-bold mt-0.5"
                            :class="
                              day.isToday
                                ? 'bg-primary-500 text-white shadow-sm'
                                : 'text-gray-700 dark:text-gray-300'
                            "
                          >
                            {{ formatDateUTC(day.date, 'd') }}
                          </div>
                        </div>

                        <div class="flex-1 min-w-0 space-y-1.5 pb-3">
                          <!-- Wellness / fuel chips (opt-in) -->
                          <div v-if="day.chips.length > 0" class="flex gap-2">
                            <button
                              v-for="chip in day.chips"
                              :key="chip.key"
                              type="button"
                              class="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                              :class="chip.class"
                              @click="chip.onClick"
                            >
                              {{ chip.label }}
                            </button>
                          </div>

                          <CalendarAgendaItem
                            v-for="activity in day.entries"
                            :key="activity.id"
                            :activity="activity"
                            :settings="calendarSettings"
                            :distance-units="distanceUnits"
                            :in-comparison="isWorkoutInComparison(activity.id)"
                            :draggable="isMobileDraggableActivity(activity)"
                            :dragging="mobileDraggingActivity?.id === activity.id"
                            :saving="savingToLibraryId === activity.id"
                            @open="openActivity(activity)"
                            @toggle-comparison="toggleWorkoutComparison(activity)"
                            @save-to-library="saveActivityToLibrary(activity)"
                            @drag-start="
                              (event: TouchEvent) => onMobileActivityDragStart(event, activity)
                            "
                            @drag-move="onMobileActivityDragMove"
                            @drag-end="onMobileActivityDragEnd"
                            @drag-cancel="onMobileActivityDragCancel"
                          >
                            <template v-if="hasActivityChartPreview(activity)" #aside>
                              <MiniWorkoutChart
                                :workout="activity"
                                :sport-settings="getActivityZones(activity)"
                                :preference="getActivityChartPreference(activity)"
                                class="hidden sm:block w-16 h-8 self-center opacity-75"
                              />
                            </template>
                          </CalendarAgendaItem>

                          <div
                            v-if="
                              day.isToday && day.entries.length === 0 && !mobileDraggingActivity
                            "
                            class="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400"
                          >
                            {{ t('day_nothing_planned_today') }}
                          </div>

                          <div
                            v-if="mobileDraggingActivity && day.entries.length === 0"
                            class="p-2 rounded-lg border border-dashed border-primary-300/70 text-[11px] text-primary-600 dark:text-primary-400"
                          >
                            {{ t('mobile_drop_here') }}
                          </div>
                        </div>
                      </div>
                    </template>
                  </div>
                </section>
              </div>
            </div>

            <!-- List View -->
            <div
              v-else-if="viewMode === 'list'"
              class="bg-default rounded-xl border border-default shadow overflow-x-auto h-full flex flex-col"
            >
              <UTable
                ref="table"
                v-model:column-visibility="columnVisibility"
                :data="sortedActivities"
                :columns="availableColumns"
                :loading="status === 'pending'"
                class="flex-1 w-full"
                empty="No activities found for this month"
                :ui="{
                  root: 'w-full',
                  base: 'w-full table-auto',
                  th: 'text-left text-xs font-bold uppercase tracking-widest text-muted sticky top-0 bg-default z-10 px-4 py-3 border-b border-default',
                  td: 'text-sm text-default cursor-pointer px-4 py-3',
                  tbody: 'divide-y divide-default'
                }"
                @select="(_, row) => openActivity(row.original)"
              >
                <template #type-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <UIcon :name="getEntryIcon(row.original)" class="w-4 h-4 flex-shrink-0" />
                    <span class="hidden sm:inline">{{ row.original.type }}</span>
                  </div>
                </template>

                <template #date-cell="{ row }">
                  <div class="whitespace-nowrap">
                    {{ formatActivityDateForList(row.original) }}
                  </div>
                </template>

                <template #chart-cell="{ row }">
                  <div v-if="hasActivityChartPreview(row.original)" class="w-24 h-10">
                    <MiniWorkoutChart
                      :workout="row.original"
                      :sport-settings="getActivityZones(row.original)"
                      :preference="getActivityChartPreference(row.original)"
                    />
                  </div>
                  <span v-else class="text-gray-400 text-xs">-</span>
                </template>

                <template #title-cell="{ row }">
                  <div class="flex items-center gap-2">
                    <div class="max-w-xs truncate" :title="row.original.title">
                      {{ row.original.title }}
                    </div>
                    <UButton
                      v-if="row.original.id && row.original.source === 'completed'"
                      :icon="
                        isWorkoutInComparison(row.original.id)
                          ? 'i-lucide-check'
                          : 'i-lucide-git-compare-arrows'
                      "
                      color="neutral"
                      :variant="isWorkoutInComparison(row.original.id) ? 'soft' : 'ghost'"
                      size="xs"
                      @click.stop="toggleWorkoutComparison(row.original)"
                    />
                  </div>
                </template>

                <template #duration-cell="{ row }">
                  <span v-if="row.original.duration || row.original.plannedDuration">
                    {{
                      formatDurationCompact(
                        row.original.duration || row.original.plannedDuration || 0
                      )
                    }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #distance-cell="{ row }">
                  <span
                    v-if="row.original.distance || row.original.plannedDistance"
                    class="whitespace-nowrap"
                  >
                    {{ formatDistance(row.original.distance || row.original.plannedDistance || 0) }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #averageHr-cell="{ row }">
                  <span
                    v-if="row.original.averageHr"
                    class="flex items-center gap-1 text-red-500 dark:text-red-400"
                  >
                    <UIcon name="i-heroicons-heart" class="w-3.5 h-3.5" />
                    <span class="font-medium">{{ Math.round(row.original.averageHr) }}</span>
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #intensity-cell="{ row }">
                  <span v-if="row.original.intensity != null">
                    {{ (row.original.intensity * 100).toFixed(0) }}%
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #tss-cell="{ row }">
                  <span v-if="row.original.tss || row.original.plannedTss">
                    {{ Math.round(row.original.tss || row.original.plannedTss || 0) }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #rpe-cell="{ row }">
                  <span v-if="row.original.rpe"> {{ row.original.rpe }}/10 </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #trainingLoad-cell="{ row }">
                  <span v-if="row.original.trainingLoad">
                    {{ Math.round(row.original.trainingLoad) }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #trimp-cell="{ row }">
                  <span v-if="row.original.trimp">
                    {{ Math.round(row.original.trimp) }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #sessionRpe-cell="{ row }">
                  <span v-if="row.original.sessionRpe">
                    {{ row.original.sessionRpe }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #feel-cell="{ row }">
                  <span v-if="row.original.feel"> {{ row.original.feel }}/5 </span>
                  <span v-else class="text-gray-400">-</span>
                </template>
                <template #averageWatts-cell="{ row }">
                  <span v-if="row.original.averageWatts" class="font-medium">
                    {{ Math.round(row.original.averageWatts) }}W
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #normalizedPower-cell="{ row }">
                  <span v-if="row.original.normalizedPower" class="font-medium">
                    {{ Math.round(row.original.normalizedPower) }}W
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #weightedAvgWatts-cell="{ row }">
                  <span v-if="row.original.weightedAvgWatts" class="font-medium">
                    {{ Math.round(row.original.weightedAvgWatts) }}W
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #kilojoules-cell="{ row }">
                  <span v-if="row.original.kilojoules">
                    {{ Math.round(row.original.kilojoules) }} kJ
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #calories-cell="{ row }">
                  <span v-if="row.original.calories">
                    {{ Math.round(row.original.calories) }} kcal
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #elapsedTime-cell="{ row }">
                  <span v-if="row.original.elapsedTime">
                    {{ formatDurationCompact(row.original.elapsedTime) }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #deviceName-cell="{ row }">
                  <span v-if="row.original.deviceName" class="text-xs">
                    {{ row.original.deviceName }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #commute-cell="{ row }">
                  <UBadge v-if="row.original.commute" color="info" variant="subtle" size="xs">
                    Commute
                  </UBadge>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #isPrivate-cell="{ row }">
                  <UIcon
                    v-if="row.original.isPrivate"
                    name="i-heroicons-lock-closed"
                    class="text-gray-500"
                  />
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #gearId-cell="{ row }">
                  <span v-if="row.original.gearId" class="text-xs">
                    {{ row.original.gearId }}
                  </span>
                  <span v-else class="text-gray-400">-</span>
                </template>

                <template #source-cell="{ row }">
                  <UBadge
                    :color="row.original.source === 'completed' ? 'success' : 'neutral'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ row.original.source === 'completed' ? 'Completed' : 'Planned' }}
                  </UBadge>
                </template>

                <template #status-cell="{ row }">
                  <UBadge
                    :color="
                      row.original.status === 'completed' ||
                      row.original.status === 'completed_plan'
                        ? 'success'
                        : row.original.status === 'missed'
                          ? 'error'
                          : 'neutral'
                    "
                    variant="subtle"
                    size="xs"
                  >
                    {{ listStatusLabel(row.original.status) }}
                  </UBadge>
                </template>
              </UTable>
            </div>
          </ClientOnly>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <PlannedWorkoutModal
    v-model="showPlannedWorkoutModal"
    :planned-workout="selectedPlannedWorkout"
    :user-ftp="userStore.currentFtp"
    :all-sport-settings="allSportSettings"
    :saving-to-library="savingToLibraryId === selectedPlannedWorkout?.id"
    @completed="handlePlannedWorkoutCompleted"
    @deleted="handlePlannedWorkoutDeleted"
    @save-to-library="savePlannedWorkoutToLibrary"
  />

  <WorkoutQuickViewModal
    v-model="showWorkoutModal"
    :workout="selectedWorkout"
    @deleted="handleWorkoutDeleted"
    @updated="() => refresh()"
  />

  <DeduplicateModal v-model:open="showDeduplicateModal" @updated="() => refresh()" />

  <BulkDeleteModal v-model="showBulkDeleteModal" @deleted="refresh" />

  <WellnessModal
    v-if="showWellnessModal"
    v-model:open="showWellnessModal"
    :date="selectedWellnessDate"
  />

  <WeeklyZoneDetailModal
    v-model="showWeekZoneModal"
    :week-data="selectedWeekData"
    :user-zones="userZones"
    :all-sport-settings="allSportSettings"
    :streams="selectedWeekStreams"
    :ftp="userStore.currentFtp"
  />

  <CalendarNoteModal v-model:open="showCalendarNoteModal" :note="selectedCalendarNote" />

  <UModal
    v-model:open="showMergeModal"
    title="Merge Workouts?"
    description="This action cannot be undone."
    :prevent-close="isMerging"
  >
    <template #body>
      <p class="text-gray-700 dark:text-gray-300">
        Do you want to merge <strong>{{ mergeSource?.title }}</strong> into
        <strong>{{ mergeTarget?.title }}</strong
        >?
      </p>
      <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
        The dragged workout will be marked as a duplicate, and the target workout will be kept as
        the primary version.
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="isMerging"
          @click="
            () => {
              showMergeModal = false
            }
          "
          >Cancel</UButton
        >
        <UButton
          color="primary"
          :loading="isMerging"
          @click="
            () => {
              void confirmMerge()
            }
          "
          >Merge</UButton
        >
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="showLinkModal"
    title="Link Workouts?"
    description="This will mark the planned workout as completed by this activity."
    :prevent-close="isLinking"
  >
    <template #body>
      <p class="text-gray-700 dark:text-gray-300">
        Do you want to link the planned workout <strong>{{ linkPlanned?.title }}</strong> to the
        completed activity <strong>{{ linkCompleted?.title }}</strong
        >?
      </p>
    </template>

    <template #footer>
      <div class="flex justify-end gap-3 w-full">
        <UButton
          color="neutral"
          variant="ghost"
          :disabled="isLinking"
          @click="
            () => {
              showLinkModal = false
            }
          "
          >Cancel</UButton
        >
        <UButton
          color="primary"
          :loading="isLinking"
          @click="
            () => {
              void confirmLink()
            }
          "
          >Link</UButton
        >
      </div>
    </template>
  </UModal>

  <UModal
    v-if="showMatcherModal"
    v-model:open="showMatcherModal"
    title="Link Workouts"
    description="Manually match completed activities with planned workouts."
    :ui="{ content: 'sm:max-w-4xl' }"
  >
    <template #body>
      <div class="p-3 sm:p-6">
        <WorkoutMatcher
          :completed-workouts="unlinkedCompletedWorkouts"
          :planned-workouts="unlinkedPlannedWorkouts"
          @matched="onWorkoutsMatched"
        />
      </div>
    </template>
  </UModal>

  <CalendarSettingsModal
    v-model:open="showCalendarSettingsModal"
    :nutrition-enabled="nutritionEnabled"
  />

  <MilestoneModal v-model:open="showMilestoneModal" :milestone="selectedMilestone" />

  <AddSessionModal
    v-model:open="showAddSessionModal"
    :initial-date="addSessionDate"
    :initial-type="usualSessionType"
    @created="
      () => {
        void safeRefresh()
      }
    "
    @open-library="openWorkoutLibrary"
  />

  <ClientOnly>
    <PlanArchitectWorkoutDrawer
      v-if="viewMode !== 'list' && isWorkoutDrawerVisible"
      :open="isWorkoutDrawerOpen"
      :templates="workoutTemplates || []"
      :loading="workoutTemplateStatus === 'pending'"
      :error="workoutTemplateStatus === 'error'"
      :library-source="workoutLibrarySource"
      :is-coaching-mode="isCoachingLibraryMode"
      allow-calendar-target
      :schedule-targets="workoutDrawerScheduleTargets"
      class="z-[70]"
      @toggle="toggleWorkoutDrawerCollapsed"
      @created="refreshWorkoutTemplates"
      @update:library-source="workoutLibrarySource = $event"
      @open-calendar-picker="openTemplateCalendarPicker"
      @schedule-template="onQuickScheduleTemplate"
    />
  </ClientOnly>

  <UModal
    v-model:open="showTemplateCalendarPicker"
    title="Schedule Workout"
    description="Choose the day you want to place this library item on your calendar."
  >
    <template #body>
      <div class="space-y-4 p-4">
        <div v-if="calendarPickerTemplate" class="rounded-xl border border-default/80 px-3 py-2.5">
          <div class="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
            Library Item
          </div>
          <div class="mt-1 text-sm font-semibold text-highlighted">
            {{ calendarPickerTemplate.title }}
          </div>
        </div>

        <div class="flex justify-center">
          <UCalendar v-model="calendarPickerDate" />
        </div>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          @click="
            () => {
              showTemplateCalendarPicker = false
            }
          "
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          :disabled="!calendarPickerTemplate || !calendarPickerDate"
          @click="
            () => {
              void confirmTemplateCalendarPicker()
            }
          "
        >
          Add to day
        </UButton>
      </div>
    </template>
  </UModal>

  <WorkoutsWorkoutComparisonDock />
</template>

<script setup lang="ts">
  import { useTranslate } from '@tolgee/vue'
  import { nextTick } from 'vue'
  import { format, isSameMonth, getISOWeek, getISOWeekYear } from 'date-fns'
  import { useStorage } from '@vueuse/core'
  import { CalendarDate, getLocalTimeZone, type DateValue } from '@internationalized/date'
  import type { CalendarActivity } from '~/types/calendar'
  import { getWeekSummary } from '~/composables/useWeekSummary'
  import WorkoutMatcher from '~/components/workouts/WorkoutMatcher.vue'
  import MiniWorkoutChart from '~/components/workouts/MiniWorkoutChart.vue'
  import DeduplicateModal from '~/components/activities/DeduplicateModal.vue'
  import BulkDeleteModal from '~/components/workouts/BulkDeleteModal.vue'
  import CalendarMetabolicWave from '~/components/activities/CalendarMetabolicWave.vue'
  import CalendarSettingsModal from '~/components/activities/CalendarSettingsModal.vue'
  import CalendarWeekSummary from '~/components/activities/CalendarWeekSummary.vue'
  import CalendarAgendaItem from '~/components/activities/CalendarAgendaItem.vue'
  import AddSessionModal from '~/components/activities/AddSessionModal.vue'
  import MilestoneModal from '~/components/activities/MilestoneModal.vue'
  import PlanArchitectWorkoutDrawer from '~/components/plans/PlanArchitectWorkoutDrawer.vue'
  import { getDefaultSportSettings, getSportSettingsForActivity } from '~/utils/sportSettings'
  import { getWorkoutChartPreference } from '~/utils/workoutChartContext'
  import { getCalendarActivityDateKey } from '~/utils/calendar'
  import {
    getStructuredWorkoutObject,
    hasStructuredWorkoutPreviewData
  } from '~/utils/structuredWorkout'
  import { formatDistance as formatDist } from '~/utils/metrics'
  import {
    getEntryIcon,
    getSessionStatusStyle,
    resolveActivityCalendarSettings
  } from '~/utils/calendarDisplay'

  const { t } = useTranslate('activities')
  const { t: tl } = useTranslate('legend')

  definePageMeta({
    middleware: 'auth',
    layout: 'default'
  })

  const integrationStore = useIntegrationStore()
  const comparisonStore = useWorkoutComparisonStore()
  const userStore = useUserStore()
  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  // Stored preferences win; everything else falls back to the calm defaults. Fuel layers only
  // ever show when nutrition tracking is on.
  const calendarSettings = computed(() =>
    resolveActivityCalendarSettings(userStore.user?.dashboardSettings?.activityCalendar, {
      nutritionEnabled: nutritionEnabled.value
    })
  )

  const distanceUnits = computed(() => userStore.profile?.distanceUnits || 'Kilometers')

  const legendItems = computed(() => {
    const isTReady = typeof t.value === 'function'
    return [
      {
        key: 'completed',
        label: isTReady ? t.value('legend_done') : 'Done',
        dot: getSessionStatusStyle('completed').dot
      },
      {
        key: 'planned',
        label: isTReady ? t.value('legend_planned') : 'Planned',
        dot: getSessionStatusStyle('planned').dot
      },
      {
        key: 'missed',
        label: isTReady ? t.value('legend_missed') : 'Missed',
        dot: getSessionStatusStyle('missed').dot
      }
    ]
  })

  const showCalendarSettingsModal = ref(false)
  const { formatDate, formatDateUTC, formatDateTime, formatTime, getUserLocalDate, timezone } =
    useFormat()
  const { onTaskCompleted } = useUserRunsState()

  function isWorkoutInComparison(workoutId: string) {
    return comparisonStore.isSelected(workoutId)
  }

  function toggleWorkoutComparison(activity: any) {
    if (!activity?.id) return

    comparisonStore.toggleWorkout({
      id: activity.id,
      title: activity.title || 'Workout',
      type: activity.type || null,
      date: activity.date || null,
      athleteName: userStore.profile?.name || userStore.user?.email || 'Athlete'
    })
  }

  // Auto-refresh when relevant background tasks complete
  const REFRESH_TASKS = [
    'ingest-strava',
    'ingest-rouvy',
    'ingest-intervals',
    'ingest-fit-file',
    'ingest-hevy',
    'ingest-all',
    'generate-structured-workout',
    'generate-weekly-plan',
    'generate-training-block',
    'adapt-training-plan'
  ]

  // Modal state
  const showDeduplicateModal = ref(false)
  const showBulkDeleteModal = ref(false)
  const showPlannedWorkoutModal = ref(false)
  const selectedPlannedWorkout = ref<any>(null)
  const showWorkoutModal = ref(false)

  const selectedWorkout = ref<any>(null)
  const showWellnessModal = ref(false)
  const selectedWellnessDate = ref<Date | null>(null)
  const showWeekZoneModal = ref(false)
  const selectedWeekData = ref<any>(null)
  const selectedWeekStreams = ref<any[]>([])
  const showMergeModal = ref(false)
  const mergeSource = ref<CalendarActivity | null>(null)
  const mergeTarget = ref<CalendarActivity | null>(null)
  const isMerging = ref(false)
  const showMatcherModal = ref(false)
  const showMilestoneModal = ref(false)
  const selectedMilestone = ref<CalendarActivity | null>(null)

  const showLinkModal = ref(false)
  const linkPlanned = ref<CalendarActivity | null>(null)
  const linkCompleted = ref<CalendarActivity | null>(null)
  const isLinking = ref(false)
  const showTemplateCalendarPicker = ref(false)
  const calendarPickerTemplate = ref<any | null>(null)
  const calendarPickerDate = ref<any>(null)
  const isWorkoutDrawerVisible = ref(false)
  const isWorkoutDrawerOpen = ref(true)
  const savingToLibraryId = ref<string | null>(null)
  const { source: workoutLibrarySource, isCoachingMode: isCoachingLibraryMode } = useLibrarySource(
    'activities-workout-drawer'
  )

  const {
    data: workoutTemplates,
    status: workoutTemplateStatus,
    refresh: refreshWorkoutTemplates
  } = (useLazyFetch as any)('/api/library/workouts', {
    server: false,
    default: () => [] as any[],
    query: computed(() => ({
      scope: workoutLibrarySource.value
    }))
  }) as any

  const { toggle: toggleTriggerMonitor } = useTriggerMonitor()

  // Everything that is not the page's one primary action lives in this overflow menu (desktop
  // "more" button and the mobile navbar overflow).
  const activitiesOverflowItems = computed(() => {
    const isTReady = typeof t.value === 'function'
    const label = (key: string, fallback: string) => (isTReady ? t.value(key) : fallback)
    const syncing = integrationStore.syncingData || status.value === 'pending'

    return [
      [
        {
          label: syncing ? label('header_syncing', 'Syncing…') : label('header_sync', 'Sync now'),
          icon: 'i-heroicons-arrow-path',
          disabled: syncing,
          onSelect: () => {
            void handleRefresh()
          }
        },
        {
          label: isWorkoutDrawerVisible.value
            ? label('header_hide_library', 'Hide workout library')
            : label('header_workout_library', 'Workout library'),
          icon: 'i-heroicons-rectangle-stack',
          onSelect: () => {
            if (isWorkoutDrawerVisible.value) isWorkoutDrawerVisible.value = false
            else openWorkoutLibrary()
          }
        },
        {
          label: label('header_upload_file', 'Upload a workout file'),
          icon: 'i-heroicons-cloud-arrow-up',
          to: '/workouts/upload'
        },
        {
          label: label('controls_calendar_settings', 'Calendar settings'),
          icon: 'i-heroicons-adjustments-horizontal',
          onSelect: () => {
            showCalendarSettingsModal.value = true
          }
        }
      ],
      [
        {
          label: label('header_menu_link_workouts', 'Link Workouts'),
          icon: 'i-heroicons-link',
          onSelect: () => {
            showMatcherModal.value = true
          }
        },
        {
          label: label('header_menu_deduplicate', 'Deduplicate'),
          icon: 'i-heroicons-document-duplicate',
          onSelect: () => {
            showDeduplicateModal.value = true
          }
        },
        {
          label: label('header_menu_bulk_delete', 'Delete workouts…'),
          icon: 'i-heroicons-trash',
          onSelect: () => {
            showBulkDeleteModal.value = true
          }
        },
        {
          label: label('header_tasks', 'Background tasks'),
          icon: 'i-heroicons-cpu-chip',
          onSelect: () => toggleTriggerMonitor()
        }
      ]
    ]
  })

  function parseCalendarDate(dateParam: unknown) {
    if (typeof dateParam !== 'string') return null

    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateParam)
    if (!match) return null

    const [, year, month, day] = match
    const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return formatDateUTC(parsed, 'yyyy-MM-dd') === dateParam ? parsed : null
  }

  const currentDate = ref(parseCalendarDate(route.query.date) || getUserLocalDate())
  const viewMode = ref<'week' | 'calendar' | 'list'>('week')
  const trainingViews = [
    { value: 'week' as const, label: 'view_week' },
    { value: 'calendar' as const, label: 'view_calendar' },
    { value: 'list' as const, label: 'view_sessions' }
  ]
  const trainingViewOptions = computed(() =>
    trainingViews.map((view) => ({ label: t.value(view.label), value: view.value }))
  )
  const mobileDraggingActivity = ref<{ id: string; source: string; date: string | Date } | null>(
    null
  )
  const mobileDragTargetDateKey = ref<string | null>(null)
  const weekDays = computed(() => {
    const isTReady = typeof t.value === 'function'
    return [
      isTReady ? t.value('controls_days_mon') : 'Mon',
      isTReady ? t.value('controls_days_tue') : 'Tue',
      isTReady ? t.value('controls_days_wed') : 'Wed',
      isTReady ? t.value('controls_days_thu') : 'Thu',
      isTReady ? t.value('controls_days_fri') : 'Fri',
      isTReady ? t.value('controls_days_sat') : 'Sat',
      isTReady ? t.value('controls_days_sun') : 'Sun'
    ]
  })

  const calendarRange = computed(() => {
    // Manual UTC start/end calculation to match calendarWeeks
    const year = currentDate.value.getUTCFullYear()
    const month = currentDate.value.getUTCMonth()
    const monthStart = new Date(Date.UTC(year, month, 1))

    // Start of week (Monday)
    const dayOfWeek = monthStart.getUTCDay()
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const start = new Date(monthStart)
    start.setUTCDate(monthStart.getUTCDate() + diffToMonday)

    // End of month -> End of week
    const monthEnd = new Date(Date.UTC(year, month + 1, 0))
    const endDayOfWeek = monthEnd.getUTCDay()
    const diffToSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek
    const end = new Date(monthEnd)
    end.setUTCDate(monthEnd.getUTCDate() + diffToSunday)

    return {
      startDate: formatDateUTC(start, 'yyyy-MM-dd'),
      endDate: formatDateUTC(end, 'yyyy-MM-dd')
    }
  })

  // API Fetch
  const {
    data: calendarResponse,
    status,
    refresh
  } = (useFetch as any)('/api/calendar', {
    query: calendarRange,
    watch: [currentDate]
  }) as any

  const activities = computed(() => {
    if (!calendarResponse.value) return []
    const { activities: rawActivities, nutritionByDate, wellnessByDate } = calendarResponse.value

    return (Array.isArray(rawActivities) ? rawActivities : []).map((a: any) => {
      const dateKey = getCalendarActivityDateKey(a, timezone.value)
      return {
        ...a,
        nutrition: nutritionByDate?.[dateKey] || null,
        wellness: wellnessByDate?.[dateKey] || null
      }
    })
  })

  async function safeRefresh() {
    try {
      await refresh()
    } catch (error) {
      console.error('[activities] refresh failed', error)
    }
  }

  REFRESH_TASKS.forEach((task) => {
    onTaskCompleted(task, () => safeRefresh())
  })

  // Metabolic Wave Fetch (Consolidated to fix N+1)
  const {
    data: metabolicWaveResponse,
    status: metabolicWaveStatus,
    refresh: refreshMetabolicWave
  } = useAsyncData(
    'metabolic-wave',
    async () => {
      if (!nutritionEnabled.value || !calendarSettings.value.showMetabolicWave) return null
      return ($fetch as any)('/api/nutrition/metabolic-wave', {
        query: calendarRange.value
      })
    },
    { watch: [currentDate, nutritionEnabled, () => calendarSettings.value.showMetabolicWave] }
  )

  useActivityRealtime(async () => {
    await safeRefresh()
    if (nutritionEnabled.value && calendarSettings.value.showMetabolicWave) {
      try {
        await refreshMetabolicWave()
      } catch (error) {
        console.error('[activities] metabolic wave refresh failed', error)
      }
    }
  })

  const metabolicWavePoints = computed(() => metabolicWaveResponse.value?.points || [])

  // Bulk fetch streams for visible activities
  const streamsMap = ref<Record<string, any>>({})
  const streamsLoading = ref(false)

  watch(
    activities,
    async (newActivities) => {
      if (import.meta.server) return

      if (!newActivities?.length) {
        streamsMap.value = {}
        return
      }

      // Only fetch streams for completed workouts that actually have streams
      const ids = newActivities
        .filter((a) => a.source === 'completed' && a.hasStreams)
        .map((a) => a.id)

      if (ids.length === 0) {
        streamsMap.value = {}
        return
      }

      streamsLoading.value = true
      try {
        const streams = (await ($fetch as any)('/api/workouts/streams', {
          method: 'POST',
          body: {
            workoutIds: ids,
            keys: ['hrZoneTimes', 'powerZoneTimes', 'heartrate', 'watts', 'time'],
            points: 150
          }
        })) as any[]

        // Create map
        const map: Record<string, any> = {}
        streams.forEach((s) => (map[s.workoutId] = s))
        streamsMap.value = map
      } catch (e) {
        console.error('Error fetching bulk streams:', e)
      } finally {
        streamsLoading.value = false
      }
    },
    { immediate: true }
  )

  // User Profile for Zones
  const { data: profile } = (useFetch as any)('/api/profile') as any

  const allSportSettings = computed(() => profile.value?.profile?.sportSettings || [])

  const userZones = computed(() => {
    const defaultProfile = getDefaultSportSettings(allSportSettings.value)
    return {
      hrZones: defaultProfile?.hrZones || getDefaultHrZones(),
      powerZones: defaultProfile?.powerZones || getDefaultPowerZones(),
      paceZones: defaultProfile?.paceZones || [],
      ftp: defaultProfile?.ftp,
      lthr: defaultProfile?.lthr,
      maxHr: defaultProfile?.maxHr,
      thresholdPace: defaultProfile?.thresholdPace,
      targetPolicy: defaultProfile?.targetPolicy,
      loadPreference: defaultProfile?.loadPreference
    }
  })

  function getActivityZones(activity: any) {
    const settings = getSportSettingsForActivity(allSportSettings.value, activity?.type || '')
    if (!settings) return userZones.value

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

  function hasActivityChartPreview(activity: any) {
    return hasStructuredWorkoutPreviewData(activity)
  }

  function collectStructuredMetricAvailability(activity: any) {
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

    const availability = visit(steps)
    return {
      hasHr: availability.hasHr,
      hasPower: availability.hasPower,
      hasPace: availability.hasPace
    }
  }

  function getActivityChartPreference(activity: any): 'hr' | 'power' | 'pace' {
    return getWorkoutChartPreference(
      activity,
      getActivityZones(activity),
      collectStructuredMetricAvailability(activity)
    )
  }

  function getDefaultHrZones() {
    return [
      { name: 'Z1', min: 60, max: 120 },
      { name: 'Z2', min: 121, max: 145 },
      { name: 'Z3', min: 146, max: 160 },
      { name: 'Z4', min: 161, max: 175 },
      { name: 'Z5', min: 176, max: 220 }
    ]
  }

  function getDefaultPowerZones() {
    return [
      { name: 'Z1', min: 0, max: 137 },
      { name: 'Z2', min: 138, max: 187 },
      { name: 'Z3', min: 188, max: 225 },
      { name: 'Z4', min: 226, max: 262 },
      { name: 'Z5', min: 263, max: 999 }
    ]
  }

  // Calendar Logic
  const calendarWeeks = computed(() => {
    // Generate dates based on UTC to avoid browser timezone shifts
    // 1. Get start of month in UTC
    const year = currentDate.value.getUTCFullYear()
    const month = currentDate.value.getUTCMonth()
    const monthStart = new Date(Date.UTC(year, month, 1))

    // 2. Find start of week (Monday)
    // getUTCDay: 0=Sun, 1=Mon...
    const dayOfWeek = monthStart.getUTCDay()
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Adjust to Monday
    const start = new Date(monthStart)
    start.setUTCDate(monthStart.getUTCDate() + diffToMonday)

    // 3. Find end of month and end of week
    const monthEnd = new Date(Date.UTC(year, month + 1, 0))
    const endDayOfWeek = monthEnd.getUTCDay()
    const diffToSunday = endDayOfWeek === 0 ? 0 : 7 - endDayOfWeek
    const end = new Date(monthEnd)
    end.setUTCDate(monthEnd.getUTCDate() + diffToSunday)

    const weeks = []
    let currentWeek = []

    // Iterate day by day in UTC
    const dayIterator = new Date(start)
    while (dayIterator <= end) {
      // Create a stable copy for the cell
      const day = new Date(dayIterator)

      const dayStr = formatDateUTC(day, 'yyyy-MM-dd')
      const currentActivities = Array.isArray(activities.value) ? activities.value : []
      const dayActivities = currentActivities.filter((a) => {
        if (a.source === 'note') {
          const noteStart = formatDateUTC(a.date, 'yyyy-MM-dd')
          const noteEnd = a.displayEndDate
            ? formatDateUTC(a.displayEndDate, 'yyyy-MM-dd')
            : a.endDate
              ? formatDateUTC(a.endDate, 'yyyy-MM-dd')
              : null

          if (!noteEnd) return noteStart === dayStr
          return dayStr >= noteStart && dayStr <= noteEnd
        }

        const dateStr = getCalendarActivityDateKey(a, timezone.value)
        return dateStr === dayStr
      })

      // Sort activities by time within the day, newest first.
      dayActivities.sort((a, b) => {
        const getTimestamp = (activity: CalendarActivity) => {
          if (activity.source === 'planned' && typeof activity.startTime === 'string') {
            const baseDate = String(activity.date).split('T')[0]
            const plannedDate = new Date(`${baseDate}T${activity.startTime}`)
            if (!isNaN(plannedDate.getTime())) return plannedDate.getTime()
          }

          const date = new Date(activity.date)
          return isNaN(date.getTime()) ? 0 : date.getTime()
        }

        return getTimestamp(b) - getTimestamp(a)
      })

      // Check if other month based on UTC month index
      // currentDate.value is already UTC midnight User Local Date
      const isOtherMonth = day.getUTCMonth() !== currentDate.value.getUTCMonth()

      currentWeek.push({
        date: day,
        activities: dayActivities,
        isOtherMonth
      })

      if (currentWeek.length === 7) {
        weeks.push(currentWeek)
        currentWeek = []
      }

      // Next day
      dayIterator.setUTCDate(dayIterator.getUTCDate() + 1)
    }

    return weeks
  })

  const selectedWeekDays = computed(() => {
    const selected = formatDateUTC(currentDate.value, 'yyyy-MM-dd')
    return (
      calendarWeeks.value.find((week) =>
        week.some((day) => formatDateUTC(day.date, 'yyyy-MM-dd') === selected)
      ) || []
    )
  })
  const selectedWeekSummary = computed(() => getWeekSummary(selectedWeekDays.value))
  const selectedWeekSessions = computed(() =>
    selectedWeekDays.value
      .flatMap((day) => day.activities)
      .filter(
        (activity) =>
          activity.source === 'completed' ||
          (activity.source === 'planned' && activity.status !== 'completed_plan')
      )
  )
  const selectedWeekSessionCount = computed(() => selectedWeekSessions.value.length)
  const nextWeekSession = computed(() => {
    const today = formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
    return (
      selectedWeekSessions.value
        .filter(
          (activity) =>
            activity.source === 'planned' &&
            getCalendarActivityDateKey(activity, timezone.value) >= today
        )
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] || null
    )
  })
  const currentWeekLabel = computed(() => {
    const week = selectedWeekDays.value
    return week.length
      ? `${formatDateUTC(week[0]!.date, 'MMM d')} – ${formatDateUTC(week[6]!.date, 'MMM d, yyyy')}`
      : ''
  })
  const isSelectedCurrentWeek = computed(() =>
    selectedWeekDays.value.some((day) => isTodayDate(day.date))
  )
  function navigateWeek(direction: number) {
    const date = new Date(currentDate.value)
    date.setUTCDate(date.getUTCDate() + direction * 7)
    currentDate.value = date
  }

  const calendarWeeksWithSummary = computed(() => {
    return calendarWeeks.value.map((week) => ({
      week,
      summary: getWeekSummary(week)
    }))
  })

  const orderedCalendarWeeks = computed(() => {
    if (calendarSettings.value.reverseWeekOrder) {
      return [...calendarWeeks.value].reverse()
    }
    return calendarWeeks.value
  })

  const orderedCalendarWeeksWithSummary = computed(() => {
    if (calendarSettings.value.reverseWeekOrder) {
      return [...calendarWeeksWithSummary.value].reverse()
    }
    return calendarWeeksWithSummary.value
  })

  interface AgendaChip {
    key: string
    label: string
    class: string
    onClick: () => void
  }

  // Mobile agenda: one entry per day that has something to show (sessions, notes, milestones).
  // Wellness-only days stay hidden unless they are today.
  const agendaWeeks = computed(() => {
    const isTReady = typeof t.value === 'function'
    return orderedCalendarWeeks.value.map((week) => {
      const days = week.map((day) => {
        const entries = day.activities.filter(
          (a: CalendarActivity) => a.id && a.type !== 'wellness' && a.source !== 'wellness'
        )
        const chips: AgendaChip[] = []
        const recoveryScore = day.activities.find((a: CalendarActivity) => a.wellness)?.wellness
          ?.recoveryScore
        if (calendarSettings.value.showWellness && recoveryScore) {
          chips.push({
            key: 'recovery',
            label: isTReady
              ? t.value('day_recovery_chip', { value: Math.round(recoveryScore) })
              : `${Math.round(recoveryScore)}% recovery`,
            class: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
            onClick: () => openWellnessModal(day.date)
          })
        }
        const calories = day.activities.find((a: CalendarActivity) => a.nutrition)?.nutrition
          ?.calories
        if (calendarSettings.value.showNutrition && calories) {
          chips.push({
            key: 'calories',
            label: `${Math.round(calories)} kcal`,
            class: 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
            onClick: () => openNutrition(day.date)
          })
        }

        return {
          ...day,
          key: getDateKey(day.date),
          isToday: isTodayDate(day.date),
          entries,
          chips
        }
      })

      return {
        week,
        days,
        summary: getWeekSummary(week),
        isCurrent: week[0] ? isCurrentWeek(week[0].date) : false
      }
    })
  })

  const mobileDayDateMap = computed(() => {
    const map = new Map<string, Date>()
    for (const week of calendarWeeks.value) {
      for (const day of week) {
        map.set(getDateKey(day.date), day.date)
      }
    }
    return map
  })

  const currentMonthLabel = computed(() => formatDateUTC(currentDate.value, 'MMMM yyyy'))

  const isCurrentMonth = computed(() => isSameMonth(currentDate.value, getUserLocalDate()))
  const lastAutoScrolledMonthKey = ref<string | null>(null)
  let hasAutoScrolledOnce = false

  // Navigation
  function nextMonth() {
    // Add 1 month in UTC
    const next = new Date(currentDate.value)
    next.setUTCMonth(next.getUTCMonth() + 1)
    currentDate.value = next
  }

  function prevMonth() {
    // Sub 1 month in UTC
    const prev = new Date(currentDate.value)
    prev.setUTCMonth(prev.getUTCMonth() - 1)
    currentDate.value = prev
  }

  function goToToday() {
    const alreadyOnThisMonth = isCurrentMonth.value
    currentDate.value = getUserLocalDate()
    // Switching months re-runs the auto-scroll once the new month has loaded; within the same
    // month nothing reloads, so bring today back into view here.
    if (alreadyOnThisMonth) {
      lastAutoScrolledMonthKey.value = null
      void scrollMobileTodayIntoView()
    }
  }

  async function scrollMobileTodayIntoView() {
    if (import.meta.server || typeof window === 'undefined') return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    if (!isCurrentMonth.value || status.value !== 'success') return

    const monthKey = formatDateUTC(currentDate.value, 'yyyy-MM')
    if (lastAutoScrolledMonthKey.value === monthKey) return

    await nextTick()

    // The agenda renders client-only, so it can appear a few ticks after the data does.
    let anchor = document.getElementById('mobile-today-anchor')
    for (let attempt = 0; !anchor && attempt < 6; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, 80))
      await nextTick()
      anchor = document.getElementById('mobile-today-anchor')
    }

    if (!anchor) return

    // Align today's row just under its sticky week header (the row carries a matching
    // scroll-margin), so the header never covers the first card.
    anchor.scrollIntoView({
      behavior: hasAutoScrolledOnce ? 'smooth' : 'auto',
      block: 'start'
    })
    hasAutoScrolledOnce = true
    lastAutoScrolledMonthKey.value = monthKey
  }

  watch(
    () => route.query.date,
    (dateParam) => {
      const parsed = parseCalendarDate(dateParam)
      if (!parsed) return

      if (formatDateUTC(parsed, 'yyyy-MM-dd') === formatDateUTC(currentDate.value, 'yyyy-MM-dd')) {
        return
      }

      currentDate.value = parsed
    }
  )

  watch(
    currentDate,
    (date) => {
      lastAutoScrolledMonthKey.value = null
      const dateKey = formatDateUTC(date, 'yyyy-MM-dd')
      if (route.query.date === dateKey) return

      router.replace({
        query: {
          ...route.query,
          date: dateKey
        }
      })
    },
    { immediate: true }
  )

  watch(
    [status, orderedCalendarWeeks, isCurrentMonth],
    () => {
      void scrollMobileTodayIntoView()
    },
    { immediate: true }
  )

  function isTodayDate(date: Date) {
    return formatDateUTC(date, 'yyyy-MM-dd') === formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd')
  }

  // Helpers
  function getWeekNumber(date: Date) {
    return getISOWeek(date)
  }

  function isFutureWeek(weekStart: Date) {
    return getDateKey(weekStart) > getDateKey(getUserLocalDate())
  }

  function isCurrentWeek(date: Date) {
    const today = getUserLocalDate()
    return getISOWeek(date) === getISOWeek(today) && getISOWeekYear(date) === getISOWeekYear(today)
  }

  function formatDistance(meters: number): string {
    return formatDist(meters, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function getDateKey(date: Date | string): string {
    return formatDateUTC(date, 'yyyy-MM-dd')
  }

  function isMobileDraggableActivity(activity: CalendarActivity): boolean {
    return activity.source === 'planned' && activity.status !== 'completed_plan'
  }

  function onMobileActivityDragStart(event: TouchEvent, activity: CalendarActivity) {
    if (!isMobileDraggableActivity(activity) || !event.touches.length) return

    mobileDraggingActivity.value = {
      id: activity.id,
      source: activity.source,
      date: activity.date
    }
    mobileDragTargetDateKey.value = getDateKey(activity.date)
  }

  function onMobileActivityDragMove(event: TouchEvent) {
    if (!mobileDraggingActivity.value || !event.touches.length) return

    const touch = event.touches[0]
    if (!touch) return

    const dayElement = document
      .elementFromPoint(touch.clientX, touch.clientY)
      ?.closest('[data-mobile-day-key]') as HTMLElement | null

    if (!dayElement?.dataset.mobileDayKey) return
    mobileDragTargetDateKey.value = dayElement.dataset.mobileDayKey
  }

  async function onMobileActivityDragEnd() {
    const drag = mobileDraggingActivity.value
    const targetDateKey = mobileDragTargetDateKey.value

    mobileDraggingActivity.value = null
    mobileDragTargetDateKey.value = null

    if (!drag || !targetDateKey) return

    const sourceDateKey = getDateKey(drag.date)
    if (sourceDateKey === targetDateKey) return

    const targetDate = mobileDayDateMap.value.get(targetDateKey)
    if (!targetDate) return

    await onRescheduleActivity({
      activity: { id: drag.id, source: drag.source },
      date: targetDate
    })
  }

  function onMobileActivityDragCancel() {
    mobileDraggingActivity.value = null
    mobileDragTargetDateKey.value = null
  }

  async function openWeekActivity(activity: CalendarActivity) {
    if (activity.source === 'planned') {
      await navigateTo(`/workouts/planned/${activity.id}`)
    } else if (activity.source === 'completed') {
      await navigateTo(`/workouts/${activity.id}`)
    } else {
      await openActivity(activity)
    }
  }

  function listStatusLabel(status: string | null | undefined) {
    if (status === 'completed' || status === 'completed_plan') return t.value('legend_completed')
    if (status === 'missed') return t.value('legend_missed')
    if (status === 'planned') return t.value('legend_planned')
    if (!status) return ''
    const text = status.replace(/_/g, ' ')
    return text.charAt(0).toUpperCase() + text.slice(1)
  }

  async function openActivity(activity: CalendarActivity) {
    if (activity.source === 'completed') {
      // Open quick view modal for completed workouts
      await openWorkoutModal(activity.id)
    } else if (activity.source === 'planned') {
      // Open planned workout modal
      await openPlannedWorkoutModal(activity.id)
    } else if (activity.source === 'note') {
      // Open note modal
      await openCalendarNoteModal(activity.id)
    } else if (
      activity.source === 'goal' ||
      activity.source === 'threshold' ||
      activity.source === 'pb'
    ) {
      selectedMilestone.value = activity
      showMilestoneModal.value = true
    }
  }

  const showCalendarNoteModal = ref(false)
  const selectedCalendarNote = ref<any>(null)

  async function openCalendarNoteModal(noteId: string) {
    try {
      const note = await $fetch<any, string & {}>(`/api/calendar/notes/${noteId}`)
      selectedCalendarNote.value = note
      showCalendarNoteModal.value = true
    } catch (error) {
      console.error('Error fetching calendar note:', error)
      toast.add({
        title: 'Failed to load calendar note',
        description: 'Please try again.',
        color: 'error'
      })
    }
  }

  async function openPlannedWorkoutModal(plannedWorkoutId: string) {
    try {
      const plannedWorkout = await $fetch<any, string & {}>(
        `/api/planned-workouts/${plannedWorkoutId}`
      )
      selectedPlannedWorkout.value = plannedWorkout
      showPlannedWorkoutModal.value = true
    } catch (error) {
      console.error('Error fetching planned workout:', error)
      toast.add({
        title: 'Failed to load planned workout',
        description: 'Please try again.',
        color: 'error'
      })
    }
  }

  async function openWorkoutModal(workoutId: string) {
    try {
      const workout = await $fetch<any, string & {}>(`/api/workouts/${workoutId}`)
      selectedWorkout.value = workout
      showWorkoutModal.value = true
    } catch (error) {
      console.error('Error fetching workout:', error)
      toast.add({
        title: 'Failed to load workout',
        description: 'Please try again.',
        color: 'error'
      })
    }
  }

  function handlePlannedWorkoutCompleted() {
    showPlannedWorkoutModal.value = false
    selectedPlannedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function handlePlannedWorkoutDeleted() {
    showPlannedWorkoutModal.value = false
    selectedPlannedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function handleWorkoutDeleted() {
    showWorkoutModal.value = false
    selectedWorkout.value = null
    refresh() // Refresh the activities list
  }

  function openWellnessModal(date: Date) {
    selectedWellnessDate.value = date
    showWellnessModal.value = true
  }

  function openNutrition(date: Date) {
    if (!nutritionEnabled.value) return
    const dateStr = formatDateUTC(date, 'yyyy-MM-dd')
    navigateTo(`/nutrition/${dateStr}`)
  }

  function onMergeActivity({
    source,
    target
  }: {
    source: CalendarActivity
    target: CalendarActivity
  }) {
    // Only allow merging completed workouts for now
    if (source.source !== 'completed' || target.source !== 'completed') {
      return // Or show a toast saying can only merge completed workouts
    }

    mergeSource.value = source
    mergeTarget.value = target
    showMergeModal.value = true
  }

  function onLinkActivity({
    planned,
    completed
  }: {
    planned: CalendarActivity
    completed: CalendarActivity
  }) {
    linkPlanned.value = planned
    linkCompleted.value = completed
    showLinkModal.value = true
  }

  async function confirmLink() {
    if (!linkPlanned.value || !linkCompleted.value) return

    isLinking.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${linkCompleted.value.id}/link`, {
        method: 'POST',
        body: {
          plannedWorkoutId: linkPlanned.value.id
        }
      })

      // Refresh activities
      await refresh()

      showLinkModal.value = false
      linkPlanned.value = null
      linkCompleted.value = null

      const toast = useToast()
      toast.add({
        title: 'Workouts linked',
        description: 'The workout has been successfully linked to the planned activity.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Link failed:', error)
      const toast = useToast()
      toast.add({
        title: 'Link failed',
        description: error.data?.message || 'Could not link workouts.',
        color: 'error'
      })
    } finally {
      isLinking.value = false
    }
  }

  async function confirmMerge() {
    if (!mergeSource.value || !mergeTarget.value) return

    isMerging.value = true
    try {
      await $fetch<any, string & {}>('/api/workouts/merge', {
        method: 'POST',
        body: {
          primaryWorkoutId: mergeTarget.value.id,
          secondaryWorkoutId: mergeSource.value.id
        }
      })

      // Refresh activities
      await refresh()

      showMergeModal.value = false
      mergeSource.value = null
      mergeTarget.value = null

      const toast = useToast()
      toast.add({
        title: 'Workouts merged',
        description: 'The workouts have been successfully merged.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Merge failed:', error)
      const toast = useToast()
      toast.add({
        title: 'Merge failed',
        description: error.data?.message || 'Could not merge workouts.',
        color: 'error'
      })
    } finally {
      isMerging.value = false
    }
  }

  async function onRescheduleActivity({
    activity,
    date
  }: {
    activity: { id: string; source: string }
    date: Date
  }) {
    const toast = useToast()

    try {
      await $fetch<any, string & {}>(`/api/planned-workouts/${activity.id}`, {
        method: 'PATCH',
        body: {
          date: formatDateUTC(date, 'yyyy-MM-dd')
        }
      })

      // Refresh data
      await refresh()

      toast.add({
        title: 'Workout Rescheduled',
        description: `Workout moved to ${formatDateUTC(date, 'MMM do')}.`,
        color: 'success'
      })
    } catch (error: any) {
      console.error('Reschedule failed:', error)
      toast.add({
        title: 'Reschedule Failed',
        description: error.data?.message || 'Could not move workout.',
        color: 'error'
      })
    }
  }

  async function saveActivityToLibrary(activity: CalendarActivity) {
    const toast = useToast()
    savingToLibraryId.value = activity.id

    try {
      const response = await ($fetch as any)('/api/library/workouts/save', {
        method: 'POST',
        body:
          activity.source === 'planned'
            ? {
                plannedWorkoutId: activity.id,
                title: activity.title
              }
            : {
                workoutId: activity.id,
                title: activity.title
              }
      })

      if (response?.template) {
        const existingTemplates = workoutTemplates.value || []
        const alreadyExists = existingTemplates.some(
          (template: any) => template.id === response.template.id
        )

        if (!alreadyExists) {
          workoutTemplates.value = [response.template, ...existingTemplates]
        }
      }

      if (!isWorkoutDrawerVisible.value) {
        isWorkoutDrawerVisible.value = true
      }
      if (!isWorkoutDrawerOpen.value) {
        isWorkoutDrawerOpen.value = true
      }

      toast.add({
        title: 'Saved to Library',
        description:
          activity.source === 'planned'
            ? 'Planned workout captured as a reusable blueprint.'
            : 'Workout captured in your library.',
        color: 'success'
      })
    } catch (error: any) {
      console.error('Save to library failed:', error)
      toast.add({
        title: 'Save Failed',
        description: error.data?.message || 'Failed to save to library',
        color: 'error'
      })
    } finally {
      savingToLibraryId.value = null
    }
  }

  async function savePlannedWorkoutToLibrary(plannedWorkout: any) {
    if (!plannedWorkout?.id) {
      return
    }

    await saveActivityToLibrary({
      ...plannedWorkout,
      source: 'planned'
    } as CalendarActivity)
  }

  async function onScheduleTemplate({ template, date }: { template: any; date: Date }) {
    const toast = useToast()

    try {
      await $fetch<any, string & {}>('/api/planned-workouts', {
        method: 'POST',
        body: {
          date: formatDateUTC(date, 'yyyy-MM-dd'),
          title: template.title,
          description: template.description,
          type: template.type,
          category: template.category,
          durationSec: template.durationSec,
          tss: template.tss,
          workIntensity: template.workIntensity,
          structuredWorkout: template.structuredWorkout
        }
      })

      await refresh()

      if (workoutTemplates.value?.length) {
        workoutTemplates.value = workoutTemplates.value.map((item: any) =>
          item.id === template.id
            ? {
                ...item,
                usageCount: (item.usageCount || 0) + 1,
                lastUsedAt: new Date().toISOString()
              }
            : item
        )
      }

      toast.add({
        title: 'Workout Scheduled',
        description: `"${template.title}" added to ${formatDateUTC(date, 'MMM do')}.`,
        color: 'success'
      })
    } catch (error: any) {
      console.error('Schedule template failed:', error)
      toast.add({
        title: 'Scheduling Failed',
        description: error.data?.message || 'Could not schedule workout from library.',
        color: 'error'
      })
    }
  }

  async function onQuickScheduleTemplate({ template, date }: { template: any; date: string }) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    if (!match) return

    const [, year, month, day] = match
    await onScheduleTemplate({
      template,
      date: new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    })
  }

  function toCalendarDate(date: Date) {
    return new CalendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  function getQuickScheduleStartDate() {
    const today = getUserLocalDate()
    return currentDate.value > today ? currentDate.value : today
  }

  function openTemplateCalendarPicker({ template }: { template: any }) {
    calendarPickerTemplate.value = template
    calendarPickerDate.value = toCalendarDate(getQuickScheduleStartDate())
    showTemplateCalendarPicker.value = true
  }

  async function confirmTemplateCalendarPicker() {
    if (!calendarPickerTemplate.value || !calendarPickerDate.value) {
      return
    }

    const selectedDate = (calendarPickerDate.value as any).toDate(getLocalTimeZone())

    await onScheduleTemplate({
      template: calendarPickerTemplate.value,
      date: new Date(
        Date.UTC(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
      )
    })

    showTemplateCalendarPicker.value = false
    calendarPickerTemplate.value = null
  }

  // Primary action: add a session (simple form); the workout library is the secondary path.
  const showAddSessionModal = ref(false)
  const addSessionDate = ref(formatDateUTC(getUserLocalDate(), 'yyyy-MM-dd'))

  const usualSessionType = computed(() => {
    const counts = new Map<string, number>()
    for (const activity of activities.value) {
      if (activity.source !== 'completed' && activity.source !== 'planned') continue
      if (!activity.type || activity.type === 'Rest') continue
      counts.set(activity.type, (counts.get(activity.type) || 0) + 1)
    }
    let best = 'Run'
    let bestCount = 0
    for (const [type, count] of counts) {
      if (count > bestCount) {
        best = type
        bestCount = count
      }
    }
    return best
  })

  function openAddSession(date?: Date) {
    addSessionDate.value = formatDateUTC(date || getQuickScheduleStartDate(), 'yyyy-MM-dd')
    showAddSessionModal.value = true
  }

  function openWorkoutLibrary() {
    viewMode.value = 'calendar'
    isWorkoutDrawerVisible.value = true
    isWorkoutDrawerOpen.value = true
  }

  function toggleWorkoutDrawerCollapsed() {
    isWorkoutDrawerOpen.value = !isWorkoutDrawerOpen.value
  }

  const workoutDrawerScheduleTargets = computed(() => {
    const targets: Array<{ label: string; date: string }> = []
    const seenDates = new Set<string>()
    const startDate = getQuickScheduleStartDate()

    for (let index = 0; index < 7; index++) {
      const nextDate = new Date(startDate)
      nextDate.setUTCDate(startDate.getUTCDate() + index)
      const dateKey = formatDateUTC(nextDate, 'yyyy-MM-dd')

      if (seenDates.has(dateKey)) {
        continue
      }

      seenDates.add(dateKey)
      targets.push({
        label:
          index === 0
            ? `Add to ${formatDateUTC(nextDate, 'MMM d')}`
            : formatDateUTC(nextDate, 'EEE, MMM d'),
        date: dateKey
      })
    }

    const plannedDate = selectedPlannedWorkout.value?.date
      ? new Date(selectedPlannedWorkout.value.date)
      : null

    if (plannedDate) {
      const plannedDay = formatDateUTC(plannedDate, 'yyyy-MM-dd')
      if (!seenDates.has(plannedDay)) {
        targets.unshift({
          label: `Add to workout day (${formatDateUTC(plannedDate, 'MMM d')})`,
          date: plannedDay
        })
      }
    }

    return targets
  })

  // List View Helpers
  const tableSearch = ref('')
  const table = useTemplateRef('table')

  const availableColumns = computed(() => {
    const isTReady = typeof t.value === 'function'
    return [
      {
        accessorKey: 'type',
        header: isTReady ? t.value('controls_table_columns_type') : 'Type',
        id: 'type'
      },
      {
        accessorKey: 'title',
        header: isTReady ? t.value('controls_table_columns_title') : 'Name',
        id: 'title'
      },
      {
        accessorKey: 'date',
        header: isTReady ? t.value('controls_table_columns_date') : 'Date',
        id: 'date'
      },
      {
        accessorKey: 'duration',
        header: isTReady ? t.value('controls_table_columns_duration') : 'Duration',
        id: 'duration'
      },
      {
        accessorKey: 'distance',
        header: isTReady ? t.value('controls_table_columns_distance') : 'Distance',
        id: 'distance'
      },
      {
        accessorKey: 'chart',
        header: isTReady ? t.value('controls_table_columns_chart') : 'Structure',
        id: 'chart'
      },
      {
        accessorKey: 'averageHr',
        header: isTReady ? t.value('controls_table_columns_averageHr') : 'Avg HR',
        id: 'averageHr'
      },
      {
        accessorKey: 'intensity',
        header: isTReady ? t.value('controls_table_columns_intensity') : 'Intensity',
        id: 'intensity'
      },
      {
        accessorKey: 'tss',
        header: isTReady ? t.value('controls_table_columns_tss') : 'TSS',
        id: 'tss'
      },
      {
        accessorKey: 'trainingLoad',
        header: isTReady ? t.value('controls_table_columns_trainingLoad') : 'Training Load',
        id: 'trainingLoad'
      },
      {
        accessorKey: 'trimp',
        header: isTReady ? t.value('controls_table_columns_trimp') : 'TRIMP',
        id: 'trimp'
      },
      {
        accessorKey: 'rpe',
        header: isTReady ? t.value('controls_table_columns_rpe') : 'RPE',
        id: 'rpe'
      },
      {
        accessorKey: 'sessionRpe',
        header: isTReady ? t.value('controls_table_columns_sessionRpe') : 'Session RPE',
        id: 'sessionRpe'
      },
      {
        accessorKey: 'feel',
        header: isTReady ? t.value('controls_table_columns_feel') : 'Feel',
        id: 'feel'
      },
      {
        accessorKey: 'averageWatts',
        header: isTReady ? t.value('controls_table_columns_averageWatts') : 'Avg Power',
        id: 'averageWatts'
      },
      {
        accessorKey: 'normalizedPower',
        header: isTReady ? t.value('controls_table_columns_normalizedPower') : 'NP',
        id: 'normalizedPower'
      },
      {
        accessorKey: 'weightedAvgWatts',
        header: isTReady ? t.value('controls_table_columns_weightedAvgWatts') : 'Weighted Power',
        id: 'weightedAvgWatts'
      },
      {
        accessorKey: 'kilojoules',
        header: isTReady ? t.value('controls_table_columns_kilojoules') : 'kJ',
        id: 'kilojoules'
      },
      {
        accessorKey: 'calories',
        header: isTReady ? t.value('controls_table_columns_calories') : 'Calories',
        id: 'calories'
      },
      {
        accessorKey: 'elapsedTime',
        header: isTReady ? t.value('controls_table_columns_elapsedTime') : 'Elapsed Time',
        id: 'elapsedTime'
      },
      {
        accessorKey: 'deviceName',
        header: isTReady ? t.value('controls_table_columns_deviceName') : 'Device',
        id: 'deviceName'
      },
      {
        accessorKey: 'commute',
        header: isTReady ? t.value('controls_table_columns_commute') : 'Commute',
        id: 'commute'
      },
      {
        accessorKey: 'isPrivate',
        header: isTReady ? t.value('controls_table_columns_isPrivate') : 'Private',
        id: 'isPrivate'
      },
      {
        accessorKey: 'gearId',
        header: isTReady ? t.value('controls_table_columns_gearId') : 'Gear',
        id: 'gearId'
      },
      {
        accessorKey: 'source',
        header: isTReady ? t.value('controls_table_columns_source') : 'Source',
        id: 'source'
      },
      {
        accessorKey: 'status',
        header: isTReady ? t.value('controls_table_columns_status') : 'Status',
        id: 'status'
      }
    ]
  })

  // Use column visibility state that persists in localStorage
  // Default: hide some of the more advanced columns
  const columnVisibility = useStorage<Record<string, boolean>>(
    'activities-list-columns-visibility',
    {
      trainingLoad: false,
      trimp: false,
      sessionRpe: false,
      feel: false,
      normalizedPower: false,
      weightedAvgWatts: false,
      kilojoules: false,
      calories: false,
      elapsedTime: false,
      deviceName: false,
      commute: false,
      isPrivate: false,
      gearId: false
    }
  )

  const columnMenuItems = computed(() => {
    return availableColumns.value.map((column) => ({
      label: column.header as string,
      type: 'checkbox' as const,
      checked: columnVisibility.value[column.id] !== false,
      onUpdateChecked(checked: boolean) {
        columnVisibility.value = {
          ...columnVisibility.value,
          [column.id]: checked
        }
      },
      onSelect(e: Event) {
        e.preventDefault()
      }
    }))
  })

  const sortedActivities = computed(() => {
    const list = Array.isArray(activities.value) ? activities.value : []
    if (list.length === 0) return []

    // Filter out wellness dummy entries from the list view
    let result = list.filter((a) => a.type !== 'wellness')

    result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    if (tableSearch.value) {
      const q = tableSearch.value.toLowerCase()
      result = result.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.type || '').toLowerCase().includes(q) ||
          (a.status || '').toLowerCase().includes(q)
      )
    }

    return result
  })

  function formatDateForList(dateStr: string) {
    return formatDateTime(dateStr, 'MMM dd, yyyy h:mm a')
  }

  function formatActivityDateForList(activity: CalendarActivity) {
    if (activity.source === 'planned') {
      const dateLabel = formatDateUTC(activity.date, 'MMM dd, yyyy')
      const timeLabel = activity.startTime ? formatTime(activity.startTime) : ''
      return timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel
    }

    return formatDateForList(activity.date)
  }

  function formatDateSafe(dateStr: string) {
    return formatDateTime(dateStr, 'EEE dd MMM yyyy h:mm a')
  }

  function formatDurationCompact(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)

    if (h > 0) {
      return `${h}h ${m}m`
    }
    return `${m}m`
  }

  function formatDurationDetailed(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  function getWeekWorkoutIds(week: any[]): string[] {
    const ids: string[] = []
    week.forEach((day) => {
      day.activities.forEach((activity: CalendarActivity) => {
        if (activity.source === 'completed') {
          ids.push(activity.id)
        }
      })
    })
    return ids
  }

  function getWeekStreams(week: any[]): any[] {
    const ids = getWeekWorkoutIds(week)
    return ids.map((id) => streamsMap.value[id]).filter(Boolean)
  }

  function openWeekZoneDetail(week: any[]) {
    const summary = getWeekSummary(week)
    const completedActivities: CalendarActivity[] = []
    const allPlannedActivities: CalendarActivity[] = []

    week.forEach((day) => {
      day.activities.forEach((activity: CalendarActivity) => {
        if (activity.source === 'completed') {
          completedActivities.push(activity)
        } else if (activity.source === 'planned') {
          allPlannedActivities.push(activity)
        }
      })
    })

    const weekStreams = getWeekStreams(week)

    selectedWeekData.value = {
      weekNumber: week[0] ? getWeekNumber(week[0].date) : 0,
      completedWorkouts: completedActivities.length,
      totalDuration: summary.duration,
      totalDistance: summary.distance,
      totalTSS: summary.tss,
      plannedDuration: summary.plannedDuration,
      plannedDistance: summary.plannedDistance,
      plannedTss: summary.plannedTss,
      workoutIds: completedActivities.map((a) => a.id),
      activities: completedActivities,
      plannedActivities: allPlannedActivities
    }
    selectedWeekStreams.value = weekStreams
    showWeekZoneModal.value = true
  }

  function handleRefresh() {
    refresh()
    integrationStore.syncAllData()
  }

  function onWorkoutsMatched() {
    showMatcherModal.value = false
    refresh()
  }

  const unlinkedCompletedWorkouts = computed(() => {
    const list = Array.isArray(activities.value) ? activities.value : []
    return list.filter((a) => a.source === 'completed' && !a.plannedWorkoutId)
  })

  const unlinkedPlannedWorkouts = computed(() => {
    const list = Array.isArray(activities.value) ? activities.value : []
    return list.filter((a) => a.source === 'planned' && a.status === 'missed')
  })
</script>

<style scoped>
  /* Custom scrollbar for horizontal scrolling on mobile */
  .overflow-x-auto {
    scrollbar-width: thin;
    scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
  }

  .overflow-x-auto::-webkit-scrollbar {
    height: 4px;
  }

  .overflow-x-auto::-webkit-scrollbar-track {
    background: transparent;
  }

  .overflow-x-auto::-webkit-scrollbar-thumb {
    background-color: rgba(156, 163, 175, 0.5);
    border-radius: 20px;
  }

  /* Success Shimmer for active week */
  .active-week-indicator {
    background: linear-gradient(90deg, transparent, rgba(34, 197, 94, 0.05), transparent);
    background-size: 200% 100%;
    animation: shimmer 3s infinite;
  }

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
</style>
