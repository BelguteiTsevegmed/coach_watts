import { randomUUID } from 'node:crypto'
import { planAdaptationSchema } from '../../utils/plans/week-recalculation'
import { dispatchTask } from '../../utils/task-dispatcher'
import { requireAuth } from '../../utils/auth-guard'
import { trainingPlanRepository } from '../../utils/repositories/trainingPlanRepository'
import { publishTaskRunStartedEvent } from '../../utils/task-run-events'

export default defineEventHandler(async (event) => {
  const authUser = await requireAuth(event, ['plan:write'])

  const parsed = planAdaptationSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      message: 'Invalid request. Only RECALCULATE_WEEK is supported.'
    })
  }
  const { planId, adaptationType, context, anchorWorkoutIds } = parsed.data
  const requestId = parsed.data.requestId || randomUUID()
  const userId = authUser.id

  // Verify ownership
  const plan = await trainingPlanRepository.getById(planId, userId)

  if (!plan) {
    throw createError({ statusCode: 404, message: 'Plan not found' })
  }

  const handle = await dispatchTask(
    'adapt-training-plan',
    {
      userId,
      planId: planId,
      adaptationType,
      requestId,
      context,
      anchorWorkoutIds
    },
    {
      tags: [`user:${userId}`, `plan:${planId}`],
      concurrencyKey: userId,
      idempotencyKey: `adapt_${requestId}`
    }
  )

  await publishTaskRunStartedEvent(userId, 'adapt-training-plan', handle, {
    tags: [`user:${userId}`, `plan:${planId}`]
  })

  return {
    success: true,
    jobId: handle.id,
    requestId
  }
})
