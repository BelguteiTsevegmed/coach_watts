import { getDefaultSportSettings, getSportSettingsForActivity } from '~/utils/sportSettings'
import { flattenWorkoutSteps } from '~/utils/workout-analytics'

/**
 * Which target a planned workout is written against, so its mini chart is
 * drawn in the same metric (power, heart rate or pace) as the session itself.
 */
export function getMiniChartPreference(workout: any): 'power' | 'hr' | 'pace' {
  const primaryMetric = String(
    workout?.lastGenerationSettingsSnapshot?.targetPolicy?.primaryMetric ||
      workout?.createdFromSettingsSnapshot?.targetPolicy?.primaryMetric ||
      ''
  ).toLowerCase()

  if (primaryMetric === 'heartrate') return 'hr'
  if (primaryMetric === 'pace') return 'pace'
  if (primaryMetric === 'power') return 'power'

  const flattenedSteps = flattenWorkoutSteps(workout?.structuredWorkout?.steps || [])
  const primaryTargets = flattenedSteps
    .map((step: any) => String(step?.primaryTarget || '').toLowerCase())
    .filter(Boolean)

  if (primaryTargets.length > 0) {
    const counts = primaryTargets.reduce((acc: Record<string, number>, metric: string) => {
      acc[metric] = (acc[metric] || 0) + 1
      return acc
    }, {})
    if ((counts.power || 0) >= Math.max(counts.heartrate || 0, counts.pace || 0)) return 'power'
    if ((counts.heartrate || 0) >= Math.max(counts.power || 0, counts.pace || 0)) return 'hr'
    if ((counts.pace || 0) > 0) return 'pace'
  }

  if (flattenedSteps.some((step: any) => step?.power)) return 'power'
  if (flattenedSteps.some((step: any) => step?.heartRate)) return 'hr'
  if (flattenedSteps.some((step: any) => step?.pace)) return 'pace'

  return 'power'
}

/** Sport settings for the mini chart, falling back to the default profile. */
export function getMiniChartSportSettings(
  workout: any,
  allSportSettings: any[] | null | undefined,
  currentFtp: number | null | undefined
) {
  const settings = allSportSettings || []
  const specific = getSportSettingsForActivity(settings, workout?.type || '')
  const fallback = getDefaultSportSettings(settings)

  return (
    specific || {
      ftp: currentFtp,
      lthr: fallback?.lthr,
      maxHr: fallback?.maxHr,
      thresholdPace: fallback?.thresholdPace,
      hrZones: fallback?.hrZones || [],
      powerZones: fallback?.powerZones || [],
      paceZones: fallback?.paceZones || [],
      targetPolicy: fallback?.targetPolicy,
      loadPreference: fallback?.loadPreference
    }
  )
}
