import type { MacroPlan } from './macro-policy'
import { formatDateUTC, formatUserDate } from '../date'
import { classifySportFamily, type SportFamily } from '../coaching/sport'
import { RECOVERY_WEEK_FACTOR, TSS_PER_HOUR, type WeekTargetOptions } from './week-targets'

/** Product planning heuristics, not validated injury-prevention thresholds. */
export const DEFAULT_PROGRESSION_POLICY = {
  lookbackDays: 28,
  initialMultiplier: 1.2,
  growthPerLoadingWeek: 1.1,
  starterMinutes: { run: 60, ride: 90, swim: 60, strength: 60, other: 60 },
  breakDays: 14,
  returningMultiplier: 0.5
}

export type ProgressionPolicy = typeof DEFAULT_PROGRESSION_POLICY
export type SportVolumeTargets = Partial<Record<SportFamily, number>>
export type PlanProgression = {
  macroPlan?: MacroPlan
  version: 'sport-progression-v1'
  capturedAt: string
  requestedVolumeMinutes: number
  availabilityMinutes: number | null
  policy: ProgressionPolicy
  history: {
    from: string
    through: string
    completeness: 'COMPLETE' | 'UNKNOWN'
    source: 'ATHLETE_CONFIRMED' | 'UNVERIFIED_IMPORTS'
    includedWorkouts: number
    totalEnduranceWeeklyMinutes: number
  }
  sports: Partial<
    Record<
      SportFamily,
      {
        recentWeeklyAvgMinutes: number
        completedSessions?: number
        activeWeeks?: number
        lastWorkoutAt: string | null
        daysSinceLastWorkout: number | null
        status: 'ACTIVE' | 'RETURNING' | 'INACTIVE' | 'UNKNOWN_HISTORY'
        tssEstimate?: {
          perHour: number
          source: 'sport_history' | 'coarse_default'
          sampleCount: number
          coverage: number
        }
        rampBaseMinutes: number
      }
    >
  >
  explanations: string[]
}

