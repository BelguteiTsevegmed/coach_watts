<template>
  <div v-if="profile" class="space-y-4">
    <div class="rounded-xl border border-default bg-muted/10 p-4">
      <h4 class="text-sm font-semibold text-highlighted">Perceived effort (RPE 1–10)</h4>
      <p class="mt-2 text-sm text-muted">
        Use how hard the activity feels: 1 is very light and 10 is your maximum effort. During easy
        running, aim to speak comfortably in full sentences.
      </p>
    </div>
    <h4 class="text-sm font-semibold text-muted">Workout Steps</h4>
    <ol class="space-y-3">
      <li
        v-for="(row, index) in profile.rows"
        :key="index"
        class="rounded-xl border border-default p-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span class="font-medium text-highlighted">{{ row.name }}</span>
          <span class="text-muted">
            <template v-if="row.repetitions > 1">{{ row.repetitions }} × </template>
            {{ formatDuration(row.durationSeconds) }}
          </span>
          <strong class="text-highlighted">RPE {{ row.rpe }}/10</strong>
        </div>
        <div
          class="mt-3 h-2 overflow-hidden rounded bg-muted"
          role="meter"
          :aria-label="`${row.name} perceived effort`"
          aria-valuemin="1"
          aria-valuemax="10"
          :aria-valuenow="row.rpe"
          :aria-valuetext="`RPE ${row.rpe} out of 10`"
        >
          <div class="h-full rounded bg-primary" :style="{ width: `${row.rpe * 10}%` }" />
        </div>
        <p v-if="row.notes" class="mt-2 text-sm text-muted">{{ row.notes }}</p>
      </li>
    </ol>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import { getWorkoutEffortProfile } from '#shared/workout-effort'
  const props = defineProps<{ structure: any }>()
  const profile = computed(() => getWorkoutEffortProfile(props.structure))
  function formatDuration(seconds: number) {
    if (!seconds) return ''
    const minutes = Math.floor(seconds / 60)
    const remaining = Math.round(seconds % 60)
    return remaining ? `${minutes}m ${remaining}s` : `${minutes}m`
  }
</script>
