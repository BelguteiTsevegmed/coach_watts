import { z } from 'zod'
import {
  adaptStructuredWorkout,
  createZoneProfileSnapshot,
  type CanonicalStructuredWorkout
} from './structured-workout-contract'

/** Product dose bounds, not universal physiological or safety thresholds. */
export const WORKOUT_FAMILY_VERSION = 'endurance-families-v1'
export const WORKOUT_FAMILY_IDS = [
  'easy',
  'endurance',
  'threshold',
  'vo2',
  'strides',
  'sprints',
  'long',
  'race_specific'
] as const
export type WorkoutFamilyId = (typeof WORKOUT_FAMILY_IDS)[number]
export type FamilySport = 'run' | 'ride'
export const familySelectionSchema = z
  .object({
    family: z.enum(WORKOUT_FAMILY_IDS),
    doseStep: z.number().int().min(0).max(2),
    // Relative speed/power can change independently of repetitions. Short fast
    // efforts use effort cues; they never inherit threshold percentages.
    intensityFactor: z.number().finite().positive().optional()
  })
  .strict()
export type FamilySelection = z.infer<typeof familySelectionSchema>
export const familySelectionJsonSchema = {
  type: 'object',
  properties: {
    family: { type: 'string', enum: [...WORKOUT_FAMILY_IDS] },
    doseStep: { type: 'integer', minimum: 0, maximum: 2 },
    intensityFactor: { type: 'number', minimum: 0.1, maximum: 1.2 }
  },
  required: ['family', 'doseStep'],
  additionalProperties: false
}

type Dose = { reps: number; workSeconds: number; recoverySeconds: number }
type FamilyDefinition = {
  objective: string
  sports: readonly FamilySport[]
  intent: string
  rpe: number
  quality: boolean
  minReps: number
  minDurationSeconds: number
  maxDurationSeconds: Record<FamilySport, number>
  factor: Record<FamilySport, readonly [number, number, number]>
  doses?: Record<FamilySport, readonly Dose[]>
}
const dose = (reps: number, workSeconds: number, recoverySeconds: number): Dose => ({
  reps,
  workSeconds,
  recoverySeconds
})
const both = ['run', 'ride'] as const
const continuous = {
  sports: both,
  intent: 'endurance',
  rpe: 4,
  quality: false,
  minReps: 1,
  minDurationSeconds: 1200,
  maxDurationSeconds: { run: 7200, ride: 10800 },
  factor: { run: [0.7, 0.85, 0.75], ride: [0.6, 0.75, 0.65] }
} satisfies Omit<FamilyDefinition, 'objective'>
export const WORKOUT_FAMILIES: Readonly<Record<WorkoutFamilyId, FamilyDefinition>> = {
  easy: {
    ...continuous,
    objective: 'Comfortable aerobic movement at conversational effort.',
    intent: 'easy',
    rpe: 3,
    minDurationSeconds: 900,
    factor: { run: [0.6, 0.8, 0.7], ride: [0.45, 0.65, 0.55] }
  },
  endurance: { ...continuous, objective: 'Accumulate steady aerobic exposure without hard work.' },
  long: {
    ...continuous,
    objective: 'Extend familiar aerobic exposure with steady pacing and practiced fueling.',
    minDurationSeconds: 3600,
    maxDurationSeconds: { run: 10800, ride: 18000 }
  },
  threshold: {
    ...continuous,
    objective: 'Repeat controlled sustained efforts with recovery between repetitions.',
    intent: 'threshold',
    rpe: 7,
    quality: true,
    minReps: 2,
    maxDurationSeconds: { run: 5400, ride: 7200 },
    factor: { run: [0.95, 1.02, 1], ride: [0.9, 1, 0.95] },
    doses: {
      run: [dose(3, 300, 120), dose(3, 480, 120), dose(4, 480, 120)],
      ride: [dose(3, 480, 180), dose(3, 600, 180), dose(2, 1200, 300)]
    }
  },
  vo2: {
    ...continuous,
    objective: 'Accumulate repeatable hard aerobic efforts with equal-time easy recovery.',
    intent: 'vo2',
    rpe: 8,
    quality: true,
    minReps: 3,
    maxDurationSeconds: { run: 4500, ride: 5400 },
    factor: { run: [1.03, 1.12, 1.08], ride: [1.05, 1.2, 1.1] },
    doses: {
      run: [dose(4, 120, 120), dose(4, 180, 180), dose(5, 180, 180)],
      ride: [dose(4, 180, 180), dose(5, 180, 180), dose(5, 240, 240)]
    }
  },
  strides: {
    ...continuous,
    objective: 'Practice relaxed fast running with full easy recovery; avoid all-out sprinting.',
    sports: ['run'],
    intent: 'strides',
    rpe: 8,
    quality: true,
    minReps: 4,
    maxDurationSeconds: { run: 3600, ride: 3600 },
    doses: {
      run: [dose(4, 20, 80), dose(6, 20, 80), dose(8, 20, 80)],
      ride: []
    }
  },
  sprints: {
    ...continuous,
    objective:
      'Practice brief fast cycling efforts with full easy recovery and controlled technique.',
    sports: ['ride'],
    intent: 'sprint',
    rpe: 9,
    quality: true,
    minReps: 4,
    maxDurationSeconds: { run: 3600, ride: 5400 },
    doses: {
      run: [],
      ride: [dose(4, 10, 170), dose(6, 10, 170), dose(8, 10, 170)]
    }
  },
  race_specific: {
    ...continuous,
    objective:
      'Rehearse the supplied event effort in sustained repetitions, without racing the session.',
    intent: 'tempo',
    rpe: 6,
    quality: true,
    minReps: 2,
    maxDurationSeconds: { run: 7200, ride: 10800 },
    // No default event pace: the planner must supply a known event target.
    factor: { run: [0.8, 1.02, 0.9], ride: [0.65, 1, 0.8] },
    doses: {
      run: [dose(2, 600, 180), dose(2, 900, 180), dose(3, 900, 180)],
      ride: [dose(2, 600, 180), dose(2, 900, 180), dose(3, 900, 180)]
    }
  }
}