export function buildPlanProgression(input: {
  now: Date
  workouts: Array<{
    id: string
    date: Date
    type: string | null
    durationSec: number
    isDuplicate: boolean
    tss?: number | null
  }>
  activityTypes: string[]
  requestedVolumeMinutes: number
  availabilityMinutes?: number | null
  historyCompleteness?: 'COMPLETE' | 'UNKNOWN'
  planWeeks?: number
  policy?: ProgressionPolicy
}): PlanProgression {
  const policy = input.policy ?? DEFAULT_PROGRESSION_POLICY
  const from = new Date(input.now.getTime() - policy.lookbackDays * 86400000)
  const seen = new Set<string>()
  const workouts = input.workouts.filter((w) => {
    if (
      w.isDuplicate ||
      seen.has(w.id) ||
      w.date < from ||
      w.date > input.now ||
      !Number.isFinite(w.durationSec) ||
      w.durationSec <= 0
    )
      return false
    seen.add(w.id)
    return true
  })
  const complete = input.historyCompleteness === 'COMPLETE'
  const result: PlanProgression = {
    version: 'sport-progression-v1',
    capturedAt: input.now.toISOString(),
    requestedVolumeMinutes: Math.max(0, input.requestedVolumeMinutes),
    availabilityMinutes: input.availabilityMinutes ?? null,
    policy,
    history: {
      from: from.toISOString(),
      through: input.now.toISOString(),
      completeness: complete ? 'COMPLETE' : 'UNKNOWN',
      source: complete ? 'ATHLETE_CONFIRMED' : 'UNVERIFIED_IMPORTS',
      includedWorkouts: workouts.length,
      totalEnduranceWeeklyMinutes:
        (workouts
          .filter((w) => ['run', 'ride', 'swim'].includes(classifySportFamily(w.type)))
          .reduce((sum, w) => sum + w.durationSec / 60, 0) *
          7) /
        policy.lookbackDays
    },
    sports: {},
    explanations: []
  }
  const families = [...new Set(input.activityTypes.map(classifySportFamily))]
  for (const sport of families) {
    const rows = workouts.filter((w) => classifySportFamily(w.type) === sport)
    const average = (rows.reduce((sum, w) => sum + w.durationSec / 60, 0) * 7) / policy.lookbackDays
    const last = rows.reduce<Date | null>(
      (date, w) => (!date || w.date > date ? w.date : date),
      null
    )
    const days = last ? Math.floor((input.now.getTime() - last.getTime()) / 86400000) : null
    const returning = days !== null && days >= policy.breakDays
    let rampBase = average > 0 ? average * policy.initialMultiplier : policy.starterMinutes[sport]
    if (!complete) rampBase = Math.min(rampBase, average || policy.starterMinutes[sport])
    if (returning) rampBase *= policy.returningMultiplier
    const tssRows = rows.filter(
      (w) => typeof w.tss === 'number' && Number.isFinite(w.tss) && w.tss >= 0
    )
    const totalSeconds = rows.reduce((sum, w) => sum + w.durationSec, 0)
    const knownSeconds = tssRows.reduce((sum, w) => sum + w.durationSec, 0)
    const coverage = totalSeconds > 0 ? knownSeconds / totalSeconds : 0
    const useHistory = tssRows.length >= 3 && knownSeconds >= 3600 && coverage >= 0.5
    const perHour = useHistory
      ? tssRows.reduce((sum, w) => sum + w.tss!, 0) / (knownSeconds / 3600)
      : TSS_PER_HOUR
    result.sports[sport] = {
      tssEstimate: {
        perHour,
        source: useHistory ? 'sport_history' : 'coarse_default',
        sampleCount: tssRows.length,
        coverage
      },
      recentWeeklyAvgMinutes: average,
      completedSessions: rows.length,
      activeWeeks: new Set(
        rows.map((w) => Math.floor((input.now.getTime() - w.date.getTime()) / (7 * 86400000)))
      ).size,
      lastWorkoutAt: last?.toISOString() ?? null,
      daysSinceLastWorkout: days,
      status: returning
        ? 'RETURNING'
        : average > 0
          ? 'ACTIVE'
          : complete
            ? 'INACTIVE'
            : 'UNKNOWN_HISTORY',
      rampBaseMinutes: Math.floor(rampBase)
    }
    if (returning)
      result.explanations.push(
        `${sport}: a ${days}-day gap in recorded training reduces the starting allowance. Confirm history coverage before increasing it.`
      )
    if (!average)
      result.explanations.push(
        `${sport}: ${complete ? 'no recent training confirmed' : 'recent history unknown'}; begin with an easy ${policy.starterMinutes[sport]}-minute weekly starter allowance, rather than treating availability as a training target.`
      )
  }
  if (!complete)
    result.explanations.push(
      'Training imports are unverified. Missing records are not confirmed inactivity; import or confirm the last 28 days before increasing the baseline.'
    )
  const first = calculateProgressionWeekTargets(result, {
    blockType: 'BASE',
    weekNumber: 1,
    blockDurationWeeks: 1,
    isRecovery: false,
    loadingWeekOrdinal: 1
  })
  if (first.volumeTargetMinutes < result.requestedVolumeMinutes)
    result.explanations.push(
      `Starting workload reduced from the requested ${result.requestedVolumeMinutes} to ${first.volumeTargetMinutes} minutes/week based on sport exposure and available time.`
    )
  if (input.planWeeks) {
    const optimisticLast = calculateProgressionWeekTargets(result, {
      blockType: 'BASE',
      weekNumber: 1,
      blockDurationWeeks: 1,
      isRecovery: false,
      loadingWeekOrdinal: input.planWeeks
    })
    if (optimisticLast.volumeTargetMinutes < result.requestedVolumeMinutes)
      result.explanations.push(
        'The event timeline is too short to reach the requested workload under this progression policy. Keep the reduced workload or revise the timeline; reaching event readiness is not guaranteed.'
      )
  }
  return result
}

export function readPlanProgression(value: unknown): PlanProgression | null {
  if (
    !value ||
    typeof value !== 'object' ||
    (value as PlanProgression).version !== 'sport-progression-v1'
  )
    return null
  return value as PlanProgression
}

export function readSportVolumeTargets(value: unknown): SportVolumeTargets | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (
    !entries.length ||
    entries.some(
      ([sport, minutes]) =>
        !['run', 'ride', 'swim', 'strength', 'other'].includes(sport) ||
        typeof minutes !== 'number' ||
        !Number.isFinite(minutes) ||
        minutes < 0
    )
  )
    return null
  return Object.fromEntries(entries) as SportVolumeTargets
}

