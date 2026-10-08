import { beforeEach, describe, expect, it, vi } from 'vitest'

const { activityRecommendationUpdate, generateStructuredAnalysis } = vi.hoisted(() => ({
  activityRecommendationUpdate: vi.fn(),
  generateStructuredAnalysis: vi.fn()
}))

vi.mock('../../../trigger/init', () => ({}))

vi.mock('../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    emailPreference: { findUnique: vi.fn() },
    plannedWorkout: { findMany: vi.fn(), groupBy: vi.fn().mockResolvedValue([]) },
    workout: { groupBy: vi.fn() },
    injury: { findMany: vi.fn() },
    report: { findFirst: vi.fn() },
    goal: { findMany: vi.fn() },
    weeklyTrainingPlan: { findFirst: vi.fn() },
    event: { findMany: vi.fn() },
    activityRecommendation: { update: vi.fn() }
  }
}))

vi.mock('../../../server/utils/repositories/activityRecommendationRepository', () => ({
  activityRecommendationRepository: {
    update: activityRecommendationUpdate,
    findById: vi.fn().mockResolvedValue({ id: 'rec-1' })
  }
}))

vi.mock('../../../server/utils/quotas/engine', () => ({
  checkQuota: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../../../server/utils/ai-user-settings', () => ({
  getUserAiSettings: vi.fn().mockResolvedValue({
    aiPersona: 'Supportive',
    aiModelPreference: 'gemini-2.0-flash-exp'
  })
}))

