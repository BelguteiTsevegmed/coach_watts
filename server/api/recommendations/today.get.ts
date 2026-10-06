import { requireAuth } from '../../utils/auth-guard'
import { getUserTimezone, getUserLocalDate } from '../../utils/date'
import { prisma } from '../../utils/db'
import { activityRecommendationRepository } from '../../utils/repositories/activityRecommendationRepository'
import { detectRecommendationPlanDrift } from '../../utils/recommendation-guardrails'

defineRouteMeta({
  openAPI: {
    tags: ['Recommendations'],
    summary: "Get today's recommendation",
    description: 'Returns the daily activity recommendation for the current date.',
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              nullable: true,
              properties: {
                id: { type: 'string' },
                date: { type: 'string', format: 'date-time' },
                recommendation: { type: 'string' },
                confidence: { type: 'number' },
                reasoning: { type: 'string' },
                status: { type: 'string' },
                userAccepted: { type: 'boolean' },
                analysisJson: { type: 'object' },
                plannedWorkout: { type: 'object' },
                planChanged: {
                  type: 'boolean',
                  description:
                    "True when today's planned workout changed after this recommendation was generated; the text may describe a session the athlete no longer sees and should be refreshed."
                },
                planChangeReason: {
                  type: 'string',
                  nullable: true,
                  enum: ['workout_removed', 'workout_changed', 'workout_added']
                }
              }
            }
          }
        }
      },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['recommendation:read'])

  const userId = user.id

  const timezone = await getUserTimezone(userId)
  const today = getUserLocalDate(timezone)

  // Find most recent recommendation for today
  const recommendation = await activityRecommendationRepository.findToday(userId, today)

  if (!recommendation) return null

  const todayWorkouts = await prisma.plannedWorkout.findMany({
    where: { userId, date: today },
    select: {
      id: true,
      title: true,
      type: true,
      durationSec: true,
      tss: true,
      completed: true,
      completedWorkouts: { select: { id: true } }
    }
  })
  const drift = detectRecommendationPlanDrift({
    analysisJson: recommendation.analysisJson,
    userAccepted: recommendation.userAccepted,
    todayWorkouts
  })

  // Find associated LLM usage
  const llmUsage = await prisma.llmUsage.findFirst({
    where: {
      entityId: recommendation.id,
      entityType: 'ActivityRecommendation'
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      feedback: true,
      feedbackText: true
    }
  })

  return {
    ...recommendation,
    planChanged: recommendation.status === 'COMPLETED' ? drift.changed : false,
    planChangeReason: recommendation.status === 'COMPLETED' ? drift.reason : null,
    llmUsageId: llmUsage?.id,
    feedback: llmUsage?.feedback,
    feedbackText: llmUsage?.feedbackText
  }
})
