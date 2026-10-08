import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compileWorkoutFamily } from '../../../shared/workout-families'
import { runGenerateStructuredWorkout } from '../../../trigger/generate-structured-workout'
import { runAdjustStructuredWorkout } from '../../../trigger/adjust-structured-workout'
import { publishActivityEvent } from '../../../server/utils/activity-realtime'
import { generateStructuredAnalysis } from '../../../server/utils/gemini'
import { generateWorkoutFamily } from '../../../server/utils/workout-family-generation'
import { writeCanonicalPlannedWorkoutStructure } from '../../../server/utils/canonical-planned-workout-write'
const state = vi.hoisted(() => ({ workout: {} as any, stale: false }))
vi.mock('../../../trigger/init', () => ({}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: (input: unknown) => input,
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../../trigger/queues', () => ({ userReportsQueue: {} }))
vi.mock('../../../server/utils/task-registry', () => ({ registerTaskHandler: vi.fn() }))
vi.mock('../../../server/utils/db', () => ({
  prisma: {
    plannedWorkout: { findUnique: vi.fn(async () => state.workout) },
    integration: { findFirst: vi.fn(async () => null) }
  }
}))
vi.mock('../../../server/utils/gemini', () => ({
  generateStructuredAnalysis: vi.fn(),
  buildConciseWorkoutSummary: () => ''
}))
vi.mock('../../../server/utils/quotas/engine', () => ({ checkQuota: vi.fn() }))
vi.mock('../../../server/utils/intervals-sync', () => ({ syncPlannedWorkoutToIntervals: vi.fn() }))
vi.mock('../../../server/utils/activity-realtime', () => ({ publishActivityEvent: vi.fn() }))
vi.mock('../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: vi.fn(async () => []) }
}))
vi.mock('../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getForActivityType: vi.fn(async () => ({
      thresholdPace: 3.6,
      warmupTime: 10,
      cooldownTime: 5,
      targetPolicy: { primaryMetric: 'pace' }
    }))
  }
}))
vi.mock('../../../server/utils/structure-generation-run-lifecycle', () => ({
  startStructureGenerationTask: vi.fn(async () => ({ stale: false })),
  finishStructureGenerationTask: vi.fn(),
  failStructureGenerationTaskFromPayload: vi.fn()
}))
vi.mock('../../../server/utils/date', async (original) => ({
  ...(await original<typeof import('../../../server/utils/date')>()),
  getUserTimezone: vi.fn(async () => 'UTC'),
  getUserLocalDate: () => new Date('2026-10-08')
}))
vi.mock('../../../server/utils/workout-family-generation', async (original) => ({
  ...(await original<typeof import('../../../server/utils/workout-family-generation')>()),
  generateWorkoutFamily: vi.fn(async (input: any) => {
    const compilation = compileWorkoutFamily({
      selection: { family: 'threshold', doseStep: 0 },
      sport: 'run',
      durationSeconds: input.adjustments?.durationMinutes
        ? input.adjustments.durationMinutes * 60
        : input.workout.durationSec,
      eligibility: {
        recentSessionCount: 8,
        longestSessionSeconds: 3600,
        hasSportRestriction: false,
        maxDoseStep: {}
      },
      references: { ftp: null, thresholdPaceMps: 3.6, source: 'sport_settings', metric: 'pace' }
    })
    return { ...compilation, context: compilation.provenance }
  })
}))
vi.mock('../../../server/utils/canonical-planned-workout-write', async (original) => {
  const actual =
    await original<typeof import('../../../server/utils/canonical-planned-workout-write')>()
  return {
    ...actual,
    writeCanonicalPlannedWorkoutStructure: vi.fn(async (options: any) => {
      const result = actual.buildCanonicalPlannedWorkoutWriteData({
        ...options,
        workoutType: state.workout.type
      })
      if (!state.stale) Object.assign(state.workout, result.data)
      return { ...result, stale: state.stale }
    })
  }
})

describe('family generation and adjustment through the canonical write', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.stale = false
    state.workout = {
      id: 'planned-1',
      userId: 'athlete-1',
      type: 'Run',
      title: '3 × 300s threshold',
      description: 'Controlled work',
      durationSec: 1740,
      date: new Date('2026-10-10'),
      externalId: 'ai-gen-test',
      syncStatus: 'LOCAL_ONLY',
      user: {
        aiPersona: 'Aggressive',
        featureFlags: { structuredWorkout: { generator: 'workout_families_v1' } }
      }
    }
  })
  it('persists the fitted title, description, duration, distance and family provenance together', async () => {
    await expect(
      runGenerateStructuredWorkout({ plannedWorkoutId: 'planned-1', generationRevision: 2 })
    ).resolves.toMatchObject({ success: true })
    expect(generateWorkoutFamily).toHaveBeenCalledOnce()
    expect(generateStructuredAnalysis).not.toHaveBeenCalled()
    expect(state.workout).toMatchObject({ title: 'Threshold run — 2 × 300s', durationSec: 1740 })
    expect(state.workout.lastGenerationContext.family.dose.reps).toBe(2)
    expect(state.workout.structuredWorkout.workoutFamily.dose.reps).toBe(2)
    expect(state.workout.distanceMeters).toBeGreaterThan(0)
    expect(writeCanonicalPlannedWorkoutStructure).toHaveBeenCalledWith(
      expect.objectContaining({ expectedGenerationRevision: 2 })
    )
    expect(publishActivityEvent).toHaveBeenCalledOnce()
  })
  it('recompiles an adjustment into an explicit alternative without stale promises', async () => {
    await runGenerateStructuredWorkout({ plannedWorkoutId: 'planned-1' })
    vi.clearAllMocks()
    await runAdjustStructuredWorkout({
      plannedWorkoutId: 'planned-1',
      adjustments: { durationMinutes: 25 }
    })
    expect(state.workout.title).toBe('Easy run — 25 min')
    expect(state.workout.description).not.toContain('3 ×')
    expect(state.workout.durationSec).toBe(1500)
    expect(state.workout.structuredWorkout.workoutFamily.accepted.family).toBe('easy')
    expect(generateStructuredAnalysis).not.toHaveBeenCalled()
  })
  it('publishes nothing when the canonical generation revision is stale', async () => {
    state.stale = true
    await expect(
      runGenerateStructuredWorkout({ plannedWorkoutId: 'planned-1', generationRevision: 1 })
    ).resolves.toMatchObject({ stale: true })
    expect(state.workout.title).toBe('3 × 300s threshold')
    expect(publishActivityEvent).not.toHaveBeenCalled()
  })
})
