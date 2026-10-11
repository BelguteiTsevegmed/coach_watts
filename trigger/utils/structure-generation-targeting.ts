import { resolveWorkoutTargeting, type WorkoutTargetingOverride } from './workout-targeting'

export function resolveStructureTargeting(
  sportSettings: any,
  workoutType: string,
  override?: WorkoutTargetingOverride | null,
  userMetrics: { ftp?: number | null; lthr?: number | null } = {}
) {
  const resolved = resolveWorkoutTargeting(sportSettings, override)
  // A default profile is a preference, not evidence of measured physiology.
  // Only offer percentage targets backed by a real personal reference. RPE is
  // usable without a sensor and remains the final fallback.
  const positive = (value: unknown) => Number.isFinite(Number(value)) && Number(value) > 0
  const available = {
    heartRate: positive(sportSettings?.lthr || userMetrics.lthr),
    power:
      !workoutType.toLowerCase().includes('swim') &&
      positive(sportSettings?.ftp || userMetrics.ftp),
    pace: positive(sportSettings?.thresholdPace),
    rpe: true
  }
  const fallbackOrder = resolved.targetPolicy.fallbackOrder.filter((metric) => available[metric])
  const primaryMetric = available[resolved.targetPolicy.primaryMetric]
    ? resolved.targetPolicy.primaryMetric
    : fallbackOrder[0] || 'rpe'
  const loadOrderTokens = fallbackOrder.map((metric) =>
    metric === 'heartRate' ? 'HR' : metric.toUpperCase()
  )
  return {
    ...resolved,
    targetPolicy: {
      ...resolved.targetPolicy,
      primaryMetric,
      fallbackOrder,
      // No sensor data: discard hallucinated secondary targets as well.
      ...(fallbackOrder.length === 1 && primaryMetric === 'rpe'
        ? { strictPrimary: true, allowMixedTargetsPerStep: false }
        : {})
    },
    loadPreference: loadOrderTokens.join('_'),
    loadOrderTokens,
    priorityText: loadOrderTokens.join(' > ')
  }
}
