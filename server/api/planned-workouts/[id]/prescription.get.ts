import { requireAuth } from '../../../utils/auth-guard'
import { prisma } from '../../../utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['workouts:read'])
  const id = getRouterParam(event, 'id')!
  const workout = await prisma.plannedWorkout.findUnique({
    where: { id, userId: user.id },
    select: { rawJson: true }
  })
  if (!workout) throw createError({ statusCode: 404, message: 'Planned workout not found' })
  const receiptId = (workout.rawJson as any)?.prescriptionAssessmentId
  const assessment = await prisma.trainingPrescriptionAssessment.findFirst({
    where: {
      userId: user.id,
      OR: [
        { sessionIds: { has: id } },
        ...(typeof receiptId === 'string' ? [{ id: receiptId }] : [])
      ]
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      source: true,
      ruleVersion: true,
      outcome: true,
      result: true,
      createdAt: true
    }
  })
  return { assessment }
})
