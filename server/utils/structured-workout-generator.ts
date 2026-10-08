import { prisma } from './db'
import { resolveFamilySport } from '../../shared/workout-families'
import { isDraftStructuredWorkoutSupported } from './structured-workout-draft'

export const STRUCTURED_WORKOUT_GENERATOR_MODES = [
  'legacy_json',
  'draft_json_v1',
  'workout_families_v1'
] as const

export type StructuredWorkoutGeneratorMode = (typeof STRUCTURED_WORKOUT_GENERATOR_MODES)[number]

const DEFAULT_STRUCTURED_WORKOUT_GENERATOR_MODE: StructuredWorkoutGeneratorMode = 'draft_json_v1'

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeStructuredWorkoutGeneratorMode(
  value: unknown
): StructuredWorkoutGeneratorMode | null {
  if (typeof value !== 'string') return null
  return STRUCTURED_WORKOUT_GENERATOR_MODES.includes(value as StructuredWorkoutGeneratorMode)
    ? (value as StructuredWorkoutGeneratorMode)
    : null
}

export function readStructuredWorkoutGeneratorModeFromFeatureFlags(
  featureFlags: unknown
): StructuredWorkoutGeneratorMode {
  if (!isRecord(featureFlags)) return DEFAULT_STRUCTURED_WORKOUT_GENERATOR_MODE
  const mode = normalizeStructuredWorkoutGeneratorMode(featureFlags?.structuredWorkout?.generator)
  return mode || DEFAULT_STRUCTURED_WORKOUT_GENERATOR_MODE
}

export async function resolveStructuredWorkoutGeneratorMode(
  userId: string,
  explicitOverride?: StructuredWorkoutGeneratorMode | null
): Promise<StructuredWorkoutGeneratorMode> {
  if (explicitOverride !== undefined && explicitOverride !== null) {
    const normalizedOverride = normalizeStructuredWorkoutGeneratorMode(explicitOverride)
    if (!normalizedOverride) {
      throw new Error(`Unsupported structured workout generator mode: ${explicitOverride}`)
    }
    return normalizedOverride
  }

  const user = await (prisma as any).user.findUnique({
    where: { id: userId },
    select: { featureFlags: true }
  })

  return readStructuredWorkoutGeneratorModeFromFeatureFlags(user?.featureFlags)
}

/**
 * Resolve the generator mode for a specific workout type.
 * Families are opt-in for running/cycling; other endurance sports keep the draft path.
 */
export function resolveStructureGeneratorModeForWorkout(
  workoutType: unknown,
  featureFlags?: unknown
): StructuredWorkoutGeneratorMode {
  if (
    resolveFamilySport(workoutType) &&
    readStructuredWorkoutGeneratorModeFromFeatureFlags(featureFlags) === 'workout_families_v1'
  )
    return 'workout_families_v1'
  return isDraftStructuredWorkoutSupported(workoutType) ? 'draft_json_v1' : 'legacy_json'
}
