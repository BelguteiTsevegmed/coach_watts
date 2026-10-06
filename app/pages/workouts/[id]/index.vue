<template>
  <UDashboardPanel id="workout-detail" :ui="{ body: 'p-0' }">
    <template #header>
      <UDashboardNavbar :ui="{ title: 'hidden' }">
        <template #leading>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            class="hidden sm:flex"
            @click="
              () => {
                void goBack()
              }
            "
          >
            {{ t('back_to_data') }}
          </UButton>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            class="sm:hidden min-h-11 min-w-11"
            :aria-label="t('back_to_data')"
            @click="
              () => {
                void goBack()
              }
            "
          />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <div class="hidden sm:block">
              <ClientOnly>
                <DashboardTriggerMonitorButton />
              </ClientOnly>
            </div>
            <UDropdownMenu
              v-if="workout"
              :items="[
                [
                  {
                    label: savingToLibrary ? 'Saving to library…' : 'Save to library',
                    disabled: savingToLibrary,
                    icon: 'i-heroicons-bookmark',
                    onSelect: () => saveToLibrary()
                  },
                  {
                    label: t('controls_customize'),
                    icon: 'i-heroicons-adjustments-horizontal',
                    onSelect: () => (isWorkoutSectionsModalOpen = true)
                  },
                  {
                    label:
                      workout && isWorkoutInComparison(workout.id)
                        ? 'Remove from Comparison'
                        : 'Add to Comparison',
                    icon:
                      workout && isWorkoutInComparison(workout.id)
                        ? 'i-lucide-check'
                        : 'i-lucide-git-compare-arrows',
                    onSelect: () => toggleWorkoutComparison()
                  },
                  {
                    label: t('controls_edit'),
                    icon: 'i-heroicons-pencil-square',
                    onSelect: () => (isEditModalOpen = true)
                  },
                  {
                    label: 'Manage tags',
                    icon: 'i-heroicons-hashtag',
                    onSelect: () => {
                      showTagEditor = !showTagEditor
                    }
                  },
                  {
                    label: t('map_analysis'),
                    icon: 'i-heroicons-map',
                    onSelect: () => navigateTo(`/workouts/${route.params.id}/map`)
                  },
                  {
                    label: 'Debug Intervals',
                    icon: 'i-heroicons-cpu-chip',
                    onSelect: () => navigateTo(`/workouts/${route.params.id}/intervals`)
                  },
                  {
                    label: t('controls_share'),
                    icon: 'i-heroicons-share',
                    onSelect: () => (isShareModalOpen = true)
                  }
                ],
                [
                  {
                    label: t('controls_delete'),
                    icon: 'i-heroicons-trash',
                    color: 'error',
                    onSelect: () => (isDeleteModalOpen = true)
                  }
                ]
              ]"
            >
              <UButton
                icon="i-heroicons-ellipsis-horizontal"
                color="neutral"
                variant="outline"
                size="md"
                aria-label="More workout actions"
              >
                {{ t('journey_more') }}
              </UButton>
            </UDropdownMenu>
            <UButton
              v-if="workout"
              icon="i-heroicons-chat-bubble-left-right"
              color="neutral"
              variant="ghost"
              size="md"
              @click="
                () => {
                  void chatAboutWorkout()
                }
              "
            >
              <span class="hidden sm:inline">{{ t('journey_ask_coach') }}</span>
              <span class="sm:hidden">{{ t('controls_chat') }}</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="workout && !loading">
        <nav class="flex items-center gap-1" :aria-label="t('journey_views')">
          <UButton
            v-for="view in workoutJourneyViews"
            :key="view.value"
            :variant="workoutJourneyView === view.value ? 'soft' : 'ghost'"
            :color="workoutJourneyView === view.value ? 'primary' : 'neutral'"
            size="md"
            class="min-h-11 px-4"
            :aria-pressed="workoutJourneyView === view.value"
            @click="selectWorkoutJourneyView(view.value)"
          >
            {{ view.label }}
          </UButton>
        </nav>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div
        class="session-page max-w-4xl mx-auto w-full px-5 py-6 sm:px-8 sm:py-10 pb-24 space-y-8 sm:space-y-10 overflow-x-hidden"
      >
        <section v-if="workout && !loading" class="session-intro" aria-labelledby="session-title">
          <div class="flex flex-wrap items-center justify-between gap-4">
            <p class="text-sm text-muted">
              {{ formatDateWeekday(workout.date) }}, {{ formatDatePrimary(workout.date) }}
              <span class="ml-2">{{ formatTimeOnly(workout.date) }}</span>
            </p>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-heroicons-chevron-left"
                color="neutral"
                variant="ghost"
                class="min-h-11 min-w-11"
                :aria-label="t('journey_previous')"
                @click="navigateDate(-1)"
              />
              <UButton
                icon="i-heroicons-chevron-right"
                color="neutral"
                variant="ghost"
                class="min-h-11 min-w-11"
                :aria-label="t('journey_next')"
                @click="navigateDate(1)"
              />
            </div>
          </div>
          <h1
            id="session-title"
            class="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight break-words"
          >
            {{ workout.title }}
          </h1>
          <div class="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
            <span class="inline-flex items-center gap-2">
              <UIcon :name="getWorkoutIcon(workout.type)" class="h-4 w-4" />
              {{ workout.type || t('journey_activity') }}
            </span>
            <span v-if="workout.durationSec != null">{{
              formatDuration(workout.durationSec)
            }}</span>
            <span v-if="workout.distanceMeters">{{ formatDistance(workout.distanceMeters) }}</span>
            <span v-if="workout.tss || workout.trainingLoad">
              {{ Math.round(workout.tss || workout.trainingLoad) }} {{ t('metrics_tss') }}
            </span>
            <UiDataAttribution
              v-if="
                [
                  'strava',
                  'garmin',
                  'zwift',
                  'apple_health',
                  'whoop',
                  'intervals',
                  'withings',
                  'hevy',
                  'wahoo',
                  'rouvy',
                  'fit_file'
                ].includes(workout.source)
              "
              :provider="workout.source"
              :device-name="workout.deviceName"
              :fallback-label="getWorkoutSourceLabel(workout, t)"
              mode="minimal"
            />
          </div>
          <div v-if="achievements.length" class="mt-5 flex flex-wrap gap-2">
            <UBadge v-for="pb in achievements" :key="pb.type" color="success" variant="soft">
              <UIcon name="i-heroicons-trophy" class="mr-1 h-3.5 w-3.5" />
              {{ pb.label }}: {{ pb.displayValue }}{{ pb.unit === 's' ? '' : pb.unit }}
            </UBadge>
          </div>
          <details v-if="workout.description" class="mt-5 session-description">
            <summary class="min-h-11 py-3 cursor-pointer text-sm text-muted">
              {{ t('journey_session_description') }}
            </summary>
            <p class="mt-2 max-w-prose text-sm text-muted leading-relaxed whitespace-pre-wrap">
              {{ workout.description }}
            </p>
          </details>
          <div v-if="showTagEditor" class="mt-6 space-y-4 rounded-xl border border-default p-4">
            <UFormField :label="t('journey_tags')">
              <UInputTags
                v-model="localTagDraft"
                :placeholder="t('journey_tags_placeholder')"
                class="w-full"
              />
            </UFormField>
            <div v-if="intervalsSourceTags.length" class="flex flex-wrap items-center gap-2">
              <span class="text-sm text-muted">Intervals.icu</span>
              <UBadge
                v-for="tag in intervalsSourceTags"
                :key="tag"
                color="neutral"
                variant="soft"
                >{{ tag }}</UBadge
              >
            </div>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                :disabled="!hasLocalTagChanges || savingTags"
                @click="resetLocalTags"
                >{{ t('journey_reset') }}</UButton
              >
              <UButton
                :loading="savingTags"
                :disabled="!hasLocalTagChanges"
                @click="saveLocalTags"
                >{{ t('journey_save_tags') }}</UButton
              >
            </div>
          </div>
        </section>

        <!-- Loading State -->
        <div v-if="loading" class="p-4 sm:p-0 space-y-6">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2">
              <UCard :ui="{ root: 'rounded-none sm:rounded-xl shadow-none sm:shadow' }">
                <div class="space-y-4">
                  <USkeleton class="h-8 w-3/4" />
                  <div class="flex gap-3">
                    <USkeleton class="h-4 w-24" />
                    <USkeleton class="h-4 w-24" />
                    <USkeleton class="h-4 w-24" />
                  </div>
                  <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                    <USkeleton v-for="i in 4" :key="i" class="h-16 w-full rounded-lg" />
                  </div>
                </div>
              </UCard>
            </div>
            <div class="lg:col-span-1">
              <UCard :ui="{ root: 'rounded-none sm:rounded-xl shadow-none sm:shadow' }">
                <USkeleton class="h-4 w-32 mb-4" />
                <div class="flex justify-center items-center h-48">
                  <USkeleton class="h-32 w-32 rounded-full" />
                </div>
              </UCard>
            </div>
          </div>
        </div>

        <div v-else-if="error" class="p-4 sm:p-0 text-center py-12">
          <UAlert
            icon="i-heroicons-exclamation-triangle"
            color="error"
            variant="soft"
            :title="t('error_data_title')"
            :description="error"
          />
          <div class="mt-4 flex justify-center gap-3">
            <UButton class="min-h-11" @click="fetchWorkout">{{ t('journey_retry') }}</UButton>
            <UButton color="neutral" variant="ghost" class="min-h-11" @click="goBack">
              {{ t('back_to_data') }}
            </UButton>
          </div>
        </div>

        <div v-else-if="workout" class="flex flex-col gap-8 sm:gap-10">
          <div id="header" class="scroll-mt-20" />
          <section
            v-if="workoutJourneyView === 'summary' && isSectionEnabled('analysis')"
            class="session-coach"
            :style="{ order: -20 }"
          >
            <h2 class="text-xl font-semibold">{{ t('journey_coach_takeaway') }}</h2>
            <p
              v-if="workout.aiAnalysisJson?.executive_summary"
              class="mt-3 max-w-prose text-base leading-relaxed whitespace-pre-wrap line-clamp-4"
            >
              {{ workout.aiAnalysisJson.executive_summary }}
            </p>
            <p v-else class="mt-3 max-w-prose text-sm text-muted leading-relaxed">
              {{
                analyzingWorkout
                  ? t('analysis_analyzing')
                  : workout.aiAnalysis
                    ? t('journey_legacy_ready')
                    : t('journey_analysis_empty')
              }}
            </p>
            <UButton
              color="neutral"
              variant="link"
              class="mt-3 px-0 min-h-11"
              @click="scrollToSection('analysis')"
            >
              {{
                workout.aiAnalysis || workout.aiAnalysisJson
                  ? t('journey_read_analysis')
                  : t('journey_open_analysis')
              }}
            </UButton>
          </section>

          <!-- Personal Notes -->
          <div
            v-if="isJourneySectionVisible('notes')"
            id="notes"
            class="scroll-mt-20 px-0 sm:px-0"
            :style="sectionStyle('notes')"
          >
            <NotesEditor
              v-model="workout.notes"
              :notes-updated-at="workout.notesUpdatedAt"
              :title="t('journey_reflection')"
              :empty-hint="t('journey_reflection_hint')"
              :api-endpoint="`/api/workouts/${workout.id}/notes`"
              @update:notes-updated-at="workout.notesUpdatedAt = $event"
            />
          </div>

          <details
            v-if="
              workoutJourneyView === 'summary' && (workout.overallScore || workout.technicalScore)
            "
            class="session-disclosure"
            :style="{ order: 20 }"
          >
            <summary>{{ t('performance_summary_header') }}</summary>
            <div class="mt-6 max-w-lg">
              <PerformanceScoreChart
                :scores="{
                  overall: workout.overallScore,
                  technical: workout.technicalScore,
                  effort: workout.effortScore,
                  pacing: workout.pacingScore,
                  execution: workout.executionScore
                }"
              />
            </div>
          </details>
          <details
            v-if="isJourneySectionVisible('training-impact')"
            class="session-disclosure"
            :style="sectionStyle('training-impact')"
          >
            <summary>{{ t('journey_training_impact') }}</summary>
            <div class="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <UButton
                v-for="metric in journeyTrainingImpact"
                :key="metric.key"
                color="neutral"
                variant="soft"
                class="min-h-20 flex-col items-start p-4"
                @click="handleOpenMetric({ key: metric.key, value: metric.value ?? 0 })"
              >
                <span class="text-sm text-muted">{{ metric.label }}</span>
                <span class="text-xl font-semibold tabular-nums">{{ metric.value ?? '—' }}</span>
              </UButton>
            </div>
            <p class="mt-5 text-sm text-muted">
              {{
                workout.source === 'intervals'
                  ? t('impact_source_intervals', { link: 'Intervals.icu' })
                  : t('impact_source_local')
              }}
            </p>
            <ul class="mt-4 space-y-2 text-sm text-muted">
              <li>{{ tt('tss_load') }}</li>
              <li>{{ tt('fitness_ctl') }}</li>
              <li>{{ tt('fatigue_atl') }}</li>
              <li>{{ tt('form_tsb') }}</li>
            </ul>
          </details>
          <div
            v-if="workoutJourneyView !== 'summary'"
            class="flex flex-wrap items-center gap-3"
            :style="{ order: -30 }"
          >
            <label for="session-section" class="text-sm text-muted">{{ t('journey_jump') }}</label>
            <select
              id="session-section"
              class="session-section-select"
              @change="scrollToSection(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ t('journey_choose_section') }}</option>
              <option
                v-for="section in workoutNavSections"
                :key="section.key"
                :value="section.anchorId"
              >
                {{ section.label }}
              </option>
            </select>
          </div>

          <!-- Refactored Threshold Detection Banner -->
          <template v-if="workoutJourneyView === 'summary' && detectedThresholds.length > 0">
            <div
              v-for="detection in detectedThresholds"
              :key="detection.type"
              class="relative overflow-hidden bg-neutral-50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-none transition-all duration-300 group"
            >
              <!-- Decorative Accent -->
              <div class="absolute top-0 left-0 w-1 h-full bg-primary-500" />

              <div class="flex flex-col lg:flex-row lg:items-center gap-8 lg:gap-12">
                <!-- Left: Content & Context -->
                <div class="flex-1 space-y-4">
                  <div class="flex items-center gap-3">
                    <div
                      class="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center border border-primary-500/20"
                    >
                      <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
                    </div>
                    <h3
                      class="text-lg font-semibold text-neutral-900 dark:text-white tracking-tight italic"
                    >
                      {{ t('level_up_detected', { sport: detection.sportName }) }}
                    </h3>
                  </div>

                  <div class="space-y-2">
                    <p class="text-neutral-600 dark:text-gray-300 leading-relaxed">
                      {{ t('level_up_desc', { label: detection.label }) }}
                    </p>
                    <div class="flex items-center gap-2">
                      <p class="text-xs text-neutral-500 dark:text-gray-500 font-medium">
                        {{
                          t('level_up_peak_effort', {
                            value: detection.peakValue,
                            unit: detection.unit
                          })
                        }}
                      </p>
                      <UBadge
                        v-if="detection.isEstimated"
                        color="neutral"
                        variant="subtle"
                        size="xs"
                        class="text-xs font-bold"
                        :label="t('level_up_estimated')"
                      />
                    </div>
                  </div>

                  <div class="space-y-3 pt-2">
                    <div class="flex flex-wrap items-center gap-4">
                      <UButton
                        size="md"
                        color="primary"
                        variant="solid"
                        class="font-semibold px-6 shadow-none shadow-primary-500/20"
                        :label="t('level_up_update_now')"
                        @click="
                          () => {
                            void openThresholdUpdate(detection)
                          }
                        "
                      />
                      <UButton
                        size="md"
                        color="neutral"
                        variant="ghost"
                        class="text-neutral-500 hover:text-neutral-900 dark:text-gray-400 dark:hover:text-white font-bold"
                        :label="t('level_up_later')"
                        @click="
                          () => {
                            void dismissedThresholds.push(detection.type)
                          }
                        "
                      />
                    </div>
                    <p class="text-xs text-neutral-400 dark:text-gray-500 italic leading-tight">
                      {{ t('level_up_sync_note') }}
                    </p>
                  </div>
                </div>

                <!-- Right: High-Contrast Visualization -->
                <div class="flex items-center justify-center lg:justify-end shrink-0">
                  <div
                    class="flex items-center gap-4 sm:gap-8 bg-neutral-100 dark:bg-black/40 p-6 rounded-2xl border border-neutral-200 dark:border-white/5"
                  >
                    <!-- Old Value -->
                    <div class="text-center">
                      <div class="text-xs font-semibold text-neutral-400 dark:text-gray-500 mb-1">
                        {{ t('level_up_old') }}
                      </div>
                      <div
                        class="text-2xl font-bold text-neutral-400 dark:text-gray-400 line-through decoration-neutral-300 dark:decoration-gray-600"
                      >
                        {{ detection.oldValue
                        }}<span class="text-xs ml-0.5">{{ detection.unit.trim() }}</span>
                      </div>
                    </div>

                    <!-- Arrow and Percentage -->
                    <div class="flex flex-col items-center gap-1">
                      <div
                        v-if="detection.percent > 0"
                        class="text-xs font-semibold text-primary-500 bg-primary-500/10 px-2 py-0.5 rounded-full"
                      >
                        +{{ detection.percent }}%
                      </div>
                      <UIcon
                        name="i-heroicons-arrow-long-right"
                        class="w-8 h-8 text-neutral-300 dark:text-gray-600"
                      />
                    </div>

                    <!-- New Value -->
                    <div class="text-center relative">
                      <div class="text-xs font-semibold text-primary-500 mb-1">
                        {{ t('level_up_new') }}
                      </div>
                      <div
                        class="text-4xl font-semibold text-neutral-900 dark:text-white flex items-baseline gap-1"
                      >
                        {{ detection.newValue }}
                        <span class="text-sm font-bold text-neutral-400 dark:text-gray-500">{{
                          detection.unit.trim()
                        }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <details
            v-if="isJourneySectionVisible('exercises')"
            id="exercises"
            class="scroll-mt-20 session-disclosure"
            :style="sectionStyle('exercises')"
          >
            <summary>{{ t('sections_exercises') }}</summary>
            <WorkoutsExerciseList class="mt-5" :exercises="workout.exercises" />
          </details>

          <details
            v-if="isJourneySectionVisible('nutrition')"
            id="nutrition"
            class="scroll-mt-20 session-disclosure"
            :style="sectionStyle('nutrition')"
          >
            <summary>{{ t('nutrition_header') }}</summary>
            <div class="mt-6 space-y-6">
              <h3 v-if="nutritionEstimate" class="text-sm font-medium">
                {{ t('journey_estimated_fuel_use') }}
              </h3>
              <dl v-if="nutritionEstimate" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div v-for="item in nutritionEstimate" :key="item.label" class="space-y-1">
                  <dt class="text-sm text-muted">{{ item.label }}</dt>
                  <dd class="text-xl font-semibold tabular-nums">{{ item.value }}</dd>
                </div>
              </dl>
              <dl class="flex flex-wrap gap-x-8 gap-y-4 text-sm">
                <div>
                  <dt class="text-muted">{{ t('nutrition_actual_energy') }}</dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    {{ workout.kilojoules != null ? `${workout.kilojoules} kJ` : '—' }}
                  </dd>
                </div>
                <div>
                  <dt class="text-muted">{{ t('nutrition_planned_energy') }}</dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    {{ plannedKJ ? `${plannedKJ} kJ` : t('nutrition_no_target') }}
                  </dd>
                </div>
                <div v-if="workout.plannedWorkout?.tss">
                  <dt class="text-muted">{{ t('nutrition_energy_delta') }}</dt>
                  <dd class="mt-1 font-medium tabular-nums">
                    {{ t('nutrition_vs_plan', { delta: (kJDelta > 0 ? '+' : '') + kJDelta }) }}
                  </dd>
                </div>
              </dl>
              <fieldset class="space-y-3">
                <legend class="text-sm font-medium">{{ t('nutrition_digestion_header') }}</legend>
                <div class="flex items-center gap-2">
                  <UButton
                    v-for="i in 5"
                    :key="i"
                    :color="stomachFeel === i ? 'primary' : 'neutral'"
                    :variant="stomachFeel === i ? 'solid' : 'soft'"
                    class="min-h-11 min-w-11 justify-center"
                    :aria-pressed="stomachFeel === i"
                    :aria-label="t('journey_digestion_rating', { rating: i })"
                    @click="updateStomachFeel(i)"
                    >{{ i }}</UButton
                  >
                </div>
                <div class="flex justify-between max-w-64 text-xs text-muted">
                  <span>{{ t('nutrition_digestion_poor') }}</span>
                  <span>{{ t('nutrition_digestion_great') }}</span>
                </div>
              </fieldset>
              <UAlert
                v-if="kJDelta >= 10"
                color="warning"
                variant="soft"
                icon="i-heroicons-exclamation-triangle"
                :title="t('nutrition_adjustment_title')"
                :description="
                  t('nutrition_adjustment_desc', { delta: kJDelta, carbs: recoveryCarbBump })
                "
              />
            </div>
          </details>

          <!-- AI Analysis Section -->
          <div
            v-if="shouldRenderSection('analysis')"
            id="analysis"
            class="scroll-mt-20 space-y-0 sm:space-y-8"
            :style="sectionStyle('analysis')"
          >
            <h2 class="text-xl font-semibold text-default mb-4 sm:mb-0">
              {{ t('analysis_header') }}
            </h2>

            <!-- Plan Adherence HUD -->
            <div v-if="workout.plannedWorkout" class="px-0 sm:px-0">
              <PlanAdherence
                :adherence="workout.planAdherence"
                :regenerating="analyzingAdherence"
                :unlinking="unlinkingPlannedWorkout"
                :planned-workout="workout.plannedWorkout"
                @regenerate="analyzeAdherence"
                @unlink="unlinkPlannedWorkout"
              />
            </div>

            <!-- DETAILED INSIGHT HUD -->
            <div
              class="bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-none p-6 sm:p-10 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden"
            >
              <div class="flex flex-wrap items-center justify-between gap-4 mb-6 relative z-10">
                <div class="flex flex-wrap items-center gap-3">
                  <div
                    class="w-10 h-10 rounded-xl flex items-center justify-center bg-primary-500/10 border border-primary-500/20"
                  >
                    <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary-500" />
                  </div>
                  <h3
                    class="text-lg sm:text-xl font-semibold tracking-tight text-black dark:text-white"
                  >
                    {{ t('analysis_detail_title') }}
                  </h3>
                </div>
                <div class="flex items-center gap-3">
                  <div
                    v-if="workout.aiAnalysisStatus === 'QUOTA_EXCEEDED' && !workout.aiAnalysis"
                    class="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-left max-w-md"
                  >
                    <p class="text-xs font-semibold text-amber-900 dark:text-amber-100">
                      {{ t('analysis_quota_skipped_title') }}
                    </p>
                    <p class="text-xs text-amber-800/90 dark:text-amber-200 mt-1">
                      {{ t('analysis_quota_skipped_desc') }}
                    </p>
                    <div class="flex flex-wrap gap-2 mt-3">
                      <UButton
                        size="xs"
                        color="primary"
                        variant="solid"
                        @click="
                          () => {
                            void openWorkoutQuotaUpgrade()
                          }
                        "
                      >
                        {{ t('analysis_quota_skipped_upgrade') }}
                      </UButton>
                      <UButton
                        v-if="canAnalyzeNowAfterQuotaReset"
                        size="xs"
                        color="neutral"
                        variant="outline"
                        :loading="analyzingWorkout"
                        @click="
                          () => {
                            void analyzeWorkout()
                          }
                        "
                      >
                        {{ t('analysis_quota_skipped_retry') }}
                      </UButton>
                    </div>
                  </div>
                  <UButton
                    v-if="!workout.aiAnalysis"
                    icon="i-heroicons-sparkles"
                    color="primary"
                    variant="solid"
                    size="md"
                    class="font-semibold text-xs px-6"
                    :loading="analyzingWorkout"
                    :disabled="analyzingWorkout"
                    @click="
                      () => {
                        void analyzeWorkout()
                      }
                    "
                  >
                    {{ t('analysis_button_analyze') }}
                  </UButton>
                  <UButton
                    v-else
                    icon="i-heroicons-arrow-path"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="font-semibold text-xs bg-white dark:bg-white/5 border-zinc-200 dark:border-white/10"
                    :loading="analyzingWorkout"
                    :disabled="analyzingWorkout"
                    @click="
                      () => {
                        void analyzeWorkout()
                      }
                    "
                  >
                    {{ t('analysis_button_regenerate') }}
                  </UButton>
                  <UButton
                    v-if="canPublishSummaryToIntervals"
                    icon="i-heroicons-paper-airplane"
                    color="primary"
                    variant="outline"
                    size="sm"
                    class="font-semibold text-sm min-h-11"
                    :loading="publishingSummary"
                    :disabled="publishingSummary || analyzingWorkout"
                    @click="
                      () => {
                        void publishSummaryToIntervals()
                      }
                    "
                  >
                    {{ t('analysis_button_publish') }}
                  </UButton>
                </div>
              </div>

              <!-- Structured Analysis HUD Layers -->
              <div v-if="workout.aiAnalysisJson" class="space-y-12 relative z-10">
                <!-- Coach's Briefing (Executive Summary) -->
                <div
                  class="bg-white dark:bg-white/[0.03] backdrop-blur-md rounded-2xl p-8 border border-zinc-200 dark:border-white/10 relative overflow-hidden group/briefing shadow-none"
                >
                  <div class="absolute top-0 left-0 w-1.5 h-full bg-primary-500 shadow-none" />
                  <h3
                    class="tabular-nums text-xs font-semibold text-zinc-600 dark:text-zinc-500 mb-5 flex items-center gap-2"
                  >
                    <UIcon
                      name="i-heroicons-light-bulb"
                      class="w-4 h-4 text-primary-500 motion-safe:animate-pulse"
                    />
                    What your coach noticed
                  </h3>
                  <p
                    class="text-lg text-zinc-800 dark:text-zinc-100 leading-relaxed font-medium whitespace-pre-wrap"
                  >
                    {{ workout.aiAnalysisJson.executive_summary }}
                  </p>
                </div>

                <!-- Analysis Grid (HUD Cards) -->
                <div
                  v-if="workout.aiAnalysisJson.sections"
                  class="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  <div
                    v-for="(section, index) in workout.aiAnalysisJson.sections"
                    :key="index"
                    class="overflow-hidden border border-zinc-200 dark:border-white/5 bg-white dark:bg-white/[0.01] rounded-2xl group/section hover:bg-zinc-50 dark:hover:bg-white/[0.03] transition-all duration-500 shadow-none"
                  >
                    <div
                      class="px-6 py-4 border-b border-zinc-100 dark:border-white/5 flex items-center justify-between bg-zinc-50/50 dark:bg-white/[0.02]"
                    >
                      <h3
                        class="tabular-nums text-xs font-semibold text-zinc-500 dark:text-zinc-400"
                      >
                        {{ section.title }}
                      </h3>
                      <div
                        class="px-2 py-0.5 rounded border font-semibold text-xs transition-colors duration-500"
                        :class="getStatusPillClass(section.status)"
                      >
                        {{ section.status_label || section.status }}
                      </div>
                    </div>
                    <div class="px-6 py-6">
                      <ul class="space-y-4">
                        <li
                          v-for="(point, pIndex) in section.analysis_points"
                          :key="pIndex"
                          class="flex items-start gap-3 text-sm text-zinc-700 dark:text-default font-medium leading-relaxed"
                        >
                          <span
                            class="i-heroicons-chevron-right w-4 h-4 mt-0.5 text-primary-500/50 flex-shrink-0"
                          />
                          <!-- eslint-disable-next-line vue/no-v-html -->
                          <span v-html="highlightTechnicalData(point)"></span>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>

                <!-- Strategic Recommendations HUD -->
                <div
                  v-if="workout.aiAnalysisJson.recommendations?.length"
                  class="overflow-hidden border border-zinc-200 dark:border-white/5 bg-white dark:bg-white/[0.01] rounded-2xl shadow-none dark:shadow-inner"
                >
                  <div
                    class="px-8 py-5 border-b border-zinc-100 dark:border-white/5 bg-zinc-50/50 dark:bg-white/[0.02]"
                  >
                    <h3
                      class="tabular-nums text-xs font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-2"
                    >
                      <UIcon
                        name="i-heroicons-clipboard-document-list"
                        class="w-4 h-4 text-primary-500"
                      />
                      What to try next
                    </h3>
                  </div>
                  <div class="px-8 py-10 space-y-8">
                    <div
                      v-for="(rec, index) in workout.aiAnalysisJson.recommendations"
                      :key="index"
                      class="border-l-4 pl-6 py-1 relative group/rec"
                      :class="getPriorityBorderClass(rec.priority)"
                    >
                      <div class="flex items-center gap-3 mb-2">
                        <h4
                          class="text-base font-semibold text-black dark:text-white tracking-tight"
                        >
                          {{ rec.title }}
                        </h4>
                        <span
                          v-if="rec.priority"
                          :class="getPriorityBadgeClass(rec.priority)"
                          class="text-xs px-2 py-0.5 rounded-full font-semibold border border-zinc-200 dark:border-white/10 bg-zinc-100 dark:bg-white/5"
                        >
                          {{ rec.priority }}
                        </span>
                      </div>
                      <p
                        class="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed font-medium whitespace-pre-wrap"
                      >
                        {{ rec.description }}
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Physical Response Matrix (Strengths & Weaknesses) -->
                <div
                  v-if="
                    workout.aiAnalysisJson.strengths?.length ||
                    workout.aiAnalysisJson.weaknesses?.length
                  "
                  class="grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  <div
                    v-if="workout.aiAnalysisJson.strengths?.length"
                    class="rounded-2xl p-8 border border-[#00DC82]/10 bg-white dark:bg-[#00DC82]/[0.02] relative overflow-hidden group/str shadow-none"
                  >
                    <div
                      class="absolute top-0 right-0 p-4 opacity-5 group-hover/str:opacity-10 transition-opacity"
                    >
                      <UIcon name="i-heroicons-bolt" class="w-20 h-20 text-[#00DC82]" />
                    </div>
                    <h3
                      class="tabular-nums text-xs font-semibold text-[#00DC82] mb-6 flex items-center gap-2"
                    >
                      What went well
                    </h3>
                    <ul class="space-y-4">
                      <li
                        v-for="(strength, index) in workout.aiAnalysisJson.strengths"
                        :key="index"
                        class="flex items-start gap-3 text-xs font-bold text-zinc-700 dark:text-zinc-200"
                      >
                        <UIcon
                          name="i-heroicons-check-circle"
                          class="w-4 h-4 text-[#00DC82] shrink-0"
                        />
                        <span>{{ strength }}</span>
                      </li>
                    </ul>
                  </div>

                  <div
                    v-if="workout.aiAnalysisJson.weaknesses?.length"
                    class="rounded-2xl p-8 border border-orange-500/10 bg-white dark:bg-orange-500/[0.02] relative overflow-hidden group/weak shadow-none"
                  >
                    <div
                      class="absolute top-0 right-0 p-4 opacity-5 group-hover/weak:opacity-10 transition-opacity"
                    >
                      <UIcon name="i-heroicons-fire" class="w-20 h-20 text-orange-500" />
                    </div>
                    <h3
                      class="tabular-nums text-xs font-semibold text-orange-600 dark:text-orange-400 mb-6 flex items-center gap-2"
                    >
                      What to work on
                    </h3>
                    <ul class="space-y-4">
                      <li
                        v-for="(weakness, index) in workout.aiAnalysisJson.weaknesses"
                        :key="index"
                        class="flex items-start gap-3 text-xs font-bold text-zinc-700 dark:text-zinc-200"
                      >
                        <UIcon
                          name="i-heroicons-arrow-trending-up"
                          class="w-4 h-4 text-orange-500 shrink-0"
                        />
                        <span>{{ weakness }}</span>
                      </li>
                    </ul>
                  </div>
                </div>

                <!-- Telemetry Validation -->
                <div
                  v-if="workout.aiAnalyzedAt"
                  class="flex justify-between items-center pt-8 border-t border-zinc-100 dark:border-white/5"
                >
                  <div class="tabular-nums text-xs font-semibold text-zinc-400 dark:text-zinc-600">
                    Analysis completed {{ formatDate(workout.aiAnalyzedAt) }}
                  </div>
                </div>
              </div>

              <!-- Legacy Fallback -->
              <div v-else-if="workout.aiAnalysis" class="space-y-6 relative z-10">
                <div class="prose prose-sm dark:prose-invert max-w-none px-2">
                  <!-- eslint-disable vue/no-v-html -- markdown-rendered analysis -->
                  <div class="text-default font-medium leading-relaxed" v-html="renderedAnalysis" />
                  <!-- eslint-enable vue/no-v-html -->
                </div>
                <div
                  v-if="workout.aiAnalyzedAt"
                  class="flex justify-between items-center pt-8 border-t border-white/5"
                >
                  <div class="tabular-nums text-xs font-semibold text-zinc-600">
                    Analysis completed {{ formatDate(workout.aiAnalyzedAt) }}
                  </div>
                </div>
              </div>

              <!-- PENDING STATES -->
              <div v-else-if="!analyzingWorkout" class="text-center py-24 relative z-10">
                <div
                  class="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-white/10 group-hover:border-primary-500/30 transition-colors"
                >
                  <UIcon
                    name="i-heroicons-bolt"
                    class="w-10 h-10 text-zinc-600 opacity-40 group-hover:text-primary-500 transition-colors"
                  />
                </div>
                <p class="text-sm font-semibold text-default mb-2">
                  Your coaching review is ready to begin
                </p>
                <p class="text-xs text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Analyze this session to understand what went well and what to try next.
                </p>
                <UButton
                  size="lg"
                  color="primary"
                  variant="solid"
                  class="mt-10 font-semibold text-xs px-10 py-4 shadow-none rounded-xl"
                  @click="
                    () => {
                      void analyzeWorkout()
                    }
                  "
                >
                  {{ t('analysis_button_analyze') }}
                </UButton>
              </div>

              <div v-else class="text-center py-24 relative z-10">
                <div class="relative w-20 h-20 mx-auto mb-8">
                  <div
                    class="absolute inset-0 rounded-full border-2 border-primary-500/20 motion-safe:animate-ping"
                  />
                  <div
                    class="absolute inset-0 rounded-full border-t-2 border-primary-500 motion-safe:animate-spin"
                  />
                  <UIcon
                    name="i-heroicons-cpu-chip"
                    class="absolute inset-0 m-auto w-8 h-8 text-primary-500 motion-safe:animate-pulse"
                  />
                </div>
                <p class="text-sm text-default font-semibold motion-safe:animate-pulse">
                  {{ t('analysis_analyzing') }}
                </p>
                <p class="text-xs tabular-nums text-zinc-500 mt-2">Reviewing your session data</p>
              </div>
            </div>
          </div>

          <!-- Power Curve Section -->
          <div
            v-if="shouldRenderSection('power-curve')"
            id="power-curve"
            class="scroll-mt-20 space-y-6"
            :style="sectionStyle('power-curve')"
          >
            <h2 class="text-base font-semibold text-zinc-600 dark:text-zinc-500 px-5 sm:px-0">
              {{ t('sections_power_curve') }}
            </h2>
            <div
              class="bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-none p-6 sm:p-10 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden"
            >
              <PowerCurveChart :workout-id="workout.id" />
            </div>
          </div>

          <!-- Interval Analysis Section -->
          <div
            v-if="shouldRenderSection('intervals')"
            id="intervals"
            class="scroll-mt-20 space-y-6"
            :style="sectionStyle('intervals')"
          >
            <h2
              class="text-base font-semibold text-zinc-600 dark:text-zinc-500 px-5 sm:px-0 flex items-center justify-between w-full"
            >
              <span>{{ t('sections_intervals') }}</span>
              <UButton
                icon="i-heroicons-cpu-chip"
                size="xs"
                variant="ghost"
                color="neutral"
                class="font-semibold text-xs"
                :to="`/workouts/${workout.id}/intervals`"
              >
                {{ t('interval_audit') }}
              </UButton>
            </h2>
            <div
              class="bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-none p-0 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden"
            >
              <IntervalsAnalysis
                :workout-id="workout.id"
                class="!bg-transparent !border-none !shadow-none !p-6 sm:!p-10"
              />
            </div>
          </div>

          <!-- Advanced Analytics Section -->
          <div
            v-if="shouldRenderSection('advanced')"
            id="advanced"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('advanced')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_advanced') }}
            </h2>
            <AdvancedWorkoutMetrics :workout-id="workout.id" @open-metric="handleOpenMetric" />
          </div>

          <!-- Route Map Section -->
          <div
            v-if="shouldRenderSection('map')"
            id="map"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('map')"
          >
            <h2
              class="text-base font-semibold text-gray-400 px-4 sm:px-0 flex items-center justify-between w-full"
            >
              <span>{{ t('sections_map') }}</span>
              <UButton
                icon="i-heroicons-arrows-pointing-out"
                size="xs"
                variant="ghost"
                color="neutral"
                class="font-semibold text-xs"
                :to="`/workouts/${workout.id}/map`"
              >
                {{ t('map_analysis') }}
              </UButton>
            </h2>
            <UiWorkoutMap
              :coordinates="workout.streams.latlng"
              :streams="workout.streams"
              :workout-id="workout.id"
              :interactive="true"
              :provider="workout.source"
              :provider-label="getWorkoutSourceLabel(workout, t)"
              :device-name="workout.deviceName"
            />
          </div>

          <!-- Pacing Analysis -->
          <div
            v-if="shouldRenderSection('pacing')"
            id="pacing"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('pacing')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_pacing') }}
            </h2>
            <PacingAnalysis
              :workout-id="workout.id"
              :activity-type="workout.type"
              @open-metric="handleOpenMetric"
            />
          </div>

          <!-- Timeline -->
          <div
            v-if="shouldRenderSection('timeline')"
            id="timeline"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('timeline')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_timeline') }}
            </h2>
            <WorkoutTimeline :workout-id="workout.id" />
          </div>

          <!-- Zones -->
          <div
            v-if="shouldRenderSection('zones')"
            id="zones"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('zones')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_zones') }}
            </h2>
            <ZoneChart
              :workout-id="workout.id"
              :activity-type="workout.type"
              :stream-data="workout.streams"
            />
          </div>

          <!-- Efficiency -->
          <div
            v-if="shouldRenderSection('efficiency')"
            id="efficiency"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('efficiency')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_efficiency') }}
            </h2>
            <EfficiencyMetricsCard
              :metrics="{
                variabilityIndex: workout.variabilityIndex,
                efficiencyFactor: workout.efficiencyFactor,
                decoupling: workout.decoupling,
                powerHrRatio: workout.powerHrRatio,
                polarizationIndex: workout.polarizationIndex,
                lrBalance: workout.lrBalance
              }"
              @open-metric="handleOpenMetric"
            />
          </div>

          <!-- Detailed Metrics Section -->
          <div
            v-if="shouldRenderSection('metrics')"
            id="metrics"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('metrics')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_metrics') }}
            </h2>
            <div
              class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3"
            >
              <button
                v-for="metric in availableMetrics"
                :key="metric.key"
                type="button"
                class="flex min-h-11 text-left focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 group cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 px-2 -mx-2 transition-colors"
                @click="
                  () => {
                    void handleOpenMetric({ key: metric.label, value: metric.value })
                  }
                "
              >
                <div class="flex items-center gap-2">
                  <UTooltip
                    v-if="metricTooltips[metric.label]"
                    :popper="{ placement: 'top' }"
                    :ui="{ content: 'w-[300px] h-auto whitespace-normal' }"
                    arrow
                  >
                    <span
                      class="text-xs font-semibold text-gray-500 border-b border-dashed border-gray-300 dark:border-gray-700 cursor-help group-hover:text-primary-500 group-hover:border-primary-300 transition-colors"
                      >{{ metric.label }}</span
                    >
                    <template #content>
                      <div class="text-left text-sm">{{ metricTooltips[metric.label] }}</div>
                    </template>
                  </UTooltip>
                  <span
                    v-else
                    class="text-xs font-semibold text-gray-500 group-hover:text-primary-500 transition-colors"
                  >
                    {{ metric.label }}
                  </span>
                  <UBadge
                    v-if="metric.source === 'fit'"
                    color="neutral"
                    variant="soft"
                    size="xs"
                    class="font-semibold text-xs"
                  >
                    FIT
                  </UBadge>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-black dark:text-white">{{
                    metric.value
                  }}</span>
                  <UIcon
                    name="i-heroicons-magnifying-glass-circle"
                    class="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100"
                  />
                </div>
              </button>
            </div>

            <div
              v-if="hasAnalysisFactsPanel"
              class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800"
            >
              <div class="flex flex-col gap-5">
                <div class="flex items-center justify-between gap-4 flex-wrap">
                  <div class="flex items-center gap-2">
                    <UIcon name="i-heroicons-beaker" class="w-5 h-5 text-amber-500" />
                    <div class="flex flex-col">
                      <h3 class="text-sm font-semibold text-gray-900 dark:text-white">
                        Calculated Workout Facts
                      </h3>
                      <div class="text-xs font-bold text-gray-400 dark:text-gray-500">
                        Derived training interpretation signals for this workout
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UBadge color="primary" variant="soft" class="font-semibold text-xs">
                      Schema: {{ analysisFactsVersionLabel }}
                    </UBadge>
                    <UBadge color="success" variant="soft" class="font-semibold text-xs">
                      Included: {{ includedPromptFactsCount }}
                    </UBadge>
                    <UBadge color="neutral" variant="soft" class="font-semibold text-xs">
                      Ignored: {{ ignoredPromptFactsCount }}
                    </UBadge>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      class="font-semibold text-xs"
                      :icon="
                        analysisFactsOpen ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'
                      "
                      :label="analysisFactsOpen ? 'Hide Facts' : 'Show Facts'"
                      @click="
                        () => {
                          analysisFactsOpen = !analysisFactsOpen
                        }
                      "
                    />
                  </div>
                </div>

                <div
                  v-if="!analysisFactsOpen"
                  class="rounded-xl bg-amber-50/70 dark:bg-amber-950/20 p-4 border border-amber-100 dark:border-amber-900/40"
                >
                  <div class="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-2">
                    Collapsed Summary
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <UBadge
                      v-for="badge in analysisFactsSummaryBadges"
                      :key="badge.key"
                      :color="getSummaryBadgeColor(badge.value)"
                      variant="soft"
                      class="font-semibold text-xs"
                    >
                      {{ badge.label }}: {{ formatFactValue(badge.value) }}
                    </UBadge>
                  </div>
                </div>

                <div v-else class="space-y-4">
                  <div class="flex flex-wrap gap-2 mb-1">
                    <UBadge
                      v-for="badge in analysisFactsSummaryBadges"
                      :key="badge.key"
                      :color="getSummaryBadgeColor(badge.value)"
                      variant="soft"
                      class="font-semibold text-xs"
                    >
                      {{ badge.label }}: {{ formatFactValue(badge.value) }}
                    </UBadge>
                  </div>

                  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div
                      v-for="group in analysisFactsGroups"
                      :key="group.key"
                      class="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                    >
                      <div
                        class="px-4 py-3 bg-gray-50/70 dark:bg-gray-950/50 border-b border-gray-100 dark:border-gray-800"
                      >
                        <h4 class="text-xs font-semibold text-gray-900 dark:text-white">
                          {{ group.label }}
                        </h4>
                      </div>
                      <div class="px-4 py-3 space-y-2">
                        <div
                          v-for="entry in group.entries"
                          :key="entry.key"
                          class="flex items-start justify-between gap-4 text-xs"
                        >
                          <UTooltip
                            :text="analysisFactTooltips[entry.key] || entry.label"
                            :popper="{ placement: 'top' }"
                            :ui="{ content: 'w-[280px] h-auto whitespace-normal' }"
                            arrow
                          >
                            <div
                              class="font-semibold text-gray-400 border-b border-dashed border-gray-300 dark:border-gray-700 inline-block cursor-help"
                            >
                              {{ entry.label }}
                            </div>
                          </UTooltip>
                          <UTooltip
                            :text="getPromptDecisionReason(entry.path)"
                            :popper="{ placement: 'left' }"
                            :ui="{ content: 'w-[260px] h-auto whitespace-normal' }"
                            arrow
                          >
                            <div
                              class="text-right font-medium cursor-help"
                              :class="getPromptDecisionValueClass(entry.path)"
                            >
                              {{ formatFactValue(entry.value) }}
                            </div>
                          </UTooltip>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Data Streams Section -->
          <div
            v-if="shouldRenderSection('streams')"
            id="streams"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('streams')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('sections_streams') }}
            </h2>
            <div
              class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800 flex flex-wrap gap-2.5"
            >
              <UButton
                v-for="stream in availableStreams"
                :key="stream.key"
                color="neutral"
                variant="soft"
                size="sm"
                class="min-h-11 cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors font-semibold text-xs px-2.5 py-1"
                @click="
                  () => {
                    void openStreamModal({
                      ...stream,
                      label: stream.label || '',
                      color: stream.color || '#000000',
                      unit: stream.unit || ''
                    })
                  }
                "
              >
                {{ stream.label }}
              </UButton>
              <UButton
                v-if="hasExtrasMeta"
                icon="i-heroicons-code-bracket-square"
                color="neutral"
                variant="soft"
                size="sm"
                class="font-semibold text-xs px-2.5 py-1"
                @click="
                  () => {
                    isExtrasMetaModalOpen = true
                  }
                "
              >
                {{ t('modal_extras_title') }}
              </UButton>
            </div>
          </div>

          <!-- Duplicate Workout Section -->
          <div
            v-if="shouldRenderSection('duplicates')"
            id="duplicates"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('duplicates')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('version_header') }}
            </h2>
            <div
              class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800"
            >
              <!-- Case 1: This is a duplicate -->
              <div
                v-if="workout.isDuplicate"
                class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800"
              >
                <div class="flex items-start gap-3">
                  <UIcon
                    name="i-heroicons-information-circle"
                    class="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0"
                  />
                  <div>
                    <h3 class="font-bold text-yellow-900 dark:text-yellow-100 tracking-tight">
                      {{ t('version_duplicate_title') }}
                    </h3>
                    <p class="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                      {{ t('version_duplicate_desc') }}
                    </p>

                    <div v-if="workout.canonicalWorkout" class="mt-4">
                      <p class="text-xs font-semibold text-gray-500 mb-2">
                        {{ t('version_original_ref') }}
                      </p>
                      <div
                        class="p-4 bg-gray-50 dark:bg-gray-950 rounded-xl border border-gray-100 dark:border-gray-800"
                      >
                        <div
                          class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                        >
                          <NuxtLink
                            :to="`/workouts/${workout.canonicalWorkout.id}`"
                            class="block min-w-0 flex-1 hover:opacity-90 transition-opacity"
                          >
                            <div
                              class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                            >
                              <div class="min-w-0 flex-1">
                                <div
                                  class="font-semibold text-gray-900 dark:text-white truncate tracking-tight"
                                >
                                  {{ workout.canonicalWorkout.title }}
                                </div>
                                <div class="text-xs text-gray-500 mt-1 font-bold">
                                  {{ formatDate(workout.canonicalWorkout.date) }}
                                </div>
                              </div>
                              <div
                                class="flex items-center justify-between sm:justify-end gap-4 shrink-0"
                              >
                                <div class="flex justify-end">
                                  <UiDataAttribution
                                    v-if="
                                      [
                                        'strava',
                                        'garmin',
                                        'zwift',
                                        'apple_health',
                                        'whoop',
                                        'intervals',
                                        'withings',
                                        'hevy'
                                      ].includes(workout.canonicalWorkout.source)
                                    "
                                    :provider="workout.canonicalWorkout.source"
                                    :device-name="workout.canonicalWorkout.deviceName"
                                    mode="minimal"
                                  />
                                  <span
                                    v-else
                                    :class="getSourceBadgeClass(workout.canonicalWorkout.source)"
                                    class="py-0 px-1.5 text-xs"
                                  >
                                    {{ getWorkoutSourceLabel(workout.canonicalWorkout, t) }}
                                  </span>
                                </div>
                                <UIcon
                                  name="i-heroicons-arrow-right"
                                  class="w-4 h-4 text-gray-400"
                                />
                              </div>
                            </div>
                          </NuxtLink>

                          <UButton
                            size="xs"
                            color="warning"
                            variant="soft"
                            icon="i-heroicons-link-slash"
                            class="font-bold shrink-0"
                            :loading="unlinkingDuplicateId === workout.id"
                            @click="
                              () => {
                                void openDuplicateUnlinkConfirm(
                                  workout.id,
                                  workout.canonicalWorkout.title
                                )
                              }
                            "
                          >
                            Unlink
                          </UButton>
                        </div>
                      </div>
                    </div>

                    <div class="mt-4 pt-4 border-t border-yellow-200 dark:border-yellow-800/50">
                      <UButton
                        size="xs"
                        color="warning"
                        variant="soft"
                        icon="i-heroicons-arrow-path-rounded-square"
                        class="font-bold"
                        :loading="promoting"
                        @click="
                          () => {
                            void promoteWorkout()
                          }
                        "
                      >
                        {{ t('version_promote_button') }}
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Case 2: This is the original, but has duplicates -->
              <div v-else-if="workout.duplicates && workout.duplicates.length > 0">
                <div class="flex items-start gap-3 mb-4">
                  <UIcon
                    name="i-heroicons-document-duplicate"
                    class="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0"
                  />
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white tracking-tight">
                      {{ t('version_linked_duplicates') }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                      {{ t('version_linked_desc') }}
                    </p>
                  </div>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="dup in workout.duplicates"
                    :key="dup.id"
                    class="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800"
                  >
                    <div
                      class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
                    >
                      <NuxtLink
                        :to="`/workouts/${dup.id}`"
                        class="block min-w-0 flex-1 hover:opacity-90 transition-opacity"
                      >
                        <div
                          class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                        >
                          <div class="min-w-0 flex-1">
                            <div
                              class="font-semibold text-gray-900 dark:text-white truncate tracking-tight"
                            >
                              {{ dup.title }}
                            </div>
                            <div class="text-xs text-gray-500 mt-1 font-bold">
                              {{ formatDate(dup.date) }}
                            </div>
                          </div>
                          <div
                            class="flex items-center justify-between sm:justify-end gap-4 shrink-0"
                          >
                            <UBadge color="warning" variant="subtle" size="xs" class="font-bold">{{
                              t('sections_duplicates')
                            }}</UBadge>
                            <div class="flex justify-end">
                              <UiDataAttribution
                                v-if="
                                  [
                                    'strava',
                                    'garmin',
                                    'zwift',
                                    'apple_health',
                                    'whoop',
                                    'intervals',
                                    'withings',
                                    'hevy'
                                  ].includes(dup.source)
                                "
                                :provider="dup.source"
                                :device-name="dup.deviceName"
                                mode="minimal"
                              />
                              <span
                                v-else
                                :class="getSourceBadgeClass(dup.source)"
                                class="py-0 px-1.5 text-xs"
                              >
                                {{ getWorkoutSourceLabel(dup, t) }}
                              </span>
                            </div>
                            <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                          </div>
                        </div>
                      </NuxtLink>

                      <UButton
                        size="xs"
                        color="warning"
                        variant="soft"
                        icon="i-heroicons-link-slash"
                        class="font-bold shrink-0"
                        :loading="unlinkingDuplicateId === dup.id"
                        @click="
                          () => {
                            void openDuplicateUnlinkConfirm(dup.id, dup.title)
                          }
                        "
                      >
                        Unlink
                      </UButton>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Linked Planned Workout -->
              <div
                v-if="workout.plannedWorkout"
                class="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800"
              >
                <div class="flex items-start gap-3 mb-4">
                  <UIcon
                    name="i-heroicons-calendar"
                    class="w-6 h-6 text-primary-600 dark:text-primary-400 flex-shrink-0"
                  />
                  <div>
                    <h3 class="font-semibold text-gray-900 dark:text-white tracking-tight">
                      {{ t('version_prescribed_plan') }}
                    </h3>
                    <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                      {{ t('version_prescribed_desc') }}
                    </p>
                  </div>
                </div>

                <NuxtLink
                  :to="`/workouts/planned/${workout.plannedWorkout.id}`"
                  class="block p-4 bg-primary-50 dark:bg-primary-950/20 rounded-xl border border-primary-100 dark:border-primary-900/50 hover:border-primary-500 dark:hover:border-primary-500 transition-all shadow-none"
                >
                  <div
                    class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="font-semibold text-gray-900 dark:text-white tracking-tight">
                        {{ workout.plannedWorkout.title }}
                      </div>
                      <div class="text-xs text-gray-500 mt-1 flex items-center gap-2 font-bold">
                        {{ formatDateUTC(workout.plannedWorkout.date) }}
                        <span
                          v-if="workout.plannedWorkout.type"
                          class="px-1.5 py-0 rounded bg-gray-100 dark:bg-gray-700 text-xs font-semibold"
                        >
                          {{ workout.plannedWorkout.type }}
                        </span>
                      </div>
                    </div>
                    <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <UBadge color="primary" variant="solid" size="xs" class="font-semibold">{{
                        t('legend_plan')
                      }}</UBadge>
                      <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>

          <div
            v-if="shouldRenderSection('raw-data')"
            id="raw-data"
            class="scroll-mt-20 space-y-4"
            :style="sectionStyle('raw-data')"
          >
            <h2 class="text-base font-semibold text-gray-400 px-5 sm:px-0">
              {{ t('raw_data_header') }}
            </h2>
            <JsonViewer
              title="Raw Data (JSON)"
              :data="workout.rawJson"
              filename="workout-raw.json"
            />
          </div>

          <div
            v-if="workout.llmUsageId"
            class="flex justify-end px-5 pt-8 pb-2 sm:px-0 border-t border-gray-100 dark:border-gray-800"
          >
            <AiFeedback
              :llm-usage-id="workout.llmUsageId"
              :initial-feedback="workout.feedback"
              :initial-feedback-text="workout.feedbackText"
            />
          </div>
        </div>
        <div v-else class="space-y-4 py-12 text-center">
          <h1 class="text-2xl font-semibold">{{ t('journey_not_found') }}</h1>
          <p class="text-sm text-muted">{{ t('journey_not_found_hint') }}</p>
          <UButton color="neutral" variant="soft" class="min-h-11" @click="goBack">
            {{ t('back_to_data') }}
          </UButton>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Metric Detail Modal -->
  <WorkoutsMetricDetailModal
    v-if="activeMetric"
    v-model="isMetricModalOpen"
    :metric-key="activeMetric.key"
    :value="activeMetric.value"
    :unit="activeMetric.unit"
    :rating="activeMetric.rating"
    :rating-color="activeMetric.ratingColor"
    :workout-id="workout?.id"
    :streams="workout?.streams"
    :activity-type="workout?.type"
  />

  <WorkoutsWorkoutSectionsSettingsModal
    v-model:open="isWorkoutSectionsModalOpen"
    :sections="workoutSectionsModalOptions"
  />

  <!-- Promote Workout Confirmation Modal -->
  <UModal
    v-model:open="isPromoteModalOpen"
    :title="t('modal_promote_title')"
    :description="t('modal_promote_desc')"
  >
    <template #body>
      <div class="space-y-4">
        <div
          class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0"
            />
            <div>
              <h3 class="font-semibold text-yellow-900 dark:text-yellow-100">
                {{ t('modal_promote_sure') }}
              </h3>
              <p class="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                {{ t('modal_promote_action_desc') }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('banner_exit')"
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isPromoteModalOpen = false
            }
          "
        />
        <UButton
          :label="t('modal_promote_confirm')"
          color="warning"
          variant="solid"
          :loading="promoting"
          @click="
            () => {
              void confirmPromoteWorkout()
            }
          "
        />
      </div>
    </template>
  </UModal>

  <!-- Share Modal -->
  <UModal
    v-model:open="isShareModalOpen"
    :title="t('modal_share_title')"
    :description="t('modal_share_desc')"
  >
    <template #body>
      <ShareAccessPanel
        :link="shareLink"
        :loading="generatingShareLink"
        :expiry-value="shareExpiryValue"
        resource-label="workout"
        :share-title="
          workout?.title ? `Workout: ${workout.title}` : 'Workout shared from Coach Watts'
        "
        @update:expiry-value="shareExpiryValue = $event"
        @generate="generateShareLink"
        @copy="copyToClipboard"
      />
    </template>
    <template #footer>
      <UButton
        :label="t('banner_exit')"
        color="neutral"
        variant="ghost"
        @click="
          () => {
            isShareModalOpen = false
          }
        "
      />
    </template>
  </UModal>

  <!-- Stream Chart Modal -->
  <StreamChartModal
    v-if="selectedStream"
    v-model:open="isStreamModalOpen"
    :workout-id="workout?.id"
    :stream-key="selectedStream.key"
    :title="selectedStream.label"
    :color="selectedStream.color"
    :unit="selectedStream.unit"
    :activity-type="workout?.type"
  />

  <!-- Extras Meta Modal -->
  <UModal
    v-model:open="isExtrasMetaModalOpen"
    :title="t('modal_extras_title')"
    :description="t('modal_extras_desc')"
    :ui="{ content: 'max-w-5xl' }"
  >
    <template #body>
      <JsonViewer
        v-if="extrasMetaData"
        title="FIT extrasMeta"
        :data="extrasMetaData"
        :deep="2"
        :default-open="true"
        filename="fit-extras-meta.json"
      />
      <div v-else class="text-sm text-gray-500 py-4">{{ t('modal_extras_empty') }}</div>
    </template>
    <template #footer>
      <UButton
        :label="t('banner_exit')"
        color="neutral"
        variant="ghost"
        @click="
          () => {
            isExtrasMetaModalOpen = false
          }
        "
      />
    </template>
  </UModal>

  <!-- Edit Workout Modal -->
  <WorkoutsEditModal
    v-if="workout"
    v-model:open="isEditModalOpen"
    :workout="workout"
    @updated="fetchWorkout"
    @delete="onDeleteRequested"
  />

  <!-- Delete Confirmation Modal -->
  <UModal
    v-model:open="isDeleteModalOpen"
    :title="t('modal_delete_title')"
    :description="t('modal_delete_desc')"
  >
    <template #body>
      <div class="space-y-4">
        <div
          class="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0"
            />
            <div>
              <h3 class="font-semibold text-red-900 dark:text-red-100">
                {{ t('modal_delete_sure') }}
              </h3>
              <p class="text-sm text-red-800 dark:text-red-200 mt-1">
                {{ t('modal_delete_action_desc') }}
              </p>
            </div>
          </div>
        </div>

        <div
          v-if="shouldShowSyncSourceNote(workout)"
          class="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800"
        >
          <div class="flex items-start gap-3">
            <UIcon
              name="i-heroicons-arrow-path"
              class="w-6 h-6 text-orange-600 dark:text-orange-400 flex-shrink-0"
            />
            <div>
              <h3 class="font-semibold text-orange-900 dark:text-orange-100 tracking-tight text-xs">
                {{ t('modal_delete_sync_note_title') }}
              </h3>
              <p class="text-xs text-orange-800 dark:text-orange-200 mt-1">
                {{
                  t('modal_delete_sync_note_desc', {
                    source: getWorkoutSourceLabel(workout)
                  })
                }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="t('banner_exit')"
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isDeleteModalOpen = false
            }
          "
        />
        <UButton
          :label="t('controls_delete')"
          color="error"
          :loading="deleting"
          @click="
            () => {
              void deleteWorkout()
            }
          "
        />
      </div>
    </template>
  </UModal>

  <UModal
    v-model:open="isDuplicateUnlinkModalOpen"
    title="Unlink Duplicate Workout"
    :description="
      duplicateUnlinkTargetName
        ? `Remove the duplicate link for ${duplicateUnlinkTargetName}? Both workouts will remain in your history as separate activities.`
        : 'Remove this duplicate link? Both workouts will remain in your history as separate activities.'
    "
  >
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          color="neutral"
          variant="ghost"
          @click="
            () => {
              isDuplicateUnlinkModalOpen = false
            }
          "
        >
          Cancel
        </UButton>
        <UButton
          color="warning"
          :loading="Boolean(unlinkingDuplicateId)"
          @click="
            () => {
              void unlinkDuplicateWorkout()
            }
          "
        >
          Unlink
        </UButton>
      </div>
    </template>
  </UModal>

  <WorkoutsWorkoutComparisonDock />
