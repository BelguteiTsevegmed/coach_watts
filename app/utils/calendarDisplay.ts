import type { CalendarActivity } from '~/types/calendar'
import { WORKOUT_ICONS } from '~/utils/activity-types'

/**
 * Display preferences for the training calendar (/activities).
 *
 * Stored per user under `dashboardSettings.activityCalendar`. Only keys the athlete has changed
 * are meant to be persisted, so a stored value always wins and everything else falls back to
 * these defaults. The defaults are deliberately calm: sessions, durations and status only.
 * Training-load numbers, wellness and fuel data are opt-in.
 */
export interface ActivityCalendarSettings {
  /** Weekly energy-availability wave under each week (nutrition only). */
  showMetabolicWave: boolean
  /** Coloured fuel-state dot next to the day number (nutrition only). */
  showFuelState: boolean
  /** Visual gap between calendar weeks. */
  showWeekSeparator: boolean
  /** Show the most recent week first. */
  reverseWeekOrder: boolean
  /** Position sessions by time of day inside a cell. */
  alignActivitiesByTime: boolean
  /** HRV, sleep, resting HR and weight next to the day number. */
  showWellness: boolean
  /** Daily calorie/macro targets at the bottom of each day (nutrition only). */
  showNutrition: boolean
  /** Fitness / fatigue / form (CTL / ATL / TSB) on workouts and week totals. */
  showTrainingStress: boolean
  /** Start time, average heart rate and TSS on sessions, plus TSS in the week totals. */
  showSessionDetails: boolean
}

export type ActivityCalendarSettingKey = keyof ActivityCalendarSettings

export const DEFAULT_ACTIVITY_CALENDAR_SETTINGS: Readonly<ActivityCalendarSettings> = Object.freeze(
  {
    showMetabolicWave: false,
    showFuelState: false,
    showWeekSeparator: true,
    reverseWeekOrder: false,
    alignActivitiesByTime: false,
    showWellness: false,
    showNutrition: false,
    showTrainingStress: false,
    showSessionDetails: false
  }
)

export const NUTRITION_CALENDAR_SETTING_KEYS: readonly ActivityCalendarSettingKey[] = [
  'showNutrition',
  'showFuelState',
  'showMetabolicWave'
]

/**
 * Merge stored preferences over the defaults. Non-boolean stored values are ignored. When
 * nutrition tracking is off, every fuel/nutrition layer is forced off regardless of what was
 * stored.
 */
export function resolveActivityCalendarSettings(
  stored: unknown,
  options: { nutritionEnabled?: boolean } = {}
): ActivityCalendarSettings {
  const resolved: ActivityCalendarSettings = { ...DEFAULT_ACTIVITY_CALENDAR_SETTINGS }

  if (stored && typeof stored === 'object') {
    for (const key of Object.keys(resolved) as ActivityCalendarSettingKey[]) {
      const value = (stored as Record<string, unknown>)[key]
      if (typeof value === 'boolean') resolved[key] = value
    }
  }

  if (options.nutritionEnabled === false) {
    for (const key of NUTRITION_CALENDAR_SETTING_KEYS) resolved[key] = false
  }

  return resolved
}

export type SessionStatus = 'completed' | 'planned' | 'missed' | 'rest' | 'note' | 'milestone'

const MILESTONE_SOURCES = new Set(['goal', 'threshold', 'pb'])

export function isMilestone(activity: Pick<CalendarActivity, 'source'>): boolean {
  return MILESTONE_SOURCES.has(activity.source)
}

/** One plain status per calendar entry: done, planned, missed, rest, note or milestone. */
export function getSessionStatus(
  activity: Pick<CalendarActivity, 'source' | 'status' | 'type'>
): SessionStatus {
  if (activity.source === 'note') return 'note'
  if (MILESTONE_SOURCES.has(activity.source)) return 'milestone'
  if (activity.source === 'completed') return 'completed'
  if (activity.type === 'Rest') return 'rest'
  if (activity.status === 'completed_plan' || activity.status === 'completed') return 'completed'
  if (activity.status === 'missed') return 'missed'
  return 'planned'
}

