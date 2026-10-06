<template>
  <div
    :class="[
      'p-4 sm:p-6',
      isBlueprint
        ? 'bg-default/95 border border-default/80 rounded-3xl shadow-none'
        : 'bg-default rounded-xl border border-default'
    ]"
  >
    <div class="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h3 class="text-lg font-semibold">Swim steps</h3>
      <WorkoutDetailToolsMenu
        :editing="activeTab === 'edit'"
        :generating="generating"
        :allow-edit="allowEdit"
        edit-label="Edit steps"
        @view="emit('view')"
        @adjust="emit('adjust')"
        @edit="activeTab = activeTab === 'edit' ? 'view' : 'edit'"
        @regenerate="emit('regenerate')"
      />
    </div>

    <div class="space-y-4">
      <div
        v-if="activeTab === 'view' && workout.structuredWorkout?.steps?.length"
        class="space-y-4"
      >
        <div
          v-for="(step, index) in workout.structuredWorkout.steps"
          :key="index"
          class="flex items-center p-3 bg-gray-50 dark:bg-gray-950 rounded-lg"
        >
          <div
            class="w-8 h-8 rounded-full bg-cyan-100 dark:bg-cyan-900 text-cyan-600 dark:text-cyan-300 flex items-center justify-center font-bold text-sm mr-4"
          >
            {{ Number(index) + 1 }}
          </div>
          <div class="flex-1">
            <div class="font-medium">{{ step.name || step.type }}</div>
            <div class="text-sm text-muted">
              <span v-if="step.distance">{{ step.distance }}m</span>
              <span v-else-if="step.durationSeconds || step.duration">{{
                formatDuration(step.durationSeconds || step.duration)
              }}</span>
              <span
                v-if="step.description && (step.distance || step.durationSeconds || step.duration)"
                class="mx-2"
                >•</span
              >
              <span v-if="step.description">{{ step.description }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeTab === 'edit'">
        <WorkoutStepsEditor
          :steps="workout.structuredWorkout?.steps || []"
          @save="$emit('save', $event)"
          @cancel="activeTab = 'view'"
        />
      </div>
      <div v-else class="text-center py-8 text-muted">No structured swim steps available.</div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import WorkoutDetailToolsMenu from '~/components/workouts/WorkoutDetailToolsMenu.vue'
  import WorkoutStepsEditor from './WorkoutStepsEditor.vue'
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

  function formatDuration(seconds: number) {
    const mins = Math.floor(seconds / 60)
    return `${mins} min`
  }
</script>
