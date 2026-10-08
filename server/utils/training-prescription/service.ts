import type { Prisma } from '@prisma/client'
import { createError } from 'h3'
import { fromZonedTime } from 'date-fns-tz'
import { randomUUID } from 'node:crypto'
import { prisma } from '../db'
import { formatDateUTC, formatUserDate } from '../date'
import { summarizePlannedStimulus } from '../training-stimulus'
import { readSportVolumeTargets } from '../plans/progression-policy'
import {
  assessTrainingPrescription,
  isProtectedPrescriptionSession,
  type PrescriptionSession,
  type PrescriptionSnapshot
} from './assessment'

type Client = Prisma.TransactionClient
export function prescriptionSession(
  workout: any,
  timezone = 'UTC',
  completed = false
): PrescriptionSession {
  const summary =
    workout.stimulusSummary ||
    (workout.structuredWorkout ? summarizePlannedStimulus(workout) : null)
  const day =
    typeof workout.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(workout.date)
      ? workout.date
      : completed
        ? formatUserDate(new Date(workout.date), timezone)
        : formatDateUTC(new Date(workout.date))
  const metadata = workout.rawJson && typeof workout.rawJson === 'object' ? workout.rawJson : {}
  return {
    id: workout.id,
    plannedWorkoutId: workout.plannedWorkoutId,
    date: day,
    type: workout.type || null,
    title: workout.title || null,
    durationSec: workout.durationSec ?? null,
    distanceMeters: workout.distanceMeters ?? null,
    tss: workout.tss ?? null,
    hard:
      summary?.hardSession ??
      (typeof (completed ? workout.intensity : workout.workIntensity) === 'number'
        ? (completed ? workout.intensity : workout.workIntensity) >= 0.85
        : null),
    protected: !!(workout.completed || metadata.locked || metadata.isAnchor)
  }
}
export async function lockPrescriptionSchedule(tx: Client, userId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))::text`
}
export async function loadPrescriptionSnapshot(
  tx: Client,
  userId: string,
  proposals: any[],
  now = new Date()
): Promise<PrescriptionSnapshot> {
  const user = await tx.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true }
  })
  const timezone = user.timezone || 'UTC'
  const today = formatUserDate(now, timezone)
  const days = proposals.map((p) => prescriptionSession(p, timezone).date).sort()
  const earliest = new Date(`${days[0] || today}T00:00:00Z`)
  earliest.setUTCDate(earliest.getUTCDate() - 35)
  const historyStart = new Date(`${today}T00:00:00Z`)
  historyStart.setUTCDate(historyStart.getUTCDate() - 60)
  const from = earliest < historyStart ? earliest : historyStart
  const through = new Date(`${days.at(-1) || today}T00:00:00Z`)
  through.setUTCDate(through.getUTCDate() + 8)
  const actualEnd = new Date(now.getTime() + 1)
  const [planned, completed, availability, injuries, weeks] = await Promise.all([
    tx.plannedWorkout.findMany({
      where: {
        userId,
        date: { gte: from, lte: through },
        trainingWeek: { is: { block: { plan: { isTemplate: false } } } }
      }
    }),
    tx.workout.findMany({
      where: {
        userId,
        isDuplicate: false,
        date: { gte: fromZonedTime(`${formatDateUTC(from)}T00:00:00`, timezone), lt: actualEnd }
      },
      select: {
        id: true,
        date: true,
        type: true,
        title: true,
        durationSec: true,
        distanceMeters: true,
        tss: true,
        intensity: true,
        plannedWorkoutId: true
      }
    }),
    tx.trainingAvailability.findMany({ where: { userId } }),
    tx.injury.findMany({ where: { userId, status: { in: ['ACTIVE', 'RECOVERING'] } } }),
    tx.trainingWeek.findMany({
      where: {
        startDate: { lte: through },
        endDate: { gte: from },
        block: { plan: { userId, isTemplate: false } }
      }
    })
  ])
  // Unlinked standalone and provider sessions share the same schedule/budgets.
  const independent = await tx.plannedWorkout.findMany({
    where: { userId, trainingWeekId: null, date: { gte: from, lte: through } }
  })
  return {
    capturedAt: now.toISOString(),
    today,
    timezone,
    planned: [...planned, ...independent]
      .filter((w) => w.completionStatus !== 'SKIPPED')
      .map((w) => prescriptionSession(w, timezone)),
    completed: completed.map((w) => prescriptionSession(w, timezone, true)),
    availability,
    injuries,
    weeks: weeks.map((w) => ({
      start: formatDateUTC(w.startDate),
      end: formatDateUTC(w.endDate),
      volumeMinutes: w.volumeTargetMinutes,
      sportMinutes: readSportVolumeTargets(w.sportVolumeTargets),
      tss: w.tssTarget
    }))
  }
}
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
/** Call within the transaction owning the schedule write, before deleting/replacing anything. */
export async function validatePrescriptionWrite(
  tx: Client,
  userId: string,
  proposals: any[],
  options: {
    source: string
    replaceIds?: string[]
    imported?: boolean
    allowUserReplacement?: boolean
    readOnly?: boolean
    snapshot?: PrescriptionSnapshot
  }
) {
  await lockPrescriptionSchedule(tx, userId)
  const snapshot = options.snapshot || (await loadPrescriptionSnapshot(tx, userId, proposals))
  // Replacement paths cannot erase athlete/external anchors or completed sessions.
  for (const id of options.replaceIds || []) {
    const existing = await tx.plannedWorkout.findUnique({ where: { id, userId } })
    if (
      existing &&
      (snapshot.completed.some((w) => w.plannedWorkoutId === id) ||
        isProtectedPrescriptionSession(
          options.allowUserReplacement ? { ...existing, managedBy: 'COACH_WATTS' } : existing
        ))
    )
      throw createError({
        statusCode: 409,
        message:
          'The replacement includes a protected session. Reload the schedule before trying again.'
      })
  }
  const sessions = proposals.map((p) => prescriptionSession(p, snapshot.timezone))
  const assessment = assessTrainingPrescription(snapshot, sessions, options)
  const id = randomUUID()
  const data = {
    id,
    userId,
    source: options.source,
    ruleVersion: assessment.version,
    outcome: assessment.outcome,
    sessionIds: sessions.map((s) => s.id).filter((id): id is string => !!id),
    snapshot: json(snapshot),
    result: json(assessment)
  }
  // Rejections need an independent durable receipt: the owning write transaction rolls back.
  await (assessment.accepted ? tx : prisma).trainingPrescriptionAssessment.create({ data })
  if (!assessment.accepted)
    throw createError({
      statusCode: 422,
      message:
        assessment.violations.find((v) => v.severity === 'block')?.message ||
        'Training proposal rejected.',
      data: { assessmentId: id, ...assessment }
    })
  return { id, ...assessment }
}
export const prescriptionMutationKeys = [
  'date',
  'type',
  'durationSec',
  'distanceMeters',
  'tss',
  'workIntensity',
  'structuredWorkout',
  'stimulusSummary'
]
export function hasPrescriptionMutation(data: Record<string, unknown>) {
  return prescriptionMutationKeys.some((key) => data[key] !== undefined)
}
export function withPrescriptionAssessment(rawJson: unknown, assessmentId: string) {
  return {
    ...(rawJson && typeof rawJson === 'object' && !Array.isArray(rawJson) ? rawJson : {}),
    prescriptionAssessmentId: assessmentId
  }
}