export interface SessionStatusStyle {
  /** Card surface: left accent border + tinted background. */
  card: string
  /** Sport icon colour. */
  icon: string
  /** Legend / status dot. */
  dot: string
}

const SESSION_STATUS_STYLES: Record<SessionStatus, SessionStatusStyle> = {
  completed: {
    card: 'border-green-500 bg-green-50 hover:bg-green-100 dark:border-green-500 dark:bg-green-500/10 dark:hover:bg-green-500/15',
    icon: 'text-green-600 dark:text-green-400',
    dot: 'bg-green-500'
  },
  planned: {
    card: 'border-blue-400 bg-blue-50/70 hover:bg-blue-100 dark:border-blue-400 dark:bg-blue-500/10 dark:hover:bg-blue-500/15',
    icon: 'text-blue-500 dark:text-blue-400',
    dot: 'bg-blue-400'
  },
  missed: {
    card: 'border-red-400 bg-red-50/70 hover:bg-red-100 dark:border-red-400 dark:bg-red-500/10 dark:hover:bg-red-500/15',
    icon: 'text-red-500 dark:text-red-400',
    dot: 'bg-red-500'
  },
  rest: {
    card: 'border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:bg-gray-800',
    icon: 'text-gray-400',
    dot: 'bg-gray-400'
  },
  note: {
    card: 'border-dashed border-gray-300 bg-gray-50 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800/50 dark:hover:bg-gray-800',
    icon: 'text-gray-400',
    dot: 'bg-gray-400'
  },
  milestone: {
    card: 'border-amber-400 bg-amber-50/70 hover:bg-amber-100 dark:border-amber-400 dark:bg-amber-500/10 dark:hover:bg-amber-500/15',
    icon: 'text-amber-500 dark:text-amber-400',
    dot: 'bg-amber-400'
  }
}

export function getSessionStatusStyle(status: SessionStatus): SessionStatusStyle {
  return SESSION_STATUS_STYLES[status]
}

/** Sport icon for a session type, tolerant of free-form type strings. */
export function getSessionIcon(type?: string | null): string {
  if (type && WORKOUT_ICONS[type]) return WORKOUT_ICONS[type]

  const normalized = (type || '').toLowerCase()
  if (normalized.includes('ride') || normalized.includes('cycl') || normalized.includes('bike'))
    return 'i-tabler-bike'
  if (normalized.includes('run') || normalized.includes('jog')) return 'i-tabler-run'
  if (normalized.includes('swim')) return 'i-tabler-swimming'
  if (
    normalized.includes('weight') ||
    normalized.includes('strength') ||
    normalized.includes('gym')
  )
    return 'i-tabler-barbell'
  if (normalized.includes('walk')) return 'i-tabler-walk'
  if (normalized.includes('hike')) return 'i-tabler-mountain'
  if (normalized.includes('yoga') || normalized.includes('mobility')) return 'i-tabler-yoga'
  if (normalized.includes('rest')) return 'i-tabler-zzz'
  if (normalized.includes('note')) return 'i-heroicons-document-text'
  return 'i-tabler-activity'
}

/** Icon for any calendar entry: milestones and notes get their own, sessions their sport. */
export function getEntryIcon(
  activity: Pick<CalendarActivity, 'source' | 'type' | 'priority'>
): string {
  if (activity.source === 'goal')
    return activity.priority === 'HIGH' ? 'i-heroicons-star-solid' : 'i-heroicons-flag-solid'
  if (activity.source === 'threshold') return 'i-heroicons-arrow-trending-up'
  if (activity.source === 'pb') return 'i-heroicons-trophy-solid'
  if (activity.source === 'note') return 'i-heroicons-document-text'
  return getSessionIcon(activity.type)
}

