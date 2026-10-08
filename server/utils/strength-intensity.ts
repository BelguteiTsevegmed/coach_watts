const KG_PER_LB = 0.45359237

export type StrengthHistorySet = {
  exerciseName: string
  reps: number | null
  weight: number | null
  weightUnit: string | null
  rpe?: number | null
  performedAt?: Date | string | null
  setOrder?: number | null
  sessionId?: string | null
}

export type StrengthIntensityReference = {
  exerciseName: string
  e1rmKg: { minKg: number; maxKg: number }
  sampleCount: number
  latestRpe: number | null
  estimatedRir: number | null
  progressionAdjustment: number
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function normalizeExerciseName(value: unknown) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function weightToKg(weight: unknown, unit: unknown): number | null {
  const value = Number(weight)
  if (!Number.isFinite(value) || value <= 0) return null

  const normalizedUnit = String(unit || '')
    .trim()
    .toLowerCase()
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalizedUnit)) return value
  if (['lb', 'lbs', 'pound', 'pounds'].includes(normalizedUnit)) return value * KG_PER_LB
  return null
}

/**
 * Estimate one-rep max as the spread across Epley, Brzycki, and Wathan.
 * The formulas only stay acceptably close for logged sets of eight reps or fewer.
 */
export function estimateE1rmRange(
  weightKg: number,
  reps: number
): { minKg: number; maxKg: number } | null {
  if (
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    !Number.isInteger(reps) ||
    reps < 1 ||
    reps > 8
  ) {
    return null
  }

  const estimates = [
    weightKg * (1 + reps / 30),
    weightKg * (36 / (37 - reps)),
    weightKg * (100 / (48.8 + 53.8 * Math.exp(-0.075 * reps)))
  ]

  return {
    minKg: round(Math.min(...estimates)),
    maxKg: round(Math.max(...estimates))
  }
}

/** A proposal only: repeated comparable sessions are required for an increase. */
export function buildStrengthIntensityReferences(
  history: StrengthHistorySet[],
  asOf?: Date
): StrengthIntensityReference[] {
  const grouped = new Map<
    string,
    Array<{
      set: StrengthHistorySet
      range: { minKg: number; maxKg: number }
      weightKg: number
      timestamp: number
      rpe: number | null
      sessionKey: string
    }>
  >()
  for (const set of history) {
    const key = normalizeExerciseName(set.exerciseName)
    const weightKg = weightToKg(set.weight, set.weightUnit)
    if (!key || weightKg === null) continue
    const range = estimateE1rmRange(weightKg, Number(set.reps))
    if (!range) continue
    const timestamp = set.performedAt ? +new Date(set.performedAt) : 0
    if (!Number.isFinite(timestamp)) continue
    if (asOf && (!timestamp || timestamp >= +asOf || timestamp < +asOf - 42 * 86_400_000)) continue
    const rpe = set.rpe == null ? null : Number(set.rpe)
    const validRpe = rpe !== null && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10 ? rpe : null
    const rows = grouped.get(key) || []
    rows.push({
      set,
      range,
      weightKg,
      timestamp,
      rpe: validRpe,
      sessionKey: set.sessionId || String(timestamp)
    })
    grouped.set(key, rows)
  }

  return [...grouped.values()]
    .map((rows) => {
      rows.sort(
        (a, b) => b.timestamp - a.timestamp || (b.set.setOrder ?? -1) - (a.set.setOrder ?? -1)
      )
      const latest = rows[0]!
      const sessionRows = rows.filter((row) => row.sessionKey === latest.sessionKey)
      // Highest effort in the latest session prevents an easy final set from hiding failure.
      const latestRpe = sessionRows.every((row) => row.rpe !== null)
        ? Math.max(...sessionRows.map((row) => row.rpe!))
        : null
      const previous = rows.find((row) => row.sessionKey !== latest.sessionKey)
      const priorRows = previous ? rows.filter((row) => row.sessionKey === previous.sessionKey) : []
      const comparable =
        previous &&
        latest.timestamp > previous.timestamp &&
        latest.timestamp - previous.timestamp <= 14 * 86_400_000 &&
        [...sessionRows, ...priorRows].every(
          (row) =>
            row.rpe !== null &&
            row.rpe <= 7 &&
            row.set.reps === latest.set.reps &&
            Math.abs(row.weightKg - latest.weightKg) / latest.weightKg <= 0.05
        )
      // Missing set/form/completion evidence never authorizes an automatic increase;
      // this adjustment is a conditional proposal consumed with programme gates.
      const progressionAdjustment =
        latestRpe !== null && latestRpe >= 9.5 ? -0.025 : comparable ? 0.025 : 0
      const conservativeRange = sessionRows.reduce(
        (best, row) => (row.range.minKg < best.minKg ? row.range : best),
        latest.range
      )
      return {
        exerciseName: String(latest.set.exerciseName).trim(),
        e1rmKg: conservativeRange,
        sampleCount: rows.length,
        latestRpe,
        estimatedRir: latestRpe === null ? null : round(10 - latestRpe, 1),
        progressionAdjustment
      }
    })
    .sort((a, b) => a.exerciseName.localeCompare(b.exerciseName))
}

