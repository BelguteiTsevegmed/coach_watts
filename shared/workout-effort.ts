export interface WorkoutEffortRow {
  name: string
  rpe: number
  durationSeconds: number
  repetitions: number
  notes: string
}

/** An effort-only profile has no physiological targets to chart as percentages. */
export function getWorkoutEffortProfile(structure: any): {
  rows: WorkoutEffortRow[]
  averageRpe: number
} | null {
  const rows: WorkoutEffortRow[] = []
  let effortOnly = true
  const visit = (steps: any[], repetitions = 1) => {
    for (const step of steps) {
      const reps = Math.max(1, Math.trunc(Number(step?.reps || step?.repeat || 1))) * repetitions
      if (Array.isArray(step?.steps) && step.steps.length > 0) {
        visit(step.steps, reps)
        continue
      }
      const rpe = step?.rpe
      if (
        typeof rpe !== 'number' ||
        !Number.isFinite(rpe) ||
        rpe < 1 ||
        rpe > 10 ||
        step.heartRate ||
        step.power ||
        step.pace
      ) {
        effortOnly = false
        continue
      }
      rows.push({
        name: String(step.name || step.type || 'Run'),
        rpe,
        durationSeconds: Math.max(0, Number(step.durationSeconds || step.duration || 0)),
        repetitions: reps,
        notes: String(step.notes || step.targetSplit || '')
      })
    }
  }
  visit(Array.isArray(structure?.steps) ? structure.steps : [])
  if (!effortOnly || rows.length === 0) return null
  const totalWeight = rows.reduce(
    (total, row) => total + (row.durationSeconds || 1) * row.repetitions,
    0
  )
  const averageRpe =
    rows.reduce((total, row) => total + row.rpe * (row.durationSeconds || 1) * row.repetitions, 0) /
    totalWeight
  return { rows, averageRpe }
}