</template>

<script setup lang="ts">
  import { useNow } from '@vueuse/core'
  import { nextTick } from 'vue'
  import { useTranslate } from '@tolgee/vue'
  import { marked } from 'marked'
  import PlanAdherence from '~/components/workouts/PlanAdherence.vue'
  import StreamChartModal from '~/components/charts/streams/StreamChartModal.vue'
  import { getWorkoutSourceLabel } from '~/utils/workout-source'
  import { metricTooltips } from '~/utils/tooltips'
  import { getAnalysisStatusColor } from '~/utils/analysis-status'
  import {
    convertElevation,
    formatDistance as formatDist,
    formatElevation as formatElev,
    formatTemperature,
    getElevationUnitLabel,
    getVelocityUnitLabel,
    isRideWorkoutType
  } from '~/utils/metrics'

  const { t } = useTranslate('workout')
  const { t: tt } = useTranslate('workout-tooltips')

  const { formatDate: baseFormatDate, formatDateTime, formatDateUTC, formatTime } = useFormat()
  const { trackWorkoutViewDetail, trackWorkoutSectionView } = useAnalytics()
  const isPageActive = ref(true)

  type WorkoutSectionKey =
    | 'overview'
    | 'training-impact'
    | 'exercises'
    | 'nutrition'
    | 'analysis'
    | 'power-curve'
    | 'intervals'
    | 'advanced'
    | 'map'
    | 'pacing'
    | 'timeline'
    | 'zones'
    | 'efficiency'
    | 'notes'
    | 'metrics'
    | 'streams'
    | 'duplicates'
    | 'raw-data'

  type WorkoutJourneyView = 'summary' | 'analysis' | 'details'
  const workoutJourneyView = ref<WorkoutJourneyView>('summary')
  const workoutJourneyViews = computed(() => [
    { value: 'summary' as const, label: t.value('journey_summary') },
    { value: 'analysis' as const, label: t.value('journey_analysis') },
    { value: 'details' as const, label: t.value('journey_details') }
  ])
  const workoutJourneySectionGroups: Record<WorkoutSectionKey, WorkoutJourneyView> = {
    overview: 'summary',
    'training-impact': 'summary',
    exercises: 'summary',
    nutrition: 'summary',
    notes: 'summary',
    analysis: 'analysis',
    'power-curve': 'analysis',
    intervals: 'analysis',
    advanced: 'analysis',
    map: 'analysis',
    pacing: 'analysis',
    timeline: 'analysis',
    zones: 'analysis',
    efficiency: 'analysis',
    metrics: 'details',
    streams: 'details',
    duplicates: 'details',
    'raw-data': 'details'
  }

  function isJourneySectionVisible(sectionKey: WorkoutSectionKey) {
    return (
      workoutJourneySectionGroups[sectionKey] === workoutJourneyView.value &&
      isSectionEnabled(sectionKey)
    )
  }

  function selectWorkoutJourneyView(view: WorkoutJourneyView) {
    workoutJourneyView.value = view
    deferredSectionsReady.value = true
  }

  interface WorkoutSectionSettings {
    [key: string]: {
      visible: boolean
      order: number
    }
  }

  definePageMeta({
    middleware: 'auth'
  })

  const route = useRoute()
  const router = useRouter()
  const toast = useToast()
  const config = useRuntimeConfig()
  const { showQuotaPaywall, getOperationQuota, isQuotaExhausted } = useQuotaPaywall()
  const workoutAnalysisQuota = ref<any>(null)
  const comparisonStore = useWorkoutComparisonStore()
  const userStore = useUserStore()
  const nutritionEnabled = computed(
    () =>
      userStore.profile?.nutritionTrackingEnabled !== false &&
      userStore.user?.nutritionTrackingEnabled !== false
  )

  const workout = ref<any>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  const deferredSectionsReady = ref(false)
  let deferredSectionsTimer: ReturnType<typeof setTimeout> | null = null
  const savingTags = ref(false)
  const showTagEditor = ref(false)
  const analysisFactsOpen = ref(false)
  const quotaClock = useNow({ interval: 30_000 })
  const canAnalyzeNowAfterQuotaReset = computed(() => {
    if (workout.value?.aiAnalysisStatus !== 'QUOTA_EXCEEDED') return false
    if (!workoutAnalysisQuota.value) return false
    return !isQuotaExhausted(workoutAnalysisQuota.value, quotaClock.value)
  })

  async function refreshWorkoutAnalysisQuota() {
    if (workout.value?.aiAnalysisStatus === 'QUOTA_EXCEEDED') {
      workoutAnalysisQuota.value = await getOperationQuota('workout_analysis')
    }
  }

  async function openWorkoutQuotaUpgrade() {
    await showQuotaPaywall({
      operation: 'workout_analysis',
      title: 'Unlock Workout Analysis',
      featureTitle: 'Workout Analysis',
      reason: 'quota_skipped_workout',
      quota: workoutAnalysisQuota.value
    })
  }

  watch(
    () => workout.value?.aiAnalysisStatus,
    () => {
      void refreshWorkoutAnalysisQuota()
    },
    { immediate: true }
  )
  const analyzingWorkout = ref(false)
  const analyzingAdherence = ref(false)
  const unlinkingPlannedWorkout = ref(false)
  const promoting = ref(false)
  const deleting = ref(false)
  const publishingSummary = ref(false)
  const savingToLibrary = ref(false)
  const unlinkingDuplicateId = ref<string | null>(null)

  const isPromoteModalOpen = ref(false)
  const isShareModalOpen = ref(false)
  const isExtrasMetaModalOpen = ref(false)
  const isWorkoutSectionsModalOpen = ref(false)
  const isDuplicateUnlinkModalOpen = ref(false)
  const shareExpiryValue = ref('never')
  const duplicateUnlinkTargetId = ref<string | null>(null)
  const duplicateUnlinkTargetName = ref('')

  const stomachFeel = ref<number | null>(null)

  function isWorkoutInComparison(workoutId?: string | null) {
    return workoutId ? comparisonStore.isSelected(workoutId) : false
  }

  function toggleWorkoutComparison() {
    if (!workout.value?.id) return

    comparisonStore.toggleWorkout({
      id: workout.value.id,
      title: workout.value.title || 'Workout',
      type: workout.value.type || null,
      date: workout.value.date || null,
      athleteName: userStore.profile?.name || userStore.user?.email || 'Athlete'
    })

    toast.add({
      title: comparisonStore.isSelected(workout.value.id)
        ? 'Workout added to comparison'
        : 'Workout removed from comparison',
      color: 'success'
    })
  }

  const { shareLink, generatingShareLink, generateShareLink } = useResourceShare(
    'WORKOUT',
    computed(() => workout.value?.id)
  )

  const copyToClipboard = () => {
    if (!shareLink.value) return
    if (import.meta.client) {
      navigator.clipboard.writeText(shareLink.value)
      toast.add({
        title: 'Copied',
        description: 'Link copied to clipboard.',
        color: 'success'
      })
    }
  }

  watch(isShareModalOpen, (newValue) => {
    if (newValue && !shareLink.value) {
      generateShareLink()
    }
  })

  const renderedAnalysis = computed(() => {
    if (!workout.value?.aiAnalysis) return ''
    return marked(workout.value.aiAnalysis)
  })

  const analysisFacts = computed(() => workout.value?.analysisFacts || null)
  const analysisFactsV2 = computed(() => workout.value?.analysisFactsV2 || null)
  const hasAnalysisFactsPanel = computed(() =>
    Boolean(analysisFactsV2.value || analysisFacts.value)
  )
  const analysisFactsVersionLabel = computed(() => (analysisFactsV2.value ? 'v2' : 'v1'))
  const analysisFactTooltips: Record<string, string> = {
    rpe: 'The athlete-reported intensity of the full session on the RPE scale.',
    sessionRpeLoad:
      'Session RPE multiplied by duration in minutes. This reflects total subjective toll, not a heart-rate zone.',
    subjectiveObjectiveGap:
      'How far the athlete’s subjective load diverges from objective load markers like TSS or training load.',
    musculoskeletalToll:
      'Estimated impact and tissue stress from the session, especially useful for running and strength work.',
    impactProfile:
      'Baseline mechanical impact expectation for the sport, used to contextualize subjective load.',
    analysisMode:
      'Which signal family should lead interpretation for this workout: power, pace, RPE, or a mixed view.',
    hrUsable:
      'Whether heart-rate telemetry is trustworthy enough to support physiological conclusions.',
    hrZeroRatio:
      'Share of HR samples that were literal zero values, which are treated as invalid telemetry.',
    hrMissingRatio:
      'Share of HR samples that were missing or invalid, indicating unreliable heart-rate coverage.',
    hrArtifactFlag:
      'True when the heart-rate stream shows enough placeholder or invalid data to treat it as artifact-prone.',
    powerSourceType:
      'Whether power is treated as direct measured mechanical power, estimated/modelled power, or unknown.',
    powerAbsoluteUsable:
      'Whether the absolute power number is reliable enough to use as a benchmark, not just a relative trend.',
    powerRelativeUsable:
      'Whether available power can still be used for within-athlete trend tracking even if absolute accuracy is uncertain.',
    lrBalanceUsable:
      'Whether left/right balance can be interpreted safely after checking source semantics and possible channel issues.',
    normalHrLagExpected:
      'Whether delayed HR response should be expected physiologically for this workout type and effort profile.',
    normalHrLagDetected:
      'Whether the workout shows a normal delayed HR rise after power or pace increases rather than a sensor problem.',
    steadyStateSegmentsAvailable:
      'Whether there is enough sustained steady work after warm-up to support durability-style physiology checks.',
    warmupExcludedMinutes:
      'Minutes excluded from decoupling logic so warm-up kinetics do not create false positives.',
    decouplingValid:
      'Whether decoupling should be interpreted at all for this session based on duration and telemetry quality.',
    decouplingEffective:
      'The effective post-warm-up decoupling value used for debugging. Negative values can indicate efficiency gain.',
    decouplingDirection:
      'Classifies the session as positive drift, stable, or efficiency gain after excluding the warm-up phase.',
    decouplingConfidence:
      'Confidence in the decoupling reading based on workout duration and signal quality.',
    sourceSemantics:
      'Describes what the L/R balance channels likely represent: true left/right legs, human-vs-motor, or unknown.',
    inversionSuspected:
      'True when the balance channels appear reversed and need correction before interpretation.',
    correctedLeftPct:
      'Left-side percentage after any sanity correction or inversion handling has been applied.',
    correctedRightPct:
      'Right-side percentage after any sanity correction or inversion handling has been applied.',
    interpretationMode:
      'Whether L/R balance is used normally, corrected first, or disabled entirely.',
    correctionReason: 'Short explanation for why L/R interpretation was corrected or disabled.',
    detected:
      'Whether ERG mode was detected from explicit metadata or a strong inferred trainer-control signature.',
    confidence:
      'Confidence level for the current diagnostic group, especially ERG and decoupling inference.',
    source:
      'Whether the ERG inference came from explicit metadata, heuristic inference, or remains unknown.',
    powerControlMode:
      'The likely trainer control mode: ERG, resistance/slope-style control, free ride, or unknown.',
    reasons: 'Short reasons explaining why the system inferred the current ERG status.',
    computedFrom: 'Inputs used to compute this fact payload for the current workout.',
    unavailableInputs: 'Inputs that were missing, so some facts may be downgraded or unavailable.',
    disabledInterpretations:
      'Interpretations intentionally suppressed because the available data is not trustworthy enough.',
    primaryArchetype: 'High-level workout intent classification used to drive the AI analysis.',
    executionEnvironment:
      'Execution environment determines whether pacing is athlete-driven, trainer-enforced, or treadmill-based.',
    primaryMetric:
      'The primary metric the AI should prioritize for interpreting execution quality.',
    sessionSteadiness:
      'Describes whether the session is steady, rolling, stochastic, or interval-based.',
    hrArtifactSeverity: 'How severe the HR telemetry artifacts are if present.',
    paceUsable: 'Whether pace should be trusted as a meaningful execution signal.',
    gpsConfidence: 'Confidence in pace/GPS interpretation, mainly for running-style sessions.',
    suppressions: 'Signals the AI is explicitly instructed not to interpret from this workout.',
    planLinked: 'Whether this workout was linked to a planned session.',
    adherenceAssessable:
      'Whether planned-vs-actual adherence can be scored defensibly with the available data.',
    adherenceReason: 'Explanation for why adherence is or is not assessable.',
    completionPct: 'Compact summary of how much of the planned session was completed.',
    durationVsPlanPct: 'Actual duration as a percentage of planned duration.',
    workIntervalHitRate:
      'Percentage of planned work intervals that landed near their intended target.',
    recoveryHitRate: 'Percentage of planned recovery intervals that matched the expected target.',
    targetOvershootPct:
      'Average amount the athlete overshot planned targets when they went too hard.',
    targetUndershootPct:
      'Average amount the athlete undershot planned targets when they went too easy.',
    structureMatched:
      'Whether the actual session structure resembled the planned work/recovery pattern.',
    executionClassification:
      'High-level classification of how the session was executed relative to the plan.',
    decouplingInterpretable: 'Whether classic decoupling is valid to discuss for this workout.',
    decouplingReason: 'Explanation for why classic decoupling was suppressed or allowed.',
    lateSessionFadePct:
      'Late-session change in the primary workload signal, used as a durability marker.',
    firstVsLastIntervalDeltaPct:
      'Change between the first and last hard interval, used as a repeatability signal.',
    recoveryTrendScore: 'Normalized score for short-term recovery behavior between efforts.',
    executionStabilityScore:
      'Normalized score for how consistently the athlete delivered the session.',
    repeatabilityScore: 'Normalized score for interval-to-interval repeatability.',
    dominantPowerZone: 'Power zone containing the largest share of the session.',
    dominantHrZone: 'Heart-rate zone containing the largest share of the session.',
    timeAboveThresholdPct: 'Share of the session spent above threshold-like intensity bins.',
    cadenceDriftPct: 'Change in cadence between early and late parts of the session.',
    cadenceStabilityScore: 'Normalized score for cadence consistency.',
    torqueProfile: 'Simple cadence-based characterization of pedaling style for cycling workouts.',
    pacingDriftPct: 'Change in running pace/speed between early and late parts of the session.',
    suppressedMetrics: 'Metrics intentionally hidden from AI interpretation for safety.',
    overallConfidence: 'Confidence level for the entire v2 fact payload.'
  }

  const analysisFactsGroups = computed(() => {
    if (analysisFactsV2.value) {
      return [
        {
          key: 'guardrails',
          label: 'Guardrails',
          entries: [
            {
              key: 'analysisMode',
              path: 'guardrails.analysisMode',
              label: 'Analysis Mode',
              value: analysisFactsV2.value.guardrails.analysisMode
            },
            {
              key: 'primaryArchetype',
              path: 'guardrails.archetype.primaryArchetype',
              label: 'Primary Archetype',
              value: analysisFactsV2.value.guardrails.archetype.primaryArchetype
            },
            {
              key: 'executionEnvironment',
              path: 'guardrails.archetype.executionEnvironment',
              label: 'Execution Environment',
              value: analysisFactsV2.value.guardrails.archetype.executionEnvironment
            },
            {
              key: 'primaryMetric',
              path: 'guardrails.archetype.primaryMetric',
              label: 'Primary Metric',
              value: analysisFactsV2.value.guardrails.archetype.primaryMetric
            },
            {
              key: 'sessionSteadiness',
              path: 'guardrails.archetype.sessionSteadiness',
              label: 'Session Steadiness',
              value: analysisFactsV2.value.guardrails.archetype.sessionSteadiness
            },
            {
              key: 'hrUsable',
              path: 'guardrails.telemetry.hrUsable',
              label: 'HR Usable',
              value: analysisFactsV2.value.guardrails.telemetry.hrUsable
            },
            {
              key: 'hrArtifactSeverity',
              path: 'guardrails.telemetry.hrArtifactSeverity',
              label: 'HR Artifact Severity',
              value: analysisFactsV2.value.guardrails.telemetry.hrArtifactSeverity
            },
            {
              key: 'powerSourceType',
              path: 'guardrails.telemetry.powerSourceType',
              label: 'Power Source Type',
              value: analysisFactsV2.value.guardrails.telemetry.powerSourceType
            },
            {
              key: 'paceUsable',
              path: 'guardrails.telemetry.paceUsable',
              label: 'Pace Usable',
              value: analysisFactsV2.value.guardrails.telemetry.paceUsable
            },
            {
              key: 'gpsConfidence',
              path: 'guardrails.telemetry.gpsConfidence',
              label: 'GPS Confidence',
              value: analysisFactsV2.value.guardrails.telemetry.gpsConfidence
            },
            {
              key: 'lrBalanceUsable',
              path: 'guardrails.telemetry.lrBalanceUsable',
              label: 'L/R Balance Usable',
              value: analysisFactsV2.value.guardrails.telemetry.lrBalanceUsable
            },
            {
              key: 'detected',
              path: 'guardrails.erg.detected',
              label: 'ERG Detected',
              value: analysisFactsV2.value.guardrails.erg.detected
            },
            {
              key: 'powerControlMode',
              path: 'guardrails.erg.powerControlMode',
              label: 'Power Control Mode',
              value: analysisFactsV2.value.guardrails.erg.powerControlMode
            },
            {
              key: 'suppressions',
              path: 'guardrails.suppressions',
              label: 'Suppressions',
              value: analysisFactsV2.value.guardrails.suppressions
            }
          ]
        },
        {
          key: 'adherence',
          label: 'Adherence',
          entries: [
            {
              key: 'planLinked',
              path: 'adherence.planLinked',
              label: 'Plan Linked',
              value: analysisFactsV2.value.adherence.planLinked
            },
            {
              key: 'adherenceAssessable',
              path: 'adherence.adherenceAssessable',
              label: 'Adherence Assessable',
              value: analysisFactsV2.value.adherence.adherenceAssessable
            },
            {
              key: 'adherenceReason',
              path: 'adherence.adherenceReason',
              label: 'Adherence Reason',
              value: analysisFactsV2.value.adherence.adherenceReason
            },
            {
              key: 'completionPct',
              path: 'adherence.completionPct',
              label: 'Completion %',
              value: analysisFactsV2.value.adherence.completionPct
            },
            {
              key: 'durationVsPlanPct',
              path: 'adherence.durationVsPlanPct',
              label: 'Duration vs Plan %',
              value: analysisFactsV2.value.adherence.durationVsPlanPct
            },
            {
              key: 'workIntervalHitRate',
              path: 'adherence.workIntervalHitRate',
              label: 'Work Interval Hit Rate',
              value: analysisFactsV2.value.adherence.workIntervalHitRate
            },
            {
              key: 'recoveryHitRate',
              path: 'adherence.recoveryHitRate',
              label: 'Recovery Hit Rate',
              value: analysisFactsV2.value.adherence.recoveryHitRate
            },
            {
              key: 'targetOvershootPct',
              path: 'adherence.targetOvershootPct',
              label: 'Target Overshoot %',
              value: analysisFactsV2.value.adherence.targetOvershootPct
            },
            {
              key: 'targetUndershootPct',
              path: 'adherence.targetUndershootPct',
              label: 'Target Undershoot %',
              value: analysisFactsV2.value.adherence.targetUndershootPct
            },
            {
              key: 'structureMatched',
              path: 'adherence.structureMatched',
              label: 'Structure Matched',
              value: analysisFactsV2.value.adherence.structureMatched
            },
            {
              key: 'executionClassification',
              path: 'adherence.executionClassification',
              label: 'Execution Classification',
              value: analysisFactsV2.value.adherence.executionClassification
            }
          ]
        },
        {
          key: 'performanceSignals',
          label: 'Performance Signals',
          entries: [
            {
              key: 'decouplingInterpretable',
              path: 'performanceSignals.decoupling.interpretable',
              label: 'Decoupling Interpretable',
              value: analysisFactsV2.value.performanceSignals.decoupling.interpretable
            },
            {
              key: 'decouplingReason',
              path: 'performanceSignals.decoupling.reason',
              label: 'Decoupling Reason',
              value: analysisFactsV2.value.performanceSignals.decoupling.reason
            },
            {
              key: 'decouplingEffective',
              path: 'performanceSignals.decoupling.effective',
              label: 'Decoupling Effective',
              value: analysisFactsV2.value.performanceSignals.decoupling.effective
            },
            {
              key: 'decouplingDirection',
              path: 'performanceSignals.decoupling.direction',
              label: 'Decoupling Direction',
              value: analysisFactsV2.value.performanceSignals.decoupling.direction
            },
            {
              key: 'lateSessionFadePct',
              path: 'performanceSignals.durability.lateSessionFadePct',
              label: 'Late Session Fade %',
              value: analysisFactsV2.value.performanceSignals.durability.lateSessionFadePct
            },
            {
              key: 'firstVsLastIntervalDeltaPct',
              path: 'performanceSignals.durability.firstVsLastIntervalDeltaPct',
              label: 'First vs Last Interval Delta %',
              value: analysisFactsV2.value.performanceSignals.durability.firstVsLastIntervalDeltaPct
            },
            {
              key: 'recoveryTrendScore',
              path: 'performanceSignals.durability.recoveryTrendScore',
              label: 'Recovery Trend Score',
              value: analysisFactsV2.value.performanceSignals.durability.recoveryTrendScore
            },
            {
              key: 'executionStabilityScore',
              path: 'performanceSignals.durability.executionStabilityScore',
              label: 'Execution Stability Score',
              value: analysisFactsV2.value.performanceSignals.durability.executionStabilityScore
            },
            {
              key: 'repeatabilityScore',
              path: 'performanceSignals.durability.repeatabilityScore',
              label: 'Repeatability Score',
              value: analysisFactsV2.value.performanceSignals.durability.repeatabilityScore
            },
            {
              key: 'dominantPowerZone',
              path: 'performanceSignals.zones.dominantPowerZone',
              label: 'Dominant Power Zone',
              value: analysisFactsV2.value.performanceSignals.zones.dominantPowerZone
            },
            {
              key: 'dominantHrZone',
              path: 'performanceSignals.zones.dominantHrZone',
              label: 'Dominant HR Zone',
              value: analysisFactsV2.value.performanceSignals.zones.dominantHrZone
            },
            {
              key: 'timeAboveThresholdPct',
              path: 'performanceSignals.zones.timeAboveThresholdPct',
              label: 'Time Above Threshold %',
              value: analysisFactsV2.value.performanceSignals.zones.timeAboveThresholdPct
            },
            {
              key: 'cadenceDriftPct',
              path: 'performanceSignals.sportSpecific.cadenceDriftPct',
              label: 'Cadence Drift %',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.cadenceDriftPct
            },
            {
              key: 'cadenceStabilityScore',
              path: 'performanceSignals.sportSpecific.cadenceStabilityScore',
              label: 'Cadence Stability Score',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.cadenceStabilityScore
            },
            {
              key: 'torqueProfile',
              path: 'performanceSignals.sportSpecific.torqueProfile',
              label: 'Torque Profile',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.torqueProfile
            },
            {
              key: 'pacingDriftPct',
              path: 'performanceSignals.sportSpecific.pacingDriftPct',
              label: 'Pacing Drift %',
              value: analysisFactsV2.value.performanceSignals.sportSpecific.pacingDriftPct
            }
          ]
        },
        {
          key: 'confidence',
          label: 'Confidence',
          entries: [
            {
              key: 'overallConfidence',
              path: 'confidence.overall',
              label: 'Overall Confidence',
              value: analysisFactsV2.value.confidence.overall
            },
            {
              key: 'computedFrom',
              path: 'confidence.debugMeta.computedFrom',
              label: 'Computed From',
              value: analysisFactsV2.value.confidence.debugMeta.computedFrom
            },
            {
              key: 'unavailableInputs',
              path: 'confidence.debugMeta.unavailableInputs',
              label: 'Unavailable Inputs',
              value: analysisFactsV2.value.confidence.debugMeta.unavailableInputs
            },
            {
              key: 'suppressedMetrics',
              path: 'confidence.debugMeta.suppressedMetrics',
              label: 'Suppressed Metrics',
              value: analysisFactsV2.value.confidence.debugMeta.suppressedMetrics
            }
          ]
        }
      ]
    }

    if (!analysisFacts.value) return []

    return [
      {
        key: 'subjective',
        label: 'Subjective',
        entries: [
          {
            key: 'rpe',
            path: 'subjective.rpe',
            label: 'RPE',
            value: analysisFacts.value.subjective.rpe
          },
          {
            key: 'sessionRpeLoad',
            path: 'subjective.sessionRpeLoad',
            label: 'Session RPE Load',
            value: analysisFacts.value.subjective.sessionRpeLoad
          },
          {
            key: 'subjectiveObjectiveGap',
            path: 'subjective.subjectiveObjectiveGap',
            label: 'Subjective vs Objective Gap',
            value: analysisFacts.value.subjective.subjectiveObjectiveGap
          },
          {
            key: 'musculoskeletalToll',
            path: 'subjective.musculoskeletalToll',
            label: 'Musculoskeletal Toll',
            value: analysisFacts.value.subjective.musculoskeletalToll
          },
          {
            key: 'impactProfile',
            path: 'subjective.impactProfile',
            label: 'Impact Profile',
            value: analysisFacts.value.subjective.impactProfile
          }
        ]
      },
      {
        key: 'telemetry',
        label: 'Telemetry',
        entries: [
          {
            key: 'analysisMode',
            path: 'telemetry.analysisMode',
            label: 'Analysis Mode',
            value: analysisFacts.value.telemetry.analysisMode
          },
          {
            key: 'hrUsable',
            path: 'telemetry.hrUsable',
            label: 'HR Usable',
            value: analysisFacts.value.telemetry.hrUsable
          },
          {
            key: 'hrZeroRatio',
            path: 'telemetry.hrZeroRatio',
            label: 'HR Zero Ratio',
            value: analysisFacts.value.telemetry.hrZeroRatio
          },
          {
            key: 'hrMissingRatio',
            path: 'telemetry.hrMissingRatio',
            label: 'HR Missing Ratio',
            value: analysisFacts.value.telemetry.hrMissingRatio
          },
          {
            key: 'hrArtifactFlag',
            path: 'telemetry.hrArtifactFlag',
            label: 'HR Artifact Flag',
            value: analysisFacts.value.telemetry.hrArtifactFlag
          },
          {
            key: 'powerSourceType',
            path: 'telemetry.powerSourceType',
            label: 'Power Source Type',
            value: analysisFacts.value.telemetry.powerSourceType
          },
          {
            key: 'powerAbsoluteUsable',
            path: 'telemetry.powerAbsoluteUsable',
            label: 'Power Absolute Usable',
            value: analysisFacts.value.telemetry.powerAbsoluteUsable
          },
          {
            key: 'powerRelativeUsable',
            path: 'telemetry.powerRelativeUsable',
            label: 'Power Relative Usable',
            value: analysisFacts.value.telemetry.powerRelativeUsable
          },
          {
            key: 'lrBalanceUsable',
            path: 'telemetry.lrBalanceUsable',
            label: 'L/R Balance Usable',
            value: analysisFacts.value.telemetry.lrBalanceUsable
          }
        ]
      },
      {
        key: 'physiology',
        label: 'Physiology',
        entries: [
          {
            key: 'normalHrLagExpected',
            path: 'physiology.normalHrLagExpected',
            label: 'Normal HR Lag Expected',
            value: analysisFacts.value.physiology.normalHrLagExpected
          },
          {
            key: 'normalHrLagDetected',
            path: 'physiology.normalHrLagDetected',
            label: 'Normal HR Lag Detected',
            value: analysisFacts.value.physiology.normalHrLagDetected
          },
          {
            key: 'steadyStateSegmentsAvailable',
            path: 'physiology.steadyStateSegmentsAvailable',
            label: 'Steady-State Segments',
            value: analysisFacts.value.physiology.steadyStateSegmentsAvailable
          },
          {
            key: 'warmupExcludedMinutes',
            path: 'physiology.warmupExcludedMinutes',
            label: 'Warmup Excluded Minutes',
            value: analysisFacts.value.physiology.warmupExcludedMinutes
          },
          {
            key: 'decouplingValid',
            path: 'physiology.decouplingValid',
            label: 'Decoupling Valid',
            value: analysisFacts.value.physiology.decouplingValid
          },
          {
            key: 'decouplingEffective',
            path: 'physiology.decouplingEffective',
            label: 'Decoupling Effective',
            value: analysisFacts.value.physiology.decouplingEffective
          },
          {
            key: 'decouplingDirection',
            path: 'physiology.decouplingDirection',
            label: 'Decoupling Direction',
            value: analysisFacts.value.physiology.decouplingDirection
          },
          {
            key: 'decouplingConfidence',
            path: 'physiology.decouplingConfidence',
            label: 'Decoupling Confidence',
            value: analysisFacts.value.physiology.decouplingConfidence
          }
        ]
      },
      {
        key: 'lrBalance',
        label: 'L/R Balance',
        entries: [
          {
            key: 'sourceSemantics',
            path: 'lrBalance.sourceSemantics',
            label: 'Source Semantics',
            value: analysisFacts.value.lrBalance.sourceSemantics
          },
          {
            key: 'inversionSuspected',
            path: 'lrBalance.inversionSuspected',
            label: 'Inversion Suspected',
            value: analysisFacts.value.lrBalance.inversionSuspected
          },
          {
            key: 'correctedLeftPct',
            path: 'lrBalance.correctedLeftPct',
            label: 'Corrected Left %',
            value: analysisFacts.value.lrBalance.correctedLeftPct
          },
          {
            key: 'correctedRightPct',
            path: 'lrBalance.correctedRightPct',
            label: 'Corrected Right %',
            value: analysisFacts.value.lrBalance.correctedRightPct
          },
          {
            key: 'interpretationMode',
            path: 'lrBalance.interpretationMode',
            label: 'Interpretation Mode',
            value: analysisFacts.value.lrBalance.interpretationMode
          },
          {
            key: 'correctionReason',
            path: 'lrBalance.correctionReason',
            label: 'Correction Reason',
            value: analysisFacts.value.lrBalance.correctionReason
          }
        ]
      },
      {
        key: 'erg',
        label: 'ERG',
        entries: [
          {
            key: 'detected',
            path: 'erg.detected',
            label: 'Detected',
            value: analysisFacts.value.erg.detected
          },
          {
            key: 'confidence',
            path: 'erg.confidence',
            label: 'Confidence',
            value: analysisFacts.value.erg.confidence
          },
          {
            key: 'source',
            path: 'erg.source',
            label: 'Source',
            value: analysisFacts.value.erg.source
          },
          {
            key: 'powerControlMode',
            path: 'erg.powerControlMode',
            label: 'Power Control Mode',
            value: analysisFacts.value.erg.powerControlMode
          },
          {
            key: 'reasons',
            path: 'erg.reasons',
            label: 'Reasons',
            value: analysisFacts.value.erg.reasons
          }
        ]
      },
      {
        key: 'debugMeta',
        label: 'Debug Meta',
        entries: [
          {
            key: 'computedFrom',
            path: 'debugMeta.computedFrom',
            label: 'Computed From',
            value: analysisFacts.value.debugMeta.computedFrom
          },
          {
            key: 'unavailableInputs',
            path: 'debugMeta.unavailableInputs',
            label: 'Unavailable Inputs',
            value: analysisFacts.value.debugMeta.unavailableInputs
          },
          {
            key: 'disabledInterpretations',
            path: 'debugMeta.disabledInterpretations',
            label: 'Disabled Interpretations',
            value: analysisFacts.value.debugMeta.disabledInterpretations
          }
        ]
      }
    ]
  })

  function formatFactValue(value: unknown) {
    if (value === null || value === undefined || value === '') return 'Unavailable'
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
    if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : 'None'
    return String(value)
  }

  function getFactBadgeColor(value: boolean) {
    return value ? 'success' : 'warning'
  }

  function getSummaryBadgeColor(value: unknown) {
    return typeof value === 'boolean' ? getFactBadgeColor(value) : 'neutral'
  }

  const analysisFactsSummaryBadges = computed(() => {
    if (analysisFactsV2.value) {
      return [
        {
          key: 'hrUsable',
          label: 'HR Usable',
          value: analysisFactsV2.value.guardrails.telemetry.hrUsable
        },
        {
          key: 'primaryArchetype',
          label: 'Archetype',
          value: analysisFactsV2.value.guardrails.archetype.primaryArchetype
        },
        {
          key: 'executionClassification',
          label: 'Execution',
          value: analysisFactsV2.value.adherence.executionClassification
        },
        {
          key: 'decouplingInterpretable',
          label: 'Decoupling',
          value: analysisFactsV2.value.performanceSignals.decoupling.interpretable
        }
      ]
    }

    if (!analysisFacts.value) return []
    return [
      {
        key: 'hrUsable',
        label: 'HR Usable',
        value: analysisFacts.value.telemetry.hrUsable
      },
      {
        key: 'analysisMode',
        label: 'Analysis Mode',
        value: analysisFacts.value.telemetry.analysisMode
      },
      {
        key: 'lrMode',
        label: 'L/R Mode',
        value: analysisFacts.value.lrBalance.interpretationMode
      }
    ]
  })

  const promptDecisions = computed(
    () =>
      analysisFactsV2.value?.confidence?.debugMeta?.promptDecisions ||
      analysisFacts.value?.debugMeta?.promptDecisions ||
      {}
  )
  const includedPromptFactsCount = computed(
    () => Object.values(promptDecisions.value).filter((decision: any) => decision.include).length
  )
  const ignoredPromptFactsCount = computed(
    () => Object.values(promptDecisions.value).filter((decision: any) => !decision.include).length
  )

  function getPromptDecision(path: string) {
    return (
      promptDecisions.value[path] || { include: false, reason: 'No prompt decision available.' }
    )
  }

  function getPromptDecisionInclude(path: string) {
    return getPromptDecision(path).include
  }

  function getPromptDecisionReason(path: string) {
    return getPromptDecision(path).reason
  }

  function getPromptDecisionValueClass(path: string) {
    return getPromptDecisionInclude(path)
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-gray-500 dark:text-gray-400'
  }

  const splitWorkoutTags = (tags: unknown) => {
    const values = Array.isArray(tags)
      ? tags.filter((tag): tag is string => typeof tag === 'string')
      : []

    return {
      intervals: values.filter((tag) => tag.startsWith('icu:')),
      local: values.filter((tag) => !tag.startsWith('icu:'))
    }
  }

  const localTagDraft = ref<string[]>([])

  const intervalsSourceTags = computed(() => splitWorkoutTags(workout.value?.tags).intervals)
  const localWorkoutTags = computed(() => splitWorkoutTags(workout.value?.tags).local)
  const normalizedLocalTagDraft = computed(() =>
    Array.from(
      new Set(
        localTagDraft.value
          .map((tag) => tag.trim().replace(/\s+/g, ' ').toLowerCase())
          .filter((tag) => tag.length > 0 && !tag.startsWith('icu:'))
      )
    )
  )
  const hasLocalTagChanges = computed(() => {
    if (normalizedLocalTagDraft.value.length !== localWorkoutTags.value.length) return true

    return normalizedLocalTagDraft.value.some((tag, index) => tag !== localWorkoutTags.value[index])
  })

  const syncLocalTagDraft = () => {
    localTagDraft.value = [...localWorkoutTags.value]
  }

  const resetLocalTags = () => {
    syncLocalTagDraft()
  }

  watch(
    () => workout.value?.tags,
    () => {
      syncLocalTagDraft()
    },
    { immediate: true }
  )

  const isOnboarded = computed(() => {
    // 1. Check if ANY data (Workouts, Nutrition, or Wellness)
    if (
      userStore.dataSyncStatus?.workouts ||
      userStore.dataSyncStatus?.nutrition ||
      userStore.dataSyncStatus?.wellness
    )
      return true

    return false
  })

  const canPublishSummaryToIntervals = computed(() => {
    return (
      workout.value &&
      workout.value.source === 'intervals' &&
      (workout.value.aiAnalysis || workout.value.aiAnalysisJson)
    )
  })

  // Metric modal state
  const isMetricModalOpen = ref(false)
  const activeMetric = ref<{
    key: string
    value: string | number
    unit?: string
    rating?: string
    ratingColor?: 'success' | 'warning' | 'error' | 'neutral'
  } | null>(null)

  function handleOpenMetric(metric: any) {
    activeMetric.value = metric
    isMetricModalOpen.value = true
  }

  // Stream modal state
  const isStreamModalOpen = ref(false)
  const selectedStream = ref<{
    key: string
    label: string
    color: string
    unit: string
  } | null>(null)

  function openStreamModal(stream: any) {
    selectedStream.value = stream
    isStreamModalOpen.value = true
  }

  const dismissedThresholds = ref<string[]>([])

  const detectedThresholds = computed(() => {
    if (!workout.value || !workout.value.thresholdDetection) return []
    const uniqueThresholds: Record<string, any> = {}

    workout.value.thresholdDetection
      .filter((d: any) => !dismissedThresholds.value.includes(d.type))
      .forEach((detection: any) => {
        const sport = detection.sport || 'General'
        const label = detection.label || detection.type
        const unit = detection.unit || (detection.type === 'LTHR' ? 'bpm' : 'W')
        const key = `${sport}-${detection.type}`

        uniqueThresholds[key] = {
          ...detection,
          sportName: sport,
          label,
          unit,
          peakValue: detection.peakValue || detection.newValue
        }
      })
    return Object.values(uniqueThresholds)
  })

  // Personal Bests State
  const achievements = computed(() => {
    if (!workout.value || !workout.value.personalBests) return []
    return workout.value.personalBests
      .filter((pb: any) => pb && typeof pb.type === 'string' && pb.type.length > 0)
      .map((pb: any) => {
        const isPace = pb.unit === 's'
        let displayValue = pb.value.toString()
        if (isPace) {
          const mins = Math.floor(pb.value / 60)
          const secs = Math.floor(pb.value % 60)
          displayValue = `${mins}:${secs.toString().padStart(2, '0')}`
        }

        // Localize common PB types
        let label = pb.type.replace(/_/g, ' ').replace('RUN ', '').replace('POWER ', 'Peak ')
        const typeKey = `achievement_${pb.type.toLowerCase()}`
        if (typeof t.value === 'function' && t.value(typeKey) !== typeKey) {
          label = t.value(typeKey)
        }

        return {
          ...pb,
          displayValue,
          label
        }
      })
  })

  function openThresholdUpdate(detection: any) {
    activeDetection.value = detection
    isThresholdModalOpen.value = true
  }

  async function confirmThresholdUpdate() {
    if (!activeDetection.value) return

    const metricKey = activeDetection.value.type.toLowerCase()
    const success = await userStore.updateUserMetrics(
      {
        [metricKey]: activeDetection.value.newValue
      },
      workout.value?.type
    )

    if (success) {
      isThresholdModalOpen.value = false
      dismissedThresholds.value.push(activeDetection.value.type)
    }
  }

  const isEditModalOpen = ref(false)
  const isDeleteModalOpen = ref(false)

  const onDeleteRequested = () => {
    isEditModalOpen.value = false
    isDeleteModalOpen.value = true
  }

  const isThresholdModalOpen = ref(false)
  const activeDetection = ref<any>(null)

  const extrasMetaData = computed<Record<string, any> | null>(() => {
    const value = workout.value?.streams?.extrasMeta
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, any>
  })

  const fitSessionSummary = computed(() => {
    return extrasMetaData.value?.fitSession || null
  })

  // Available metrics computed property
  const availableMetrics = computed(() => {
    if (!workout.value) return []
    const metrics = []

    // Time & Distance
    if (workout.value.durationSec)
      metrics.push({
        key: 'duration',
        label: t.value('metrics_duration'),
        value: formatDuration(workout.value.durationSec)
      })
    if (workout.value.distance)
      metrics.push({
        key: 'distance',
        label: t.value('metrics_distance'),
        value: formatDistance(workout.value.distance)
      })

    // Intensity & Load
    if (workout.value.tss)
      metrics.push({
        key: 'tss',
        label: t.value('metrics_tss'),
        value: workout.value.tss.toFixed(1)
      })
    if (workout.value.intensity)
      metrics.push({
        key: 'intensity',
        label: 'Intensity (IF)',
        value: workout.value.intensity.toFixed(2)
      })
    if (workout.value.trainingLoad)
      metrics.push({
        key: 'load',
        label: 'Training Load',
        value: workout.value.trainingLoad.toFixed(0)
      })

    // Heart Rate
    if (workout.value.averageHr)
      metrics.push({
        key: 'avgHr',
        label: t.value('metrics_avg_hr'),
        value: `${workout.value.averageHr} bpm`
      })
    if (workout.value.maxHr)
      metrics.push({
        key: 'maxHr',
        label: t.value('metrics_max_hr'),
        value: `${workout.value.maxHr} bpm`
      })

    // Power
    if (workout.value.averageWatts)
      metrics.push({
        key: 'avgWatts',
        label: t.value('metrics_avg_power'),
        value: `${workout.value.averageWatts}W`
      })
    if (workout.value.maxWatts)
      metrics.push({
        key: 'maxWatts',
        label: t.value('metrics_max_power'),
        value: `${workout.value.maxWatts}W`
      })
    if (workout.value.normalizedPower)
      metrics.push({
        key: 'np',
        label: t.value('metrics_np'),
        value: `${workout.value.normalizedPower}W`
      })
    if (workout.value.variabilityIndex)
      metrics.push({
        key: 'vi',
        label: 'Variability Index (VI)',
        value: workout.value.variabilityIndex.toFixed(2)
      })
    if (workout.value.efficiencyFactor)
      metrics.push({
        key: 'ef',
        label: 'Efficiency Factor (EF)',
        value: workout.value.efficiencyFactor.toFixed(2)
      })

    // Others
    if (workout.value.averageCadence)
      metrics.push({
        key: 'cadence',
        label: t.value('metrics_avg_cadence'),
        value: `${workout.value.averageCadence} rpm`
      })
    if (workout.value.calories)
      metrics.push({
        key: 'calories',
        label: t.value('metrics_calories'),
        value: `${workout.value.calories} kcal`
      })
    if (workout.value.elevationGain)
      metrics.push({
        key: 'elevation',
        label: t.value('metrics_elevation'),
        value: formatElevation(workout.value.elevationGain)
      })
    if (workout.value.kilojoules)
      metrics.push({ key: 'kj', label: 'Work (kJ)', value: `${workout.value.kilojoules} kJ` })
    if (workout.value.strainScore)
      metrics.push({
        key: 'strain',
        label: 'Strain Score',
        value: workout.value.strainScore.toFixed(1)
      })
    if (workout.value.hrLoad)
      metrics.push({ key: 'hrLoad', label: 'HR Load', value: workout.value.hrLoad.toFixed(0) })
    if (workout.value.workAboveFtp)
      metrics.push({
        key: 'workAboveFtp',
        label: t.value('metrics_work') + ' > FTP',
        value: `${(workout.value.workAboveFtp / 1000).toFixed(1)} kJ`
      })
    if (workout.value.wBalDepletion)
      metrics.push({
        key: 'wBal',
        label: "W' Bal Depletion",
        value: `${(workout.value.wBalDepletion / 1000).toFixed(1)} kJ`
      })
    if (workout.value.wPrime)
      metrics.push({
        key: 'wPrime',
        label: "W'",
        value: `${(workout.value.wPrime / 1000).toFixed(1)} kJ`
      })
    if (workout.value.carbsUsed)
      metrics.push({
        key: 'carbs',
        label: t.value('metrics_carbs'),
        value: `${workout.value.carbsUsed} g`
      })

    // Training status
    if (workout.value.ctl)
      metrics.push({ key: 'ctl', label: 'CTL (Fitness)', value: workout.value.ctl.toFixed(1) })
    if (workout.value.atl)
      metrics.push({ key: 'atl', label: 'ATL (Fatigue)', value: workout.value.atl.toFixed(1) })
    if (workout.value.ftp)
      metrics.push({ key: 'ftp', label: 'FTP at Time', value: `${workout.value.ftp}W` })

    // Subjective metrics
    if (workout.value.rpe)
      metrics.push({ key: 'rpe', label: 'RPE', value: `${workout.value.rpe}/10` })
    if (workout.value.sessionRpe)
      metrics.push({ key: 'srpe', label: 'Session RPE', value: `${workout.value.sessionRpe}` })
    // Standardized feel scale is 1-5 (1=Weak, 5=Strong)
    if (workout.value.feel)
      metrics.push({ key: 'feel', label: 'Feel', value: `${workout.value.feel}/5` })
    if (workout.value.trimp)
      metrics.push({ key: 'trimp', label: 'TRIMP', value: `${workout.value.trimp}` })

    // Environment
    if (workout.value.avgTemp !== null && workout.value.avgTemp !== undefined)
      metrics.push({
        key: 'temp',
        label: t.value('metrics_temp'),
        value: formatTemperature(
          workout.value.avgTemp,
          userStore.profile?.temperatureUnits || 'Celsius'
        )
      })
    if (workout.value.trainer !== null && workout.value.trainer !== undefined)
      metrics.push({
        key: 'trainer',
        label: t.value('trainer_indoor'),
        value: workout.value.trainer ? t.value('trainer_yes') : t.value('trainer_no')
      })

    const sessionSummary = fitSessionSummary.value
    if (sessionSummary) {
      if (sessionSummary.totalElapsedTime !== null && sessionSummary.totalElapsedTime !== undefined)
        metrics.push({
          key: 'fitTotalElapsedTime',
          label: 'Elapsed Time',
          value: formatDuration(Math.round(sessionSummary.totalElapsedTime)),
          source: 'fit'
        })

      if (sessionSummary.totalTimerTime !== null && sessionSummary.totalTimerTime !== undefined)
        metrics.push({
          key: 'fitTotalTimerTime',
          label: 'Timer Time',
          value: formatDuration(Math.round(sessionSummary.totalTimerTime)),
          source: 'fit'
        })

      if (sessionSummary.totalDistance !== null && sessionSummary.totalDistance !== undefined)
        metrics.push({
          key: 'fitTotalDistance',
          label: t.value('metrics_distance'),
          value: formatDistance(sessionSummary.totalDistance),
          source: 'fit'
        })

      if (sessionSummary.totalAscent !== null && sessionSummary.totalAscent !== undefined)
        metrics.push({
          key: 'fitTotalAscent',
          label: 'Total Ascent',
          value: `${Math.round(sessionSummary.totalAscent)} m`,
          source: 'fit'
        })

      if (sessionSummary.totalDescent !== null && sessionSummary.totalDescent !== undefined)
        metrics.push({
          key: 'fitTotalDescent',
          label: 'Total Descent',
          value: `${Math.round(sessionSummary.totalDescent)} m`,
          source: 'fit'
        })

      if (sessionSummary.totalCalories !== null && sessionSummary.totalCalories !== undefined)
        metrics.push({
          key: 'fitTotalCalories',
          label: t.value('metrics_calories'),
          value: `${Math.round(sessionSummary.totalCalories)} kcal`,
          source: 'fit'
        })

      if (
        (workout.value.averageWatts === null || workout.value.averageWatts === undefined) &&
        sessionSummary.avgPower !== null &&
        sessionSummary.avgPower !== undefined
      )
        metrics.push({
          key: 'fitAvgPower',
          label: t.value('metrics_avg_power'),
          value: `${Math.round(sessionSummary.avgPower)}W`,
          source: 'fit'
        })

      if (
        (workout.value.maxWatts === null || workout.value.maxWatts === undefined) &&
        sessionSummary.maxPower !== null &&
        sessionSummary.maxPower !== undefined
      )
        metrics.push({
          key: 'fitMaxPower',
          label: t.value('metrics_max_power'),
          value: `${Math.round(sessionSummary.maxPower)}W`,
          source: 'fit'
        })

      if (
        (workout.value.maxHr === null || workout.value.maxHr === undefined) &&
        sessionSummary.maxHeartRate !== null &&
        sessionSummary.maxHeartRate !== undefined
      )
        metrics.push({
          key: 'fitMaxHr',
          label: t.value('metrics_max_hr'),
          value: `${Math.round(sessionSummary.maxHeartRate)} bpm`,
          source: 'fit'
        })

      if (
        sessionSummary.trainingStressScore !== null &&
        sessionSummary.trainingStressScore !== undefined
      )
        metrics.push({
          key: 'fitTss',
          label: t.value('metrics_tss'),
          value: Number(sessionSummary.trainingStressScore).toFixed(1),
          source: 'fit'
        })
    }

    return metrics
  })

  // Available streams computed property
  const availableStreams = computed(() => {
    if (!workout.value || !workout.value.streams) return []
    const streams = []
    const isRideWorkout = isRideWorkoutType(workout.value.type)
    const velocityLabel = isRideWorkout ? 'Speed' : 'Velocity'
    const velocityUnit = isRideWorkout
      ? getVelocityUnitLabel(userStore.profile?.distanceUnits || 'Kilometers')
      : 'm/s'

    // Define stream metadata
    const streamMetadata: Record<string, { label: string; color: string; unit: string }> = {
      time: { label: 'Time', color: '#9ca3af', unit: 's' },
      distance: {
        label: t.value('metrics_distance'),
        color: '#6b7280',
        unit: userStore.distanceUnitLabel
      },
      velocity: { label: velocityLabel, color: '#3b82f6', unit: velocityUnit },
      heartrate: { label: 'Heart Rate', color: '#ef4444', unit: 'bpm' },
      cadence: { label: 'Cadence', color: '#f59e0b', unit: 'rpm' },
      watts: { label: t.value('metrics_avg_power'), color: '#8b5cf6', unit: 'W' },
      altitude: {
        label: 'Altitude',
        color: '#10b981',
        unit: getElevationUnitLabel(userStore.profile?.distanceUnits || 'Kilometers')
      },
      latlng: { label: 'GPS', color: '#6366f1', unit: '' },
      grade: { label: 'Grade', color: '#14b8a6', unit: '%' },
      moving: { label: 'Moving', color: '#9ca3af', unit: '' },
      torque: { label: 'Torque', color: '#f97316', unit: 'N-m' },
      temp: {
        label: t.value('metrics_temp'),
        color: '#06b6d4',
        unit: userStore.temperatureUnitLabel
      },
      respiration: { label: 'Respiration', color: '#ec4899', unit: 'brpm' },
      hrv: { label: 'HRV', color: '#84cc16', unit: 'ms' },
      leftRightBalance: { label: 'L/R Balance', color: '#d946ef', unit: '%' },
      targetPower: { label: 'Target Power', color: '#10b981', unit: 'W' }
    }

    const streamKeys = Object.keys(streamMetadata)

    for (const key of streamKeys) {
      if (
        workout.value.streams[key] &&
        Array.isArray(workout.value.streams[key]) &&
        workout.value.streams[key].length > 0
      ) {
        streams.push({
          key,
          ...streamMetadata[key]
        })
      }
    }
    return streams
  })

  const hasExtrasMeta = computed(() => {
    return Boolean(extrasMetaData.value && Object.keys(extrasMetaData.value).length > 0)
  })

  const workoutSectionAvailability = computed<Record<WorkoutSectionKey, boolean>>(() => {
    const currentWorkout = workout.value

    return {
      overview: Boolean(currentWorkout),
      'training-impact': hasTrainingMetrics(currentWorkout),
      exercises: shouldShowExercises(currentWorkout),
      nutrition: Boolean(
        nutritionEnabled.value && (currentWorkout?.kilojoules || currentWorkout?.plannedWorkout)
      ),
      analysis: Boolean(currentWorkout),
      'power-curve': shouldShowDetailedPacing(currentWorkout),
      intervals: shouldShowIntervals(currentWorkout),
      advanced: shouldShowDetailedPacing(currentWorkout),
      map: shouldShowMap(currentWorkout),
      pacing: shouldShowDetailedPacing(currentWorkout),
      timeline: shouldShowDetailedPacing(currentWorkout),
      zones: shouldShowPacing(currentWorkout),
      efficiency: hasEfficiencyMetrics(currentWorkout),
      notes: Boolean(currentWorkout),
      metrics: availableMetrics.value.length > 0,
      streams: availableStreams.value.length > 0 || hasExtrasMeta.value,
      duplicates: Boolean(
        currentWorkout?.isDuplicate ||
        currentWorkout?.duplicates?.length ||
        currentWorkout?.plannedWorkout
      ),
      'raw-data': Boolean(currentWorkout?.rawJson)
    }
  })

  const journeyTrainingImpact = computed(() => [
    {
      key: 'Fitness (CTL)',
      label: 'Fitness',
      value: workout.value?.ctl != null ? Math.round(workout.value.ctl) : null
    },
    {
      key: 'Fatigue (ATL)',
      label: 'Fatigue',
      value: workout.value?.atl != null ? Math.round(workout.value.atl) : null
    },
    {
      key: 'TSS (Load)',
      label: 'Training load',
      value:
        workout.value?.tss != null || workout.value?.trainingLoad != null
          ? Math.round(workout.value.tss ?? workout.value.trainingLoad)
          : null
    },
    {
      key: 'Form (TSB)',
      label: 'Form',
      value: Number.isFinite(calculateForm(workout.value)) ? calculateForm(workout.value) : null
    }
  ])

  const workoutSectionSettings = computed<WorkoutSectionSettings>(() => {
    const saved =
      (userStore.user?.dashboardSettings?.workoutDetailSections as
        Partial<WorkoutSectionSettings> | undefined) || {}

    return workoutSectionCatalog.value.reduce((acc, section) => {
      const fallback = workoutSectionDefaults.value[section.key] || { visible: true, order: 99 }
      const sectionSettings = saved[section.key]
      acc[section.key] = {
        visible: sectionSettings?.visible ?? fallback.visible,
        order: typeof sectionSettings?.order === 'number' ? sectionSettings.order : fallback.order
      }
      return acc
    }, {} as WorkoutSectionSettings)
  })

  const workoutSectionsModalOptions = computed(() =>
    workoutSectionCatalog.value.map((section) => ({
      key: section.key,
      label: section.label,
      icon: section.icon,
      available: workoutSectionAvailability.value[section.key],
      defaultVisible: workoutSectionDefaults.value[section.key]?.visible ?? true
    }))
  )

  const workoutNavSections = computed(() =>
    workoutSectionCatalog.value
      .filter((section) => isJourneySectionVisible(section.key))
      .sort(
        (a, b) =>
          (workoutSectionSettings.value[a.key]?.order ?? 0) -
          (workoutSectionSettings.value[b.key]?.order ?? 0)
      )
  )

  const deferredSectionKeys = new Set<WorkoutSectionKey>([
    'analysis',
    'power-curve',
    'intervals',
    'advanced',
    'map',
    'pacing',
    'timeline',
    'zones',
    'efficiency',
    'metrics',
    'streams',
    'duplicates',
    'raw-data'
  ])

  function shouldRenderSection(sectionKey: WorkoutSectionKey) {
    return (
      isJourneySectionVisible(sectionKey) &&
      (deferredSectionsReady.value || !deferredSectionKeys.has(sectionKey))
    )
  }

  function scheduleDeferredSections() {
    if (!import.meta.client || deferredSectionsReady.value) return

    const renderDeferredSections = () => {
      deferredSectionsTimer = null
      deferredSectionsReady.value = true
    }

    // Keep the first summary paint light; nav clicks can still opt into these sections immediately.
    deferredSectionsTimer = setTimeout(renderDeferredSections, 1500)
  }

  function isSectionEnabled(sectionKey: WorkoutSectionKey) {
    return (
      (workoutSectionSettings.value[sectionKey]?.visible ?? true) &&
      workoutSectionAvailability.value[sectionKey]
    )
  }

  function sectionStyle(sectionKey: WorkoutSectionKey) {
    return {
      order: sectionKey === 'notes' ? -10 : (workoutSectionSettings.value[sectionKey]?.order ?? 0)
    }
  }

  // Fetch workout data
  async function fetchWorkout() {
    if (!isPageActive.value) return
    loading.value = true
    error.value = null
    try {
      const id = route.params.id
      const result = await $fetch<any, string & {}>(`/api/workouts/${id}`)
      if (!isPageActive.value) return
      workout.value = result
    } catch (e: any) {
      if (!isPageActive.value) return
      error.value = e?.data?.message || e?.message || t.value('error_failed_to_load')
      console.error('Error fetching workout:', e)
    } finally {
      if (isPageActive.value) {
        loading.value = false
      }
    }
  }

  async function saveLocalTags() {
    if (!workout.value || savingTags.value || !hasLocalTagChanges.value) return

    savingTags.value = true
    try {
      const response = (await ($fetch as any)(`/api/workouts/${workout.value.id}`, {
        method: 'PATCH',
        body: {
          setLocalTags: normalizedLocalTagDraft.value
        }
      })) as { success: boolean; workout: any }

      workout.value = response.workout
      syncLocalTagDraft()

      toast.add({
        title: 'Tags updated',
        description: 'Workout tags have been saved.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (e: any) {
      console.error('Error updating workout tags:', e)
      toast.add({
        title: 'Failed to update tags',
        description: e?.data?.message || e?.message || 'Could not save workout tags.',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      savingTags.value = false
    }
  }

  // Background Task Monitoring
  const { refresh: refreshRuns } = useUserRuns()
  const { onTaskCompleted, onTaskFailed } = useUserRunsState()

  // Analyze workout function
  async function analyzeWorkout() {
    if (!workout.value) return

    analyzingWorkout.value = true
    try {
      const result = (await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/analyze`, {
        method: 'POST'
      })) as any

      // If already completed, update immediately
      if (result.status === 'COMPLETED' && 'analysis' in result && result.analysis) {
        workout.value.aiAnalysis = result.analysis
        workout.value.aiAnalyzedAt = result.analyzedAt
        workout.value.aiAnalysisStatus = 'COMPLETED'
        analyzingWorkout.value = false

        toast.add({
          title: t.value('analyzing_ready_title'),
          description: t.value('analyzing_ready_desc'),
          color: 'success',
          icon: 'i-heroicons-check-circle'
        })
        return
      }

      // Update status
      workout.value.aiAnalysisStatus = result.status
      refreshRuns()

      // Show processing message
      toast.add({
        title: t.value('analyzing_started_title'),
        description: t.value('analyzing_started_desc'),
        color: 'info',
        icon: 'i-heroicons-sparkles'
      })
    } catch (e: any) {
      console.error('Error triggering workout analysis:', e)
      analyzingWorkout.value = false

      if (e.data?.statusCode === 429 || e.status === 429) {
        await showQuotaPaywall({
          operation: 'workout_analysis',
          title: 'Crush Your Training Momentum',
          featureTitle: 'Workout Analysis',
          reason: 'quota_exceeded'
        })
        return
      }

      toast.add({
        title: t.value('analyzing_failed_title'),
        description: e?.data?.message || e?.message || 'Failed to start workout analysis',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    }
  }

  // Analyze plan adherence
  async function analyzeAdherence() {
    if (!workout.value) return

    analyzingAdherence.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/analyze-adherence`, {
        method: 'POST'
      })
      refreshRuns()

      toast.add({
        title: t.value('analyzing_started_title'),
        description: t.value('analyzing_adherence_started'),
        color: 'info',
        icon: 'i-heroicons-sparkles'
      })
    } catch (e: any) {
      console.error('Error triggering adherence analysis:', e)
      analyzingAdherence.value = false

      if (e.data?.statusCode === 429 || e.status === 429) {
        await showQuotaPaywall({
          operation: 'workout_analysis',
          title: 'Usage Quota Reached',
          featureTitle: 'Plan Adherence Analysis',
          reason: 'quota_exceeded'
        })
        return
      }

      toast.add({
        title: t.value('analyzing_failed_title'),
        description: e?.data?.message || e?.message || 'Failed to start adherence analysis',
        color: 'error'
      })
    }
  }

  async function unlinkPlannedWorkout() {
    if (!workout.value?.id || unlinkingPlannedWorkout.value) return

    unlinkingPlannedWorkout.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/unlink`, {
        method: 'POST'
      })

      toast.add({
        title: 'Unlinked',
        description: 'Workout unlinked from plan',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      await fetchWorkout()
    } catch (e: any) {
      console.error('Error unlinking workout from plan:', e)
      toast.add({
        title: 'Failed to unlink',
        description: e?.data?.message || e?.message || 'Failed to unlink workout from plan',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      unlinkingPlannedWorkout.value = false
    }
  }

  async function publishSummaryToIntervals() {
    if (!workout.value || !canPublishSummaryToIntervals.value || publishingSummary.value) return

    publishingSummary.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/publish-summary`, {
        method: 'POST'
      })

      toast.add({
        title: t.value('analysis_button_publish'),
        description: t.value('publish_summary_success'),
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      await fetchWorkout()
    } catch (e: any) {
      console.error('Error publishing workout summary:', e)
      toast.add({
        title: 'Publish Failed',
        description: e?.data?.message || e?.message || 'Failed to publish workout summary',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      publishingSummary.value = false
    }
  }

  // Listen for completion
  onTaskCompleted('analyze-workout', async () => {
    if (!isPageActive.value) return
    try {
      await fetchWorkout()
      if (!isPageActive.value) return
      analyzingWorkout.value = false
      toast.add({
        title: t.value('analyzing_ready_title'),
        description: 'AI workout analysis has been generated successfully',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (error) {
      console.error('[WorkoutDetail] analyze-workout completion handler failed:', error)
      if (isPageActive.value) {
        analyzingWorkout.value = false
      }
    }
  })

  onTaskCompleted('analyze-plan-adherence', async () => {
    if (!isPageActive.value) return
    try {
      await fetchWorkout()
      if (!isPageActive.value) return
      analyzingAdherence.value = false
      toast.add({
        title: 'Adherence Analysis Complete',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })
    } catch (error) {
      console.error('[WorkoutDetail] analyze-plan-adherence completion handler failed:', error)
      if (isPageActive.value) {
        analyzingAdherence.value = false
      }
    }
  })

  onTaskFailed('analyze-workout', async (run) => {
    if (!isPageActive.value) return
    analyzingWorkout.value = false
    toast.add({
      title: 'Analysis Failed',
      description: run.error?.message || 'AI workout analysis failed',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })

  onTaskFailed('analyze-plan-adherence', async (run) => {
    if (!isPageActive.value) return
    analyzingAdherence.value = false
    toast.add({
      title: 'Adherence Analysis Failed',
      description: run.error?.message || 'Plan adherence analysis failed',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    })
  })

  async function promoteWorkout() {
    if (!workout.value) return
    isPromoteModalOpen.value = true
  }

  function openDuplicateUnlinkConfirm(workoutId: string, workoutTitle?: string | null) {
    duplicateUnlinkTargetId.value = workoutId
    duplicateUnlinkTargetName.value = workoutTitle || ''
    isDuplicateUnlinkModalOpen.value = true
  }

  async function unlinkDuplicateWorkout() {
    if (!duplicateUnlinkTargetId.value) return

    unlinkingDuplicateId.value = duplicateUnlinkTargetId.value
    try {
      await $fetch<any, string & {}>(
        `/api/workouts/${duplicateUnlinkTargetId.value}/unlink-duplicate`,
        {
          method: 'POST'
        }
      )

      toast.add({
        title: 'Workout unlinked',
        description: 'The workouts are no longer linked as duplicates.',
        color: 'success',
        icon: 'i-heroicons-check-circle'
      })

      isDuplicateUnlinkModalOpen.value = false
      duplicateUnlinkTargetId.value = null
      duplicateUnlinkTargetName.value = ''
      await fetchWorkout()
    } catch (e: any) {
      console.error('Failed to unlink duplicate workout:', e)
      toast.add({
        title: 'Failed to unlink workout',
        description: e?.data?.message || e?.message || 'Could not remove the duplicate link.',
        color: 'error',
        icon: 'i-heroicons-exclamation-circle'
      })
    } finally {
      unlinkingDuplicateId.value = null
    }
  }

  async function confirmPromoteWorkout() {
    if (!workout.value) return

    promoting.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/promote`, {
        method: 'POST'
      })

      toast.add({
        title: 'Success',
        description: t.value('promote_success'),
        color: 'success'
      })

      // Refresh to reflect changes
      await fetchWorkout()
      isPromoteModalOpen.value = false
    } catch (e: any) {
      console.error('Failed to promote workout:', e)
      toast.add({
        title: 'Error',
        description: e.data?.message || 'Failed to promote workout',
        color: 'error'
      })
    } finally {
      promoting.value = false
    }
  }

  async function deleteWorkout() {
    if (!workout.value || deleting.value) return

    deleting.value = true
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}`, {
        method: 'DELETE'
      })

      toast.add({
        title: t.value('delete_success_title'),
        description: t.value('delete_success_desc'),
        color: 'success'
      })

      // Navigate back to activities/history
      router.push('/activities')
    } catch (e: any) {
      console.error('Failed to delete workout:', e)
      toast.add({
        title: 'Error',
        description: e.data?.message || 'Failed to delete workout',
        color: 'error'
      })
    } finally {
      deleting.value = false
      isDeleteModalOpen.value = false
    }
  }

  // Utility functions
  function formatDate(date: string | Date) {
    return formatDateTime(date, 'EEEE, MMMM d, yyyy h:mm a')
  }

  function formatTimeOnly(date: string | Date) {
    return formatTime(date)
  }

  function formatDatePrimary(date: string | Date) {
    if (!date) return ''
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  function formatDateWeekday(date: string | Date) {
    if (!date) return ''
    const d = new Date(date)
    return d.toLocaleDateString('en-US', {
      weekday: 'long'
    })
  }

  function navigateDate(direction: number) {
    if (!workout.value) return
    const neighborId = direction > 0 ? workout.value.nextWorkoutId : workout.value.prevWorkoutId

    if (neighborId) {
      navigateTo(`/workouts/${neighborId}`)
    } else {
      // Fallback: if no neighbor, go to activities for that date range
      const baseDate = new Date(workout.value.date)
      const targetDate = new Date(baseDate)
      targetDate.setDate(baseDate.getDate() + direction)
      navigateTo({
        path: '/activities',
        query: { date: targetDate.toISOString().split('T')[0] }
      })
    }
  }

  function formatDuration(seconds: number) {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`
    }
    return `${secs}s`
  }

  function formatDurationShort(seconds: number): string {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  function getIntensityColorClass(intensity: number | null, type: 'text' | 'bg' = 'text') {
    const val = intensity || 0
    if (val < 0.75) return type === 'text' ? 'text-[#00DC82]' : 'bg-[#00DC82]'
    if (val < 0.85) return type === 'text' ? 'text-yellow-500' : 'bg-yellow-500'
    if (val < 0.95) return type === 'text' ? 'text-orange-500' : 'bg-orange-500'
    return type === 'text' ? 'text-red-500' : 'bg-red-500'
  }

  function formatDistance(meters: number) {
    return formatDist(meters, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function formatElevation(meters: number) {
    return formatElev(meters, userStore.profile?.distanceUnits || 'Kilometers')
  }

  function getSourceBadgeClass(source: string) {
    const baseClass = 'px-3 py-1 rounded-full text-xs font-semibold'
    if (source === 'intervals')
      return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`
    if (source === 'whoop')
      return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200`
    if (source === 'strava')
      return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200`
    if (source === 'rouvy')
      return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`
    if (source === 'garmin')
      return `${baseClass} bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200`
    return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200`
  }

  function shouldShowSyncSourceNote(workout: any) {
    if (!workout) return false
    if (workout.source === 'manual') return false
    if (workout.source === 'fit_file') return Boolean(workout.oauthAppId)
    return true
  }

  /**
   * HUD pill styling for an AI analysis section status. The severity decision itself
   * lives in `~/utils/analysis-status` so this page, the report page, the share page
   * and the score modal cannot disagree about it again (CW-424); only the pill's
   * look is local.
   */
  function getStatusPillClass(status?: string | null) {
    // Each branch carries an explicit light value: the pill text is 8px, and the
    // bright HUD tones these dark-mode values use (the brand `#00DC82` in
    // particular) drop under 2:1 against the light card background.
    switch (getAnalysisStatusColor(status)) {
      case 'success':
        return 'border-emerald-600/30 dark:border-[#00DC82]/30 text-emerald-700 dark:text-[#00DC82] bg-emerald-500/10 dark:bg-[#00DC82]/5'
      case 'warning':
        return 'border-amber-600/30 dark:border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/5'
      case 'error':
        return 'border-red-600/30 dark:border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/10 dark:bg-red-500/5'
      case 'info':
        return 'border-blue-600/30 dark:border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/5'
      default:
        return 'border-zinc-500/30 dark:border-zinc-400/30 text-zinc-600 dark:text-zinc-400 bg-zinc-500/10 dark:bg-zinc-500/5'
    }
  }

  function getPriorityBadgeClass(priority: string) {
    const baseClass = 'px-2 py-0.5 rounded text-xs font-medium'
    if (priority === 'high')
      return `${baseClass} bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200`
    if (priority === 'medium')
      return `${baseClass} bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200`
    if (priority === 'low')
      return `${baseClass} bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200`
    return `${baseClass} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200`
  }

  function getPriorityBorderClass(priority: string) {
    if (priority === 'high') return 'border-red-500'
    if (priority === 'medium') return 'border-yellow-500'
    if (priority === 'low') return 'border-blue-500'
    return 'border-gray-300'
  }

  function getScoreCircleClass(score: number) {
    if (score >= 8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
    if (score >= 6) return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    if (score >= 4) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
  }

  function shouldShowExercises(workout: any) {
    if (!workout) return false
    return workout.exercises && workout.exercises.length > 0
  }

  function shouldShowPowerCurve(workout: any) {
    if (!workout) return false
    // Show power curve if workout has power data (watts stream)
    const supportedSources = ['strava', 'rouvy', 'intervals', 'fit_file']
    return (
      supportedSources.includes(workout.source) &&
      workout.streams &&
      (workout.averageWatts || workout.maxWatts)
    )
  }

  function shouldShowMap(workout: any) {
    if (!workout || !workout.streams) return false
    return (
      workout.streams.latlng &&
      Array.isArray(workout.streams.latlng) &&
      workout.streams.latlng.length > 0
    )
  }

  function shouldShowIntervals(workout: any) {
    if (!workout || !workout.streams) return false
    const supportedSources = ['strava', 'rouvy', 'intervals', 'fit_file']
    return (
      supportedSources.includes(workout.source) &&
      (workout.streams.watts || workout.streams.heartrate || workout.streams.velocity)
    )
  }

  function shouldShowPacing(workout: any) {
    if (!workout) return false
    // Show timeline/zones if workout has stream data (time-series HR, power, velocity, etc.)
    // OR if it has cached zone data in rawJson (fallback for Whoop, etc.)
    const supportedSources = ['strava', 'rouvy', 'intervals', 'fit_file', 'whoop']
    const hasRawZones = workout.rawJson?.score?.zone_durations?.length > 0
    const hasStreams =
      workout.streams &&
      (workout.streams.heartrate ||
        workout.streams.watts ||
        workout.streams.velocity ||
        workout.streams.hrZoneTimes ||
        workout.streams.powerZoneTimes)
    return (supportedSources.includes(workout.source) && hasStreams) || hasRawZones
  }

  function shouldShowDetailedPacing(workout: any) {
    if (!workout || !workout.streams) return false
    // Detailed pacing needs raw time-series data
    return workout.streams.heartrate || workout.streams.watts || workout.streams.velocity
  }

  function hasEfficiencyMetrics(workout: any) {
    if (!workout) return false
    return (
      workout.variabilityIndex !== null ||
      workout.efficiencyFactor !== null ||
      workout.decoupling !== null ||
      workout.powerHrRatio !== null ||
      workout.polarizationIndex !== null ||
      workout.lrBalance !== null
    )
  }

  function hasTrainingMetrics(workout: any) {
    if (!workout) return false
    return (
      (workout.tss !== null || workout.trainingLoad !== null) &&
      (workout.ctl !== null || workout.atl !== null)
    )
  }

  function calculateForm(workout: any) {
    if (!workout || workout.ctl === null || workout.atl === null) return null
    return Math.round(workout.ctl - workout.atl)
  }

  function getFormClass(form: number | null) {
    if (form === null)
      return 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-500'

    if (form >= 25)
      return 'bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-blue-900 dark:text-blue-100' // Transition
    if (form >= 5)
      return 'bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 text-green-900 dark:text-green-100' // Fresh
    if (form >= -10)
      return 'bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white' // Grey zone / Neutral
    if (form >= -30)
      return 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-100 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100' // Optimal Training
    return 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 text-red-900 dark:text-red-100' // High Risk
  }

  function highlightTechnicalData(text: string): string {
    if (!text) return ''
    // Regex to match numbers followed by units or specific technical terms
    // Matches: 0.980 VI, 66 rpm, -22 min, 250W, 180bpm, 10.5km, etc.
    const technicalRegex =
      /(\b-?\d+(?:\.\d+)?\s*(?:VI|EF|IF|rpm|min|sec|W|bpm|km|m|kJ|kg|%|TSS|CTL|ATL|TSB)\b)/gi
    return text.replace(
      technicalRegex,
      '<span class="text-[#00DC82] font-black tabular-nums">$1</span>'
    )
  }

  // Scroll to section
  function scrollToSection(sectionId: string) {
    if (!sectionId) return
    const section = workoutSectionCatalog.value.find((entry) => entry.anchorId === sectionId)
    if (section) workoutJourneyView.value = workoutJourneySectionGroups[section.key]
    trackWorkoutSectionView(sectionId)
    if (!deferredSectionsReady.value) {
      deferredSectionsReady.value = true
    }

    void nextTick(() => {
      const element = document.getElementById(sectionId)
      element?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start'
      })
    })
  }

  async function saveToLibrary() {
    if (!workout.value) return

    savingToLibrary.value = true
    try {
      await $fetch<any, string & {}>('/api/library/workouts/save', {
        method: 'POST',
        body: {
          workoutId: workout.value.id,
          title: workout.value.title
        }
      })

      toast.add({
        title: 'Saved to Library',
        description: 'You can now reuse this session structure from your library.',
        color: 'success',
        actions: [
          {
            label: 'View Library',
            onClick: () => {
              navigateTo('/library/workouts')
            }
          }
        ]
      })
    } catch (error: any) {
      toast.add({
        title: 'Save Failed',
        description: error.data?.message || 'Failed to save to library',
        color: 'error'
      })
    } finally {
      savingToLibrary.value = false
    }
  }

  // Chat about workout
  function chatAboutWorkout() {
    if (!workout.value) return
    navigateTo({
      path: '/chat',
      query: { workoutId: workout.value.id }
    })
  }

  function detectProvider(name: string | undefined): string | undefined {
    if (!name) return undefined
    const lower = name.toLowerCase()
    if (lower.includes('zwift')) return 'zwift'
    if (lower.includes('rouvy')) return 'rouvy'
    if (lower.includes('garmin')) return 'garmin'
    if (lower.includes('apple')) return 'apple_health'
    return undefined
  }

  // Section Catalog Definition
  const workoutSectionCatalog = computed(
    (): Array<{
      key: WorkoutSectionKey
      label: string
      icon: string
      anchorId: string
    }> => {
      const isTReady = typeof t.value === 'function'
      return [
        {
          key: 'exercises',
          label: isTReady ? t.value('sections_exercises') : 'Exercises',
          icon: 'i-lucide-dumbbell',
          anchorId: 'exercises'
        },
        {
          key: 'nutrition',
          label: isTReady ? t.value('sections_nutrition') : 'Nutrition',
          icon: 'i-lucide-beaker',
          anchorId: 'nutrition'
        },
        {
          key: 'analysis',
          label: isTReady ? t.value('sections_analysis') : 'AI Analysis',
          icon: 'i-lucide-sparkles',
          anchorId: 'analysis'
        },
        {
          key: 'power-curve',
          label: isTReady ? t.value('sections_power_curve') : 'Power Curve',
          icon: 'i-lucide-zap',
          anchorId: 'power-curve'
        },
        {
          key: 'intervals',
          label: isTReady ? t.value('sections_intervals') : 'Intervals',
          icon: 'i-lucide-timer',
          anchorId: 'intervals'
        },
        {
          key: 'advanced',
          label: isTReady ? t.value('sections_advanced') : 'Advanced',
          icon: 'i-lucide-microscope',
          anchorId: 'advanced'
        },
        {
          key: 'map',
          label: isTReady ? t.value('sections_map') : 'Map',
          icon: 'i-lucide-map',
          anchorId: 'map'
        },
        {
          key: 'pacing',
          label: isTReady ? t.value('sections_pacing') : 'Pacing',
          icon: 'i-lucide-activity',
          anchorId: 'pacing'
        },
        {
          key: 'timeline',
          label: isTReady ? t.value('sections_timeline') : 'Timeline',
          icon: 'i-lucide-chart-line',
          anchorId: 'timeline'
        },
        {
          key: 'zones',
          label: isTReady ? t.value('sections_zones') : 'Zones',
          icon: 'i-lucide-layers',
          anchorId: 'zones'
        },
        {
          key: 'efficiency',
          label: isTReady ? t.value('sections_efficiency') : 'Efficiency',
          icon: 'i-lucide-gauge',
          anchorId: 'efficiency'
        },
        {
          key: 'notes',
          label: isTReady ? t.value('sections_notes') : 'Notes',
          icon: 'i-lucide-notebook-pen',
          anchorId: 'notes'
        },
        {
          key: 'metrics',
          label: isTReady ? t.value('sections_metrics') : 'Metrics',
          icon: 'i-lucide-bar-chart-3',
          anchorId: 'metrics'
        },
        {
          key: 'streams',
          label: isTReady ? t.value('sections_streams') : 'Streams',
          icon: 'i-lucide-radio',
          anchorId: 'streams'
        },
        {
          key: 'duplicates',
          label: isTReady ? t.value('sections_duplicates') : 'Versions',
          icon: 'i-lucide-copy',
          anchorId: 'duplicates'
        },
        {
          key: 'raw-data',
          label: isTReady ? t.value('sections_raw_data') : 'Raw Data',
          icon: 'i-lucide-code-xml',
          anchorId: 'raw-data'
        }
      ]
    }
  )

  const workoutSectionDefaults = computed(() =>
    workoutSectionCatalog.value.reduce((acc, section, index) => {
      acc[section.key] = { visible: true, order: index }
      return acc
    }, {} as WorkoutSectionSettings)
  )

  function goBack() {
    router.back()
  }

  const plannedKJ = computed(() => {
    if (!workout.value?.plannedWorkout) return null
    const pw = workout.value.plannedWorkout
    return Math.round((pw.tss || 100) * 8.5)
  })

  const kJDelta = computed(() => {
    if (!workout.value?.kilojoules || !plannedKJ.value) return 0
    return Math.round(((workout.value.kilojoules - plannedKJ.value) / plannedKJ.value) * 100)
  })

  const recoveryCarbBump = computed(() => {
    if (kJDelta.value < 10) return 0
    return Math.round((kJDelta.value / 15) * 40)
  })

  const nutritionEstimate = computed(() => {
    const caloriesFromWorkout = Number(workout.value?.calories || 0)
    const kilojoules = Number(workout.value?.kilojoules || 0)
    const estimatedCalories = Math.round(
      caloriesFromWorkout > 0 ? caloriesFromWorkout : kilojoules > 0 ? kilojoules / 4.184 : 0
    )

    if (estimatedCalories <= 0) return null

    const reportedCarbs = Number(workout.value?.carbsUsed || 0)
    const estimatedCarbs = Math.round(
      reportedCarbs > 0 ? reportedCarbs : (estimatedCalories * 0.6) / 4
    )
    const nonCarbCalories = Math.max(estimatedCalories - estimatedCarbs * 4, 0)
    const estimatedFat = Math.round((nonCarbCalories * 0.8) / 9)
    const estimatedProtein = Math.round((nonCarbCalories * 0.2) / 4)

    return [
      {
        label: 'Calories',
        value: `${estimatedCalories} kcal`,
        icon: 'i-tabler-flame',
        iconClass: 'text-orange-500'
      },
      {
        label: 'Carbs',
        value: `${estimatedCarbs} g`,
        icon: 'i-tabler-bread',
        iconClass: 'text-yellow-500'
      },
      {
        label: 'Fat',
        value: `${estimatedFat} g`,
        icon: 'i-tabler-droplet',
        iconClass: 'text-cyan-500'
      },
      {
        label: 'Protein',
        value: `${estimatedProtein} g`,
        icon: 'i-tabler-egg',
        iconClass: 'text-blue-500'
      }
    ]
  })

  async function updateStomachFeel(val: number) {
    stomachFeel.value = val
    try {
      await $fetch<any, string & {}>(`/api/workouts/${workout.value.id}/metadata`, {
        method: 'POST' as any,
        body: { stomachFeel: val }
      })
      toast.add({
        title: 'Feedback Saved',
        color: 'success'
      })
    } catch (e) {
      console.error('Failed to save stomach feel:', e)
    }
  }

  // Load data on mount
  onMounted(() => {
    trackWorkoutViewDetail('completed')
    fetchWorkout()

    if (route.query.share === 'true') {
      isShareModalOpen.value = true
    }
  })

  watch(loading, (isLoading) => {
    if (!isLoading) {
      scheduleDeferredSections()
    }
  })

  watch(
    [() => route.hash, loading],
    ([hash, isLoading]) => {
      if (isLoading || error.value || !workout.value || !hash) return
      const sectionId = hash.slice(1)
      if (workoutSectionCatalog.value.some((section) => section.anchorId === sectionId)) {
        scrollToSection(sectionId)
      }
    },
    { flush: 'post' }
  )

  onBeforeUnmount(() => {
    isPageActive.value = false

    if (deferredSectionsTimer) {
      clearTimeout(deferredSectionsTimer)
      deferredSectionsTimer = null
    }
  })

  watch(
    () => route.params.id,
    (newId, oldId) => {
      if (!newId || newId === oldId) return
      if (deferredSectionsTimer) {
        clearTimeout(deferredSectionsTimer)
        deferredSectionsTimer = null
      }
      deferredSectionsReady.value = false
      workoutJourneyView.value = 'summary'
      showTagEditor.value = false
      fetchWorkout()
    }
  )

  useHead(() => ({
    title: workout.value?.title || 'Workout Details'
  }))
</script>

<style scoped>
  .session-intro {
    padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--ui-border);
  }
  .session-coach {
    max-width: 48rem;
  }
  .session-disclosure {
    border-top: 1px solid var(--ui-border);
    padding-top: 1.25rem;
  }
  .session-disclosure > summary {
    cursor: pointer;
    padding-block: 0.5rem;
    font-weight: 600;
    min-height: 2.75rem;
  }
  .session-description > summary:focus-visible,
  .session-disclosure > summary:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 4px;
    border-radius: 0.25rem;
  }
  .session-section-select {
    min-height: 2.75rem;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ui-border);
    border-radius: 0.5rem;
    background: var(--ui-bg);
    max-width: 100%;
  }
  .session-section-select:focus-visible {
    outline: 2px solid var(--ui-primary);
    outline-offset: 2px;
  }
</style>
