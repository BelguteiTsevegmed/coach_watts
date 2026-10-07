<template>
  <div v-if="effortRows.length" class="mb-5 space-y-3 rounded-xl border border-default p-4">
    <h4 class="text-sm font-semibold">Effort targets</h4>
    <ol class="space-y-2 text-sm">
      <li v-for="(row, index) in effortRows" :key="index">
        <strong
          >{{ row.name }} — {{ row.reps > 1 ? `${row.reps} × ` : ''
          }}{{ Math.round(row.duration / 60) }} min, RPE {{ row.rpe }}/10</strong
        >
        <p v-if="row.description" class="text-muted">{{ row.description }}</p>
      </li>
    </ol>
    <p v-if="structure?.metricEstimates?.stress === 'unavailable'" class="text-sm text-muted">
      Training stress is unavailable without a usable physiological reference. Follow the effort
      cues.
    </p>
    <details v-if="structure?.physiology?.calibrationOptions?.length" class="text-sm">
      <summary class="cursor-pointer text-muted">Calibrate precise targets</summary>
      <p
        v-for="option in structure.physiology.calibrationOptions"
        :key="option.id"
        class="mt-2 text-muted"
      >
        {{ option.description }} {{ option.requires }}
      </p>
    </details>
  </div>
</template>

<script setup lang="ts">
  const props = defineProps<{ structure?: any }>()
  const effortRows = computed(() => {
    const rows: Array<{
      name: string
      duration: number
      reps: number
      rpe: number
      description?: string
    }> = []
    const visit = (steps: any[], multiplier = 1) => {
      for (const step of steps || []) {
        const reps = multiplier * Math.max(1, Number(step.reps) || 1)
        if (Array.isArray(step.steps) && step.steps.length) visit(step.steps, reps)
        else if (typeof step.rpe === 'number')
          rows.push({
            name: step.name || step.type || 'Effort',
            duration: step.durationSeconds || step.duration || 0,
            reps,
            rpe: step.rpe,
            description: step.description
          })
      }
    }
    visit(props.structure?.steps || [])
    return rows
  })
</script>
