import { createError } from 'h3'
import type { Prisma } from '@prisma/client'
import { prisma } from '../db'
import { hasRenderableStructure } from '../structured-workout-persistence'
import { lockPrescriptionSchedule, validatePrescriptionWrite } from './service'

/** Hold the same athlete lock through the remote send so no newer prescription can overtake it. */
export async function withPrescriptionPublication<T>(
  userId: string,
  expected: any,
  send: (current: any, tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  if (!expected.id)
    throw createError({
      statusCode: 422,
      message: 'Publication requires a committed planned workout.'
    })
  return prisma.$transaction(
    async (tx) => {
      await lockPrescriptionSchedule(tx, userId)
      const current = await tx.plannedWorkout.findUnique({ where: { id: expected.id, userId } })
      if (!current)
        throw createError({
          statusCode: 409,
          message: 'This workout was removed before publication.'
        })
      if (current.type !== 'Rest' && !hasRenderableStructure(current.structuredWorkout))
        throw createError({
          statusCode: 422,
          message: 'Finish workout structure generation before publication.'
        })
      if (current.type !== 'Rest' && typeof expected.structureRevision !== 'number')
        throw createError({
          statusCode: 409,
          message: 'Publication requires the captured workout structure revision.'
        })
      for (const key of [
        'type',
        'title',
        'description',
        'startTime',
        'durationSec',
        'tss',
        'structureRevision'
      ])
        if (expected[key] !== undefined && expected[key] !== current[key as keyof typeof current])
          throw createError({
            statusCode: 409,
            message: 'This workout changed before publication. Reload and try again.'
          })
      if (expected.date && new Date(expected.date).getTime() !== current.date.getTime())
        throw createError({
          statusCode: 409,
          message: 'This workout moved before publication. Reload and try again.'
        })
      await validatePrescriptionWrite(tx, userId, [current], {
        source: 'publication-send',
        readOnly: true
      })
      return send(current, tx)
    },
    { timeout: 60000 }
  )
}
