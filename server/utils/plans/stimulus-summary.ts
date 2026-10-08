import { prisma } from '../db'
import { classifySportFamily } from '../coaching/sport'
import { fromZonedTime } from 'date-fns-tz'
import { formatDateUTC, formatUserDate } from '../date'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import {
  aggregateStimulus,
  summarizeCompletedStimulus,
  summarizePlannedStimulus,
  type TrainingStimulus,
  STIMULUS_VERSION
} from '../training-stimulus'

type Session = {
  id: string
  type: string | null
  durationSec: number | null
  distanceMeters: number | null
  tss: number | null
  structuredWorkout?: unknown
  stimulusSummary?: unknown
}
type Week = { startDate: Date; endDate: Date; workouts: Session[] }

export function summarizeWeekStimulus(
  planned: Session[],
  actual: Array<any>,
  profiles: Map<string, any> = new Map()
) {
  const actualPlanIds = new Set(actual.map((w) => w.plannedWorkoutId).filter(Boolean))
  const read = (w: Session): TrainingStimulus => {
    const saved = w.stimulusSummary as TrainingStimulus | null
    return saved?.version === STIMULUS_VERSION &&
      saved.sport === classifySportFamily(w.type) &&
      saved.durationSeconds === w.durationSec
      ? saved
      : summarizePlannedStimulus(w, profiles.get(w.type || ''))
  }
  const scheduled = planned.map(read)
  const completed = actual.map((w) => summarizeCompletedStimulus(w, profiles.get(w.type || '')))
  const remaining = planned.filter((w) => !actualPlanIds.has(w.id)).map(read)
  return {
    scheduled: aggregateStimulus(scheduled),
    completed: aggregateStimulus(completed),
    combined: aggregateStimulus([...remaining, ...completed])
  }
}

/** Recompute aggregates on read so copies, date moves, imports and completions cannot leave cached weeks stale. */
export async function attachPlanStimulus<T>(plan: T, userId: string, timezone: string) {
  const withWeeks = plan as T & { blocks: Array<{ weeks: Week[] }> }
  const weeks = withWeeks.blocks.flatMap((b) => b.weeks)
  if (!weeks.length) return plan
  const start = weeks.reduce(
    (min, w) => (w.startDate < min ? w.startDate : min),
    weeks[0]!.startDate
  )
  const end = weeks.reduce((max, w) => (w.endDate > max ? w.endDate : max), weeks[0]!.endDate)
  const nextDay = new Date(end)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const actual = await prisma.workout.findMany({
    where: {
      userId,
      isDuplicate: false,
      date: {
        gte: fromZonedTime(`${formatDateUTC(start)}T00:00:00`, timezone),
        lt: fromZonedTime(`${formatDateUTC(nextDay)}T00:00:00`, timezone)
      }
    },
    select: {
      id: true,
      date: true,
      plannedWorkoutId: true,
      type: true,
      durationSec: true,
      distanceMeters: true,
      tss: true,
      rawJson: true,
      exercises: { select: { sets: { select: { reps: true, durationSec: true } } } },
      aiAnalysisJson: true
      // Plan-wide reads use interval evidence; avoid loading months of raw streams.
    }
  })
  const profiles = new Map<string, any>()
  for (const type of new Set(
    [...actual, ...weeks.flatMap((w) => w.workouts)].map((w) => w.type || '')
  ))
    profiles.set(type, await sportSettingsRepository.getForActivityType(userId, type))
  return {
    ...plan,
    blocks: withWeeks.blocks.map((b) => ({
      ...b,
      weeks: b.weeks.map((w) => ({
        ...w,
        stimulus: summarizeWeekStimulus(
          w.workouts,
          actual.filter((a) => {
            const day = formatUserDate(a.date, timezone)
            return day >= formatDateUTC(w.startDate) && day <= formatDateUTC(w.endDate)
          }),
          profiles
        )
      }))
    }))
  }
}
