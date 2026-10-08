import { getPreferredMetric } from '~/utils/sportSettings'

export function getStructuredWorkoutPayload(workout: any) {
  if (!workout) return null
  if (workout.structuredWorkout && typeof workout.structuredWorkout === 'object') {
    return workout.structuredWorkout
  }
  return workout
}

export function resolveWorkoutChartSportSettings(workout: any, sportSettings?: any) {
  const rootWorkout = workout?.structuredWorkout ? workout : workout?._workoutContext || workout
  const structure = getStructuredWorkoutPayload(rootWorkout)
  const zoneSnapshot = structure?.zoneProfileSnapshot || null
  const snapshot =
    rootWorkout?.lastGenerationSettingsSnapshot ||
    rootWorkout?.generationSettingsSnapshot ||
    rootWorkout?.createdFromSettingsSnapshot ||
    (structure?.physiology ? { thresholds: structure.physiology.refs } : null)

  const merged = {
    ...(sportSettings || {}),
    ...(snapshot || {})
  }
  const reference = (metric: string) => {
    if (snapshot?.thresholds && metric in snapshot.thresholds)
      return Number(snapshot.thresholds[metric]) || 0
    return Number(snapshot?.[metric] || sportSettings?.[metric] || 0)
  }

  return {
    ...merged,
    ftp: reference('ftp'),
    lthr: reference('lthr'),
    maxHr: reference('maxHr'),
    thresholdPace:
      snapshot?.thresholds && 'thresholdPace' in snapshot.thresholds
        ? reference('thresholdPace')
        : Number(zoneSnapshot?.pace?.thresholdMps || reference('thresholdPace')),
    hrZones: Array.isArray(zoneSnapshot?.heartRate?.ranges)
      ? zoneSnapshot.heartRate.ranges
      : Array.isArray(snapshot?.zones?.heartRate)
        ? snapshot.zones.heartRate
        : Array.isArray(snapshot?.hrZones)
          ? snapshot.hrZones
          : Array.isArray(sportSettings?.hrZones)
            ? sportSettings.hrZones
            : [],
    powerZones: Array.isArray(zoneSnapshot?.power?.ranges)
      ? zoneSnapshot.power.ranges
      : Array.isArray(snapshot?.zones?.power)
        ? snapshot.zones.power
        : Array.isArray(snapshot?.powerZones)
          ? snapshot.powerZones
          : Array.isArray(sportSettings?.powerZones)
            ? sportSettings.powerZones
            : [],
    paceZones: Array.isArray(zoneSnapshot?.pace?.ranges)
      ? zoneSnapshot.pace.ranges
      : Array.isArray(snapshot?.zones?.pace)
        ? snapshot.zones.pace
        : Array.isArray(snapshot?.paceZones)
          ? snapshot.paceZones
          : Array.isArray(sportSettings?.paceZones)
            ? sportSettings.paceZones
            : [],
    targetPolicy:
      snapshot?.targetPolicy || sportSettings?.targetPolicy || merged.targetPolicy || undefined,
    loadPreference:
      snapshot?.loadPreference ||
      sportSettings?.loadPreference ||
      merged.loadPreference ||
      undefined
  }
}

export function getWorkoutChartPreference(
  workout: any,
  sportSettings: any,
  availableData: { hasHr: boolean; hasPower: boolean; hasPace?: boolean }
): 'hr' | 'power' | 'pace' {
  const effectiveSettings = resolveWorkoutChartSportSettings(workout, sportSettings)
  return getPreferredMetric(effectiveSettings, availableData)
}
