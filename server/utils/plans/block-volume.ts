import { classifySportFamily } from '../coaching/sport'
import { readSportVolumeTargets, type SportVolumeTargets } from './progression-policy'
/**
 * Validation and deterministic clamping for AI-generated training block weeks.
 *
 * The block generator prompts Gemini with per-week volume targets, but the model
 * sometimes schedules far more than requested (e.g. filling every availability
 * slot every day). These helpers verify the generated schedule against the
 * wizard-defined week targets and, as a last resort, scale it down so a week can
 * never be persisted at a multiple of what the athlete asked for. (CW-316)
 */

export interface GeneratedBlockWorkout {
  dayOfWeek: number
  title?: string
  description?: string
  type: string
  durationMinutes?: number
  tssEstimate?: number
  intensity?: string
}

export interface GeneratedBlockWeek {
  weekNumber: number
  focus_key?: string
  focus_label?: string
  explanation?: string
  volumeTargetMinutes?: number
  workouts?: GeneratedBlockWorkout[]
}

export interface WeekVolumeTarget {
  weekNumber: number
  volumeTargetMinutes: number | null
  tssTarget?: number | null
  isRecovery?: boolean
  /** Exact ceilings for plans with captured sport progression; legacy targets keep tolerance. */
  sportVolumeTargets?: SportVolumeTargets | null
  availability?: Array<{
    dayOfWeek: number
    slots?: unknown
    morning?: boolean
    afternoon?: boolean
    evening?: boolean
  }>
  /** UTC days (0=Sun..6=Sat) that can actually receive workouts. When set, workouts on other days are ignored (they are dropped at insert time anyway). */
  allowedDaysOfWeek?: number[]
}

export interface BlockVolumeViolation {
  weekNumber: number
  kind: 'over_volume' | 'invalid_duration' | 'over_sport_volume' | 'availability' | 'over_tss'
  message: string
}

/** A week is rejected when its scheduled minutes exceed target * VOLUME_TOLERANCE. */
export const VOLUME_TOLERANCE = 1.2
/** When clamping, scale down to target * CLAMP_RATIO. */
export const CLAMP_RATIO = 1.1
export const MIN_WORKOUT_MINUTES = 15
export const MAX_WORKOUT_MINUTES = 420

const REST_TYPES = new Set(['Rest'])

function isRest(workout: GeneratedBlockWorkout): boolean {
  return REST_TYPES.has(workout.type)
}

function countsForWeek(workout: GeneratedBlockWorkout, target: WeekVolumeTarget): boolean {
  if (isRest(workout)) return false
  if (target.allowedDaysOfWeek && !target.allowedDaysOfWeek.includes(workout.dayOfWeek)) {
    return false
  }
  return true
}

export function weekScheduledMinutes(week: GeneratedBlockWeek, target: WeekVolumeTarget): number {
  return (week.workouts || [])
    .filter((w) => countsForWeek(w, target))
    .reduce((sum, w) => sum + (w.durationMinutes || 0), 0)
}

/** Unknown committed load remains unknown, matching the final prescription assessment. */
export function remainingWeeklyTss(
  target: number | null | undefined,
  sessions: Array<{ type: string | null; tss?: number | null }>
): number | null {
  const active = sessions.filter((session) => session.type !== 'Rest')
  if (
    target == null ||
    !Number.isFinite(target) ||
    active.some((s) => s.tss == null || !Number.isFinite(s.tss))
  )
    return null
  return Math.max(0, target - active.reduce((sum, s) => sum + Math.max(0, s.tss!), 0))
}

function scheduledTss(week: GeneratedBlockWeek, target: WeekVolumeTarget): number | null {
  const active = (week.workouts || []).filter((w) => countsForWeek(w, target))
  if (active.some((w) => w.tssEstimate == null || !Number.isFinite(w.tssEstimate))) return null
  return active.reduce((sum, w) => sum + Math.max(0, w.tssEstimate!), 0)
}

function sessionCeiling(workout: GeneratedBlockWorkout, target: WeekVolumeTarget): number {
  if (!target.availability?.length) return MAX_WORKOUT_MINUTES
  const day = target.availability.find((a) => a.dayOfWeek === workout.dayOfWeek)
  if (!day) return 0
  const slots = Array.isArray(day.slots)
    ? (day.slots as Array<{ duration?: number; activityTypes?: string[] }>)
    : []
  if (!slots.length) return day.morning || day.afternoon || day.evening ? MAX_WORKOUT_MINUTES : 0
  return Math.max(
    0,
    ...slots
      .filter(
        (slot) =>
          !slot.activityTypes?.length ||
          slot.activityTypes.some(
            (type) => classifySportFamily(type) === classifySportFamily(workout.type)
          )
      )
      .map((slot) => (Number.isFinite(slot.duration) ? Number(slot.duration) : 0))
  )
}

