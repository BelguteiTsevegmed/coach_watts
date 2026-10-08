import type { Prisma } from '@prisma/client'
import { isIntervalsEventId } from '../intervals'
export async function retireReplacedPrescriptionExports(
  tx: Prisma.TransactionClient,
  userId: string,
  workouts: Array<{ id: string; externalId: string; date: Date }>
) {
  const ids = workouts.map((w) => w.id)
  if (!ids.length) return
  await tx.syncQueue.updateMany({
    where: {
      userId,
      entityType: 'planned_workout',
      entityId: { in: ids },
      status: 'PENDING',
      operation: { in: ['CREATE', 'UPDATE'] }
    },
    data: { status: 'SUPERSEDED', completedAt: new Date() }
  })
  const remote = workouts.filter((w) => isIntervalsEventId(w.externalId))
  if (remote.length)
    await tx.syncQueue.createMany({
      data: remote.map((w) => ({
        userId,
        entityType: 'planned_workout',
        entityId: w.id,
        operation: 'DELETE',
        status: 'PENDING',
        payload: { id: w.id, externalId: w.externalId, date: w.date.toISOString() }
      }))
    })
}