export async function loadStrengthIntensityReferences(
  client: any,
  userId: string,
  asOf = new Date()
): Promise<StrengthIntensityReference[]> {
  const sets = await client.workoutSet.findMany({
    where: {
      reps: { gte: 1, lte: 8 },
      weight: { gt: 0 },
      type: 'NORMAL',
      workoutExercise: {
        workout: {
          userId,
          isDuplicate: false,
          date: { gte: new Date(+asOf - 42 * 86_400_000), lt: asOf }
        }
      }
    },
    select: {
      reps: true,
      weight: true,
      weightUnit: true,
      rpe: true,
      order: true,
      workoutExercise: {
        select: {
          exercise: { select: { title: true } },
          workout: { select: { id: true, date: true } }
        }
      }
    },
    orderBy: [{ workoutExercise: { workout: { date: 'desc' } } }, { order: 'desc' }, { id: 'asc' }],
    take: 1000
  })

  return buildStrengthIntensityReferences(
    sets.map((set: any) => ({
      exerciseName: set.workoutExercise?.exercise?.title || '',
      reps: set.reps,
      weight: set.weight,
      weightUnit: set.weightUnit,
      rpe: set.rpe,
      performedAt: set.workoutExercise?.workout?.date,
      setOrder: set.order,
      sessionId: set.workoutExercise?.workout?.id
    })),
    asOf
  )
}

export function formatStrengthIntensityReferences(references: StrengthIntensityReference[]) {
  if (references.length === 0) return ''

  const rows = references.map((reference) => {
    const rpe =
      reference.latestRpe === null
        ? 'latest RPE unavailable'
        : `latest RPE ${reference.latestRpe} (estimated RIR ${reference.estimatedRir})`
    const progression =
      reference.progressionAdjustment > 0
        ? 'propose +2.5% only after confirming completion, form and next-day response'
        : reference.progressionAdjustment < 0
          ? 'reduce target -2.5%'
          : 'hold target'
    return `- ${reference.exerciseName}: e1RM ${round(reference.e1rmKg.minKg, 1)}-${round(reference.e1rmKg.maxKg, 1)} kg; ${rpe}; ${progression}`
  })

  return `STRENGTH INTENSITY REFERENCES (logged sets of 1-8 reps only):
${rows.join('\n')}
Use a reference only for the same exercise. If an exercise is absent, leave its load blank rather than inventing one.`
}

function parsePlannedReps(value: unknown): number | null {
  const matches = String(value || '').match(/\d+(?:\.\d+)?/g)
  if (!matches?.length) return null
  const reps = Math.max(...matches.map(Number))
  return Number.isFinite(reps) && reps >= 1 && reps <= 20 ? reps : null
}

function roundToIncrement(value: number, increment: number) {
  return Math.max(increment, Math.round(value / increment) * increment)
}

function formatLoad(value: number) {
  return Number.isInteger(value) ? String(value) : String(round(value, 1))
}

export function applyStrengthIntensityTargets(
  structuredWorkout: any,
  references: StrengthIntensityReference[],
  preferredWeightUnits: unknown,
  options: {
    allowLoadIncrease?: boolean
    targetRir?: number
    fillMissingLoads?: boolean
    onlyConcreteLoads?: boolean
  } = {}
) {
  if (
    options.fillMissingLoads === false ||
    !Array.isArray(structuredWorkout?.blocks) ||
    references.length === 0
  ) {
    return structuredWorkout
  }

  const referenceByName = new Map(
    references.map((reference) => [normalizeExerciseName(reference.exerciseName), reference])
  )
  const usePounds = String(preferredWeightUnits || '').toLowerCase() === 'pounds'

  for (const block of structuredWorkout.blocks) {
    for (const step of Array.isArray(block?.steps) ? block.steps : []) {
      const reference = referenceByName.get(normalizeExerciseName(step?.name))
      if (!reference || !Array.isArray(step?.setRows)) continue

      const existingLoadMode = String(step?.loadMode || '')
      const hasExplicitLoads = step.setRows.some((row: any) =>
        Boolean(String(row?.loadValue || '').trim())
      )
      const hasConcreteUnit = existingLoadMode === 'weight_kg' || existingLoadMode === 'weight_lb'
      if (options.onlyConcreteLoads && !hasConcreteUnit) continue
      if (hasExplicitLoads && !hasConcreteUnit) continue
      const stepUsesPounds = hasConcreteUnit ? existingLoadMode === 'weight_lb' : usePounds

      let filledAnyLoad = false
      for (const row of step.setRows) {
        if (String(row?.loadValue || '').trim()) continue
        const reps = parsePlannedReps(row?.value)
        if (reps === null) continue

        // Invert Epley against the current conservative range with an explicit RIR
        // allowance. Programme generation gates any proposed increase.
        const repPercentage = 1 / (1 + (reps + Math.max(0, options.targetRir ?? 0)) / 30)
        const targetKg =
          reference.e1rmKg.minKg *
          repPercentage *
          (1 +
            (options.allowLoadIncrease === false
              ? Math.min(0, reference.progressionAdjustment)
              : reference.progressionAdjustment))
        const target = stepUsesPounds
          ? roundToIncrement(targetKg / KG_PER_LB, 5)
          : roundToIncrement(targetKg, 2.5)

        row.loadValue = formatLoad(target)
        filledAnyLoad = true
      }

      if (filledAnyLoad) {
        step.loadMode = stepUsesPounds ? 'weight_lb' : 'weight_kg'
      }
    }
  }

  return structuredWorkout
}