function dayCeiling(dayOfWeek: number, target: WeekVolumeTarget): number {
  if (!target.availability?.length) return Infinity
  const day = target.availability.find((a) => a.dayOfWeek === dayOfWeek)
  if (!day) return 0
  const slots = Array.isArray(day.slots) ? (day.slots as Array<{ duration?: number }>) : []
  if (!slots.length) return day.morning || day.afternoon || day.evening ? Infinity : 0
  return slots.reduce(
    (sum, slot) => sum + (Number.isFinite(slot.duration) ? Math.max(0, Number(slot.duration)) : 0),
    0
  )
}

/** Exact, deterministic budgets for captured progression. Tiny sessions become rest instead of exceeding the budget. */
function clampProgressionWeek(
  week: GeneratedBlockWeek,
  target: WeekVolumeTarget
): GeneratedBlockWeek {
  // Bring short proposals up to a usable session before allocation. Their dose
  // increases proportionally too; frequency may then need to decrease.
  week = {
    ...week,
    workouts: (week.workouts || []).map((w) => {
      const minutes = w.durationMinutes || 0
      if (!countsForWeek(w, target) || minutes <= 0 || minutes >= MIN_WORKOUT_MINUTES) return w
      return {
        ...w,
        durationMinutes: MIN_WORKOUT_MINUTES,
        tssEstimate:
          w.tssEstimate == null ? undefined : (w.tssEstimate * MIN_WORKOUT_MINUTES) / minutes
      }
    })
  }
  const budgets = target.sportVolumeTargets ? { ...target.sportVolumeTargets } : null
  let remaining = Math.max(0, target.volumeTargetMinutes ?? Infinity)
  const scheduled = weekScheduledMinutes(week, target)
  const dose = scheduledTss(week, target)
  const tssFactor =
    target.tssTarget != null && dose != null && dose > target.tssTarget
      ? Math.max(0, target.tssTarget) / dose
      : 1
  const totalFactor = Math.min(tssFactor, scheduled > remaining ? remaining / scheduled : 1)
  const dayRemaining = new Map<number, number>()
  const sportTotals: SportVolumeTargets = {}
  for (const w of week.workouts || []) {
    if (!countsForWeek(w, target)) continue
    const sport = classifySportFamily(w.type)
    sportTotals[sport] =
      (sportTotals[sport] || 0) +
      (Number.isFinite(w.durationMinutes) ? Math.max(0, w.durationMinutes!) : 0)
  }
  const result = {
    ...week,
    workouts: (week.workouts || []).map((w) => {
      if (!countsForWeek(w, target)) return w
      const sport = classifySportFamily(w.type)
      const original = Number.isFinite(w.durationMinutes) ? Math.max(0, w.durationMinutes!) : 0
      const sportFactor = !budgets
        ? 1
        : (sportTotals[sport] || 0) > 0
          ? Math.min(1, (target.sportVolumeTargets?.[sport] || 0) / sportTotals[sport]!)
          : 0
      const availableToday = dayRemaining.get(w.dayOfWeek) ?? dayCeiling(w.dayOfWeek, target)
      const minutes = Math.floor(
        Math.min(
          original * Math.min(totalFactor, sportFactor),
          remaining,
          availableToday,
          budgets ? budgets[sport] || 0 : Infinity,
          sessionCeiling(w, target),
          MAX_WORKOUT_MINUTES
        )
      )
      if (minutes < MIN_WORKOUT_MINUTES)
        return {
          ...w,
          type: 'Rest',
          title: 'Rest',
          description: 'Rest to stay within sport progression and available time.',
          durationMinutes: 0,
          tssEstimate: 0
        }
      remaining -= minutes
      dayRemaining.set(w.dayOfWeek, availableToday - minutes)
      if (budgets) budgets[sport] = (budgets[sport] || 0) - minutes
      return {
        ...w,
        durationMinutes: minutes,
        tssEstimate:
          typeof w.tssEstimate === 'number'
            ? Math.floor((w.tssEstimate * minutes) / Math.max(1, original))
            : undefined
      }
    })
  }
  // If equal proportional reductions make every session too short, reduce frequency
  // first and retry the allocation. A 36-minute recovery week can fit two runs.
  const candidates = (week.workouts || [])
    .map((w, index) => ({ w, index }))
    .filter(({ w }) => countsForWeek(w, target))
  if (candidates.length > 1 && !result.workouts.some((w) => countsForWeek(w, target))) {
    const dropIndex = candidates[candidates.length - 1]!.index
    return clampProgressionWeek(
      {
        ...week,
        workouts: week.workouts!.map((w, index) =>
          index === dropIndex
            ? {
                ...w,
                type: 'Rest',
                title: 'Rest',
                description: 'Rest to stay within weekly training budgets.',
                durationMinutes: 0,
                tssEstimate: 0
              }
            : w
        )
      },
      target
    )
  }
  return result
}

