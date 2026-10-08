import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { fromZonedTime } from 'date-fns-tz'
import { formatDateUTC } from '../date'
import { classifySportFamily } from '../coaching/sport'
import { readSportVolumeTargets } from './progression-policy'

/** Final structure dose must fit the same weekly sport/time budgets as the proposal. */
export function assessStructureDose(input: {
  prior: { type: string | null; durationSec: number | null; tss?: number | null }
  proposed: { type: string | null; durationSec: number; tss?: number | null }
  committed: Array<{ type: string | null; durationSec: number | null; tss?: number | null }>
  volumeTargetMinutes: number
  tssTarget?: number
  sportVolumeTargets: unknown
  availableMinutes?: number | null
}) {
  const violations: string[] = []
  const minutes = (rows: Array<{ durationSec: number | null }>) =>
    rows.reduce((sum, row) => sum + Math.max(0, row.durationSec || 0) / 60, 0)
  const priorTotal = minutes([...input.committed, input.prior])
  const proposedTotal = minutes([...input.committed, input.proposed])
  const sports = readSportVolumeTargets(input.sportVolumeTargets)
  // Retain the existing legacy 10% ceiling; new plans use exact sport budgets.
  const ceiling = input.volumeTargetMinutes * (sports ? 1 : 1.1)
  if (proposedTotal > Math.max(ceiling, priorTotal) + 0.01)
    violations.push('Final structure exceeds the weekly duration budget.')
  if (sports) {
    const sport = classifySportFamily(input.proposed.type)
    const committed = input.committed.filter((w) => classifySportFamily(w.type) === sport)
    const before =
      minutes(committed) +
      (classifySportFamily(input.prior.type) === sport ? minutes([input.prior]) : 0)
    if (minutes([...committed, input.proposed]) > Math.max(sports[sport] || 0, before) + 0.01)
      violations.push(`Final structure exceeds the weekly ${sport} duration budget.`)
  }
  if (
    input.availableMinutes != null &&
    input.proposed.durationSec / 60 >
      Math.max(input.availableMinutes, (input.prior.durationSec || 0) / 60) + 0.01
  )
    violations.push('Final structure exceeds the available session time.')
  const hasTss = (row: { tss?: number | null }) =>
    typeof row.tss === 'number' && Number.isFinite(row.tss) && row.tss >= 0
  const tssKnown = [input.prior, input.proposed, ...input.committed].every(hasTss)
  if (input.tssTarget !== undefined && tssKnown) {
    const committedTss = input.committed.reduce((sum, w) => sum + w.tss!, 0)
    if (
      committedTss + input.proposed.tss! >
      Math.max(input.tssTarget, committedTss + input.prior.tss!) + 0.01
    )
      violations.push('Final structure exceeds the weekly TSS budget.')
  }
  return {
    accepted: violations.length === 0,
    violations,
    tssBudgetAssessed: tssKnown && input.tssTarget !== undefined,
    priorMinutes: priorTotal,
    proposedMinutes: proposedTotal
  }
}

export async function validateFinalStructureDose(
  tx: Prisma.TransactionClient,
  workout: {
    id: string
    userId: string
    type: string | null
    date: Date
    durationSec: number | null
    trainingWeekId: string | null
    tss: number | null
  },
  proposedDurationSec: number,
  proposedType = workout.type,
  proposedTss: number | null = null
) {
  if (!workout.trainingWeekId) return
  // Serialize sibling structure writes so two individually acceptable doses cannot exceed a week.
  await tx.$queryRaw`SELECT id FROM "TrainingWeek" WHERE id = ${workout.trainingWeekId} FOR UPDATE`
  const week = await tx.trainingWeek.findUnique({ where: { id: workout.trainingWeekId } })
  if (!week) return
  const user = await tx.user.findUnique({
    where: { id: workout.userId },
    select: { timezone: true }
  })
  const timezone = user?.timezone || 'UTC'
  const start = formatDateUTC(week.startDate)
  const end = formatDateUTC(week.endDate)
  const next = new Date(`${end}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const [planned, completed, availability] = await Promise.all([
    tx.plannedWorkout.findMany({
      where: { userId: workout.userId, date: { gte: week.startDate, lte: week.endDate } },
      select: { id: true, type: true, durationSec: true, tss: true }
    }),
    tx.workout.findMany({
      where: {
        userId: workout.userId,
        isDuplicate: false,
        date: {
          gte: fromZonedTime(`${start}T00:00:00`, timezone),
          lt: fromZonedTime(`${formatDateUTC(next)}T00:00:00`, timezone)
        }
      },
      select: { type: true, durationSec: true, tss: true, plannedWorkoutId: true }
    }),
    tx.trainingAvailability.findMany({
      where: { userId: workout.userId, dayOfWeek: workout.date.getUTCDay() }
    })
  ])
  const completedIds = new Set(completed.map((w) => w.plannedWorkoutId))
  // Completed exposure replaces its planned dose and unplanned/external activities count once.
  const committed = [
    ...planned.filter((w) => w.id !== workout.id && !completedIds.has(w.id)),
    ...completed
  ]
  // Editing an already completed plan does not change actual completed exposure.
  if (completedIds.has(workout.id)) return
  const slots = availability.flatMap((a) =>
    Array.isArray(a.slots)
      ? (a.slots as Array<{ duration?: number; activityTypes?: string[] }>)
      : []
  )
  const matching = slots.filter(
    (slot) =>
      !slot.activityTypes?.length ||
      slot.activityTypes.some(
        (type) => classifySportFamily(type) === classifySportFamily(proposedType)
      )
  )
  const availableMinutes = slots.length
    ? Math.max(0, ...matching.map((s) => Number(s.duration) || 0))
    : null
  const result = assessStructureDose({
    prior: workout,
    proposed: { type: proposedType, durationSec: proposedDurationSec, tss: proposedTss },
    committed,
    volumeTargetMinutes: week.volumeTargetMinutes,
    tssTarget: week.tssTarget,
    sportVolumeTargets: week.sportVolumeTargets,
    availableMinutes
  })
  if (!result.accepted)
    throw createError({
      statusCode: 422,
      message: result.violations[0],
      data: { version: 'final-structure-dose-v1', ...result }
    })
}