/** "45m", "1h 30m", "2h". Empty string for missing or zero durations. */
export function formatSessionDuration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return ''
  const totalMinutes = Math.round(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** Distance as a number string with one decimal ("8.3", "10"), in km or miles. */
export function formatDistanceValue(meters: number, units?: string | null): string {
  const value = units === 'Miles' ? meters / 1609.344 : meters / 1000
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function distanceUnitLabel(units?: string | null): string {
  return units === 'Miles' ? 'mi' : 'km'
}

/** "8.3 km" / "5.2 mi". Empty string for missing or zero distances. */
export function formatSessionDistance(meters?: number | null, units?: string | null): string {
  if (typeof meters !== 'number' || !Number.isFinite(meters) || meters <= 0) return ''
  return `${formatDistanceValue(meters, units)} ${distanceUnitLabel(units)}`
}

/** Duration / distance to show for a session: actual for completed work, plan otherwise. */
export function getSessionDurationSeconds(activity: CalendarActivity): number {
  return activity.duration || activity.plannedDuration || 0
}

export function getSessionDistanceMeters(activity: CalendarActivity): number {
  return activity.distance || activity.plannedDistance || 0
}

export interface WeekSummaryTotals {
  duration: number
  distance: number
  tss: number
  plannedDuration: number
  plannedDistance: number
  plannedTss: number
}

export interface WeekProgress {
  doneDuration: number
  totalDuration: number
  doneDistance: number
  totalDistance: number
  doneTss: number
  totalTss: number
  /** Share of the week's time already done, 0..1 (falls back to distance, then load). */
  ratio: number
  /** True when nothing was done and nothing is planned. */
  isEmpty: boolean
  /** True when there is still planned (or missed) work beyond what was done. */
  hasRemaining: boolean
}

/**
 * Planned vs done for a week. "Total" is what was done plus what is still on the plan
 * (including missed sessions), matching the week totals the calendar has always shown.
 */
export function getWeekProgress(summary: WeekSummaryTotals): WeekProgress {
  const doneDuration = Math.max(0, summary.duration || 0)
  const doneDistance = Math.max(0, summary.distance || 0)
  const doneTss = Math.max(0, summary.tss || 0)
  const totalDuration = doneDuration + Math.max(0, summary.plannedDuration || 0)
  const totalDistance = doneDistance + Math.max(0, summary.plannedDistance || 0)
  const totalTss = doneTss + Math.max(0, summary.plannedTss || 0)

  let ratio = 0
  if (totalDuration > 0) ratio = doneDuration / totalDuration
  else if (totalDistance > 0) ratio = doneDistance / totalDistance
  else if (totalTss > 0) ratio = doneTss / totalTss

  return {
    doneDuration,
    totalDuration,
    doneDistance,
    totalDistance,
    doneTss,
    totalTss,
    ratio: Math.min(1, Math.max(0, ratio)),
    isEmpty: totalDuration === 0 && totalDistance === 0 && totalTss === 0,
    hasRemaining: totalDuration > doneDuration || totalDistance > doneDistance || totalTss > doneTss
  }
}

export type FormState = 'detraining' | 'fresh' | 'neutral' | 'building' | 'tired' | 'very_tired'

/** Plain-language bucket for form (TSB = fitness − fatigue). */
export function getFormState(tsb: number): FormState {
  if (tsb > 25) return 'detraining'
  if (tsb > 5) return 'fresh'
  if (tsb > -10) return 'neutral'
  if (tsb > -25) return 'building'
  if (tsb > -40) return 'tired'
  return 'very_tired'
}

export function getFormColorClass(tsb: number): string {
  const state = getFormState(tsb)
  if (state === 'fresh' || state === 'detraining') return 'text-green-600 dark:text-green-400'
  if (state === 'neutral') return 'text-gray-600 dark:text-gray-300'
  if (state === 'building') return 'text-blue-600 dark:text-blue-400'
  if (state === 'tired') return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** Signed integer with a real minus sign: "+5", "−8", "0". */
export function formatSigned(value: number): string {
  const rounded = Math.round(value)
  if (rounded > 0) return `+${rounded}`
  if (rounded < 0) return `−${Math.abs(rounded)}`
  return '0'
}
