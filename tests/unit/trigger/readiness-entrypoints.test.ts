import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveReadiness, formatReadinessForPrompt } from '../../../shared/readiness'
const { generate, create, build } = vi.hoisted(() => ({
  generate: vi.fn(),
  create: vi.fn(),
  build: vi.fn()
}))
vi.mock('../../../trigger/init', () => ({}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: (config: any) => config,
  queue: (config: any) => config,
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue({ aiPersona: 'Supportive', timezone: 'UTC' }) },
    report: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'report' })
    },
    goal: { findMany: vi.fn().mockResolvedValue([]) },
    emailPreference: { findUnique: vi.fn().mockResolvedValue(null) }
  }
}))
vi.mock('../../../server/utils/services/readinessContextService', () => ({
  buildReadinessContext: build
}))
vi.mock('../../../server/utils/gemini', () => ({
  generateStructuredAnalysis: generate,
  buildWorkoutSummary: vi.fn(() => '')
}))
vi.mock('../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: vi.fn().mockResolvedValue([]) }
}))
vi.mock('../../../server/utils/repositories/wellnessRepository', () => ({
  wellnessRepository: {
    getByDate: vi.fn().mockResolvedValue(null),
    getForUser: vi.fn().mockResolvedValue([])
  }
}))
vi.mock('../../../server/utils/repositories/plannedWorkoutRepository', () => ({
  plannedWorkoutRepository: { create }
}))
vi.mock('../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: vi.fn().mockResolvedValue(null) }
}))
vi.mock('../../../server/utils/coaching/sport', async (original) => ({
  ...((await original()) as any),
  getAthletePrimarySport: vi.fn().mockResolvedValue('running')
}))
vi.mock('../../../server/utils/coaching/injury-context', async (original) => ({
  ...((await original()) as any),
  fetchOpenInjuries: vi.fn().mockResolvedValue([])
}))
vi.mock('../../../server/utils/ai-user-settings', () => ({
  getUserAiSettings: vi
    .fn()
    .mockResolvedValue({ aiPersona: 'Supportive', aiModelPreference: 'flash' })
}))
vi.mock('../../../server/utils/training-stress', () => ({
  getCurrentFitnessSummary: vi.fn().mockResolvedValue({ ctl: 20, atl: 30 })
}))
vi.mock('../../../server/utils/training-metrics', () => ({
  generateTrainingContext: vi.fn().mockResolvedValue({}),
  formatTrainingContextForPrompt: vi.fn(() => '')
}))
vi.mock('../../../server/utils/intervals-sync', () => ({
  autoUploadPlannedWorkoutToIntervalsIfEnabled: vi.fn()
}))
vi.mock('../../../server/utils/planned-workout-structure-trigger', () => ({
  enqueuePlannedWorkoutStructureGeneration: vi.fn().mockResolvedValue({ status: 'queued' })
}))

describe('daily and ad-hoc readiness context consumers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.setSystemTime(new Date('2026-10-08T12:00:00Z'))
    const context = resolveReadiness({
      asOf: '2026-10-08',
      wellness: [{ id: 'w', date: '2026-10-08', tags: 'Sick' }]
    })
    build.mockResolvedValue({ context, prompt: formatReadinessForPrompt(context) })
  })
  it('saves daily advice and reasoning without writing a workout', async () => {
    generate.mockResolvedValue({ action: 'proceed', reason: 'Good score', confidence: 0.8 })
    const { dailyCoachTask } = await import('../../../trigger/daily-coach')
    const result = await dailyCoachTask.run({ userId: 'user' })
    expect(generate.mock.calls[0]![0]).toContain('RESOLVED PERSONAL READINESS')
    expect(result.suggestion.action).toBe('rest')
    expect(result.suggestion.reason).toContain('Illness is explicitly recorded')
    expect(result.suggestion.application_status).toBe('advice_only')
    expect(create).not.toHaveBeenCalled()
    expect(build).toHaveBeenCalledWith('user', new Date('2026-10-08'), 'UTC')
  })
  it('gives ad-hoc planning today’s context even for a future requested session', async () => {
    generate.mockResolvedValue({
      title: 'Rest',
      description: 'Rest',
      type: 'Rest',
      durationMinutes: 0,
      targetTss: 0,
      intensity: 'Recovery',
      objective: 'Recovery',
      reasoningText: 'Illness'
    })
    create.mockResolvedValue({ id: 'p', type: 'Rest', userId: 'user' })
    const { runGenerateAdHocWorkout } = await import('../../../trigger/generate-ad-hoc-workout')
    await runGenerateAdHocWorkout({ userId: 'user', date: '2026-10-10T12:00:00Z' })
    const prompt = generate.mock.calls[0]![0]
    expect(prompt).toContain('RESOLVED PERSONAL READINESS')
    expect(prompt).not.toContain('<33%')
    expect(build).toHaveBeenCalledWith('user', new Date('2026-10-08'), 'UTC')
    expect(create.mock.calls[0]![0].rawJson.readinessContext.decision).toBe('rest')
  })
})
