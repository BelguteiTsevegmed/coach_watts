import { classifySportFamily } from '../coaching/sport'
import { readSportVolumeTargets } from './progression-policy'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { PlannedWorkout, TrainingAvailability, TrainingWeek, Workout } from '@prisma/client'
import { formatDateUTC, formatUserDate, parseCalendarDate } from '../date'

export const planAdaptationSchema = z.object({
  planId: z.string().min(1),
  adaptationType: z.literal('RECALCULATE_WEEK'),
  requestId: z.string().min(1).max(100).optional(),
  anchorWorkoutIds: z.array(z.string().min(1)).max(100).default([]),
  context: z.string().max(4000).optional()
})

export type AdaptationOutcome = {
  success: boolean
  outcome: 'changed' | 'unchanged' | 'failed'
  reason?: string
  message: string
  planId: string
  requestId: string
  createdCount?: number
  removedCount?: number
  remoteCleanupCount?: number
}

export function scheduleFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function calendarDays(start: string, end: string): string[] {
  const date = parseCalendarDate(start)
  if (!date || !parseCalendarDate(end)) throw new Error('Invalid week boundaries')
  const days: string[] = []
  while (formatDateUTC(date) <= end) {
    days.push(formatDateUTC(date))
    if (days.length > 14) throw new Error('Invalid training week length')
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days
}

export function isReplaceableWorkout(
  workout: PlannedWorkout,
  weekId: string,
  boundary: string,
  end: string,
  anchors: string[]
): boolean {
  const day = formatDateUTC(workout.date)
  const metadata = workout.rawJson as Record<string, unknown> | null
  return (
    day >= boundary &&
    day <= end &&
    workout.trainingWeekId === weekId &&
    workout.managedBy === 'COACH_WATTS' &&
    workout.completed === false &&
    workout.completionStatus === 'PENDING' &&
    (!workout.modifiedLocally || workout.lastStructureEditSource === 'AI') &&
    !workout.syncConflict &&
    (workout.syncStatus === 'LOCAL_ONLY' || workout.syncStatus === 'SYNCED') &&
    (!workout.lastStructureEditSource ||
      ['AI', 'PUBLISH'].includes(workout.lastStructureEditSource)) &&
    !anchors.includes(workout.id) &&
    !metadata?.isAnchor &&
    !metadata?.locked
  )
}

export function buildRecalculationContext(params: {
  week: TrainingWeek
  workouts: PlannedWorkout[]
  completed: (Pick<Workout, 'date' | 'durationSec' | 'tss' | 'plannedWorkoutId'> & {
    type?: string | null
  })[]
  availability: TrainingAvailability[]
  timezone: string
  today: string
  anchorWorkoutIds: string[]
}) {
  const { week, workouts, completed, availability, timezone, today, anchorWorkoutIds } = params
  const tomorrow = parseCalendarDate(today)!
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const boundary = formatDateUTC(tomorrow)
  const end = formatDateUTC(week.endDate)
  const start = formatDateUTC(week.startDate)
  const completedPlanIds = new Set(completed.map((w) => w.plannedWorkoutId).filter(Boolean))
  const replaceable = workouts.filter(
    (w) =>
      !completedPlanIds.has(w.id) &&
      isReplaceableWorkout(w, week.id, boundary, end, anchorWorkoutIds)
  )
  const replaceableIds = new Set(replaceable.map((w) => w.id))
  const preserved = workouts.filter((w) => !replaceableIds.has(w.id))
  // Actual completed dose takes precedence over its planned estimate; count it once.
  const committed = preserved.filter((w) => {
    const day = formatDateUTC(w.date)
    return day >= start && day <= end && !completedPlanIds.has(w.id)
  })
  const committedMinutes =
    committed.reduce((sum, w) => sum + (w.durationSec || 0) / 60, 0) +
    completed.reduce((sum, w) => sum + w.durationSec / 60, 0)
  const committedTSS =
    committed.reduce((sum, w) => sum + (w.tss || 0), 0) +
    completed.reduce((sum, w) => sum + (w.tss || 0), 0)
  const protectedDays = new Set([
    ...preserved.map((w) => formatDateUTC(w.date)),
    ...completed.map((w) => formatUserDate(w.date, timezone))
  ])
  const eligibleDays = calendarDays(boundary, end).filter((day) => !protectedDays.has(day))
  const remainingSportVolumeTargets = readSportVolumeTargets(week.sportVolumeTargets)
  if (remainingSportVolumeTargets) {
    for (const session of [...committed, ...completed]) {
      const sport = classifySportFamily(session.type)
      remainingSportVolumeTargets[sport] = Math.max(
        0,
        (remainingSportVolumeTargets[sport] || 0) - (session.durationSec || 0) / 60
      )
    }
  }
  return {
    remainingSportVolumeTargets,
    boundary,
    end,
    eligibleDays,
    replaceable,
    preserved,
    remainingVolumeMinutes: Math.max(0, week.volumeTargetMinutes - committedMinutes),
    remainingTSS: Math.max(0, week.tssTarget - committedTSS),
    committedMinutes,
    committedTSS,
    availability
  }
}

const daySchema = z.object({
  date: z.string().refine((value) => parseCalendarDate(value) !== null, 'Invalid calendar day'),
  workoutType: z.enum(['Ride', 'Run', 'Gym', 'Swim', 'Rest']),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(12000),
  reasoningText: z.string().max(4000),
  durationMinutes: z.number().finite().min(0).max(1440),
  targetTSS: z.number().finite().min(0).max(2000).optional(),
  distanceMeters: z.number().finite().positive().optional(),
  targetArea: z.string().optional(),
  timeOfDay: z.enum(['morning', 'afternoon', 'evening']).optional(),
  intensity: z.enum(['recovery', 'easy', 'moderate', 'hard', 'very_hard']).optional()
})
const proposalSchema = z.object({
  weekSummary: z.string().min(1),
  days: z.array(daySchema).min(1).max(28)
})

export function validateRecalculationProposal(
  value: unknown,
  context: ReturnType<typeof buildRecalculationContext>
) {
  const proposal = proposalSchema.parse(value)
  const covered = new Set<string>()
  let minutes = 0
  let tss = 0
  const remainingSports = context.remainingSportVolumeTargets
    ? { ...context.remainingSportVolumeTargets }
    : null
  for (const day of proposal.days) {
    if (!context.eligibleDays.includes(day.date)) {
      throw new Error(`Proposal would overwrite a protected or out-of-range day: ${day.date}`)
    }
    if (covered.has(day.date)) throw new Error(`Duplicate proposal day: ${day.date}`)
    covered.add(day.date)
    if (day.workoutType === 'Rest') {
      if (day.durationMinutes !== 0 || (day.targetTSS || 0) !== 0 || day.distanceMeters) {
        throw new Error('Rest days must have zero training dose')
      }
      continue
    }
    if (day.durationMinutes < 1) throw new Error('Training sessions must have a positive duration')
    if (context.availability.length) {
      const weekday = parseCalendarDate(day.date)!.getUTCDay()
      const available = context.availability.find((a) => a.dayOfWeek === weekday)
      const slots = Array.isArray(available?.slots)
        ? (available.slots as Array<{ duration?: number; activityTypes?: string[] }>)
        : []
      const matchingSlots = slots.filter(
        (s) =>
          !s.activityTypes?.length ||
          s.activityTypes.includes(day.workoutType) ||
          (day.workoutType === 'Gym' && s.activityTypes.includes('WeightTraining'))
      )
      if (
        !available ||
        (!slots.length && !available.morning && !available.afternoon && !available.evening)
      ) {
        throw new Error(`No training availability on ${day.date}`)
      }
      if (
        slots.length &&
        !matchingSlots.some((s) => (Number(s.duration) || 0) >= day.durationMinutes)
      ) {
        throw new Error(`Session exceeds available time on ${day.date}`)
      }
      if (!slots.length && day.timeOfDay && !available[day.timeOfDay]) {
        throw new Error(`Unavailable training window on ${day.date}`)
      }
    }
    if (remainingSports) {
      const sport = classifySportFamily(day.workoutType)
      remainingSports[sport] = (remainingSports[sport] || 0) - day.durationMinutes
      if (remainingSports[sport]! < -0.01)
        throw new Error('Proposal exceeds remaining sport-specific weekly volume')
    }
    minutes += day.durationMinutes
    tss += day.targetTSS || 0
  }
  if (covered.size !== context.eligibleDays.length)
    throw new Error('Proposal must cover every eligible day, including rest days')
  if (minutes > context.remainingVolumeMinutes + 0.01)
    throw new Error('Proposal exceeds remaining weekly volume')
  if (tss > context.remainingTSS + 0.01) throw new Error('Proposal exceeds remaining weekly TSS')
  return proposal
}
