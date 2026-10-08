import { resolveWorkoutTargeting, type WorkoutTargetingOverride } from './workout-targeting'
import { toLegacyLoadPreference } from '../../server/utils/workout-target-policy'

export function resolveStructureTargeting(
  sportSettings: any,
  workoutType: string,
  override?: WorkoutTargetingOverride | null
) {
  const resolved = resolveWorkoutTargeting(sportSettings, override)
  if (!workoutType.toLowerCase().includes('swim')) return resolved

  // Imported sport profiles can inherit the cycling POWER_HR_PACE default.
  // Swimming power is unsupported; use the next preferred swim metric.
  const fallbackOrder = resolved.targetPolicy.fallbackOrder.filter((metric) => metric !== 'power')
  const primaryMetric =
    resolved.targetPolicy.primaryMetric === 'power'
      ? fallbackOrder[0] || 'heartRate'
      : resolved.targetPolicy.primaryMetric
  const loadOrderTokens = resolved.loadOrderTokens.filter((token) => token !== 'POWER')
  return {
    ...resolved,
    targetPolicy: { ...resolved.targetPolicy, primaryMetric, fallbackOrder },
    loadPreference: toLegacyLoadPreference(fallbackOrder),
    loadOrderTokens,
    priorityText: loadOrderTokens.join(' > ')
  }
}