vi.mock('../../../server/utils/date', () => ({
  formatUserDate: vi.fn(() => 'March 10, 2026'),
  getUserLocalDate: vi.fn(() => new Date('2026-03-10T00:00:00.000Z')),
  formatDateUTC: vi.fn(() => '2026-03-10'),
  calculateAge: vi.fn(() => 30),
  getEndOfDayUTC: vi.fn(() => new Date('2026-03-10T23:59:59.999Z')),
  getStartOfDaysAgoUTC: vi.fn(() => new Date('2026-03-04T00:00:00.000Z')),
  getTimestampDateKey: vi.fn(() => '2026-03-10')
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

vi.mock('../../../server/utils/repositories/recommendationRepository', () => ({
  recommendationRepository: { list: vi.fn().mockResolvedValue([]) }
}))

vi.mock('../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getByUserId: vi.fn().mockResolvedValue([]) }
}))

vi.mock('../../../server/utils/repositories/availabilityRepository', () => ({
  availabilityRepository: {
    getForDay: vi.fn().mockResolvedValue(null),
    getFullSchedule: vi.fn().mockResolvedValue([]),
    formatForPrompt: vi.fn(() => '')
  }
}))

vi.mock('../../../server/utils/training-stress', () => ({
  calculateProjectedPMC: vi.fn(() => []),
  getCurrentFitnessSummary: vi.fn().mockResolvedValue({
    ctl: 50,
    atl: 40,
    tsb: 10,
    formStatus: { status: 'Fresh', description: 'Ready' },
    lastUpdated: new Date('2026-03-10T00:00:00.000Z')
  })
}))

vi.mock('../../../server/utils/services/wellness-analysis', () => ({
  analyzeWellness: vi.fn()
}))

vi.mock('../../../server/utils/services/checkin-service', () => ({
  getCheckinHistoryContext: vi.fn().mockResolvedValue('')
}))

vi.mock('../../../server/utils/services/metabolicService', () => ({
  metabolicService: { getMealTargetContext: vi.fn().mockResolvedValue(null) }
}))

vi.mock('../../../server/utils/services/bodyMetricResolver', () => ({
  bodyMetricResolver: {
    resolveEffectiveWeight: vi.fn().mockResolvedValue({ value: 70 })
  }
}))

vi.mock('../../../server/utils/services/wellnessEventService', () => ({
  getWellnessEventOverlaysForUser: vi.fn().mockResolvedValue([]),
  getActiveWellnessEventsForDate: vi.fn(() => []),
  formatWellnessEventsForPrompt: vi.fn(() => '')
}))

vi.mock('../../../server/utils/gemini', () => ({
  generateStructuredAnalysis,
  buildWorkoutSummary: vi.fn(() => '')
}))

vi.mock('@trigger.dev/sdk/v3', async () => {
  const actual = await vi.importActual('@trigger.dev/sdk/v3')
  return {
    ...actual,
    logger: {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    },
    tasks: { trigger: vi.fn(), onFailure: vi.fn() },
    task: vi.fn().mockImplementation((config) => ({
      run: config.run,
      id: config.id
    }))
  }
})

describe('recommendTodayActivityTask — coach brain', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    const { prisma } = await import('../../../server/utils/db')
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      timezone: 'UTC',
      nutritionTrackingEnabled: false,
      aiAutoAnalyzeReadiness: true,
      language: 'English'
    } as any)
    vi.mocked(prisma.emailPreference.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([
      {
        id: 'pw-1',
        title: 'Easy Run + 4 strides',
        type: 'Run',
        durationSec: 2400,
        tss: 33,
        description: 'Conversational pace'
      }
    ] as any)
    vi.mocked(prisma.report.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
    vi.mocked(prisma.weeklyTrainingPlan.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.event.findMany).mockResolvedValue([])
    vi.mocked((prisma as any).workout.groupBy).mockResolvedValue([
      { type: 'Run', _sum: { durationSec: 18 * 3600 } }
    ])
    vi.mocked((prisma as any).injury.findMany).mockResolvedValue([
      {
        id: 'inj-1',
        bodyArea: 'achilles',
        side: 'LEFT',
        title: null,
        description: null,
        painLevel: 5,
        status: 'ACTIVE',
        onsetDate: new Date('2026-03-07T00:00:00.000Z'),
        affectedSports: ['run'],
        notes: null
      }
    ])
    activityRecommendationUpdate.mockResolvedValue({ id: 'rec-1' })
  })

  it('briefs a running coach with the exact plan, injuries and principles', async () => {
    generateStructuredAnalysis.mockResolvedValue({
      recommendation: 'modify',
      confidence: 0.8,
      reasoning: 'Swap the run for an easy spin today.',
      suggested_modifications: {
        new_title: 'Easy spin',
        new_type: 'Ride',
        new_duration_min: 40,
        new_tss: 25,
        description: 'Easy spin'
      }
    })
    const { recommendTodayActivityTask } = await import('../../../trigger/recommend-today-activity')
    await recommendTodayActivityTask.run({
      userId: 'user-1',
      date: new Date('2026-03-10T00:00:00.000Z'),
      recommendationId: 'rec-1'
    })

    const prompt = generateStructuredAnalysis.mock.calls[0]![0] as string
    expect(prompt).toContain('expert running coach')
    expect(prompt).toContain('RESOLVED PERSONAL READINESS: fixture context')
    expect(prompt).not.toContain('cycling coach')
    expect(prompt).toContain('GROUND TRUTH')
    expect(prompt).toMatch(
      /- Title: Easy Run \+ 4 strides\n- Type: Run\n- Duration: 40 min\n- TSS: 33/
    )
    expect(prompt).toContain('NUMBERS MUST MATCH THE PLAN')
    expect(prompt).toContain('INJURY CONFLICT — MUST ACT')
    expect(prompt).toContain('Left achilles | pain 5/10 | ACTIVE')
    expect(prompt).toContain('## Coaching Principles')
    expect(prompt).toContain('### Running specifics')
    expect(prompt).toContain('coaching-evidence-v1')
    expect(prompt).toContain('Higher scores do not automatically clear')
    expect(prompt).not.toContain('TSB > -10')
    expect(prompt).not.toContain('(High Risk)')

    const schema = generateStructuredAnalysis.mock.calls[0]![1] as any
    expect(schema.properties.suggested_modifications.required).toEqual(
      expect.arrayContaining(['new_type', 'new_duration_min', 'new_tss'])
    )
  })

  it('never saves "proceed" or its reassuring rationale over an injury conflict', async () => {
    generateStructuredAnalysis.mockResolvedValue({
      recommendation: 'proceed',
      confidence: 0.7,
      reasoning: 'You are fresh, so enjoy a 45-minute run (37 TSS).'
    })
    const { recommendTodayActivityTask } = await import('../../../trigger/recommend-today-activity')
    await recommendTodayActivityTask.run({
      userId: 'user-1',
      date: new Date('2026-03-10T00:00:00.000Z'),
      recommendationId: 'rec-1'
    })

    const saved = activityRecommendationUpdate.mock.calls.find(
      (call) => call[2]?.status === 'COMPLETED'
    )![2]
    expect(saved.recommendation).toBe('modify')
    expect(saved.reasoning).toBe(
      "Your left achilles is logged at 5/10, so don't do this session as planned: swap it for cross-training that doesn't load it, or rest. Low pain alone does not clear a return; follow symptoms and any clinician restrictions, and seek assessment for red flags."
    )
    expect(saved.analysisJson.planned_workout).toEqual({
      original_title: 'Easy Run + 4 strides',
      original_tss: 33,
      original_duration_min: 40
    })
    expect(saved.analysisJson.rationale_check).toBeUndefined()
    expect(saved.analysisJson.injury_guard.overridden).toBe('proceed')
  })
})

vi.mock('../../../server/utils/services/readinessContextService', () => ({
  buildReadinessContext: vi.fn().mockResolvedValue({
    context: {
      version: 'readiness-v1',
      asOf: '2026-03-10',
      decision: 'unknown',
      reasons: [],
      conflicts: []
    },
    prompt: 'RESOLVED PERSONAL READINESS: fixture context'
  })
}))
