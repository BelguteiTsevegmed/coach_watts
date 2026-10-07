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
      <h3 class="text-lg font-semibold">Ride intervals</h3>
      <WorkoutDetailToolsMenu
        :editing="activeTab === 'edit'"
        :generating="generating"
        :allow-edit="allowEdit"
        edit-label="Edit intervals"
        :has-messages="true"
        @view="emit('view')"
        @adjust="emit('adjust')"
        @edit="activeTab = activeTab === 'edit' ? 'view' : 'edit'"
        @regenerate="emit('regenerate')"
        @add-messages="emit('add-messages')"
      />
    </div>

    <EffortWorkoutSteps :structure="workout.structuredWorkout" />

    <WorkoutChart
      v-if="!isEffortOnlyWorkout(workout.structuredWorkout) || activeTab === 'edit'"
      v-model:steps-tab="activeTab"
      :workout="workout"
      :user-ftp="userFtp"
      :sport-settings="sportSettings"
      :allow-edit="allowEdit"
      @save="$emit('save', $event)"
    />
  </div>
</template>

<script setup lang="ts">
  import { isEffortOnlyWorkout } from '#shared/physiology-references'
  import EffortWorkoutSteps from './EffortWorkoutSteps.vue'
  import WorkoutDetailToolsMenu from '~/components/workouts/WorkoutDetailToolsMenu.vue'
  import WorkoutChart from '~/components/workouts/WorkoutChart.vue'

  const props = defineProps<{
    workout: any
    userFtp?: number
    sportSettings?: any
    generating?: boolean
    allowEdit?: boolean
    stepsTab?: 'view' | 'edit'
    isBlueprint?: boolean
  }>()

  const emit = defineEmits([
    'add-messages',
    'view',
    'adjust',
    'regenerate',
    'save',
    'update:stepsTab'
  ])

  const activeTab = computed({
    get: () => props.stepsTab || 'view',
    set: (val) => emit('update:stepsTab', val)
  })
</script>
