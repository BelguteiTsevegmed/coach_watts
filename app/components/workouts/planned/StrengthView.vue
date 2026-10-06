<template>
  <div
    :class="[
      'p-4 sm:p-6',
      isBlueprint
        ? 'bg-default/95 border-x-0 border-y border-default/80 rounded-none shadow-none sm:border sm:rounded-3xl'
        : 'bg-default rounded-xl border border-default'
    ]"
  >
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-lg font-semibold">Strength session</h3>
      <WorkoutDetailToolsMenu
        :editing="activeTab === 'edit'"
        :generating="generating"
        :allow-edit="allowEdit"
        edit-label="Edit exercises"
        @view="emit('view')"
        @adjust="emit('adjust')"
        @edit="activeTab = activeTab === 'edit' ? 'view' : 'edit'"
        @regenerate="emit('regenerate')"
      />
    </div>

    <details class="mb-6 border-t border-default pt-3">
      <summary class="min-h-11 cursor-pointer py-3 text-sm text-muted">Session overview</summary>
      <dl class="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
        <div>
          <dt class="text-muted">Blocks</dt>
          <dd class="mt-1 font-medium">{{ summary.blockCount }}</dd>
        </div>
        <div>
          <dt class="text-muted">Exercises</dt>
          <dd class="mt-1 font-medium">{{ summary.exerciseCount }}</dd>
        </div>
        <div>
          <dt class="text-muted">Sets</dt>
          <dd class="mt-1 font-medium">{{ summary.totalSets }}</dd>
        </div>
        <div>
          <dt class="text-muted">Duration</dt>
          <dd class="mt-1 font-medium">{{ formatDuration(displayDurationSec) }}</dd>
        </div>
        <div>
          <dt class="text-muted">Training load</dt>
          <dd class="mt-1 font-medium">{{ displayTss }}</dd>
        </div>
      </dl>
    </details>

    <div v-if="activeTab === 'edit' && allowEdit" class="space-y-4">
      <StrengthExercisesEditor
        :structured-workout="workout.structuredWorkout"
        :exercises="workout.structuredWorkout?.exercises || []"
        :owner-scope="workout.ownerScope"
        :initial-duration-sec="workout.durationSec"
        :initial-tss="workout.tss"
        @save="$emit('save', $event)"
        @cancel="activeTab = 'view'"
      />
    </div>
    <div v-else-if="blocks.length" class="space-y-4 sm:space-y-6">
      <div
        v-for="(block, blockIndex) in blocks"
        :key="block.id"
        class="overflow-hidden rounded-none border-x-0 border-y border-default/70 bg-default/70 shadow-none sm:rounded-2xl sm:border"
      >
        <div class="border-b border-default/70 bg-muted/20 px-4 py-3 sm:px-5 sm:py-4">
          <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <div class="flex flex-wrap items-center gap-2">
                <UBadge color="primary" variant="soft" size="sm" class="tracking-wide">
                  {{ blockTypeLabel(block.type) }}
                </UBadge>
                <div class="text-xs text-muted">
                  {{ block.steps.length }} exercise{{ block.steps.length === 1 ? '' : 's' }}
                </div>
              </div>
              <div class="text-lg font-semibold text-highlighted">{{ block.title }}</div>
              <div v-if="block.notes" class="max-w-3xl text-sm text-muted">{{ block.notes }}</div>
            </div>
            <div v-if="block.durationSec" class="text-sm font-medium text-muted">
              {{ formatDuration(block.durationSec) }}
            </div>
          </div>
        </div>

        <div class="space-y-3 p-3 sm:p-5">
          <div
            v-for="(step, stepIndex) in block.steps"
            :key="step.id"
            class="rounded-none bg-gray-50 px-3 py-4 transition-colors dark:bg-gray-950 sm:rounded-xl sm:p-4"
          >
            <div class="space-y-4 xl:grid xl:grid-cols-[320px_minmax(0,1fr)] xl:gap-6 xl:space-y-0">
              <div class="space-y-4">
                <div class="flex gap-4">
                  <div
                    class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                  >
                    {{ blockIndex + 1 }}{{ alphabet(stepIndex) }}
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <div class="font-medium text-gray-900 dark:text-white">{{ step.name }}</div>
                      <UButton
                        color="neutral"
                        variant="ghost"
                        icon="i-heroicons-information-circle"
                        class="min-h-11 min-w-11"
                        :aria-label="`View details for ${step.name || 'exercise'}`"
                        @click="openStepDetails(blockIndex, stepIndex)"
                      />
                      <UButton
                        v-if="step.name"
                        :to="getYouTubeSearchUrl(step.name)"
                        target="_blank"
                        rel="noopener noreferrer"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        icon="i-simple-icons-youtube"
                        class="min-h-11 min-w-11"
                        aria-label="Search YouTube for this exercise"
                        @click.stop
                      />
                      <UBadge
                        v-if="step.libraryExerciseId"
                        color="primary"
                        variant="soft"
                        size="sm"
                        class="tracking-wide"
                      >
                        Saved Exercise
                      </UBadge>
                    </div>
                    <div class="mt-0.5 flex flex-wrap text-sm text-muted">
                      <span>{{ step.setRows.length }} sets</span>
                      <span class="mx-2">•</span>
                      <span>{{ prescriptionColumnLabel(step.prescriptionMode) }}</span>
                      <span v-if="step.loadMode !== 'none'" class="mx-2">•</span>
                      <span v-if="step.loadMode !== 'none'">{{
                        loadModeLabel(step.loadMode)
                      }}</span>
                      <span v-if="step.defaultRest" class="mx-2">•</span>
                      <span v-if="step.defaultRest">Rest {{ step.defaultRest }}</span>
                    </div>
                    <div v-if="step.notes" class="mt-1 text-xs italic text-gray-500">
                      {{ step.notes }}
                    </div>
                  </div>
                </div>

                <div
                  v-if="getYouTubeEmbedUrl(step.videoUrl)"
                  class="overflow-hidden rounded-xl border border-default/70 bg-default"
                >
                  <iframe
                    :src="getYouTubeEmbedUrl(step.videoUrl) || undefined"
                    title="Exercise video"
                    class="aspect-video w-full"
                    loading="lazy"
                    allow="
                      accelerometer;
                      autoplay;
                      clipboard-write;
                      encrypted-media;
                      gyroscope;
                      picture-in-picture;
                    "
                    allowfullscreen
                  />
                </div>
              </div>

              <div
                class="overflow-x-auto rounded-xl border border-default/70 bg-default xl:self-start"
              >
                <table class="min-w-full divide-y divide-default/70 text-sm xl:table-fixed">
                  <colgroup>
                    <col style="width: 56px" />
                    <col v-if="step.loadMode !== 'none'" style="width: 110px" />
                    <col />
                    <col v-if="step.showRestColumn" style="width: 120px" />
                  </colgroup>
                  <thead class="bg-muted/10">
                    <tr>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-muted">Set</th>
                      <th
                        v-if="step.loadMode !== 'none'"
                        class="px-3 py-2 text-left text-xs font-semibold text-muted"
                      >
                        {{ loadModeLabel(step.loadMode) }}
                      </th>
                      <th class="px-3 py-2 text-left text-xs font-semibold text-muted">
                        {{ prescriptionColumnLabel(step.prescriptionMode) }}
                      </th>
                      <th
                        v-if="step.showRestColumn"
                        class="px-3 py-2 text-left text-xs font-semibold text-muted"
                      >
                        Rest
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-default/70">
                    <tr v-for="row in step.setRows" :key="row.id">
                      <td class="px-3 py-2 font-medium text-highlighted">{{ row.index }}</td>
                      <td v-if="step.loadMode !== 'none'" class="px-3 py-2">
                        {{ row.loadValue || '--' }}
                      </td>
                      <td class="px-3 py-2">{{ formatSetValue(step, row) }}</td>
                      <td v-if="step.showRestColumn" class="px-3 py-2">
                        {{ row.restOverride || step.defaultRest || '--' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="workout.description" class="space-y-4">
      <div
        class="rounded-lg bg-gray-50 p-4 text-sm text-gray-700 whitespace-pre-wrap dark:bg-gray-950 dark:text-gray-300"
      >
        {{ workout.description }}
      </div>
    </div>
    <div v-else class="py-8 text-center text-muted">No exercises generated yet.</div>

    <USlideover
      v-model:open="isStepDetailsOpen"
      side="right"
      title="Exercise Details"
      description="Quick view of this strength exercise."
    >
      <template #content>
        <div v-if="selectedStep" class="flex h-full flex-col gap-4 p-6">
          <div>
            <div class="text-lg font-semibold text-highlighted">{{ selectedStep.name }}</div>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span>{{ selectedStep.setRows.length }} sets</span>
              <span>•</span>
              <span>{{ prescriptionColumnLabel(selectedStep.prescriptionMode) }}</span>
              <span v-if="selectedStep.loadMode !== 'none'">•</span>
              <span v-if="selectedStep.loadMode !== 'none'">{{
                loadModeLabel(selectedStep.loadMode)
              }}</span>
              <span v-if="selectedStep.defaultRest">•</span>
              <span v-if="selectedStep.defaultRest">Rest {{ selectedStep.defaultRest }}</span>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <div class="rounded-xl border border-default/70 bg-muted/10 p-4">
              <div class="text-xs font-semibold text-muted">Movement Pattern</div>
              <div class="mt-2 text-sm text-highlighted">
                {{ selectedStep.movementPattern || '--' }}
              </div>
            </div>
            <div class="rounded-xl border border-default/70 bg-muted/10 p-4">
              <div class="text-xs font-semibold text-muted">Intent</div>
              <div class="mt-2 text-sm text-highlighted">{{ selectedStep.intent || '--' }}</div>
            </div>
          </div>

          <div
            v-if="getYouTubeEmbedUrl(selectedStep.videoUrl)"
            class="overflow-hidden rounded-xl border border-default/70 bg-default"
          >
            <iframe
              :src="getYouTubeEmbedUrl(selectedStep.videoUrl) || undefined"
              title="Exercise video"
              class="aspect-video w-full"
              loading="lazy"
              allow="
                accelerometer;
                autoplay;
                clipboard-write;
                encrypted-media;
                gyroscope;
                picture-in-picture;
              "
              allowfullscreen
            />
          </div>

          <div class="overflow-x-auto rounded-xl border border-default/70 bg-default">
            <table class="min-w-full divide-y divide-default/70 text-sm">
              <thead class="bg-muted/10">
                <tr>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-muted">Set</th>
                  <th
                    v-if="selectedStep.loadMode !== 'none'"
                    class="px-3 py-2 text-left text-xs font-semibold text-muted"
                  >
                    {{ loadModeLabel(selectedStep.loadMode) }}
                  </th>
                  <th class="px-3 py-2 text-left text-xs font-semibold text-muted">
                    {{ prescriptionColumnLabel(selectedStep.prescriptionMode) }}
                  </th>
                  <th
                    v-if="selectedStep.showRestColumn"
                    class="px-3 py-2 text-left text-xs font-semibold text-muted"
                  >
                    Rest
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default/70">
                <tr v-for="row in selectedStep.setRows" :key="row.id">
                  <td class="px-3 py-2 font-medium text-highlighted">{{ row.index }}</td>
                  <td v-if="selectedStep.loadMode !== 'none'" class="px-3 py-2">
                    {{ row.loadValue || '--' }}
                  </td>
                  <td class="px-3 py-2">{{ formatSetValue(selectedStep, row) }}</td>
                  <td v-if="selectedStep.showRestColumn" class="px-3 py-2">
                    {{ row.restOverride || selectedStep.defaultRest || '--' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div
            v-if="selectedStep.notes"
            class="rounded-xl border border-default/70 bg-muted/10 p-4 text-sm text-muted"
          >
            {{ selectedStep.notes }}
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>

<script setup lang="ts">
  import WorkoutDetailToolsMenu from '~/components/workouts/WorkoutDetailToolsMenu.vue'
  import StrengthExercisesEditor from './StrengthExercisesEditor.vue'
  import {
    normalizeStrengthBlocks,
    summarizeStrengthBlocks,
    type StrengthBlock,
    type StrengthBlockType,
    type StrengthBlockStep,
    type StrengthLoadMode,
    type StrengthPrescriptionMode,
    type StrengthSetRow
  } from '~/utils/strengthWorkout'
  import { getYouTubeEmbedUrl } from '~/utils/strengthExerciseLibrary'

  const props = defineProps<{
    workout: any
    generating?: boolean
    allowEdit?: boolean
    stepsTab?: 'view' | 'edit'
    isBlueprint?: boolean
  }>()

  const emit = defineEmits(['view', 'adjust', 'regenerate', 'save', 'update:stepsTab'])

  const activeTab = computed({
    get: () => props.stepsTab || 'view',
    set: (val) => emit('update:stepsTab', val)
  })

  const blocks = computed<StrengthBlock[]>(() =>
    normalizeStrengthBlocks(props.workout.structuredWorkout || {})
  )
  const summary = computed(() => summarizeStrengthBlocks(blocks.value))
  const displayDurationSec = computed(
    () => Number(props.workout?.durationSec || 0) || summary.value.durationSec
  )
  const displayTss = computed(() => {
    const tss = Number(props.workout?.tss || 0)
    return tss > 0 ? Math.round(tss) : '--'
  })
  const isStepDetailsOpen = ref(false)
  const selectedStep = ref<StrengthBlockStep | null>(null)

  function blockTypeLabel(value: StrengthBlockType) {
    if (value === 'warmup') return 'Warm Up'
    if (value === 'cooldown') return 'Cooldown'
    if (value === 'superset') return 'Superset'
    if (value === 'circuit') return 'Circuit'
    return 'Single Exercise'
  }

  function prescriptionColumnLabel(mode: StrengthPrescriptionMode) {
    switch (mode) {
      case 'reps_per_side':
        return 'Reps / Side'
      case 'duration':
        return 'Duration'
      case 'distance_meters':
        return 'Distance (m)'
      case 'distance_km':
        return 'Distance (km)'
      case 'distance_ft':
        return 'Distance (ft)'
      case 'distance_yd':
        return 'Distance (yd)'
      case 'distance_miles':
        return 'Distance (miles)'
      default:
        return 'Reps'
    }
  }

  function loadModeLabel(mode: StrengthLoadMode) {
    switch (mode) {
      case 'weight_lb':
        return 'Weight (lb)'
      case 'weight_kg':
        return 'Weight (kg)'
      case 'weight_per_side_lb':
        return 'Weight / Side (lb)'
      case 'weight_per_side_kg':
        return 'Weight / Side (kg)'
      default:
        return 'Load'
    }
  }

  function formatSetValue(step: StrengthBlockStep, row: StrengthSetRow) {
    const value = String(row.value || '').trim()
    if (!value) return '--'
    switch (step.prescriptionMode) {
      case 'reps_per_side':
        return `${value} / side`
      case 'duration':
        return `${value}s`
      case 'distance_meters':
        return `${value} m`
      case 'distance_km':
        return `${value} km`
      case 'distance_ft':
        return `${value} ft`
      case 'distance_yd':
        return `${value} yd`
      case 'distance_miles':
        return `${value} miles`
      default:
        return value
    }
  }

  function alphabet(index: number) {
    return String.fromCharCode(65 + index)
  }

  function formatDuration(seconds: number | null | undefined) {
    if (!seconds) return '0m'
    const mins = Math.floor(seconds / 60)
    if (mins >= 60) {
      const h = Math.floor(mins / 60)
      const m = mins % 60
      return m > 0 ? `${h}h ${m}m` : `${h}h`
    }
    return `${mins}m`
  }

  function getYouTubeSearchUrl(name: string) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(name).replace(/%20/g, '+')}`
  }

  function openStepDetails(blockIndex: number, stepIndex: number) {
    selectedStep.value = blocks.value[blockIndex]?.steps?.[stepIndex] || null
    isStepDetailsOpen.value = Boolean(selectedStep.value)
  }
</script>
