/**
 * Pure helpers behind the Today screen's "This week" and goal countdown
 * cards. Dates are handled as `yyyy-MM-dd` keys in the athlete's local
 * calendar so nothing here depends on the runtime timezone.
 */
import type { CalendarActivity } from '~/types/calendar'
import { getCalendarActivityDateKey } from '~/utils/calendar'
import { addDaysToKey, daysBetweenKeys } from '~/utils/date-keys'

function keyToUtcMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1)
}

/** Date key of a date-only value stored as UTC midnight (planned workouts, goals). */
export function utcDateKey(value: string | Date | null | undefined): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/** The seven date keys (Monday → Sunday) of the week containing `todayKey`. */
export function getWeekDateKeys(todayKey: string): string[] {
  const weekday = new Date(keyToUtcMs(todayKey)).getUTCDay() // 0 = Sunday
  const offsetToMonday = (weekday + 6) % 7
  const monday = addDaysToKey(todayKey, -offsetToMonday)
  return Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i))
}

const NON_TRAINING_TYPES = new Set(['Rest', 'Note'])

export type WeekDayState = 'done' | 'planned' | 'missed' | 'rest'

export interface WeekSession {
  id: string
  title: string
  type: string
  status: 'done' | 'planned' | 'missed'
  durationSec: number
  link: string
}

export interface WeekDaySummary {
  dateKey: string
  isToday: boolean
  isPast: boolean
  state: WeekDayState
  sessions: WeekSession[]
}

export interface WeekSummary {
  days: WeekDaySummary[]
  /** Sessions completed this week (planned or not). */
  sessionsDone: number
  /** Completed sessions plus planned sessions that are still open or were missed. */
  sessionsTotal: number
  doneDurationSec: number
  totalDurationSec: number
  /** True when anything was planned or done this week. */
  hasActivity: boolean
}

function sessionDuration(activity: CalendarActivity): number {
  const value =
    activity.duration ??
    (activity as any).durationSec ??
    activity.plannedDuration ??
    activity.linkedPlannedWorkout?.duration ??
    0
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0
}

/**
 * Summarise the current week from `/api/calendar` activities.
 *
 * Completed workouts that were never linked to their planned session are
 * matched against open planned sessions on the same day, so doing the session
 * without a formal link still counts as done instead of "missed + extra".
 */
export function summarizeWeek(
  activities: CalendarActivity[],
  todayKey: string,
  timezone: string
): WeekSummary {
  const weekKeys = getWeekDateKeys(todayKey)
  const byDay = new Map<string, CalendarActivity[]>(weekKeys.map((key) => [key, []]))

  for (const activity of activities || []) {
    if (activity.source !== 'completed' && activity.source !== 'planned') continue
    const key = getCalendarActivityDateKey(activity, timezone || 'UTC')
    byDay.get(key)?.push(activity)
  }

  let sessionsDone = 0
  let sessionsTotal = 0
  let doneDurationSec = 0
  let totalDurationSec = 0

  const days: WeekDaySummary[] = weekKeys.map((dateKey) => {
    const items = byDay.get(dateKey) || []
    const isToday = dateKey === todayKey
    const isPast = dateKey < todayKey

    const done: WeekSession[] = []
    const open: WeekSession[] = []
    let unlinkedCompleted = 0

    for (const activity of items) {
      const type = activity.type || 'Workout'
      if (activity.source === 'completed') {
        if (NON_TRAINING_TYPES.has(type)) continue
        if (!activity.plannedWorkoutId) unlinkedCompleted += 1
        done.push({
          id: activity.id,
          title: activity.title,
          type,
          status: 'done',
          durationSec: sessionDuration(activity),
          link: `/workouts/${activity.id}`
        })
        continue
      }

      if (NON_TRAINING_TYPES.has(type)) continue
      const session: WeekSession = {
        id: activity.id,
        title: activity.title,
        type,
        status: 'planned',
        durationSec: sessionDuration(activity),
        link: `/workouts/planned/${activity.id}`
      }
      if (activity.status === 'completed_plan') {
        done.push({ ...session, status: 'done' })
      } else {
        open.push(session)
      }
    }

    // Unlinked completions on or before today satisfy that day's open sessions.
    const matched = isPast || isToday ? Math.min(unlinkedCompleted, open.length) : 0
    const remaining = open.slice(matched).map<WeekSession>((session) => ({
      ...session,
      status: isPast ? 'missed' : 'planned'
    }))

    const dayDone = done.reduce((sum, s) => sum + s.durationSec, 0)
    const dayRemaining = remaining.reduce((sum, s) => sum + s.durationSec, 0)
    sessionsDone += done.length
    sessionsTotal += done.length + remaining.length
    doneDurationSec += dayDone
    totalDurationSec += dayDone + dayRemaining

    let state: WeekDayState = 'rest'
    if (done.length > 0) state = 'done'
    else if (remaining.length > 0) state = isPast ? 'missed' : 'planned'

    return { dateKey, isToday, isPast, state, sessions: [...done, ...remaining] }
  })

  return {
    days,
    sessionsDone,
    sessionsTotal,
    doneDurationSec,
    totalDurationSec,
    hasActivity: sessionsTotal > 0
  }
}

