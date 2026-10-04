<template>
  <UDashboardPanel id="workout-detail" :ui="{ body: 'p-0' }">
    <template #header>
      <UDashboardNavbar :title="workout ? workout.title : t('details_title')">
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
            {{ t('back') }}
          </UButton>
          <UButton
            icon="i-heroicons-arrow-left"
            color="neutral"
            variant="ghost"
            class="sm:hidden"
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
            <UButton
              icon="i-heroicons-share"
              color="neutral"
              variant="outline"
              size="sm"
              class="hidden sm:flex"
              @click="
                () => {
                  isShareModalOpen = true
                }
              "
            >
              <span>{{ t('controls_share') }}</span>
            </UButton>
            <UDropdownMenu :items="workoutMenuItems">
              <UButton
                icon="i-heroicons-ellipsis-horizontal"
                color="neutral"
                variant="outline"
                size="sm"
                :aria-label="t('controls_more')"
                data-testid="workout-actions-menu"
              />
            </UDropdownMenu>
            <UButton
              icon="i-heroicons-chat-bubble-left-right"
              color="primary"
              variant="solid"
              size="sm"
              class="font-bold"
              @click="
                () => {
                  void chatAboutWorkout()
                }
              "
            >
              <span class="hidden sm:inline">{{ t('controls_chat_about') }}</span>
              <span class="sm:hidden">{{ t('controls_chat') }}</span>
            </UButton>
          </div>
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar v-if="workoutNavGroups.length > 1">
        <nav
          class="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          :aria-label="t('groups_nav_label')"
          data-testid="workout-section-nav"
        >
          <UButton
            v-for="group in workoutNavGroups"
            :key="group.key"
            variant="ghost"
            color="neutral"
            size="sm"
            class="shrink-0 whitespace-nowrap px-3"
            :icon="group.icon"
            :data-testid="`workout-nav-${group.key}`"
            @click="
              () => {
                void scrollToSection(group.key)
              }
            "
          >
            {{ group.label }}
          </UButton>
        </nav>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div
        id="summary"
        class="max-w-5xl mx-auto w-full p-0 sm:p-6 pb-24 space-y-0 sm:space-y-8 overflow-x-hidden scroll-mt-20"
      >
        <!-- DESKTOP HEADER (hidden on mobile) -->
        <div v-if="workout && !loading" class="hidden sm:flex flex-col gap-6">
          <!-- TOP SECTION: TITLE, MAP & ACTIONS -->
          <div
            class="relative overflow-hidden rounded-3xl bg-white dark:bg-gray-900 border border-gray-100 dark:border-white/5 p-8 flex flex-col gap-6 group/header shadow-sm dark:shadow-2xl"
          >
            <!-- GHOST BACKGROUND ROUTE -->
            <UiWorkoutRoutePreview
              v-if="workout.summaryPolyline"
              :polyline="workout.summaryPolyline"
              mode="background"
              class="opacity-[0.05] group-hover/header:opacity-[0.15] z-0 transition-opacity duration-700"
            />

            <!-- SCRIM -->
            <div
              class="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-gray-900 dark:via-gray-900/80 dark:to-transparent z-[1] pointer-events-none"
            />

            <div class="relative z-10 flex items-start justify-between">
              <div class="flex flex-col gap-4 max-w-2xl">
                <!-- Date & Nav -->
                <div class="flex items-center gap-4">
                  <div class="flex flex-col">
                    <span
                      class="font-mono text-[10px] text-primary-500 uppercase tracking-[0.4em] font-black"
                    >
                      {{ formatDateWeekday(workout.date) }}
                    </span>
                    <span
                      class="font-mono text-xs text-zinc-500 uppercase tracking-widest font-black"
                    >
                      {{ formatDatePrimary(workout.date) }}
                    </span>
                    <span class="font-mono text-[11px] text-zinc-400 dark:text-zinc-500 font-bold">
                      {{ formatTimeOnly(workout.date) }}
                    </span>
                  </div>
                  <div class="h-8 w-px bg-gray-200 dark:bg-white/10" />
                  <div class="flex items-center gap-2">
                    <UButton
                      icon="i-heroicons-chevron-left"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                      class="rounded-lg bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10"
                      @click="
                        () => {
                          void navigateDate(-1)
                        }
                      "
                    />
                    <UButton
                      icon="i-heroicons-chevron-right"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                      class="rounded-lg bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10 hover:bg-gray-200 dark:hover:bg-white/10"
                      @click="
                        () => {
                          void navigateDate(1)
                        }
                      "
                    />

                    <!-- Data Attribution (Desktop) -->
                    <div
                      class="ml-2 opacity-40 grayscale hover:opacity-100 hover:grayscale-0 transition-all duration-300 scale-90 origin-left"
                    >
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
                  </div>
                </div>

                <!-- Title & Achievements -->
                <div class="flex flex-col gap-3">
                  <div class="flex items-center gap-6">
                    <h1
                      class="font-black uppercase tracking-tighter text-gray-900 dark:text-white leading-none drop-shadow-2xl transition-all duration-500"
                      :class="[
                        workout.title.length > 25 ? 'text-2xl lg:text-3xl' : 'text-3xl lg:text-5xl'
                      ]"
                    >
                      {{ workout.title }}
                    </h1>

                    <!-- Personal Best Badges -->
                    <div v-if="achievements.length > 0" class="flex items-center gap-2">
                      <template v-for="pb in achievements" :key="pb.type">
                        <UTooltip
                          :text="`${pb.label}: ${pb.displayValue}${pb.unit === 's' ? '' : pb.unit}`"
                        >
                          <div
                            class="flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 px-2.5 py-1 rounded-full border border-yellow-500/20 font-black text-[10px] tracking-widest uppercase animate-pulse-slow"
                          >
                            <UIcon name="i-heroicons-trophy" class="w-3 h-3" />
                            {{ pb.label }}
                          </div>
                        </UTooltip>
                      </template>
                    </div>
                  </div>

                  <!-- Meta Info & Tags Trigger -->
                  <div
                    class="flex items-center gap-4 font-mono text-[10px] text-zinc-500 uppercase tracking-[0.2em]"
                  >
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="getWorkoutIcon(workout.type)"
                        class="w-4 h-4"
                        :class="getWorkoutColorClass(workout.type)"
                      />
                      <span>{{ workout.type || 'Activity' }}</span>
                    </div>
                    <span class="opacity-30">•</span>
                    <div class="flex items-center gap-1">
                      <span class="i-heroicons-clock w-3.5 h-3.5 opacity-50" />
                      {{ formatDuration(workout.durationSec) }}
                    </div>

                    <!-- Device Name (Desktop) -->
                    <template v-if="workout.deviceName">
                      <span class="opacity-30">•</span>
                      <div class="flex items-center gap-1">
                        <UIcon name="i-heroicons-cpu-chip" class="w-3.5 h-3.5 opacity-50" />
                        <span class="truncate max-w-[150px]">{{ workout.deviceName }}</span>
                      </div>
                    </template>

                    <span class="opacity-30">•</span>
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      icon="i-heroicons-hashtag"
                      class="hover:text-primary-500 p-0 h-auto font-black"
                      @click="
                        () => {
                          showTagEditor = !showTagEditor
                        }
                      "
                    >
                      <span v-if="workout.tags?.length" class="ml-1"
                        >{{ workout.tags.length }} TAGS</span
                      >
                      <span v-else class="ml-1 text-[8px]">ADD TAGS</span>
                    </UButton>
                  </div>
                </div>
              </div>

              <!-- Map Preview -->
              <NuxtLink
                v-if="workout.summaryPolyline"
                :to="`/workouts/${workout.id}/map`"
                class="shrink-0 w-24 h-24 rounded-2xl bg-black border border-white/10 overflow-hidden relative group shadow-2xl hover:border-primary-500/50 transition-all duration-500"
              >
                <UiWorkoutRoutePreview
                  :polyline="workout.summaryPolyline"
                  size="w-full h-full"
                  class="text-primary-500/40"
                />
                <div
                  class="absolute inset-0 bg-primary-500/5 group-hover:bg-primary-500/10 transition-colors"
                />
                <div
                  class="absolute bottom-0 left-0 right-0 py-1 bg-black/60 backdrop-blur-sm text-center"
                >
                  <span class="text-[8px] font-black text-primary-400 uppercase tracking-widest">{{
                    t('sections_map')
                  }}</span>
                </div>
              </NuxtLink>
            </div>

            <!-- Tag Editor Panel (Desktop) -->
            <div
              v-if="showTagEditor"
              class="relative z-10 p-6 bg-white/[0.02] border border-white/5 rounded-2xl"
            >
              <div class="flex flex-col gap-4">
                <div class="flex items-start justify-between gap-6">
                  <div class="flex-1">
                    <div
                      class="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-3"
                    >
                      Workout tags (Local)
                    </div>
                    <UInputTags
                      v-model="localTagDraft"
                      placeholder="Add local tags..."
                      color="neutral"
                      variant="outline"
                      size="md"
                    />
                  </div>
                  <div class="flex items-center gap-2 mt-7">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :disabled="!hasLocalTagChanges || savingTags"
                      @click="
                        () => {
                          void resetLocalTags()
                        }
                      "
                      >Reset</UButton
                    >
                    <UButton
                      color="primary"
                      variant="solid"
                      size="sm"
                      icon="i-heroicons-tag"
                      :loading="savingTags"
                      :disabled="!hasLocalTagChanges"
                      @click="
                        () => {
                          void saveLocalTags()
                        }
                      "
                      >Save</UButton
                    >
                  </div>
                </div>
                <div
                  v-if="intervalsSourceTags.length > 0"
                  class="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5"
                >
                  <span class="text-[9px] font-black uppercase tracking-widest text-zinc-600"
                    >Intervals Sync:</span
                  >
                  <UBadge
                    v-for="tag in intervalsSourceTags"
                    :key="tag"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="font-black tracking-tight lowercase"
                    >#{{ tag }}</UBadge
                  >
                </div>
              </div>
            </div>

            <!-- Description (Desktop) -->
            <div
              v-if="workout.description"
              class="relative z-10 p-6 bg-white/[0.01] border-l-2 border-primary-500/20 rounded-r-2xl italic text-zinc-400 font-medium leading-relaxed whitespace-pre-wrap"
            >
              {{ workout.description }}
            </div>
          </div>

          <!-- Headline numbers (sport-appropriate) -->
          <WorkoutsHeroStats :primary="heroStats.primary" :secondary="heroStats.secondary" />
        </div>

        <!-- MOBILE HUD HEADER (sm:hidden) -->
        <div
          v-if="workout && !loading"
          class="sm:hidden flex flex-col bg-white dark:bg-gray-900 relative overflow-hidden"
        >
          <!-- GHOST BACKGROUND ROUTE FOR HUD -->
          <UiWorkoutRoutePreview
            v-if="workout.summaryPolyline"
            :polyline="workout.summaryPolyline"
            mode="background"
            class="opacity-[0.08] z-0"
          />

          <!-- HUD CONTENT -->
          <div class="relative z-10 px-5 pt-6 pb-8 flex flex-col gap-8">
            <!-- HUD TOP: Navigation, Title & Source -->
            <div class="flex flex-col gap-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UButton
                    icon="i-heroicons-chevron-left"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="rounded-lg bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10"
                    @click="
                      () => {
                        void navigateDate(-1)
                      }
                    "
                  />
                  <div class="flex flex-col">
                    <span
                      class="font-mono text-[8px] text-primary-500 uppercase tracking-[0.3em] font-black"
                    >
                      {{ formatDateWeekday(workout.date) }}
                    </span>
                    <span
                      class="font-mono text-[10px] text-zinc-600 dark:text-zinc-500 uppercase tracking-widest font-black"
                    >
                      {{ formatDatePrimary(workout.date) }}
                    </span>
                  </div>
                  <UButton
                    icon="i-heroicons-chevron-right"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                    class="rounded-lg bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10"
                    @click="
                      () => {
                        void navigateDate(1)
                      }
                    "
                  />
                </div>

                <div class="opacity-40 grayscale scale-75 origin-right">
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
              </div>

              <div class="flex items-start justify-between gap-4">
                <div class="flex-1 min-w-0">
                  <h1
                    class="font-black uppercase tracking-tighter text-gray-900 dark:text-white leading-tight mb-1 transition-all duration-500"
                    :class="[
                      workout.title.length > 25 ? 'text-lg sm:text-xl' : 'text-2xl sm:text-3xl'
                    ]"
                  >
                    {{ workout.title }}
                  </h1>
                  <div
                    class="flex items-center gap-2 font-mono text-[9px] text-zinc-500 uppercase tracking-widest"
                  >
                    <UIcon
                      :name="getWorkoutIcon(workout.type)"
                      class="w-3.5 h-3.5"
                      :class="getWorkoutColorClass(workout.type)"
                    />
                    <span>{{ workout.type || 'Activity' }}</span>
                    <span v-if="workout.deviceName" class="opacity-30">•</span>
                    <span v-if="workout.deviceName" class="truncate">{{ workout.deviceName }}</span>
                  </div>

                  <!-- Achievements (Mobile) -->
                  <div v-if="achievements.length > 0" class="flex flex-wrap gap-1.5 mt-2">
                    <template v-for="pb in achievements" :key="pb.type">
                      <div
                        class="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full border border-yellow-500/20 font-black text-[8px] tracking-widest uppercase animate-pulse-slow"
                      >
                        <UIcon name="i-heroicons-trophy" class="w-2.5 h-2.5" />
                        {{ pb.label }}
                      </div>
                    </template>
                  </div>
                </div>

                <!-- FLOATING MAP PREVIEW -->
                <NuxtLink
                  v-if="workout.summaryPolyline"
                  :to="`/workouts/${workout.id}/map`"
                  class="shrink-0 w-20 h-20 rounded-xl bg-black border border-white/10 overflow-hidden relative group shadow-2xl"
                >
                  <UiWorkoutRoutePreview
                    :polyline="workout.summaryPolyline"
                    size="w-full h-full"
                    class="text-primary-500/40"
                  />
                  <div
                    class="absolute inset-0 bg-primary-500/5 group-hover:bg-primary-500/10 transition-colors"
                  />
                  <div
                    class="absolute bottom-0 left-0 right-0 py-1 px-1 bg-black/60 backdrop-blur-sm text-center"
                  >
                    <span class="text-[7px] font-black text-primary-400 uppercase tracking-widest"
                      >MAP</span
                    >
                  </div>
                </NuxtLink>
              </div>
            </div>

            <!-- Headline numbers (sport-appropriate) -->
            <WorkoutsHeroStats
              :primary="heroStats.primary"
              :secondary="heroStats.secondary"
              compact
            />

            <!-- Tags (Mobile) -->
            <div class="flex flex-col gap-3">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-heroicons-hashtag"
                class="self-start"
                @click="
                  () => {
                    showTagEditor = !showTagEditor
                  }
                "
              >
                {{
                  showTagEditor
                    ? 'Close Tag Editor'
                    : workout.tags?.length
                      ? `Manage ${workout.tags.length} Tags`
                      : 'Add Tags'
                }}
              </UButton>

              <div
                v-if="showTagEditor"
                class="p-4 bg-white/[0.02] border border-white/5 rounded-xl"
              >
                <UInputTags
                  v-model="localTagDraft"
                  placeholder="Add tags..."
                  color="neutral"
                  variant="outline"
                  size="sm"
                />
                <div class="flex items-center justify-end gap-2 mt-3">
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    @click="
                      () => {
                        void resetLocalTags()
                      }
                    "
                    >Reset</UButton
                  >
                  <UButton
                    color="primary"
                    variant="solid"
                    size="xs"
                    :loading="savingTags"
                    @click="
                      () => {
                        void saveLocalTags()
                      }
                    "
                    >Save</UButton
                  >
                </div>
              </div>
            </div>

            <!-- Description (Mobile) -->
            <div
              v-if="workout.description"
              class="p-4 bg-white/[0.01] border-l-2 border-primary-500/20 rounded-r-xl italic text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap"
            >
              {{ workout.description }}
            </div>
          </div>
        </div>

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
        </div>

        <div v-else-if="workout" class="flex flex-col gap-4 sm:gap-8">
          <div id="header" class="scroll-mt-20" />

          <!-- SUMMARY: coach's take, training impact, session context -->
          <div class="flex flex-col gap-4 sm:gap-8">
            <!-- Refactored Threshold Detection Banner -->
            <template v-if="detectedThresholds.length > 0">
              <div
                v-for="detection in detectedThresholds"
                :key="detection.type"
                class="relative overflow-hidden bg-neutral-50 dark:bg-[#1A1A1A] border border-neutral-200 dark:border-gray-800 rounded-2xl p-6 sm:p-8 shadow-xl dark:shadow-2xl transition-all duration-300 group"
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
                        class="text-lg font-black text-neutral-900 dark:text-white uppercase tracking-tight italic"
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
                          class="uppercase text-[8px] font-bold"
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
                          class="font-black px-6 shadow-lg shadow-primary-500/20"
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
                      <p
                        class="text-[9px] text-neutral-400 dark:text-gray-500 italic leading-tight"
                      >
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
                        <div
                          class="text-[10px] font-black text-neutral-400 dark:text-gray-500 uppercase tracking-widest mb-1"
                        >
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
                          class="text-[10px] font-black text-primary-500 bg-primary-500/10 px-2 py-0.5 rounded-full"
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
                        <div
                          class="text-[10px] font-black text-primary-500 uppercase tracking-widest mb-1"
                        >
                          {{ t('level_up_new') }}
                        </div>
                        <div
                          class="text-4xl font-black text-neutral-900 dark:text-white flex items-baseline gap-1"
                        >
                          {{ detection.newValue }}
                          <span
                            class="text-sm font-bold text-neutral-400 dark:text-gray-500 uppercase"
                            >{{ detection.unit.trim() }}</span
                          >
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- Coach's take (AI analysis) + plan adherence -->
            <div
              v-if="isSectionEnabled('analysis')"
              id="analysis"
              class="scroll-mt-20 flex flex-col gap-4 sm:gap-6"
            >
              <WorkoutsCoachTakeCard
                :workout="workout"
                :analyzing="analyzingWorkout"
                :can-retry-after-quota-reset="canAnalyzeNowAfterQuotaReset"
                :can-publish="Boolean(canPublishSummaryToIntervals)"
                :publishing="publishingSummary"
                :is-admin="isAdmin"
                @analyze="
                  () => {
                    void analyzeWorkout()
                  }
                "
                @upgrade="
                  () => {
                    void openWorkoutQuotaUpgrade()
                  }
                "
                @publish="
                  () => {
                    void publishSummaryToIntervals()
                  }
                "
              />

              <PlanAdherence
                v-if="workout.plannedWorkout"
                :adherence="workout.planAdherence"
                :regenerating="analyzingAdherence"
                :unlinking="unlinkingPlannedWorkout"
                :planned-workout="workout.plannedWorkout"
                @regenerate="analyzeAdherence"
                @unlink="unlinkPlannedWorkout"
              />
            </div>

            <!-- Exercises Section -->
            <div v-if="isSectionEnabled('exercises')" id="exercises" class="scroll-mt-20 space-y-4">
              <h2 class="text-base font-black uppercase tracking-widest text-gray-400 px-5 sm:px-0">
                {{ t('sections_exercises') }}
              </h2>
              <WorkoutsExerciseList :exercises="workout.exercises" />
            </div>

            <!-- Training impact (load / fitness / fatigue / form) + session scores -->
            <div
              v-if="hasTrainingMetrics(workout) || hasSessionScores"
              id="training-impact"
              class="scroll-mt-20 grid grid-cols-1 gap-4 sm:gap-6"
              :class="{ 'lg:grid-cols-2': hasTrainingMetrics(workout) && hasSessionScores }"
            >
              <WorkoutsTrainingImpactCard
                v-if="hasTrainingMetrics(workout)"
                :workout="workout"
                @open-metric="handleOpenMetric"
              />
              <div
                v-if="hasSessionScores"
                id="scores"
                class="scroll-mt-20 bg-white dark:bg-gray-900 rounded-none sm:rounded-2xl shadow-none sm:shadow-sm p-5 sm:p-6 border-x-0 sm:border-x border-y border-gray-200 dark:border-white/5 flex flex-col"
              >
                <h2
                  class="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2"
                >
                  <UIcon name="i-heroicons-star" class="w-4 h-4 text-amber-500" />
                  {{ t('session_scores_title') }}
                </h2>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-4">
                  {{ t('session_scores_subtitle') }}
                </p>
                <div class="flex-1 min-h-[200px]">
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
              </div>
            </div>

            <!-- Fueling HUD (Nutrition Debrief) -->
            <div
              v-if="isSectionEnabled('nutrition')"
              id="nutrition"
              class="scroll-mt-20 bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-sm dark:shadow-2xl p-6 sm:p-10 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden flex flex-col gap-8"
            >
              <!-- GHOST DECORATION (Dark Only) -->
              <div
                class="hidden dark:block absolute top-0 right-0 w-64 h-64 bg-orange-500/5 blur-[100px] pointer-events-none -mr-32 -mt-32"
              />

              <div class="flex items-center justify-between relative z-10">
                <div class="flex items-center gap-4">
                  <div
                    class="w-12 h-12 rounded-2xl flex items-center justify-center bg-orange-500/10 border border-orange-500/20 shadow-inner"
                  >
                    <UIcon name="i-heroicons-beaker" class="w-6 h-6 text-orange-500" />
                  </div>
                  <div class="flex flex-col">
                    <h2
                      class="text-xl sm:text-2xl font-black uppercase tracking-tighter text-black dark:text-white"
                    >
                      {{ t('nutrition_header') }}
                    </h2>
                    <span
                      class="font-mono text-[10px] text-zinc-600 dark:text-zinc-500 uppercase tracking-widest"
                      >Metabolic & Intake Balance</span
                    >
                  </div>
                </div>

                <div v-if="workout.plannedWorkout?.tss" class="text-right flex flex-col items-end">
                  <span
                    class="font-mono text-[9px] font-black text-zinc-600 dark:text-zinc-500 uppercase tracking-widest mb-1"
                    >{{ t('nutrition_energy_delta') }}</span
                  >
                  <div
                    class="text-xl font-black tabular-nums tracking-tighter"
                    :class="kJDelta >= 10 ? 'text-red-500' : 'text-[#00DC82]'"
                  >
                    {{ t('nutrition_vs_plan', { delta: (kJDelta > 0 ? '+' : '') + kJDelta }) }}
                  </div>
                </div>
              </div>

              <!-- MAIN HUD CONTENT -->
              <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center relative z-10">
                <!-- MACRO GRID -->
                <div v-if="nutritionEstimate" class="grid grid-cols-2 gap-3 sm:gap-4">
                  <div
                    v-for="item in nutritionEstimate"
                    :key="item.label"
                    class="relative group/tile overflow-hidden p-4 rounded-2xl bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 shadow-sm dark:shadow-inner transition-all hover:bg-zinc-100 dark:hover:bg-white/[0.04]"
                  >
                    <!-- 1px Gradient Border Overlay -->
                    <div
                      class="absolute inset-0 pointer-events-none opacity-0 group-hover/tile:opacity-100 transition-opacity border border-primary-500/30 rounded-2xl"
                    />

                    <div class="flex flex-col relative z-10">
                      <div class="flex items-center gap-2 mb-2">
                        <UIcon :name="item.icon" class="w-3.5 h-3.5" :class="item.iconClass" />
                        <span
                          class="font-mono text-[8px] font-black text-zinc-600 dark:text-zinc-500 uppercase tracking-widest"
                          >{{ item.label }}</span
                        >
                      </div>
                      <div class="flex items-baseline gap-1">
                        <span
                          class="text-2xl font-black text-black dark:text-white tracking-tighter"
                          >{{ item.value.split(' ')[0] }}</span
                        >
                        <span
                          class="text-[10px] font-bold text-zinc-600 dark:text-zinc-500 uppercase opacity-60"
                          >{{ item.value.split(' ')[1] }}</span
                        >
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ENERGY DELTA BAR -->
                <div class="flex flex-col gap-6">
                  <div class="flex flex-col gap-2">
                    <div class="flex justify-between items-end">
                      <span
                        class="font-mono text-[9px] font-black text-zinc-600 dark:text-zinc-500 uppercase tracking-widest"
                        >{{ t('nutrition_actual_energy') }} /
                        {{ t('nutrition_planned_energy') }}</span
                      >
                      <span
                        class="font-mono text-[9px] font-bold text-zinc-600 dark:text-zinc-400 tabular-nums"
                      >
                        {{ workout.kilojoules || 0 }} / {{ plannedKJ || 0 }} kJ
                      </span>
                    </div>

                    <div
                      class="relative h-4 w-full bg-zinc-200 dark:bg-white/5 rounded-full overflow-hidden border border-zinc-300 dark:border-white/5"
                    >
                      <!-- Progress Bar -->
                      <div
                        class="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-600 to-orange-400 transition-all duration-1000 shadow-[0_0_15px_rgba(251,146,60,0.3)]"
                        :style="{
                          width:
                            Math.min(((workout.kilojoules || 0) / (plannedKJ || 1)) * 100, 100) +
                            '%'
                        }"
                      >
                        <!-- Glowing Leading Edge -->
                        <div class="absolute right-0 top-0 bottom-0 w-1 bg-white/40 blur-[2px]" />
                      </div>

                      <!-- Demand Marker (Plan) -->
                      <div
                        class="absolute inset-y-0 border-l border-zinc-400 dark:border-white/20 z-20"
                        style="left: 100%"
                      />
                    </div>

                    <div
                      class="flex justify-between text-[8px] font-black text-zinc-500 dark:text-zinc-600 uppercase tracking-widest px-1"
                    >
                      <span>Deficit</span>
                      <span>Surplus</span>
                    </div>
                  </div>

                  <!-- STOMACH FEEL HUD -->
                  <div
                    class="p-5 rounded-2xl bg-white dark:bg-white/[0.02] border border-zinc-200 dark:border-white/5 flex flex-col gap-4 shadow-sm dark:shadow-inner"
                  >
                    <span
                      class="font-mono text-[9px] font-black text-zinc-600 dark:text-zinc-500 uppercase tracking-widest text-center"
                      >{{ t('nutrition_digestion_header') }}</span
                    >
                    <div class="flex items-center justify-center gap-3">
                      <button
                        v-for="i in 5"
                        :key="i"
                        class="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg transition-all duration-300 relative group/pill shadow-sm"
                        :class="[
                          stomachFeel === i
                            ? 'bg-[#00DC82] text-black scale-110 shadow-[0_0_20px_rgba(0,220,130,0.4)] z-20'
                            : 'bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-500 hover:bg-zinc-200 dark:hover:bg-white/10'
                        ]"
                        @click="
                          () => {
                            void updateStomachFeel(i)
                          }
                        "
                      >
                        {{ i }}
                      </button>
                    </div>
                    <div class="flex justify-between px-2">
                      <span
                        class="text-[8px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] opacity-60"
                        >{{ t('nutrition_digestion_poor') }}</span
                      >
                      <span
                        class="text-[8px] font-black text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] opacity-60"
                        >{{ t('nutrition_digestion_great') }}</span
                      >
                    </div>
                  </div>
                </div>
              </div>

              <!-- Recovery Correction Banner (Compact HUD Style) -->
              <div
                v-if="kJDelta >= 10"
                class="p-4 bg-red-500/5 rounded-2xl border border-red-500/10 flex items-start gap-4 relative z-10"
              >
                <UIcon
                  name="i-heroicons-exclamation-triangle"
                  class="w-6 h-6 text-red-500 shrink-0"
                />
                <div class="flex flex-col">
                  <h3
                    class="font-black text-red-600 dark:text-red-400 text-xs uppercase tracking-widest mb-1"
                  >
                    {{ t('nutrition_adjustment_title') }}
                  </h3>
                  <p
                    class="text-[11px] text-zinc-600 dark:text-zinc-400 font-medium leading-relaxed"
                  >
                    {{
                      t('nutrition_adjustment_desc', { delta: kJDelta, carbs: recoveryCarbBump })
                    }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Personal Notes -->
            <div v-if="isSectionEnabled('notes')" id="notes" class="scroll-mt-20 px-0 sm:px-0">
              <NotesEditor
                v-model="workout.notes"
                :notes-updated-at="workout.notesUpdatedAt"
                :api-endpoint="`/api/workouts/${workout.id}/notes`"
                class="rounded-none sm:rounded-xl border-x-0 sm:border-x border-y shadow-none sm:shadow"
                @update:notes-updated-at="workout.notesUpdatedAt = $event"
              />
            </div>
          </div>

          <!-- CHARTS -->
          <WorkoutsDetailGroup
            v-if="isGroupVisible('charts')"
            id="charts"
            :title="groupLabel('charts')"
            icon="i-lucide-chart-line"
          >
            <!-- Timeline -->
            <div
              v-if="shouldRenderSection('timeline')"
              id="timeline"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('timeline')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_timeline') }}
              </h3>
              <WorkoutTimeline :workout-id="workout.id" />
            </div>

            <!-- Zones -->
            <div
              v-if="shouldRenderSection('zones')"
              id="zones"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('zones')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_zones') }}
              </h3>
              <ZoneChart
                :workout-id="workout.id"
                :activity-type="workout.type"
                :stream-data="workout.streams"
              />
            </div>

            <!-- Pacing Analysis -->
            <div
              v-if="shouldRenderSection('pacing')"
              id="pacing"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('pacing')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_pacing') }}
              </h3>
              <PacingAnalysis
                :workout-id="workout.id"
                :activity-type="workout.type"
                @open-metric="handleOpenMetric"
              />
            </div>

            <!-- Power Curve Section -->
            <div
              v-if="shouldRenderSection('power-curve')"
              id="power-curve"
              class="scroll-mt-20 space-y-6"
              :style="sectionStyle('power-curve')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_power_curve') }}
              </h3>
              <div
                class="bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-sm dark:shadow-2xl p-6 sm:p-10 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden"
              >
                <PowerCurveChart :workout-id="workout.id" />
              </div>
            </div>
          </WorkoutsDetailGroup>

          <!-- LAPS & INTERVALS -->
          <WorkoutsDetailGroup
            v-if="isGroupVisible('laps')"
            id="laps"
            :title="groupLabel('laps')"
            icon="i-lucide-timer"
          >
            <template #actions>
              <UButton
                v-if="isAdmin"
                icon="i-heroicons-cpu-chip"
                size="xs"
                variant="ghost"
                color="neutral"
                :to="`/workouts/${workout.id}/intervals`"
              >
                {{ t('interval_audit') }}
              </UButton>
            </template>
            <div
              v-if="shouldRenderSection('intervals')"
              id="intervals"
              class="scroll-mt-20"
              :style="sectionStyle('intervals')"
            >
              <div
                class="bg-zinc-50 dark:bg-gray-900 rounded-none sm:rounded-3xl shadow-sm dark:shadow-2xl p-0 border-x-0 sm:border-x border-y border-zinc-200 dark:border-white/5 relative overflow-hidden"
              >
                <IntervalsAnalysis
                  :workout-id="workout.id"
                  class="!bg-transparent !border-none !shadow-none !p-6 sm:!p-10"
                />
              </div>
            </div>
          </WorkoutsDetailGroup>

          <!-- MAP (only with GPS data) -->
          <WorkoutsDetailGroup
            v-if="isGroupVisible('map')"
            id="map"
            :title="groupLabel('map')"
            icon="i-lucide-map"
          >
            <template #actions>
              <UButton
                icon="i-heroicons-arrows-pointing-out"
                size="xs"
                variant="ghost"
                color="neutral"
                :to="`/workouts/${workout.id}/map`"
              >
                {{ t('map_analysis') }}
              </UButton>
            </template>
            <UiWorkoutMap
              v-if="shouldRenderSection('map')"
              :coordinates="workout.streams.latlng"
              :streams="workout.streams"
              :workout-id="workout.id"
              :interactive="true"
              :provider="workout.source"
              :provider-label="getWorkoutSourceLabel(workout, t)"
              :device-name="workout.deviceName"
            />
          </WorkoutsDetailGroup>

          <!-- DETAILS -->
          <WorkoutsDetailGroup
            v-if="isGroupVisible('details')"
            id="details"
            :title="groupLabel('details')"
            icon="i-lucide-list"
          >
            <!-- Advanced Analytics Section -->
            <div
              v-if="shouldRenderSection('advanced')"
              id="advanced"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('advanced')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_advanced') }}
              </h3>
              <AdvancedWorkoutMetrics :workout-id="workout.id" @open-metric="handleOpenMetric" />
            </div>

            <!-- Efficiency -->
            <div
              v-if="shouldRenderSection('efficiency')"
              id="efficiency"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('efficiency')"
            >
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_efficiency') }}
              </h3>
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
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_metrics') }}
              </h3>
              <div
                class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3"
              >
                <div
                  v-for="metric in availableMetrics"
                  :key="metric.key"
                  class="flex justify-between py-2.5 border-b border-gray-100 dark:border-gray-800 group cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/50 px-2 -mx-2 transition-colors"
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
                        class="text-[10px] font-black uppercase tracking-widest text-gray-500 border-b border-dashed border-gray-300 dark:border-gray-700 cursor-help group-hover:text-primary-500 group-hover:border-primary-300 transition-colors"
                        >{{ metric.label }}</span
                      >
                      <template #content>
                        <div class="text-left text-sm">{{ metricTooltips[metric.label] }}</div>
                      </template>
                    </UTooltip>
                    <span
                      v-else
                      class="text-[10px] font-black uppercase tracking-widest text-gray-500 group-hover:text-primary-500 transition-colors"
                    >
                      {{ metric.label }}
                    </span>
                    <UBadge
                      v-if="metric.source === 'fit'"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      class="uppercase tracking-widest font-black text-[8px]"
                    >
                      FIT
                    </UBadge>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-black text-black dark:text-white">{{
                      metric.value
                    }}</span>
                    <UIcon
                      name="i-heroicons-magnifying-glass-circle"
                      class="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover:opacity-100"
                    />
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
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('sections_streams') }}
              </h3>
              <div
                class="bg-white dark:bg-gray-900 rounded-none sm:rounded-xl shadow-none sm:shadow p-6 border-x-0 sm:border-x border-y border-gray-100 dark:border-gray-800 flex flex-wrap gap-2.5"
              >
                <UBadge
                  v-for="stream in availableStreams"
                  :key="stream.key"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-950 transition-colors uppercase font-black tracking-widest text-[9px] px-2.5 py-1"
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
                </UBadge>
                <UButton
                  v-if="isAdmin && hasExtrasMeta"
                  icon="i-heroicons-code-bracket-square"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="uppercase font-black tracking-widest text-[9px] px-2.5 py-1"
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
              <h3 class="text-sm font-semibold text-gray-600 dark:text-gray-300 px-4 sm:px-0">
                {{ t('version_header') }}
              </h3>
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
                      <h3
                        class="font-bold text-yellow-900 dark:text-yellow-100 uppercase tracking-tight"
                      >
                        {{ t('version_duplicate_title') }}
                      </h3>
                      <p class="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                        {{ t('version_duplicate_desc') }}
                      </p>

                      <div v-if="workout.canonicalWorkout" class="mt-4">
                        <p
                          class="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2"
                        >
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
                                    class="font-black text-gray-900 dark:text-white truncate uppercase tracking-tight"
                                  >
                                    {{ workout.canonicalWorkout.title }}
                                  </div>
                                  <div
                                    class="text-[10px] text-gray-500 mt-1 font-bold uppercase tracking-widest"
                                  >
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
                                      class="py-0 px-1.5 text-[10px]"
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
                      <h3 class="font-black text-gray-900 dark:text-white uppercase tracking-tight">
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
                                class="font-black text-gray-900 dark:text-white truncate uppercase tracking-tight"
                              >
                                {{ dup.title }}
                              </div>
                              <div
                                class="text-[10px] text-gray-500 mt-1 font-bold uppercase tracking-widest"
                              >
                                {{ formatDate(dup.date) }}
                              </div>
                            </div>
                            <div
                              class="flex items-center justify-between sm:justify-end gap-4 shrink-0"
                            >
                              <UBadge
                                color="warning"
                                variant="subtle"
                                size="xs"
                                class="font-bold uppercase tracking-widest"
                                >{{ t('sections_duplicates') }}</UBadge
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
                                    ].includes(dup.source)
                                  "
                                  :provider="dup.source"
                                  :device-name="dup.deviceName"
                                  mode="minimal"
                                />
                                <span
                                  v-else
                                  :class="getSourceBadgeClass(dup.source)"
                                  class="py-0 px-1.5 text-[10px]"
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
                      <h3 class="font-black text-gray-900 dark:text-white uppercase tracking-tight">
                        {{ t('version_prescribed_plan') }}
                      </h3>
                      <p class="text-sm text-gray-600 dark:text-gray-400 mt-1 font-medium">
                        {{ t('version_prescribed_desc') }}
                      </p>
                    </div>
                  </div>

                  <NuxtLink
                    :to="`/workouts/planned/${workout.plannedWorkout.id}`"
                    class="block p-4 bg-primary-50 dark:bg-primary-950/20 rounded-xl border border-primary-100 dark:border-primary-900/50 hover:border-primary-500 dark:hover:border-primary-500 transition-all shadow-sm"
                  >
                    <div
                      class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4"
                    >
                      <div class="min-w-0 flex-1">
                        <div
                          class="font-black text-gray-900 dark:text-white uppercase tracking-tight"
                        >
                          {{ workout.plannedWorkout.title }}
                        </div>
                        <div
                          class="text-[10px] text-gray-500 mt-1 flex items-center gap-2 font-bold uppercase tracking-widest"
                        >
                          {{ formatDateUTC(workout.plannedWorkout.date) }}
                          <span
                            v-if="workout.plannedWorkout.type"
                            class="px-1.5 py-0 rounded bg-gray-100 dark:bg-gray-700 text-[10px] font-black uppercase tracking-widest"
                          >
                            {{ workout.plannedWorkout.type }}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <UBadge
                          color="primary"
                          variant="solid"
                          size="xs"
                          class="font-black uppercase tracking-widest"
                          >{{ t('legend_plan') }}</UBadge
                        >
                        <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </NuxtLink>
                </div>
              </div>
            </div>
          </WorkoutsDetailGroup>

          <!-- ADMIN-ONLY DIAGNOSTICS (engineering data, never shown to athletes) -->
          <WorkoutsDetailGroup
            v-if="showAdminDiagnostics"
            id="diagnostics"
            :title="t('diagnostics_title')"
            icon="i-heroicons-wrench-screwdriver"
            :badge="t('diagnostics_badge')"
          >
            <WorkoutsAnalysisFactsPanel
              :analysis-facts="workout.analysisFacts"
              :analysis-facts-v2="workout.analysisFactsV2"
            />

            <div
              v-if="shouldRenderSection('raw-data')"
              id="raw-data"
              class="scroll-mt-20 space-y-4"
              :style="sectionStyle('raw-data')"
            >
              <h2 class="text-base font-black uppercase tracking-widest text-gray-400 px-5 sm:px-0">
                {{ t('raw_data_header') }}
              </h2>
              <JsonViewer
                title="Raw Data (JSON)"
                :data="workout.rawJson"
                filename="workout-raw.json"
              />
            </div>
          </WorkoutsDetailGroup>
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
              <h3
                class="font-semibold text-orange-900 dark:text-orange-100 uppercase tracking-tight text-xs"
              >
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
  import PlanAdherence from '~/components/workouts/PlanAdherence.vue'
  import StreamChartModal from '~/components/charts/streams/StreamChartModal.vue'
  import { getWorkoutSourceLabel } from '~/utils/workout-source'
  import {
    ADMIN_ONLY_WORKOUT_SECTIONS,
    WORKOUT_DETAIL_GROUPS,
    WORKOUT_SECTION_GROUP,
    getAveragePaceSecondsPerKm,
    isPaceSportType,
    resolveWorkoutDetailAnchor,
    workoutHasPowerData,
    type WorkoutDetailGroupKey
  } from '~/utils/workout-detail'
  import type { WorkoutHeroStat } from '~/components/workouts/HeroStats.vue'
  import { metricTooltips } from '~/utils/tooltips'
  import {
    convertElevation,
    convertVelocity,
    formatDistance as formatDist,
    formatElevation as formatElev,
    formatPace,
    formatTemperature,
    getElevationUnitLabel,
    getVelocityUnitLabel,
    isRideWorkoutType,
    usesImperialDistance
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
  const { data: authData } = useAuth()
  // Engineering diagnostics (fact payloads, prompt decisions, raw JSON, debug
  // views) are admin-only; athletes never see them.
  const isAdmin = computed(() => Boolean((authData.value?.user as any)?.isAdmin))
  const distanceUnits = computed(() => userStore.profile?.distanceUnits || 'Kilometers')
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
      // Power-only widgets need real power data (no power curve for a run without power).
      'power-curve': Boolean(
        shouldShowDetailedPacing(currentWorkout) && workoutHasPowerData(currentWorkout)
      ),
      intervals: shouldShowIntervals(currentWorkout),
      advanced: shouldShowDetailedPacing(currentWorkout),
      map: shouldShowMap(currentWorkout),
      pacing: shouldShowDetailedPacing(currentWorkout),
      timeline: shouldShowDetailedPacing(currentWorkout),
      zones: shouldShowPacing(currentWorkout),
      efficiency: hasEfficiencyMetrics(currentWorkout),
      notes: Boolean(currentWorkout),
      metrics: availableMetrics.value.length > 0,
      streams: availableStreams.value.length > 0 || (isAdmin.value && hasExtrasMeta.value),
      duplicates: Boolean(
        currentWorkout?.isDuplicate ||
        currentWorkout?.duplicates?.length ||
        currentWorkout?.plannedWorkout
      ),
      'raw-data': Boolean(currentWorkout?.rawJson)
    }
  })

  const hasSessionScores = computed(() => {
    const w = workout.value
    return Boolean(
      w?.overallScore || w?.technicalScore || w?.effortScore || w?.pacingScore || w?.executionScore
    )
  })

  const showAdminDiagnostics = computed(
    () =>
      isAdmin.value &&
      Boolean(
        workout.value?.analysisFacts ||
        workout.value?.analysisFactsV2 ||
        isSectionEnabled('raw-data')
      )
  )

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
    visibleSectionCatalog.value.map((section) => ({
      key: section.key,
      label: section.label,
      icon: section.icon,
      available: workoutSectionAvailability.value[section.key],
      defaultVisible: workoutSectionDefaults.value[section.key]?.visible ?? true
    }))
  )

  /** Catalog minus admin-only sections for athletes. */
  const visibleSectionCatalog = computed(() =>
    workoutSectionCatalog.value.filter(
      (section) => isAdmin.value || !ADMIN_ONLY_WORKOUT_SECTIONS.has(section.key)
    )
  )

  function isGroupVisible(groupKey: WorkoutDetailGroupKey) {
    if (groupKey === 'summary') return true
    // Admin-only sections render under Diagnostics, so they never keep a group alive.
    return workoutSectionCatalog.value.some(
      (section) =>
        WORKOUT_SECTION_GROUP[section.key] === groupKey &&
        !ADMIN_ONLY_WORKOUT_SECTIONS.has(section.key) &&
        isSectionEnabled(section.key)
    )
  }

  function groupLabel(groupKey: WorkoutDetailGroupKey) {
    const group = WORKOUT_DETAIL_GROUPS.find((entry) => entry.key === groupKey)
    if (!group) return groupKey
    return typeof t.value === 'function' ? t.value(group.labelKey) : group.fallbackLabel
  }

  // Section bar: a handful of athlete-meaningful groups; groups with no data
  // for this workout (e.g. Map without GPS) are left out.
  const workoutNavGroups = computed(() =>
    WORKOUT_DETAIL_GROUPS.filter((group) => isGroupVisible(group.key)).map((group) => ({
      key: group.key,
      icon: group.icon,
      label: groupLabel(group.key)
    }))
  )

  // The coach's take is not deferred: it leads the Summary.
  const deferredSectionKeys = new Set<WorkoutSectionKey>([
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
      isSectionEnabled(sectionKey) &&
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
    if (ADMIN_ONLY_WORKOUT_SECTIONS.has(sectionKey) && !isAdmin.value) return false
    return (
      (workoutSectionSettings.value[sectionKey]?.visible ?? true) &&
      workoutSectionAvailability.value[sectionKey]
    )
  }

  function sectionStyle(sectionKey: WorkoutSectionKey) {
    return {
      order: workoutSectionSettings.value[sectionKey]?.order ?? 0
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

  function shouldShowExercises(workout: any) {
    if (!workout) return false
    return workout.exercises && workout.exercises.length > 0
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
      workout.variabilityIndex != null ||
      workout.efficiencyFactor != null ||
      workout.decoupling != null ||
      workout.powerHrRatio != null ||
      workout.polarizationIndex != null ||
      workout.lrBalance != null
    )
  }

  function hasTrainingMetrics(workout: any) {
    if (!workout) return false
    return (
      (workout.tss !== null || workout.trainingLoad !== null) &&
      (workout.ctl !== null || workout.atl !== null)
    )
  }

  /**
   * Scroll to a group (`summary`, `charts`, `laps`, `map`, `details`) or to an
   * individual section anchor. Old per-section anchors (`#intervals`,
   * `#power-curve`, `#training-impact`, ...) still resolve: to the section when
   * it is rendered, otherwise to the group it now lives in.
   */
  function scrollToSection(anchorId: string) {
    trackWorkoutSectionView(anchorId)
    if (!deferredSectionsReady.value) {
      deferredSectionsReady.value = true
    }

    void nextTick(() => {
      const resolved = resolveWorkoutDetailAnchor(anchorId)
      const candidates = [anchorId, resolved?.section, resolved?.group].filter((id): id is string =>
        Boolean(id)
      )
      for (const id of candidates) {
        const element = document.getElementById(id)
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' })
          return
        }
      }
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

  // Section Catalog Definition. Order = default order (Summary sections first,
  // then Charts, Laps & intervals, Map and Details — see `~/utils/workout-detail`).
  const workoutSectionCatalog = computed(
    (): Array<{
      key: WorkoutSectionKey
      label: string
      icon: string
    }> => {
      const isTReady = typeof t.value === 'function'
      const entries: Array<[WorkoutSectionKey, string, string, string]> = [
        ['analysis', 'sections_analysis', "Coach's take", 'i-lucide-message-square-quote'],
        ['exercises', 'sections_exercises', 'Exercises', 'i-lucide-dumbbell'],
        ['nutrition', 'sections_nutrition', 'Nutrition', 'i-lucide-beaker'],
        ['notes', 'sections_notes', 'Notes', 'i-lucide-notebook-pen'],
        ['timeline', 'sections_timeline', 'Timeline', 'i-lucide-chart-line'],
        ['zones', 'sections_zones', 'Zones', 'i-lucide-layers'],
        ['pacing', 'sections_pacing', 'Pacing', 'i-lucide-activity'],
        ['power-curve', 'sections_power_curve', 'Power Curve', 'i-lucide-zap'],
        ['intervals', 'sections_intervals', 'Intervals', 'i-lucide-timer'],
        ['map', 'sections_map', 'Map', 'i-lucide-map'],
        ['advanced', 'sections_advanced', 'Advanced', 'i-lucide-microscope'],
        ['efficiency', 'sections_efficiency', 'Efficiency', 'i-lucide-gauge'],
        ['metrics', 'sections_metrics', 'Metrics', 'i-lucide-bar-chart-3'],
        ['streams', 'sections_streams', 'Streams', 'i-lucide-radio'],
        ['duplicates', 'sections_duplicates', 'Versions', 'i-lucide-copy'],
        ['raw-data', 'sections_raw_data', 'Raw Data', 'i-lucide-code-xml']
      ]
      return entries.map(([key, labelKey, fallback, icon]) => ({
        key,
        label: isTReady ? t.value(labelKey) : fallback,
        icon
      }))
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

  function label(key: string, fallback: string) {
    return typeof t.value === 'function' ? t.value(key) : fallback
  }

  /**
   * Headline numbers for the header, chosen per sport: runs lead with pace (in
   * the athlete's units), rides with power when there is power data, and
   * power-only numbers are left out entirely when the workout has no power.
   */
  const heroStats = computed(() => {
    const primary: WorkoutHeroStat[] = []
    const secondary: WorkoutHeroStat[] = []
    const w = workout.value
    if (!w) return { primary, secondary }

    const units = distanceUnits.value
    const imperial = usesImperialDistance(units)
    const hasPower = workoutHasPowerData(w)

    if (w.distanceMeters > 0) {
      const distance = imperial ? w.distanceMeters / 1609.344 : w.distanceMeters / 1000
      primary.push({
        key: 'distance',
        label: label('stat_distance', 'Distance'),
        value: distance.toFixed(distance >= 10 ? 1 : 2),
        unit: imperial ? 'mi' : 'km'
      })
    }

    if (w.durationSec) {
      primary.push({
        key: 'time',
        label: label('stat_time', 'Time'),
        value: formatDurationShort(w.durationSec)
      })
    }

    const paceSecondsPerKm = isPaceSportType(w.type) ? getAveragePaceSecondsPerKm(w) : null
    let powerShown = false
    if (paceSecondsPerKm) {
      const [paceValue, paceUnit] = formatPace(paceSecondsPerKm, units).split('/')
      primary.push({
        key: 'pace',
        label: label('stat_avg_pace', 'Avg pace'),
        value: paceValue || '',
        unit: paceUnit ? `/${paceUnit}` : undefined
      })
    } else if (hasPower && w.averageWatts) {
      powerShown = true
      primary.push({
        key: 'power',
        label: label('stat_avg_power', 'Avg power'),
        value: Math.round(w.averageWatts),
        unit: 'W',
        tooltip: tt.value('avg_power')
      })
    } else if (isRideWorkoutType(w.type) && w.averageSpeed > 0) {
      primary.push({
        key: 'speed',
        label: label('stat_avg_speed', 'Avg speed'),
        value: convertVelocity(w.averageSpeed, units).toFixed(1),
        unit: getVelocityUnitLabel(units)
      })
    }

    const load = w.tss || w.trainingLoad
    if (load) {
      primary.push({
        key: 'load',
        label: label('stat_training_load', 'Training load'),
        value: Math.round(load),
        tooltip: tt.value('training_load')
      })
    }

    if (w.averageHr) {
      secondary.push({
        key: 'hr',
        label: label('stat_avg_hr', 'Avg heart rate'),
        value: w.averageHr,
        unit: 'bpm'
      })
    }
    if (hasPower && w.averageWatts && !powerShown) {
      secondary.push({
        key: 'power',
        label: label('stat_avg_power', 'Avg power'),
        value: Math.round(w.averageWatts),
        unit: 'W',
        tooltip: tt.value('avg_power')
      })
    }
    if (hasPower && w.normalizedPower) {
      secondary.push({
        key: 'np',
        label: label('stat_norm_power', 'Normalized power'),
        value: Math.round(w.normalizedPower),
        unit: 'W',
        tooltip: tt.value('norm_power')
      })
    }
    if (w.elevationGain) {
      secondary.push({
        key: 'elevation',
        label: label('stat_elevation', 'Elevation gain'),
        value: Math.round(convertElevation(w.elevationGain, units)),
        unit: getElevationUnitLabel(units)
      })
    }
    if (w.averageCadence && isRideWorkoutType(w.type)) {
      secondary.push({
        key: 'cadence',
        label: label('stat_cadence', 'Cadence'),
        value: w.averageCadence,
        unit: 'rpm'
      })
    }

    return { primary, secondary }
  })

  // Overflow menu: everything except Share and "Chat about this workout".
  const workoutMenuItems = computed(() => {
    const inComparison = Boolean(workout.value && isWorkoutInComparison(workout.value.id))
    const items: any[][] = [
      [
        {
          label: label('controls_edit', 'Edit'),
          icon: 'i-heroicons-pencil-square',
          onSelect: () => (isEditModalOpen.value = true)
        },
        {
          label: label('controls_share', 'Share'),
          icon: 'i-heroicons-share',
          class: 'sm:hidden',
          onSelect: () => (isShareModalOpen.value = true)
        },
        {
          label: label('controls_save_library', 'Save to library'),
          icon: 'i-heroicons-bookmark',
          onSelect: () => saveToLibrary()
        },
        {
          label: inComparison
            ? label('controls_remove_comparison', 'Remove from comparison')
            : label('controls_add_comparison', 'Add to comparison'),
          icon: inComparison ? 'i-lucide-check' : 'i-lucide-git-compare-arrows',
          onSelect: () => toggleWorkoutComparison()
        },
        {
          label: label('controls_customize_sections', 'Customize sections'),
          icon: 'i-heroicons-adjustments-horizontal',
          onSelect: () => (isWorkoutSectionsModalOpen.value = true)
        }
      ]
    ]

    if (isAdmin.value) {
      items.push([
        { label: label('diagnostics_badge', 'Admin only'), type: 'label' },
        {
          label: 'Debug Intervals',
          icon: 'i-heroicons-cpu-chip',
          onSelect: () => navigateTo(`/workouts/${route.params.id}/intervals`)
        }
      ])
    }

    items.push([
      {
        label: label('controls_delete', 'Delete'),
        icon: 'i-heroicons-trash',
        color: 'error',
        onSelect: () => (isDeleteModalOpen.value = true)
      }
    ])
    return items
  })

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
      // Honour deep links such as `/workouts/:id#intervals` (old section anchors included).
      if (import.meta.client && route.hash && workout.value) {
        scrollToSection(route.hash.slice(1))
      }
    }
  })

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
      fetchWorkout()
    }
  )

  useHead(() => ({
    title: workout.value?.title || 'Workout Details'
  }))
</script>

<style scoped>
  @keyframes pulse-slow {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  .animate-pulse-slow {
    animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
</style>