export function validateGeneratedBlockWeeks(
  weeks: GeneratedBlockWeek[],
  targets: WeekVolumeTarget[]
): BlockVolumeViolation[] {
  const violations: BlockVolumeViolation[] = []

  for (const week of weeks) {
    const target = targets.find((t) => t.weekNumber === Number(week.weekNumber))
    if (!target) continue

    const dose = scheduledTss(week, target)
    if (target.tssTarget != null && dose != null && dose > target.tssTarget + 0.01) {
      violations.push({
        weekNumber: week.weekNumber,
        kind: 'over_tss',
        message: `Week ${week.weekNumber}: scheduled ${dose} TSS exceeds the remaining ${target.tssTarget} TSS ceiling. Shorten session durations and scale their load estimates proportionally; do not lower estimates without reducing training.`
      })
    }

    for (const workout of week.workouts || []) {
      if (!countsForWeek(workout, target)) continue
      const minutes = workout.durationMinutes || 0
      if (
        !Number.isFinite(minutes) ||
        minutes < MIN_WORKOUT_MINUTES ||
        minutes > MAX_WORKOUT_MINUTES
      ) {
        violations.push({
          weekNumber: week.weekNumber,
          kind: 'invalid_duration',
          message: `Week ${week.weekNumber}: "${workout.title || workout.type}" has an implausible duration of ${minutes} minutes (must be ${MIN_WORKOUT_MINUTES}-${MAX_WORKOUT_MINUTES} for a non-Rest session).`
        })
      }
    }

    if (target.sportVolumeTargets) {
      const totals: SportVolumeTargets = {}
      const dayTotals = new Map<number, number>()
      for (const workout of week.workouts || []) {
        if (!countsForWeek(workout, target)) continue
        dayTotals.set(
          workout.dayOfWeek,
          (dayTotals.get(workout.dayOfWeek) || 0) + (workout.durationMinutes || 0)
        )
        const sport = classifySportFamily(workout.type)
        totals[sport] = (totals[sport] || 0) + (workout.durationMinutes || 0)
        if ((workout.durationMinutes || 0) > sessionCeiling(workout, target))
          violations.push({
            weekNumber: week.weekNumber,
            kind: 'availability',
            message: `Week ${week.weekNumber}: ${workout.type} exceeds the available session window.`
          })
      }
      for (const [day, minutes] of dayTotals) {
        if (minutes > dayCeiling(day, target))
          violations.push({
            weekNumber: week.weekNumber,
            kind: 'availability',
            message: `Week ${week.weekNumber}: combined sessions exceed available time on weekday ${day}.`
          })
      }
      for (const [sport, minutes] of Object.entries(totals)) {
        if (minutes > (target.sportVolumeTargets[sport as keyof SportVolumeTargets] || 0))
          violations.push({
            weekNumber: week.weekNumber,
            kind: 'over_sport_volume',
            message: `Week ${week.weekNumber}: ${sport} schedules ${minutes} minutes above its sport-specific allowance.`
          })
      }
      if (
        target.volumeTargetMinutes !== null &&
        weekScheduledMinutes(week, target) > target.volumeTargetMinutes
      )
        violations.push({
          weekNumber: week.weekNumber,
          kind: 'over_volume',
          message: `Week ${week.weekNumber}: schedule exceeds its exact ${target.volumeTargetMinutes}-minute ceiling.`
        })
      continue
    }

    if (!target.volumeTargetMinutes || target.volumeTargetMinutes <= 0) continue

    const scheduled = weekScheduledMinutes(week, target)
    if (scheduled > target.volumeTargetMinutes * VOLUME_TOLERANCE) {
      violations.push({
        weekNumber: week.weekNumber,
        kind: 'over_volume',
        message: `Week ${week.weekNumber}${target.isRecovery ? ' (RECOVERY week)' : ''}: scheduled ${scheduled} minutes but the volume target is ${target.volumeTargetMinutes} minutes. Reduce total scheduled time to within ±10% of the target — do not fill every availability slot.`
      })
    }
  }

  return violations
}