export interface UpcomingWorkoutLike {
  id: string
  date: string | Date
  title: string
  type?: string | null
  durationSec?: number | null
  tss?: number | null
}

export interface ComingUpDay<T extends UpcomingWorkoutLike = UpcomingWorkoutLike> {
  dateKey: string
  workouts: T[]
  rest: boolean
}

/**
 * Day-by-day list of what's next after today, with rest days shown in
 * between sessions. Stops after `maxSessions` sessions or `maxDays` days and
 * never pads past the last scheduled session (an empty future is "no plan",
 * not a string of rest days).
 */
export function buildComingUp<T extends UpcomingWorkoutLike>(
  workouts: T[],
  todayKey: string,
  options: { maxDays?: number; maxSessions?: number } = {}
): ComingUpDay<T>[] {
  const maxDays = options.maxDays ?? 7
  const maxSessions = options.maxSessions ?? 4

  const byDay = new Map<string, T[]>()
  let lastKey: string | null = null
  for (const workout of workouts || []) {
    const key = utcDateKey(workout.date)
    if (!key || key <= todayKey) continue
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(workout)
    if (!lastKey || key > lastKey) lastKey = key
  }
  if (!lastKey) return []

  const rows: ComingUpDay<T>[] = []
  let sessions = 0
  for (let i = 1; i <= maxDays; i++) {
    const dateKey = addDaysToKey(todayKey, i)
    if (dateKey > lastKey) break
    const training = (byDay.get(dateKey) || []).filter((w) => !NON_TRAINING_TYPES.has(w.type || ''))
    rows.push({ dateKey, workouts: training, rest: training.length === 0 })
    sessions += training.length
    if (sessions >= maxSessions) break
  }
  return rows
}

export interface GoalLike {
  id: string
  title: string
  status?: string | null
  eventDate?: string | Date | null
  targetDate?: string | Date | null
}

export interface GoalCountdown<T extends GoalLike = GoalLike> {
  goal: T
  dateKey: string
  daysToGo: number
}

/** The nearest active goal with a date that hasn't passed yet. */
export function pickCountdownGoal<T extends GoalLike>(
  goals: T[],
  todayKey: string
): GoalCountdown<T> | null {
  const candidates = (goals || [])
    .filter((goal) => (goal.status || 'ACTIVE').toUpperCase() === 'ACTIVE')
    .map((goal) => ({ goal, dateKey: utcDateKey(goal.eventDate || goal.targetDate) }))
    .filter((c): c is { goal: T; dateKey: string } => !!c.dateKey && c.dateKey >= todayKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))

  const next = candidates[0]
  if (!next) return null
  return { ...next, daysToGo: daysBetweenKeys(todayKey, next.dateKey) }
}

/** "40 min", "1h 30m", "2h" — compact training durations. */
export function formatTrainingDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  const totalMinutes = Math.max(1, Math.round(seconds / 60))
  if (totalMinutes < 60) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

/** "6.7 km" / "4.1 mi" following the athlete's distance preference. */
export function formatTrainingDistance(
  meters: number | null | undefined,
  distanceUnits: string | null | undefined
): string | null {
  if (meters === null || meters === undefined || !Number.isFinite(meters) || meters <= 0) {
    return null
  }
  if (distanceUnits === 'Miles') return `${(meters / 1609.344).toFixed(1)} mi`
  return `${(meters / 1000).toFixed(1)} km`
}
