import { randomUUID } from 'node:crypto'
import { prisma } from '../db'
import { buildTemplateStructureWriteData } from '../canonical-planned-workout-write'
import { sportSettingsRepository } from '../repositories/sportSettingsRepository'
import { isIntervalsEventId } from '../intervals'
import { publishActivityEvent } from '../activity-realtime'
import { isProtectedPrescriptionSession } from './assessment'
import {
  lockPrescriptionSchedule,
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from './service'

/** Template application is one validated replacement, never a delete/create loop. */
export async function applyPrescriptionTemplate(
  userId: string,
  drafts: any[],
  replaceSince?: Date
) {
  const candidates = await Promise.all(
    drafts.map(async (draft) => {
      const structure = draft.structuredWorkout
        ? buildTemplateStructureWriteData({
            structure: draft.structuredWorkout,
            workoutType: draft.type,
            preservePlannedDuration: draft.durationSec,
            sportSettings: await sportSettingsRepository.getForActivityType(userId, draft.type),
            allowDiagnostics: false
          })
        : null
      return {
        ...draft,
        ...structure?.data,
        id: randomUUID(),
        userId,
        externalId: `template-${randomUUID()}`,
        managedBy: 'USER',
        syncStatus: 'LOCAL_ONLY'
      }
    })
  )
  const result = await prisma.$transaction(
    async (tx) => {
      await lockPrescriptionSchedule(tx, userId)
      const current = replaceSince
        ? await tx.plannedWorkout.findMany({ where: { userId, date: { gte: replaceSince } } })
        : []
      const linkedActuals = await tx.workout.findMany({
        where: { userId, plannedWorkoutId: { in: current.map((w) => w.id) } },
        select: { plannedWorkoutId: true }
      })
      const completedIds = new Set(linkedActuals.map((w) => w.plannedWorkoutId))
      // Explicit replacement may replace an ordinary athlete-owned session, but never a lock or anchor.
      const removable = current.filter(
        (w) =>
          !completedIds.has(w.id) &&
          !isIntervalsEventId(w.externalId) &&
          !isProtectedPrescriptionSession({ ...w, managedBy: 'COACH_WATTS' })
      )
      const replaceIds = removable.map((w) => w.id)
      const assessment = await validatePrescriptionWrite(tx, userId, candidates, {
        source: 'template-application',
        replaceIds,
        allowUserReplacement: true
      })
      if (replaceIds.length) {
        await tx.syncQueue.updateMany({
          where: {
            userId,
            entityId: { in: replaceIds },
            entityType: 'planned_workout',
            status: 'PENDING',
            operation: { in: ['CREATE', 'UPDATE'] }
          },
          data: { status: 'SUPERSEDED', completedAt: new Date() }
        })
        await tx.plannedWorkout.deleteMany({ where: { userId, id: { in: replaceIds } } })
      }
      await tx.plannedWorkout.createMany({
        data: candidates.map((w) => ({
          ...w,
          rawJson: withPrescriptionAssessment(w.rawJson, assessment.id)
        }))
      })
      return { deletedCount: replaceIds.length, createdCount: candidates.length, assessment }
    },
    { isolationLevel: 'Serializable', timeout: 40000 }
  )
  await publishActivityEvent(userId, {
    scope: 'calendar',
    entityType: 'planned_workout',
    reason: 'updated'
  })
  return result
}
