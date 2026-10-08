import { prisma } from '../db'
import type { Prisma } from '@prisma/client'
import { publishActivityEvent } from '../activity-realtime'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { retireReplacedPrescriptionExports } from '../training-prescription/replacement-sync'
import {
  hasPrescriptionMutation,
  lockPrescriptionSchedule,
  validatePrescriptionWrite,
  withPrescriptionAssessment
} from '../training-prescription/service'

export const plannedWorkoutRepository = {
  /**
   * Get a single planned workout by ID, ensuring it belongs to the user
   */
  async getById(
    id: string,
    userId: string,
    options: {
      include?: Prisma.PlannedWorkoutInclude
      select?: Prisma.PlannedWorkoutSelect
    } = {}
  ) {
    if (options.select) {
      return prisma.plannedWorkout.findFirst({
        where: { id, userId },
        select: options.select
      })
    }
    return prisma.plannedWorkout.findFirst({
      where: { id, userId },
      include: options.include
    })
  },

  /**
   * Create a new planned workout
   */
  async create(data: Prisma.PlannedWorkoutUncheckedCreateInput) {
    const created = await prisma.$transaction(
      async (tx) => {
        const proposal = { ...data, id: data.id || randomUUID() }
        const assessment = await validatePrescriptionWrite(tx, data.userId, [proposal], {
          source: 'repository-create'
        })
        return tx.plannedWorkout.create({
          data: { ...proposal, rawJson: withPrescriptionAssessment(data.rawJson, assessment.id) }
        })
      },
      { isolationLevel: 'Serializable' }
    )

    await publishActivityEvent(created.userId, {
      scope: 'calendar',
      entityType: 'planned_workout',
      entityId: created.id,
      reason: 'created'
    })

    return created
  },

  /**
   * Update a planned workout
   * Enforces userId check if provided
   */
  async update(id: string, userId: string, data: Prisma.PlannedWorkoutUpdateInput) {
    const updated = await prisma.$transaction(
      async (tx) => {
        await lockPrescriptionSchedule(tx, userId)
        if (!hasPrescriptionMutation(data as Record<string, unknown>))
          return tx.plannedWorkout.update({ where: { id, userId }, data })
        const existing = await tx.plannedWorkout.findUniqueOrThrow({ where: { id, userId } })
        if (
          existing.structuredWorkout &&
          !data.structuredWorkout &&
          ['durationSec', 'tss', 'workIntensity', 'type', 'distanceMeters'].some(
            (key) =>
              (data as Record<string, unknown>)[key] !== undefined &&
              (data as Record<string, unknown>)[key] !== (existing as any)[key]
          )
        )
          throw createError({
            statusCode: 422,
            message:
              'This session has interval structure. Revise its structure together with its dose or sport before applying the change.'
          })
        const fields: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(data)) {
          if (value === undefined) continue
          if (value && typeof value === 'object' && !(value instanceof Date) && 'set' in value)
            fields[key] = value.set
          else fields[key] = value
        }
        for (const key of ['durationSec', 'distanceMeters', 'tss', 'workIntensity'])
          if (fields[key] && typeof fields[key] === 'object')
            throw createError({
              statusCode: 422,
              message: 'Prescription dose edits must provide absolute values.'
            })
        const proposal = { ...existing, ...fields }
        const assessment = await validatePrescriptionWrite(tx, userId, [proposal], {
          source: 'repository-update'
        })
        return tx.plannedWorkout.update({
          where: { id, userId },
          data: {
            ...data,
            rawJson: withPrescriptionAssessment(data.rawJson ?? existing.rawJson, assessment.id)
          }
        })
      },
      { isolationLevel: 'Serializable' }
    )

    await publishActivityEvent(userId, {
      scope: 'calendar',
      entityType: 'planned_workout',
      entityId: updated.id,
      reason: 'updated'
    })

    return updated
  },

  /**
   * Delete a planned workout
   */
  async delete(id: string, userId: string) {
    const deleted = await prisma.$transaction(async (tx) => {
      await lockPrescriptionSchedule(tx, userId)
      const current = await tx.plannedWorkout.findUniqueOrThrow({ where: { id, userId } })
      await retireReplacedPrescriptionExports(tx, userId, [current])
      return tx.plannedWorkout.delete({ where: { id, userId } })
    })

    await publishActivityEvent(userId, {
      scope: 'calendar',
      entityType: 'planned_workout',
      entityId: deleted.id,
      reason: 'deleted'
    })

    return deleted
  },

  /**
   * List planned workouts with filters
   */
  async list(
    userId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit?: number
      independentOnly?: boolean
      orderBy?:
        | Prisma.PlannedWorkoutOrderByWithRelationInput
        | Prisma.PlannedWorkoutOrderByWithRelationInput[]
      include?: Prisma.PlannedWorkoutInclude
      where?: Prisma.PlannedWorkoutWhereInput
    } = {}
  ) {
    const where: Prisma.PlannedWorkoutWhereInput = {
      userId,
      date: {
        gte: options.startDate
      },
      ...options.where
    }

    if (options.endDate) {
      if (where.date && typeof where.date === 'object') {
        ;(where.date as any).lte = options.endDate
      } else {
        where.date = { lte: options.endDate }
      }
    }

    if (options.independentOnly) {
      where.trainingWeekId = null
    }

    return prisma.plannedWorkout.findMany({
      where,
      orderBy: options.orderBy || [{ date: 'asc' }, { startTime: 'asc' }],
      take: options.limit,
      include: options.include
    })
  }
}