export function formatViolationsFeedback(violations: BlockVolumeViolation[]): string {
  return [
    'YOUR PREVIOUS RESPONSE WAS REJECTED FOR THE FOLLOWING TRAINING BUDGET VIOLATIONS:',
    ...violations.map((v) => `- ${v.message}`),
    '',
    "Regenerate the FULL block fixing every violation. Both duration and TSS ceilings must hold simultaneously. Reduce actual durations with proportional TSS estimates, never change TSS alone to fit. If minimum session length cannot fit at the proposed frequency, schedule fewer sessions, leaving the others as rest. The weekly volume targets are hard budgets: the sum of workout durations in each week MUST stay within ±10% of that week's target. Availability slots are windows when the athlete CAN train — schedule only as many sessions as the volume budget allows, never one per slot per day."
  ].join('\n')
}

/**
 * Deterministic fallback when the AI ignores corrective feedback: clamp
 * implausible durations and proportionally scale down over-volume weeks
 * (durations and TSS together) to target * CLAMP_RATIO.
 * Mutates nothing; returns new week objects plus a log of adjustments.
 */
export function clampGeneratedBlockWeeks(
  weeks: GeneratedBlockWeek[],
  targets: WeekVolumeTarget[]
): { weeks: GeneratedBlockWeek[]; adjustments: string[] } {
  const adjustments: string[] = []

  const clamped = weeks.map((week) => {
    const target = targets.find((t) => t.weekNumber === Number(week.weekNumber))
    if (!target) return week

    if (readSportVolumeTargets(target.sportVolumeTargets) || target.tssTarget != null) {
      const clamped = clampProgressionWeek(week, target)
      if (JSON.stringify(clamped.workouts) !== JSON.stringify(week.workouts))
        adjustments.push(
          `Week ${week.weekNumber}: adjusted sessions to sport progression and availability ceilings.`
        )
      return clamped
    }

    let workouts = (week.workouts || []).map((w) => {
      if (!countsForWeek(w, target)) return w
      const minutes = w.durationMinutes || 0
      if (minutes < MIN_WORKOUT_MINUTES || minutes > MAX_WORKOUT_MINUTES) {
        const fixed = Math.min(Math.max(minutes, MIN_WORKOUT_MINUTES), MAX_WORKOUT_MINUTES)
        adjustments.push(
          `Week ${week.weekNumber}: "${w.title || w.type}" duration ${minutes}min -> ${fixed}min`
        )
        return { ...w, durationMinutes: fixed }
      }
      return w
    })

    if (target.volumeTargetMinutes && target.volumeTargetMinutes > 0) {
      const scheduled = workouts
        .filter((w) => countsForWeek(w, target))
        .reduce((sum, w) => sum + (w.durationMinutes || 0), 0)

      if (scheduled > target.volumeTargetMinutes * VOLUME_TOLERANCE) {
        const factor = (target.volumeTargetMinutes * CLAMP_RATIO) / scheduled
        workouts = workouts.map((w) => {
          if (!countsForWeek(w, target)) return w
          const minutes = w.durationMinutes || 0
          const scaledMinutes = Math.max(
            MIN_WORKOUT_MINUTES,
            Math.round((minutes * factor) / 5) * 5
          )
          const scaled: GeneratedBlockWorkout = { ...w, durationMinutes: scaledMinutes }
          if (typeof w.tssEstimate === 'number') {
            scaled.tssEstimate = Math.round(w.tssEstimate * factor)
          }
          return scaled
        })
        adjustments.push(
          `Week ${week.weekNumber}: scaled ${scheduled}min down to ~${Math.round(target.volumeTargetMinutes * CLAMP_RATIO)}min (target ${target.volumeTargetMinutes}min)`
        )
      }
    }

    return { ...week, workouts }
  })

  return { weeks: clamped, adjustments }
}

/** Match one complete numbering scheme before validating or persisting any generated week. */
export function normalizeGeneratedBlockWeeks(
  weeks: GeneratedBlockWeek[],
  durationWeeks: number,
  globalWeekStart: number
): GeneratedBlockWeek[] {
  const numbers = weeks.map((week) => Number(week.weekNumber))
  const unique = new Set(numbers)
  const validRange = (start: number) =>
    numbers.every((n) => Number.isInteger(n) && n >= start && n < start + durationWeeks)
  if (weeks.length !== durationWeeks || unique.size !== durationWeeks)
    throw new Error('Invalid generated block week numbering: missing or duplicate weeks')
  const start = validRange(1) ? 1 : validRange(globalWeekStart) ? globalWeekStart : null
  if (start === null)
    throw new Error(
      'Invalid generated block week numbering: use relative or global numbers consistently'
    )
  return weeks
    .map((week) => ({ ...week, weekNumber: Number(week.weekNumber) - start + 1 }))
    .sort((a, b) => a.weekNumber - b.weekNumber)
}