export function calculateProgressionWeekTargets(
  context: PlanProgression,
  options: WeekTargetOptions
) {
  const ordinal = Math.max(1, options.loadingWeekOrdinal ?? 1)
  const allowances = Object.entries(context.sports).map(
    ([sport, baseline]) =>
      [
        sport,
        Math.floor(baseline!.rampBaseMinutes * context.policy.growthPerLoadingWeek ** (ordinal - 1))
      ] as const
  )
  const total = allowances.reduce((sum, [, minutes]) => sum + minutes, 0)
  const ceiling = Math.min(context.requestedVolumeMinutes, context.availabilityMinutes ?? Infinity)
  const scale = total > ceiling && total > 0 ? ceiling / total : 1
  let phaseFactor = options.isRecovery ? RECOVERY_WEEK_FACTOR : 1
  if (options.blockType === 'PEAK')
    phaseFactor *= 1 - (options.weekNumber / options.blockDurationWeeks) * 0.5
  const sportVolumeTargets: SportVolumeTargets = Object.fromEntries(
    allowances.map(([sport, minutes]) => [sport, Math.floor(minutes * scale * phaseFactor)])
  )
  const volumeTargetMinutes = Object.values(sportVolumeTargets).reduce(
    (sum, minutes) => sum + minutes,
    0
  )
  return {
    volumeTargetMinutes,
    tssTarget: Math.round(
      Object.entries(sportVolumeTargets).reduce(
        (sum, [sport, minutes]) =>
          sum +
          (minutes / 60) *
            (context.sports[sport as SportFamily]?.tssEstimate?.perHour ?? TSS_PER_HOUR),
        0
      )
    ),
    sportVolumeTargets
  }
}

/** Only explicit slot durations provide a numeric availability ceiling. */
export function weeklyAvailabilityMinutes(
  records: Array<{ slots: unknown; morning: boolean; afternoon: boolean; evening: boolean }>
): number | null {
  if (!records.length) return null
  let minutes = 0
  for (const record of records) {
    const slots = Array.isArray(record.slots) ? (record.slots as Array<{ duration?: number }>) : []
    if (!slots.length && (record.morning || record.afternoon || record.evening)) return null
    for (const slot of slots) {
      if (!Number.isFinite(slot.duration) || Number(slot.duration) < 0) return null
      minutes += Number(slot.duration)
    }
  }
  return minutes
}

/** Preserved sessions consume their own sport's allowance; they are never rewritten. */
export function remainingProgressionBudgets(
  volumeTargetMinutes: number | null,
  sportVolumeTargets: SportVolumeTargets | null,
  sessions: Array<{ type: string | null; durationSec: number | null }>
) {
  const remaining = sportVolumeTargets ? { ...sportVolumeTargets } : null
  let total = volumeTargetMinutes
  for (const session of sessions) {
    const minutes = Math.max(0, session.durationSec || 0) / 60
    if (total !== null) total = Math.max(0, total - minutes)
    if (remaining) {
      const sport = classifySportFamily(session.type)
      remaining[sport] = Math.max(0, (remaining[sport] || 0) - minutes)
    }
  }
  return { volumeTargetMinutes: total, sportVolumeTargets: remaining }
}

/** Actual completed dose replaces its planned estimate and is counted only once. */
export function committedProgressionSessions<
  P extends {
    id: string
    date: Date
    type: string | null
    durationSec: number | null
    managedBy?: string | null
    completed?: boolean
  },
  C extends {
    date: Date
    type: string | null
    durationSec: number
    plannedWorkoutId: string | null
  }
>(planned: P[], completed: C[], anchors: string[] = []) {
  const completedIds = new Set(completed.map((w) => w.plannedWorkoutId).filter(Boolean))
  return [
    ...planned
      .filter(
        (w) =>
          (w.managedBy === 'USER' || w.completed || anchors.includes(w.id)) &&
          !completedIds.has(w.id)
      )
      .map((w) => ({ ...w, dateKind: 'calendar' as const })),
    ...completed.map((w) => ({ ...w, dateKind: 'timestamp' as const }))
  ]
}

export function progressionSessionDay(
  session: { date: Date; dateKind?: string },
  timezone: string
): string {
  return session.dateKind === 'timestamp'
    ? formatUserDate(session.date, timezone)
    : formatDateUTC(session.date)
}