export function resolveFamilySport(type: unknown): FamilySport | null {
  if (['run', 'virtualrun', 'trailrun'].includes(String(type).toLowerCase())) return 'run'
  if (['ride', 'virtualride'].includes(String(type).toLowerCase())) return 'ride'
  return null
}
export type FamilyEligibility = {
  recentSessionCount: number
  longestSessionSeconds: number
  hasSportRestriction: boolean
  /** Earned from comparable completed sessions with usable athlete feedback. */
  maxDoseStep: Partial<Record<WorkoutFamilyId, number>>
  eventTarget?: { label: string; factor: number }
}
export type FamilyReferences = {
  ftp: number | null
  thresholdPaceMps: number | null
  source: string
  /** Honor effort-only targeting; HR targeting falls back to effort in this catalogue. */
  metric: 'power' | 'pace' | 'rpe'
}
export type FamilyCompilation = {
  title: string
  description: string
  structure: CanonicalStructuredWorkout
  durationSeconds: number
  provenance: {
    version: string
    requested: FamilySelection
    accepted: FamilySelection
    status: 'accepted' | 'adjusted'
    adjustments: string[]
    dose: Dose | null
    qualityWorkSeconds: number
    effectiveIntensityFactor: number | null
    reference: FamilyReferences
  }
}

