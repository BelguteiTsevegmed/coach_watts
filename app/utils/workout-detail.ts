/**
 * Athlete-facing structure helpers for the completed-workout detail page
 * (`app/pages/workouts/[id]/index.vue`).
 *
 * The page used to expose a dozen individual sections in its section bar. They
 * are now grouped into a handful of athlete-meaningful groups; the individual
 * section anchors still exist inside each group so old deep links keep working.
 */
import { normalizeWorkoutSport } from '#shared/workout-support-matrix'

export type WorkoutDetailGroupKey = 'summary' | 'charts' | 'laps' | 'map' | 'details'

export const WORKOUT_DETAIL_GROUPS: ReadonlyArray<{
  key: WorkoutDetailGroupKey
  labelKey: string
  fallbackLabel: string
  icon: string
}> = [
  {
    key: 'summary',
    labelKey: 'groups_summary',
    fallbackLabel: 'Summary',
    icon: 'i-lucide-layout-dashboard'
  },
  {
    key: 'charts',
    labelKey: 'groups_charts',
    fallbackLabel: 'Charts',
    icon: 'i-lucide-chart-line'
  },
  {
    key: 'laps',
    labelKey: 'groups_laps',
    fallbackLabel: 'Laps & intervals',
    icon: 'i-lucide-timer'
  },
  { key: 'map', labelKey: 'groups_map', fallbackLabel: 'Map', icon: 'i-lucide-map' },
  { key: 'details', labelKey: 'groups_details', fallbackLabel: 'Details', icon: 'i-lucide-list' }
]

/**
 * Which group every (legacy) section belongs to. Keys are the section keys /
 * anchor ids used by the page before the grouping existed, plus a few anchors
 * that only ever existed as scroll targets (`overview`, `header`, `scores`,
 * `training-impact`).
 */
export const WORKOUT_SECTION_GROUP: Record<string, WorkoutDetailGroupKey> = {
  overview: 'summary',
  header: 'summary',
  scores: 'summary',
  'training-impact': 'summary',
  analysis: 'summary',
  exercises: 'summary',
  nutrition: 'summary',
  notes: 'summary',
  timeline: 'charts',
  zones: 'charts',
  pacing: 'charts',
  'power-curve': 'charts',
  intervals: 'laps',
  map: 'map',
  advanced: 'details',
  efficiency: 'details',
  metrics: 'details',
  streams: 'details',
  duplicates: 'details',
  'raw-data': 'details',
  facts: 'details'
}

/** Sections that are engineering/debug tooling and only shown to admins. */
export const ADMIN_ONLY_WORKOUT_SECTIONS: ReadonlySet<string> = new Set(['raw-data'])

const GROUP_KEYS = new Set<string>(WORKOUT_DETAIL_GROUPS.map((group) => group.key))

/**
 * Resolve a URL hash / anchor id (with or without the leading `#`) to the
 * group it lives in and, when it names an individual section, that section.
 * Unknown anchors resolve to `null` so callers can ignore them.
 */
export function resolveWorkoutDetailAnchor(
  anchor: string | null | undefined
): { group: WorkoutDetailGroupKey; section: string | null } | null {
  const id = String(anchor || '')
    .replace(/^#/, '')
    .trim()
  if (!id) return null
  if (GROUP_KEYS.has(id)) return { group: id as WorkoutDetailGroupKey, section: null }
  const group = WORKOUT_SECTION_GROUP[id]
  return group ? { group, section: id } : null
}

export type FormStatusKey = 'very_fresh' | 'fresh' | 'neutral' | 'tired' | 'very_tired'

/**
 * Plain-language reading of Form (fitness minus fatigue, a.k.a. TSB). Band
 * edges match the ones used on the calendar and activities pages so the same
 * number never gets two different descriptions.
 */
export function getFormStatus(form: number | null | undefined): {
  key: FormStatusKey
  color: 'info' | 'success' | 'neutral' | 'warning' | 'error'
} | null {
  if (form === null || form === undefined || !Number.isFinite(form)) return null
  if (form > 25) return { key: 'very_fresh', color: 'info' }
  if (form > 5) return { key: 'fresh', color: 'success' }
  if (form > -10) return { key: 'neutral', color: 'neutral' }
  if (form > -25) return { key: 'tired', color: 'warning' }
  return { key: 'very_tired', color: 'error' }
}

/** Fitness (CTL) minus fatigue (ATL), rounded; null when either is missing. */
export function calculateWorkoutForm(
  workout: { ctl?: number | null; atl?: number | null } | null | undefined
): number | null {
  if (!workout) return null
  const { ctl, atl } = workout
  if (ctl === null || ctl === undefined || atl === null || atl === undefined) return null
  return Math.round(ctl - atl)
}

/** Foot-based sports where athletes think in pace (min/km or min/mi), not power. */
export function isPaceSportType(type: string | null | undefined): boolean {
  const normalized = String(type || '').toLowerCase()
  return normalizeWorkoutSport(type) === 'run' || normalized.includes('hike')
}

type PowerLikeWorkout = {
  averageWatts?: number | null
  maxWatts?: number | null
  normalizedPower?: number | null
  streams?: { watts?: unknown } | null
}

/** True when the workout carries any real power data (summary or stream). */
export function workoutHasPowerData(workout: PowerLikeWorkout | null | undefined): boolean {
  if (!workout) return false
  if ((workout.averageWatts ?? 0) > 0) return true
  if ((workout.normalizedPower ?? 0) > 0) return true
  if ((workout.maxWatts ?? 0) > 0) return true
  const watts = workout.streams?.watts
  return Array.isArray(watts) && watts.some((value) => Number(value) > 0)
}

/**
 * Average pace in seconds per kilometre, from the recorded average speed or,
 * failing that, distance over duration. Null when it cannot be derived.
 */
export function getAveragePaceSecondsPerKm(
  workout:
    | {
        averageSpeed?: number | null
        distanceMeters?: number | null
        durationSec?: number | null
      }
    | null
    | undefined
): number | null {
  if (!workout) return null
  const speed = Number(workout.averageSpeed)
  if (Number.isFinite(speed) && speed > 0.3) return 1000 / speed

  const distance = Number(workout.distanceMeters)
  const seconds = Number(workout.durationSec)
  if (Number.isFinite(distance) && distance > 0 && Number.isFinite(seconds) && seconds > 0) {
    return seconds / (distance / 1000)
  }
  return null
}
