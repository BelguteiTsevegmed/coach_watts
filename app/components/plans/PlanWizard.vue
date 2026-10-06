<template>
  <div class="flex flex-col h-full max-h-[75vh]">
    <!-- Scrollable Content -->
    <div class="flex-1 overflow-y-auto px-1 py-2 space-y-6">
      <div class="space-y-3" aria-live="polite">
        <p class="text-sm text-gray-500">
          Step {{ visibleStep }} of 5: {{ wizardStepLabels[visibleStep - 1] }}
        </p>
        <UProgress :model-value="visibleStep * 20" size="xs" aria-label="Plan setup progress" />
      </div>
      <!-- Step 1: Select Goal -->
      <div v-if="step === 1" class="space-y-6">
        <h3 class="text-xl font-semibold">What are you working toward?</h3>

        <div v-if="loadingGoals" class="text-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
        </div>

        <div v-else class="space-y-4">
          <div v-if="goalsLoadError" role="alert" class="space-y-3">
            <p>Your goals could not load. Try again to choose a goal.</p>
            <UButton color="neutral" variant="outline" @click="fetchGoals()">Try again</UButton>
          </div>
          <p v-else-if="goals.length === 0" class="text-sm leading-6 text-gray-500">
            Create a goal to give your training a direction.
          </p>
          <!-- Create a goal Option -->
          <button
            class="w-full p-4 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors flex items-center justify-center gap-2 text-muted hover:text-primary"
            @click="
              () => {
                showCreateGoal = true
              }
            "
          >
            <UIcon name="i-heroicons-plus" class="w-5 h-5" />
            <span class="font-medium">Create a goal</span>
          </button>

          <!-- Existing Goals -->
          <div
            v-if="goals.length > 0"
            class="space-y-3"
            role="radiogroup"
            aria-label="Choose your goal"
          >
            <button
              v-for="goal in goals"
              :key="goal.id"
              type="button"
              role="radio"
              :aria-checked="selectedGoal?.id === goal.id"
              class="w-full rounded-lg border-2 p-4 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              :class="
                selectedGoal?.id === goal.id
                  ? 'border-primary bg-primary/5 dark:bg-primary/10'
                  : 'border-gray-200 dark:border-gray-800 hover:border-primary/50'
              "
              @click="
                () => {
                  void selectGoal(goal)
                }
              "
            >
              <div class="flex justify-between items-start">
                <div>
                  <div class="font-semibold text-lg">{{ goal.title }}</div>
                  <div class="text-sm text-muted mt-1">{{ goal.description }}</div>
                  <div
                    v-if="goal.eventDate || goal.targetDate"
                    class="text-sm text-primary mt-2 flex items-center gap-1"
                  >
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                    Target: {{ formatDate(goal.eventDate || goal.targetDate) }}
                  </div>
                </div>
                <UBadge :color="getPriorityColor(goal.priority)">{{ goal.priority }}</UBadge>
              </div>
            </button>
          </div>
          <details v-if="selectedGoal?.events?.length" class="space-y-3">
            <summary
              class="cursor-pointer text-sm text-gray-600 focus-visible:outline-2 focus-visible:outline-primary"
            >
              View events for this goal
            </summary>
            <ul class="space-y-2 text-sm text-gray-500">
              <li v-for="event in selectedGoal.events" :key="event.id">
                {{ event.title }}, {{ formatDateUTC(event.date, 'MMM d')
                }}<span v-if="event.priority"> ({{ event.priority }})</span>
              </li>
            </ul>
          </details>
        </div>
      </div>

      <!-- Goal and availability are settled before generation. -->
      <div v-else-if="step === 2" class="space-y-7" data-testid="plan-availability">
        <div class="flex items-center gap-3">
          <UButton
            icon="i-heroicons-arrow-left"
            aria-label="Back to goal"
            color="neutral"
            variant="ghost"
            @click="
              () => {
                step = 1
              }
            "
          />
          <div>
            <h3 class="text-xl font-semibold">Make room for training</h3>
            <p class="mt-2 text-sm leading-6 text-gray-500">
              Set a time budget you can keep. Your plan will work around it.
            </p>
          </div>
        </div>
        <fieldset class="space-y-3">
          <legend class="text-sm font-medium">Which activities will you train?</legend>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="type in availableActivityTypes"
              :key="type.value"
              type="button"
              :aria-pressed="selectedActivityTypes.includes(type.value)"
              class="rounded-lg border px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                selectedActivityTypes.includes(type.value)
                  ? 'border-primary text-primary'
                  : 'border-gray-200 dark:border-gray-700'
              "
              @click="toggleActivityType(type.value)"
            >
              {{ type.label }}
            </button>
          </div>
        </fieldset>
        <UFormField label="Hours available each week" name="volumeHours">
          <div class="flex items-center gap-3">
            <UInput
              v-model.number="volumeHours"
              type="number"
              :min="3"
              :max="20"
              :step="0.5"
              class="w-28"
            /><span class="text-sm text-gray-500">hours</span>
          </div>
          <USlider
            v-model="volumeHours"
            :min="3"
            :max="20"
            :step="0.5"
            color="primary"
            class="mt-4"
            aria-label="Hours available each week"
          />
        </UFormField>
        <UFormField
          label="When can you train?"
          description="Include your available days, rest days and any sessions you want to keep."
          name="availability"
        >
          <UTextarea
            v-model="customInstructions"
            :rows="3"
            placeholder="For example: Tuesdays and Thursdays after work, a long ride on Sunday, and Friday off."
            class="w-full"
          />
        </UFormField>
        <div class="space-y-4 border-t border-gray-200 pt-5 dark:border-gray-800">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-sm font-medium">Plan around an event date</span
            ><USwitch v-model="isEventBased" aria-label="Plan around an event date" />
          </div>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UFormField label="Start date"
              ><UInput v-model="startDate" type="date" class="w-full"
            /></UFormField>
            <UFormField v-if="isEventBased" label="Target date"
              ><UInput v-model="endDate" type="date" class="w-full"
            /></UFormField>
            <UFormField v-else label="Plan duration"
              ><USelect
                v-model="durationWeeks"
                :items="durationOptions"
                value-key="value"
                class="w-full"
            /></UFormField>
          </div>
        </div>
        <details
          class="space-y-5 border-t border-gray-200 pt-5 dark:border-gray-800"
          data-testid="plan-expert-options"
        >
          <summary
            class="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary"
          >
            Adjust the training approach
          </summary>
          <p class="text-sm leading-6 text-gray-500">
            A steady build is selected to start. Change these details if you have a preferred
            approach.
          </p>
          <UFormField label="Training approach"
            ><USelect v-model="strategy" :items="strategyOptions" value-key="value" class="w-full"
          /></UFormField>
          <UButton color="neutral" variant="link" @click="recommendStrategy()"
            >Help me choose</UButton
          >
          <p v-if="aiRecommendation" class="text-sm leading-6 text-gray-500">
            {{ aiRecommendation }}
          </p>
          <UFormField label="Build and recovery rhythm"
            ><USelect
              v-model="recoveryRhythm"
              :items="recoveryOptions"
              value-key="value"
              class="w-full"
          /></UFormField>
          <UFormField label="Your starting point"
            ><USelect
              v-model="startingPhase"
              :items="startingPhaseOptions"
              value-key="value"
              class="w-full"
          /></UFormField>
        </details>
      </div>
      <!-- Review your training phases -->
      <div v-else-if="step === 3" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <UButton
            icon="i-heroicons-arrow-left"
            variant="ghost"
            size="sm"
            @click="
              () => {
                step = 2
              }
            "
          />
          <h3 class="text-xl font-semibold">Review your training phases</h3>
        </div>

        <div v-if="generatedPlan" class="space-y-6">
          <!-- AI Rationale -->
          <div
            v-if="generatedPlan.description"
            class="bg-primary/5 p-4 rounded-lg flex items-start gap-3 border border-primary/10"
          >
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div class="text-sm text-primary/90 italic leading-relaxed">
              &ldquo;{{ generatedPlan.description }}&rdquo;
            </div>
          </div>

          <p class="text-sm text-muted">
            Based on your starting point ({{ startingPhase }}) and timeline, we've designed this
            schedule.
          </p>

          <div class="space-y-4">
            <div
              v-for="block in generatedPlan.blocks"
              :key="block.id"
              class="w-full border-2 border-gray-200 dark:border-gray-800 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center bg-white dark:bg-gray-900"
            >
              <div class="flex items-center gap-3 w-full">
                <div
                  class="w-6 h-6 rounded-full border-2 border-primary bg-primary flex items-center justify-center flex-shrink-0"
                >
                  <div class="w-2 h-2 rounded-full bg-white" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex justify-between items-center">
                    <h4 class="font-bold truncate text-gray-900 dark:text-white">
                      {{ block.name.split('[')[0].trim() }}
                    </h4>
                    <UBadge size="xs" color="neutral" variant="soft">{{ block.type }}</UBadge>
                  </div>
                  <div class="text-xs text-muted mt-1">{{ getBlockDescription(block.type) }}</div>
                  <div class="flex items-center gap-2 mt-2">
                    <span
                      class="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800"
                    >
                      {{ block.durationWeeks }} Weeks
                    </span>
                    <span class="text-xs text-muted">
                      Starts: {{ formatDate(block.startDate, 'MMM d') }}
                    </span>
                  </div>

                  <!-- Events in this Block -->
                  <div
                    v-if="getEventsInBlock(block).length > 0"
                    class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2"
                  >
                    <div class="text-[10px] font-bold text-muted tracking-wider">Key Events</div>
                    <div
                      v-for="event in getEventsInBlock(block)"
                      :key="event.id"
                      class="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-100 dark:border-gray-800"
                    >
                      <UBadge
                        :color="event.priority === 'A' ? 'primary' : 'neutral'"
                        size="xs"
                        variant="solid"
                        class="w-5 h-5 flex items-center justify-center p-0"
                      >
                        {{ event.priority }}
                      </UBadge>
                      <div class="flex-1 min-w-0">
                        <div class="text-xs font-bold truncate">{{ event.title }}</div>
                        <div class="text-[10px] text-muted">
                          {{ formatDate(event.date, 'EEE, MMM d') }}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 4: Schedule & Existing Workouts -->
      <div v-else-if="step === 4" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <UButton
            icon="i-heroicons-arrow-left"
            variant="ghost"
            size="sm"
            @click="
              () => {
                step = 3
              }
            "
          />
          <h3 class="text-xl font-semibold">Keep your existing sessions</h3>
        </div>

        <div class="space-y-4">
          <div
            v-if="loadingWorkouts"
            class="flex flex-col items-center justify-center py-8 space-y-3"
          >
            <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary" />
            <p class="text-sm text-muted">Checking for existing workouts...</p>
          </div>

          <div v-else-if="independentWorkouts.length > 0" class="space-y-4">
            <div
              class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200"
            >
              <p>
                We found <strong>{{ independentWorkouts.length }} planned workouts</strong> during
                this period.
              </p>
              <p class="mt-1">
                Select the ones you want to <strong>keep and incorporate</strong> into your new
                plan. The AI will build the schedule around them.
              </p>
            </div>

            <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <div
                class="bg-gray-50 dark:bg-gray-800/50 p-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
              >
                <span class="text-xs font-medium text-muted ml-2">Workouts</span>
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="
                    () => {
                      void toggleSelectAll()
                    }
                  "
                >
                  {{
                    anchorWorkoutIds.length === independentWorkouts.length
                      ? 'Unselect All'
                      : 'Select All'
                  }}
                </UButton>
              </div>
              <div class="max-h-60 overflow-y-auto p-2 space-y-1">
                <div
                  v-for="workout in independentWorkouts"
                  :key="workout.id"
                  class="flex items-center gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded cursor-pointer transition-colors"
                  :class="anchorWorkoutIds.includes(workout.id) ? 'bg-primary/5' : ''"
                  @click="
                    () => {
                      void toggleAnchor(workout.id)
                    }
                  "
                >
                  <UCheckbox
                    :model-value="anchorWorkoutIds.includes(workout.id)"
                    @update:model-value="toggleAnchor(workout.id)"
                    @click.stop
                  />
                  <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center">
                      <span
                        class="font-medium text-sm truncate"
                        :class="anchorWorkoutIds.includes(workout.id) ? 'text-primary' : ''"
                        >{{ workout.title }}</span
                      >
                      <span class="text-xs text-muted tabular-nums">{{
                        formatDate(workout.date)
                      }}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-0.5">
                      <UIcon
                        v-if="anchorWorkoutIds.includes(workout.id)"
                        name="i-heroicons-lock-closed"
                        class="w-3 h-3 text-primary"
                      />
                      <span class="text-xs text-muted truncate"
                        >{{ workout.type }} •
                        {{ Math.round((workout.durationSec || 0) / 60) }}m</span
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700"
          >
            <UIcon name="i-heroicons-calendar" class="w-12 h-12 text-gray-300 mb-3 mx-auto" />
            <h4 class="font-medium text-gray-900 dark:text-gray-100">No conflicts found</h4>
            <p class="text-sm text-gray-500 mt-1">Your schedule is clear for this period.</p>
          </div>
        </div>
      </div>

      <!-- Step 6: Final Review -->
      <div v-else-if="step === 6" class="space-y-6">
        <div class="flex items-center gap-3 mb-2">
          <UButton
            icon="i-heroicons-arrow-left"
            variant="ghost"
            size="sm"
            @click="
              () => {
                step = 4
              }
            "
          />
          <h3 class="text-xl font-semibold">Ready to start?</h3>
        </div>

        <div class="space-y-3 border-y border-gray-200 py-5 dark:border-gray-800">
          <p class="text-sm font-medium">{{ volumeHours }} hours each week</p>
          <p class="text-sm leading-6 text-gray-500">
            {{ customInstructions || 'No additional availability constraints.' }}
          </p>
          <UButton
            color="neutral"
            variant="link"
            @click="
              () => {
                step = 2
              }
            "
            >Change my availability</UButton
          >
        </div>

        <div v-if="generatedPlan" class="space-y-6">
          <!-- AI Rationale -->
          <div
            v-if="generatedPlan.description"
            class="bg-primary/5 p-4 rounded-lg flex items-start gap-3 border border-primary/10"
          >
            <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div class="text-sm text-primary/90 italic leading-relaxed">
              &ldquo;{{ generatedPlan.description }}&rdquo;
            </div>
          </div>

          <div
            class="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg text-sm text-blue-800 dark:text-blue-200"
          >
            We've designed a <strong>{{ generatedPlan.strategy }}</strong> plan focusing on your
            goal <strong>{{ selectedGoal.title }}</strong
            >. It consists of {{ filteredBlocks.length }} training blocks starting from
            <strong>{{ selectedBlock?.name.split('[')[0].trim() }}</strong
            >.
          </div>

          <!-- Add a note about background generation -->
          <div
            class="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg text-sm text-yellow-800 dark:text-yellow-200 flex items-start gap-2"
          >
            <UIcon name="i-heroicons-information-circle" class="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <strong>Note:</strong> Once you click "Start training", the AI will begin generating
              detailed workouts for your first block in the background. This may take a minute.
            </div>
          </div>

          <!-- Block Timeline Visualization -->
          <div class="space-y-4">
            <div
              v-for="block in filteredBlocks"
              :key="block.order"
              class="border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
            >
              <div
                class="p-3 rounded-lg bg-gray-100 dark:bg-gray-800 text-center min-w-[60px] w-full sm:w-auto flex sm:block justify-between sm:justify-center items-center"
              >
                <div class="text-xs text-muted">WEEKS</div>
                <div class="font-bold text-lg">{{ block.durationWeeks }}</div>
              </div>

              <div class="flex-1 w-full">
                <div
                  class="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-1 gap-1"
                >
                  <h4 class="font-bold">{{ block.name.split('[')[0].trim() }}</h4>
                  <span class="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 w-fit">{{
                    formatDate(block.startDate, 'MMM d')
                  }}</span>
                </div>
                <div class="text-sm text-muted mb-2">{{ getBlockDescription(block.type) }}</div>
                <div class="flex flex-wrap gap-2">
                  <UBadge size="xs" color="primary" variant="subtle"
                    >Focus: {{ formatFocus(block.primaryFocus) }}</UBadge
                  >
                  <UBadge size="xs" color="neutral" variant="subtle">{{ block.type }}</UBadge>
                  <UBadge
                    v-if="block.name.includes('[Race:')"
                    size="xs"
                    color="info"
                    variant="soft"
                    icon="i-heroicons-flag"
                  >
                    {{ block.name.match(/\[Race: (.*?)\]/)?.[1] || 'Race' }}
                  </UBadge>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Goal Modal (Nested) -->
    <UModal
      v-model:open="showCreateGoal"
      title="Create Goal"
      description="Define a new training goal to focus your plan."
    >
      <template #body>
        <EventGoalWizard @created="onGoalCreated" @close="showCreateGoal = false" />
      </template>
    </UModal>

    <!-- Sticky Footer Actions -->
    <div
      class="pt-4 border-t mt-auto flex justify-end bg-white dark:bg-gray-900 sticky bottom-0 z-10 gap-3"
    >
      <template v-if="step === 1">
        <UButton
          v-if="selectedGoal"
          size="xl"
          color="primary"
          icon="i-heroicons-arrow-right"
          @click="
            () => {
              step = 2
            }
          "
        >
          Set my availability
        </UButton>
      </template>

      <template v-else-if="step === 2">
        <UButton
          size="xl"
          color="primary"
          :loading="initializing"
          icon="i-heroicons-sparkles"
          :disabled="selectedActivityTypes.length === 0"
          @click="
            () => {
              void initializePlan()
            }
          "
        >
          Build my plan
        </UButton>
      </template>

      <template v-else-if="step === 3">
        <UButton
          size="xl"
          color="primary"
          icon="i-heroicons-arrow-right"
          @click="
            () => {
              step = 4
            }
          "
        >
          Check my schedule
        </UButton>
      </template>

      <template v-else-if="step === 4">
        <UButton
          size="xl"
          color="primary"
          icon="i-heroicons-arrow-right"
          @click="
            () => {
              step = 6
            }
          "
        >
          Review my plan
        </UButton>
      </template>

      <template v-else-if="step === 6">
        <UButton
          variant="ghost"
          @click="
            () => {
              step = 4
            }
          "
          >Back</UButton
        >
        <UButton
          size="xl"
          color="success"
          :loading="activating"
          icon="i-heroicons-check-circle"
          @click="
            () => {
              void confirmPlan()
            }
          "
        >
          Start training
        </UButton>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
  import EventGoalWizard from '~/components/goals/EventGoalWizard.vue'
  import { useUserStore } from '~/stores/user'
  import { activityTypesForGoal } from '~/utils/plan-sports'

  const emit = defineEmits(['close', 'plan-created'])
  const toast = useToast()
  const upgradeModal = useUpgradeModal()
  const { formatDate, formatDateUTC, getUserLocalDate, timezone, calculateAge } = useFormat()
  const userStore = useUserStore()

  // State
  const step = ref(1)
  const visibleStep = computed(() => (step.value === 6 ? 5 : step.value))
  const wizardStepLabels = [
    'Goal',
    'Availability',
    'Training phases',
    'Existing sessions',
    'Review'
  ]
  const loadingGoals = ref(false)
  const goalsLoadError = ref(false)
  const showCreateGoal = ref(false)
  const goals = ref<any[]>([])
  const selectedGoal = ref<any>(null)

  function handleQuotaError(
    error: any,
    featureTitle: string,
    featureDescription: string,
    operation: 'weekly_plan_generation' = 'weekly_plan_generation'
  ) {
    if (error.statusCode === 429 || error.message?.toLowerCase().includes('quota exceeded')) {
      void (async () => {
        const { showQuotaPaywall } = useQuotaPaywall()
        await showQuotaPaywall({
          operation,
          title: 'Training Strategy Limit',
          featureTitle,
          featureDescription: error.data?.message || featureDescription,
          reason: 'quota_exceeded'
        })
      })()
      return true
    }

    if (error.statusCode === 403 || error.message?.toLowerCase().includes('upgrade to pro')) {
      upgradeModal.show({
        title: 'Pro Feature',
        featureTitle,
        featureDescription: error.data?.message || featureDescription,
        recommendedTier: 'pro',
        bullets: [
          '2 AI weekly plans per week on Supporter',
          'Advanced training block generation',
          'Strategic race planning',
          'Deep-context performance analysis'
        ]
      })
      return true
    }
    return false
  }

  // Step 2 State
  const volumeHours = ref(6) // Default 6 hours
  const strategy = ref('LINEAR')
  const recoveryRhythm = ref(4) // Default 3:1
  const startingPhase = ref('BASE')

  const recoveryOptions = [
    { label: '1 build week, 1 recovery week', value: 2 },
    { label: '2 build weeks, 1 recovery week', value: 3 },
    { label: '3 build weeks, 1 recovery week', value: 4 },
    { label: '4 build weeks, 1 recovery week', value: 5 }
  ]
  const startingPhaseOptions = [
    { label: 'Build a foundation', value: 'BASE' },
    { label: 'Develop existing fitness', value: 'BUILD' },
    { label: 'Prepare for competition', value: 'PEAK' }
  ]

  // Determine age-based recommendation
  const userAge = computed(() => {
    if (!userStore.profile?.dob) return 0
    return calculateAge(userStore.profile.dob)
  })

  watch(
    userAge,
    (newAge) => {
      if (newAge >= 45) {
        recoveryRhythm.value = 3 // Set 2:1 for masters
      }
    },
    { immediate: true }
  )

  // Initialize with local today
  const startDate = ref(getUserLocalDate().toISOString().split('T')[0])
  const endDate = ref('')
  const isEventBased = ref(true)
  const durationWeeks = ref(12)
  const aiRecommendation = ref('')

  const durationOptions = [
    { label: '4 Weeks (Sprint)', value: 4 },
    { label: '8 Weeks (Short)', value: 8 },
    { label: '12 Weeks (Standard)', value: 12 },
    { label: '16 Weeks (Long)', value: 16 },
    { label: '24 Weeks (Season)', value: 24 },
    { label: '52 Weeks (Year)', value: 52 }
  ]

  const selectedActivityTypes = ref<string[]>(['Ride'])
  const availableActivityTypes = [
    { value: 'Ride', label: 'Cycling', icon: 'i-heroicons-bolt' },
    { value: 'Run', label: 'Running', icon: 'i-heroicons-fire' },
    { value: 'Swim', label: 'Swimming', icon: 'i-material-symbols-water-drop' },
    { value: 'Gym', label: 'Strength', icon: 'i-heroicons-trophy' }
  ]

  // Step 3 State (NEW)
  const selectedBlock = computed(() => {
    if (!generatedPlan.value?.blocks) return null
    return generatedPlan.value.blocks[0]
  })

  const filteredBlocks = computed(() => {
    if (!generatedPlan.value?.blocks) return []
    return generatedPlan.value.blocks
  })

  // Step 4 State
  const customInstructions = ref('')
  const initializing = ref(false)
  const anchorWorkoutIds = ref<string[]>([])
  const independentWorkouts = ref<any[]>([])
  const loadingWorkouts = ref(false)

  async function fetchIndependentWorkouts() {
    loadingWorkouts.value = true
    try {
      // Use selected block start date or plan start date
      const startD = selectedBlock.value?.startDate || startDate.value
      if (!startD) return

      const start = new Date(startD)
      let end = new Date(start)

      if (isEventBased.value && endDate.value) {
        end = new Date(endDate.value)
      } else {
        // Use filtered duration
        const weeks = filteredBlocks.value.reduce((acc: number, b: any) => acc + b.durationWeeks, 0)
        end.setDate(end.getDate() + weeks * 7)
      }

      const workouts: any[] = await ($fetch as any)('/api/planned-workouts', {
        query: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          limit: 100
        }
      })
      independentWorkouts.value = workouts
      anchorWorkoutIds.value = workouts.map((w) => w.id)
    } catch (e) {
      console.error('Failed to fetch independent workouts', e)
    } finally {
      loadingWorkouts.value = false
    }
  }

  // Watch step to fetch workouts when entering Step 4
  watch(step, (newStep) => {
    if (newStep === 4) {
      fetchIndependentWorkouts()
    }
  })

  // Step 6 State
  const generatedPlan = ref<any>(null)
  const activating = ref(false)
  const shouldAbandonDraftOnUnmount = ref(true)

  const strategyOptions = [
    { value: 'LINEAR', label: 'Linear', description: 'Steady progression. Classic approach.' },
    { value: 'POLARIZED', label: 'Polarized', description: '80% Easy, 20% Hard. Max freshness.' },
    { value: 'BLOCK', label: 'Block', description: 'Concentrated intensity weeks. Advanced.' },
    {
      value: 'UNDULATING',
      label: 'Undulating',
      description: 'Varied daily focus. Prevents plateaus.'
    },
    {
      value: 'REVERSE',
      label: 'Reverse',
      description: 'Intense first, then long. Ideal for Ironman/Ultras.'
    },
    {
      value: 'MAINTENANCE',
      label: 'Maintenance',
      description: 'Steady load, no peak. Stay fit between goals.'
    }
  ]

  const totalWeeks = computed(() => {
    if (!filteredBlocks.value) return 0
    return filteredBlocks.value.reduce((acc: number, b: any) => acc + b.durationWeeks, 0)
  })

  // Methods
  async function fetchGoals() {
    loadingGoals.value = true
    goalsLoadError.value = false
    try {
      const data: any = await $fetch<any, string & {}>('/api/goals')
      goals.value = data.goals || []
    } catch (error) {
      goalsLoadError.value = true
      console.error('Error fetching goals', error)
    } finally {
      loadingGoals.value = false
    }
  }

  function selectGoal(goal: any) {
    selectedGoal.value = goal
    const goalSports = activityTypesForGoal(goal)
    if (goalSports && !activityTypesTouched.value) {
      selectedActivityTypes.value = goalSports
    }
    const targetDate = goal.eventDate || goal.targetDate
    if (targetDate) {
      endDate.value = formatDate(targetDate, 'yyyy-MM-dd')
      isEventBased.value = true
    } else {
      // Default to 12 weeks if no event date
      const d = getUserLocalDate()
      d.setDate(d.getDate() + 84)
      endDate.value = d.toISOString().split('T')[0] || ''
      isEventBased.value = false
    }
  }

  function onGoalCreated() {
    showCreateGoal.value = false
    fetchGoals() // Refresh list
    toast.add({ title: 'Goal Created', color: 'success' })
  }

  function getPriorityColor(p: string) {
    if (p === 'HIGH') return 'error'
    if (p === 'MEDIUM') return 'warning'
    return 'success'
  }

  function getBlockDescription(type: string) {
    const map: Record<string, string> = {
      BASE: 'Building aerobic endurance and muscular efficiency.',
      BUILD: 'Increasing threshold power and VO2 max capacity.',
      PEAK: 'Sharpening race-specific skills and tapering fatigue.',
      RACE: 'Race week preparation and execution.',
      TRANSITION: 'Recovery and unstructured riding.'
    }
    return map[type] || 'Training block.'
  }

  function formatFocus(focus: string) {
    return focus
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ')
  }

  // Once the athlete picks sports themselves, selecting a goal stops overriding them.
  const activityTypesTouched = ref(false)

  function toggleActivityType(type: string) {
    activityTypesTouched.value = true
    if (selectedActivityTypes.value.includes(type)) {
      // Prevent deselecting the last one
      if (selectedActivityTypes.value.length > 1) {
        selectedActivityTypes.value = selectedActivityTypes.value.filter((t) => t !== type)
      }
    } else {
      selectedActivityTypes.value.push(type)
    }
  }

  function toggleAnchor(id: string) {
    if (anchorWorkoutIds.value.includes(id)) {
      anchorWorkoutIds.value = anchorWorkoutIds.value.filter((i) => i !== id)
    } else {
      anchorWorkoutIds.value.push(id)
    }
  }

  function toggleSelectAll() {
    if (anchorWorkoutIds.value.length === independentWorkouts.value.length) {
      anchorWorkoutIds.value = []
    } else {
      anchorWorkoutIds.value = independentWorkouts.value.map((w) => w.id)
    }
  }

  function getEventsInBlock(block: any) {
    if (!selectedGoal.value?.events) return []

    const blockStart = new Date(block.startDate).getTime()
    const blockEnd = blockStart + block.durationWeeks * 7 * 24 * 60 * 60 * 1000

    return selectedGoal.value.events
      .filter((e: any) => {
        const eDate = new Date(e.date).getTime()
        return eDate >= blockStart && eDate < blockEnd
      })
      .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
  }

  function recommendStrategy() {
    // Simple logic for now, could be LLM powered later
    if (volumeHours.value > 10) {
      aiRecommendation.value =
        'With high volume (>10h), Polarized is excellent for avoiding burnout while building huge aerobic capacity.'
      strategy.value = 'POLARIZED'
    } else if (isEventBased.value && selectedGoal.value?.eventDate) {
      // Check time to event
      const weeks =
        (new Date(selectedGoal.value.eventDate).getTime() - getUserLocalDate().getTime()) /
        (1000 * 60 * 60 * 24 * 7)
      if (weeks < 8) {
        aiRecommendation.value =
          'With limited time (<8 weeks), Block periodization can provide a rapid fitness boost.'
        strategy.value = 'BLOCK'
      } else {
        aiRecommendation.value =
          'Linear periodization is the safest and most reliable way to peak for your event.'
        strategy.value = 'LINEAR'
      }
    } else {
      aiRecommendation.value = 'Linear periodization is the best starting point for most athletes.'
      strategy.value = 'LINEAR'
    }
  }

  async function initializePlan() {
    initializing.value = true

    if (!startDate.value) {
      toast.add({ title: 'Please select a start date', color: 'error' })
      initializing.value = false
      return
    }

    const availableHours = Number(volumeHours.value)
    if (!Number.isFinite(availableHours) || availableHours < 3 || availableHours > 20) {
      toast.add({ title: 'Choose between 3 and 20 hours per week', color: 'error' })
      initializing.value = false
      return
    }
    volumeHours.value = availableHours

    // Calculate end date if duration mode
    let finalEndDate = endDate.value
    if (!isEventBased.value) {
      const d = new Date(startDate.value + 'T00:00:00')
      d.setDate(d.getDate() + durationWeeks.value * 7)
      // Adjust to end of that day
      finalEndDate = d.toISOString().split('T')[0] + 'T23:59:59'
    } else if (finalEndDate) {
      finalEndDate = finalEndDate.split('T')[0] + 'T23:59:59'
    }

    // Map volume hours to bucket for backend (temporary until backend supports direct hours)
    let volumeBucket = 'MID'
    if (volumeHours.value <= 5) volumeBucket = 'LOW'
    else if (volumeHours.value >= 10) volumeBucket = 'HIGH'

    try {
      const response: any = await $fetch<any, string & {}>('/api/plans/initialize', {
        method: 'POST',
        body: {
          goalId: selectedGoal.value.id,
          startDate: new Date(startDate.value + 'T00:00:00').toISOString(),
          endDate: finalEndDate ? new Date(finalEndDate).toISOString() : undefined,
          volumePreference: volumeBucket,
          volumeHours: volumeHours.value,
          strategy: strategy.value,
          preferredActivityTypes: selectedActivityTypes.value,
          customInstructions: customInstructions.value,
          recoveryRhythm: recoveryRhythm.value,
          startingPhase: startingPhase.value
        }
      })

      generatedPlan.value = response.plan
      step.value = 3
    } catch (error: any) {
      console.error('[PlanWizard] Failed to initialize plan:', error)

      if (
        handleQuotaError(
          error,
          'Plan Initialization',
          'Upgrade to Pro for more AI-powered training plan generation.'
        )
      ) {
        return
      }

      toast.add({
        title: 'Failed to generate plan',
        description: error.data?.message || 'Unknown error',
        color: 'error'
      })
    } finally {
      initializing.value = false
    }
  }

  async function confirmPlan() {
    if (activating.value) return
    activating.value = true
    try {
      // Activate the plan (archives others, triggers generation)
      await $fetch<any, string & {}>(`/api/plans/${generatedPlan.value.id}/activate`, {
        method: 'POST',
        body: {
          startDate: generatedPlan.value.startDate,
          anchorWorkoutIds: anchorWorkoutIds.value
        }
      })

      shouldAbandonDraftOnUnmount.value = false
      emit('plan-created', generatedPlan.value)
      emit('close')
    } catch (error: any) {
      console.error('[PlanWizard] Failed to activate plan:', error)

      if (
        handleQuotaError(
          error,
          'Plan Activation',
          'Upgrade to Pro for more AI-powered training plan activation.'
        )
      ) {
        return
      }

      toast.add({
        title: 'Activation Failed',
        description: 'Could not activate the plan.',
        color: 'error'
      })
    } finally {
      activating.value = false
    }
  }

  onMounted(() => {
    fetchGoals()
  })

  onBeforeUnmount(() => {
    if (!shouldAbandonDraftOnUnmount.value || !generatedPlan.value?.id) return

    void $fetch<any, string & {}>(`/api/plans/${generatedPlan.value.id}/abandon`, {
      method: 'POST'
    }).catch((error: unknown) => {
      console.error('[PlanWizard] Failed to abandon draft plan on close:', error)
    })
  })
</script>