/** A progression choice is advice. Applying it still requires schedule validation. */
export function adjustFamilyDose(
  selection: FamilySelection,
  direction: 'progress' | 'regress',
  feedback: { completed: boolean; effortAsExpected: boolean; recovered: boolean; symptoms: boolean }
): FamilySelection {
  if (direction === 'regress')
    return { ...selection, doseStep: Math.max(0, selection.doseStep - 1) }
  if (!feedback.completed || !feedback.effortAsExpected || !feedback.recovered || feedback.symptoms)
    return { ...selection }
  return { ...selection, doseStep: Math.min(2, selection.doseStep + 1) }
}
const positive = (n: number | null) => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Pure compiler. The calendar owns volume; this function never increases it. */
export function compileWorkoutFamily(input: {
  selection: unknown
  sport: FamilySport
  durationSeconds: number
  warmupSeconds?: number
  cooldownSeconds?: number
  eligibility: FamilyEligibility
  references: FamilyReferences
}): FamilyCompilation {
  const requested = familySelectionSchema.parse(input.selection)
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 900)
    throw new Error('Workout family needs at least 15 minutes of available time.')
  if (input.eligibility.hasSportRestriction)
    throw new Error('Workout family cannot override an active sport restriction.')
  for (const seconds of [input.warmupSeconds, input.cooldownSeconds])
    if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0))
      throw new Error('Warm-up and cooldown must be finite non-negative durations.')
  const adjustments: string[] = []
  let accepted = { ...requested }
  const fallback = (reason: string) => {
    adjustments.push(reason)
    accepted = { family: 'easy', doseStep: 0 }
  }
  let definition = WORKOUT_FAMILIES[accepted.family]
  if (!definition.sports.includes(input.sport))
    fallback('Family is unsupported for this sport; use easy work.')
  else if (definition.quality && input.eligibility.recentSessionCount < 6)
    fallback('Insufficient recent sport exposure for quality work; use easy work.')
  else if (accepted.family === 'race_specific' && !input.eligibility.eventTarget)
    fallback('No explicit event effort supplied; use easy work.')
  definition = WORKOUT_FAMILIES[accepted.family]
  const eligibleStep = Math.max(0, Math.min(2, input.eligibility.maxDoseStep[accepted.family] || 0))
  if (accepted.doseStep > eligibleStep) {
    accepted.doseStep = eligibleStep
    adjustments.push(
      'Hold the dose ladder until comparable completion and feedback support progression.'
    )
  }
  if (!definition.quality) accepted.doseStep = 0
  let duration = Math.min(
    Math.floor(input.durationSeconds),
    definition.maxDurationSeconds[input.sport]
  )
  if (input.eligibility.recentSessionCount < 6) duration = Math.min(duration, 1800)
  if (accepted.family === 'long') {
    const exposureCeiling = Math.floor(input.eligibility.longestSessionSeconds * 1.1)
    duration = Math.min(duration, exposureCeiling)
    if (duration < definition.minDurationSeconds) {
      fallback(
        'Available time or completed long-session exposure does not support a long session; use easy work.'
      )
      definition = WORKOUT_FAMILIES.easy
      duration = Math.min(Math.floor(input.durationSeconds), Math.max(900, exposureCeiling), 1800)
    }
  }
  if (
    !definition.quality &&
    duration < definition.minDurationSeconds &&
    accepted.family !== 'easy'
  ) {
    fallback('Available time is below this family minimum; use easy work.')
    definition = WORKOUT_FAMILIES.easy
  }
  if (duration < input.durationSeconds)
    adjustments.push('Reduce total duration to the family or recent-exposure ceiling.')
  let warmup = Math.max(definition.quality ? 600 : 300, Math.round(input.warmupSeconds ?? 600))
  let cooldown = Math.max(300, Math.round(input.cooldownSeconds ?? 300))
  let selectedDose: Dose | null = definition.doses?.[input.sport][accepted.doseStep] || null
  if (selectedDose) {
    const reps = Math.min(
      selectedDose.reps,
      Math.floor(
        (duration - warmup - cooldown) / (selectedDose.workSeconds + selectedDose.recoverySeconds)
      )
    )
    if (reps < definition.minReps) {
      fallback('Quality dose cannot fit with warm-up, recovery and cooldown; use easy work.')
      definition = WORKOUT_FAMILIES.easy
      selectedDose = null
      warmup = Math.max(300, Math.round(input.warmupSeconds ?? 600))
    } else if (reps < selectedDose.reps) {
      selectedDose = { ...selectedDose, reps }
      adjustments.push('Reduce repetitions; retain work duration, recovery and target intensity.')
    }
  }
  // Easy alternatives may use the documented minimum preparation periods.
  if (!selectedDose && warmup + cooldown + 300 > duration) {
    warmup = 300
    cooldown = 300
    adjustments.push('Use minimum easy-session warm-up and cooldown.')
  }
  if (warmup + cooldown + 300 > duration && !selectedDose)
    throw new Error('Available time cannot accommodate the minimum family structure.')

  const references = {
    ...input.references,
    ftp: positive(input.references.ftp) ? input.references.ftp : null,
    thresholdPaceMps: positive(input.references.thresholdPaceMps)
      ? input.references.thresholdPaceMps
      : null
  }
  const fast = accepted.family === 'strides' || accepted.family === 'sprints'
  if (fast) references.metric = 'rpe'
  if (
    (references.metric === 'power' && (input.sport !== 'ride' || !positive(references.ftp))) ||
    (references.metric === 'pace' &&
      (input.sport !== 'run' || !positive(references.thresholdPaceMps)))
  ) {
    references.metric = 'rpe'
    adjustments.push(
      'Missing applicable athlete reference; prescribe effort instead of invented absolute targets.'
    )
  }
  if (fast && accepted.intensityFactor !== undefined)
    throw new Error('Short fast efforts require effort cues, not threshold percentages.')
  if (references.metric === 'rpe' && accepted.intensityFactor !== undefined) {
    delete accepted.intensityFactor
    adjustments.push(
      'Precise intensity cannot be resolved with effort-only targets; retain the family effort cue.'
    )
  }
  const [minFactor, maxFactor, defaultFactor] = definition.factor[input.sport]
  const factor =
    accepted.family === 'race_specific'
      ? input.eligibility.eventTarget!.factor
      : (accepted.intensityFactor ?? defaultFactor)
  if (!Number.isFinite(factor) || factor < minFactor || factor > maxFactor)
    throw new Error('Intensity target is outside the selected family bounds.')
  if (
    accepted.family === 'race_specific' &&
    accepted.intensityFactor !== undefined &&
    accepted.intensityFactor !== factor
  )
    throw new Error('Race-specific intensity must match the supplied event target.')

  const target = (rpe: number, relative: number, effortOnly = false) => {
    if (!effortOnly && references.metric === 'power')
      return {
        primaryTarget: 'power',
        power: { value: relative, units: '%' }
      }
    if (!effortOnly && references.metric === 'pace')
      return {
        primaryTarget: 'pace',
        pace: { value: relative * references.thresholdPaceMps!, units: 'm/s' }
      }
    return { primaryTarget: 'rpe', rpe }
  }
  const step = (
    type: string,
    intent: string,
    seconds: number,
    name: string,
    rpe: number,
    relative: number,
    effortOnly = false
  ) => ({
    type,
    intent,
    name,
    durationSeconds: seconds,
    ...target(rpe, relative, effortOnly)
  })
  const easyFactor = WORKOUT_FAMILIES.easy.factor[input.sport][2]
  const steps: any[] = [step('Warmup', 'warmup', warmup, 'Easy warm-up', 3, easyFactor)]
  const workTime = selectedDose ? selectedDose.reps * selectedDose.workSeconds : 0
  const setTime = selectedDose
    ? selectedDose.reps * (selectedDose.workSeconds + selectedDose.recoverySeconds)
    : 0
  const remaining = duration - warmup - cooldown - setTime
  if (selectedDose && remaining > 0)
    steps.push(step('Active', 'easy', remaining, 'Easy preparation', 3, easyFactor))
  if (selectedDose)
    steps.push({
      type: 'Active',
      name: `${selectedDose.reps} repetitions`,
      reps: selectedDose.reps,
      steps: [
        step(
          'Active',
          definition.intent,
          selectedDose.workSeconds,
          `${definition.intent} effort`,
          definition.rpe,
          factor,
          fast
        ),
        step('Rest', 'recovery', selectedDose.recoverySeconds, 'Easy recovery', 2, easyFactor)
      ]
    })
  else
    steps.push(
      step(
        'Active',
        definition.intent,
        remaining,
        'Steady conversational effort',
        definition.rpe,
        factor
      )
    )
  steps.push(step('Cooldown', 'cooldown', cooldown, 'Easy cooldown', 2, easyFactor))
  const name = accepted.family.replaceAll('_', ' ')
  const doseText = selectedDose
    ? `${selectedDose.reps} × ${selectedDose.workSeconds}s with ${selectedDose.recoverySeconds}s easy recovery after each repetition`
    : `${remaining}s steady work`
  const title = `${name[0]!.toUpperCase()}${name.slice(1)} ${input.sport === 'run' ? 'run' : 'ride'} — ${selectedDose ? `${selectedDose.reps} × ${selectedDose.workSeconds}s` : `${duration / 60} min`}`
  const description = `${definition.objective} ${warmup}s easy warm-up, ${doseText}, ${cooldown}s easy cooldown.${remaining > 0 && selectedDose ? ` Includes ${remaining}s easy preparation.` : ''}${adjustments.length ? ` Adjustment: ${adjustments.join(' ')}` : ''}`
  const provenance: FamilyCompilation['provenance'] = {
    version: WORKOUT_FAMILY_VERSION,
    requested,
    accepted,
    status: adjustments.length ? 'adjusted' : 'accepted',
    adjustments,
    dose: selectedDose,
    qualityWorkSeconds: workTime,
    effectiveIntensityFactor: references.metric === 'rpe' ? null : factor,
    reference: references
  }
  const structure = adaptStructuredWorkout(
    { steps },
    {
      source: 'AI_GENERATION',
      zoneProfileSnapshot: createZoneProfileSnapshot({
        thresholdPace: references.thresholdPaceMps
      })
    }
  )!
  structure.workoutFamily = provenance
  return { title, description, structure, durationSeconds: duration, provenance }
}
