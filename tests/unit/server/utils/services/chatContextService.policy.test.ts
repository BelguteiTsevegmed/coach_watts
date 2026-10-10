import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAthleteContext } from '../../../../../server/utils/services/chatContextService'
import { prisma } from '../../../../../server/utils/db'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    goal: { findMany: vi.fn().mockResolvedValue([]) },
    plannedWorkout: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      groupBy: vi.fn().mockResolvedValue([])
    },
    workout: { groupBy: vi.fn().mockResolvedValue([]) },
    injury: { findMany: vi.fn().mockResolvedValue([]) },
    trainingAvailability: { findMany: vi.fn().mockResolvedValue([]) },
    weeklyTrainingPlan: { findFirst: vi.fn().mockResolvedValue(null) },
    integration: { findUnique: vi.fn().mockResolvedValue(null) },
    calendarNote: { findMany: vi.fn().mockResolvedValue([]) },
    athleteJourneyEvent: { findMany: vi.fn().mockResolvedValue([]) }
  }
}))

vi.mock('../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getByUserId: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/nutritionRepository', () => ({
  nutritionRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/repositories/wellnessRepository', () => ({
  wellnessRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../../../server/utils/training-metrics', () => ({
  generateTrainingContext: vi.fn().mockResolvedValue({}),
  formatTrainingContextForPrompt: vi.fn().mockReturnValue('Training summary')
}))

vi.mock('../../../../../server/utils/services/readinessContextService', () => ({
  buildReadinessContext: vi.fn().mockResolvedValue({
    context: { decision: 'unknown', reasons: [], conflicts: [] },
    prompt: 'RESOLVED PERSONAL READINESS: fixture context'
  })
}))

describe('assembled chat coaching policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([true, false])(
    'uses supplied context before tools with nutrition tracking enabled=%s',
    async (nutritionTrackingEnabled) => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        name: 'Alex',
        timezone: 'UTC',
        aiPersona: 'Supportive',
        nutritionTrackingEnabled
      } as any)

      const { systemInstruction } = await buildAthleteContext('athlete-1')
      const telemetryData = nutritionTrackingEnabled
        ? 'activity, nutrition and wellness'
        : 'activity and wellness'

      expect(systemInstruction).toContain(`Start with the ${telemetryData} data already supplied`)
      expect(systemInstruction).toContain('missing, stale or insufficient for the current decision')
      expect(systemInstruction).not.toContain('**ALWAYS** use your tools to fetch')
      expect(systemInstruction).toContain('Recent data (last 7 days) is ALREADY PROVIDED')
      expect(systemInstruction).toContain('## Independent Coaching Judgment')
      expect(systemInstruction).toContain('agreement is not the measure of good coaching')
      // Editing still requires real tools; minimizing redundant reads must not
      // let the model claim it changed a workout merely by describing a change.
      expect(systemInstruction).toContain('You MUST use tools to make changes to the training plan')
      expect(systemInstruction).toContain('confirm changes only when the tools report success')
    }
  )
})
