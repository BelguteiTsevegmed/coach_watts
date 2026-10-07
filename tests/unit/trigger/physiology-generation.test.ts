import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runGenerateStructuredWorkout } from '../../../trigger/generate-structured-workout'
import { runAdjustStructuredWorkout } from '../../../trigger/adjust-structured-workout'
import { serializeCanonicalForIntervals } from '../../../server/utils/canonical-workout-serializer'

const io = vi.hoisted(() => ({
  workout: null as any,
  settings: {} as any,
  writes: [] as any[],
  prompts: [] as string[]
}))
vi.mock('../../../trigger/init', () => ({}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
  task: (options: any) => options,
  queue: (options: any) => options
}))
vi.mock('../../../server/utils/task-registry', () => ({ registerTaskHandler: vi.fn() }))
vi.mock('../../../server/utils/db', () => ({
  prisma: {
    workoutTemplate: {
      findUnique: async () => structuredClone(io.workout),
      update: async ({ data }: any) => {
        io.writes.push(data)
        return { ...io.workout, ...data }
      }
    },
    plannedWorkout: {
      findUnique: async () => structuredClone(io.workout),
      update: async ({ data }: any) => {
        io.writes.push(data)
        io.workout = { ...io.workout, ...data }
        return io.workout
      },
      updateMany: async ({ data }: any) => {
        io.writes.push(data)
        io.workout = { ...io.workout, ...data }
        return { count: 1 }
      }
    },
    integration: { findFirst: async () => null }
  }
}))
vi.mock('../../../server/utils/structure-generation-run', () => ({
  supersedeActiveStructureGenerationRuns: vi.fn()
}))
vi.mock('../../../server/utils/structure-generation-run-lifecycle', () => ({
  startStructureGenerationTask: async () => ({ stale: false }),
  finishStructureGenerationTask: vi.fn(),
  failStructureGenerationTaskFromPayload: vi.fn()
}))
vi.mock('../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: async () => io.settings }
}))
vi.mock('../../../server/utils/repositories/workoutRepository', () => ({
  workoutRepository: { getForUser: async () => [] }
}))
vi.mock('../../../server/utils/date', () => ({
  getUserTimezone: async () => 'UTC',
  getUserLocalDate: () => new Date('2026-10-07'),
  calculateAge: () => null
}))
vi.mock('../../../server/utils/activity-realtime', () => ({ publishActivityEvent: vi.fn() }))
vi.mock('../../../server/utils/intervals-sync', () => ({
  syncPlannedWorkoutToIntervals: async () => ({ synced: false })
}))
vi.mock('../../../server/utils/quotas/engine', () => ({ checkQuota: vi.fn() }))
vi.mock('../../../server/utils/gemini', () => ({
  buildConciseWorkoutSummary: () => '',
  generateStructuredAnalysis: async (prompt: string) => {
    io.prompts.push(prompt)
    return {
      coachInstructions: 'Keep the effort controlled.',
      steps: [
        {
          type: 'Active',
          intent: 'endurance',
          name: 'Steady effort',
          durationSeconds: 3600,
          power: { value: 0.8, units: '%' },
          heartRate: { value: 0.8, units: 'LTHR' }
        }
      ]
    }
  }
}))

beforeEach(() => {
  io.writes = []
  io.prompts = []
  io.settings = {}
  io.workout = {
    id: 'template-1',
    userId: 'athlete-1',
    title: 'Endurance',
    type: 'Ride',
    durationSec: 3600,
    user: {},
    structuredWorkout: null,
    syncStatus: 'LOCAL_ONLY',
    externalId: 'ai-gen-1',
    structureRevision: 1
  }
})

describe('physiology across structure generation and adjustment', () => {
  it.each(['generate', 'adjust'])(
    'keeps no-reference %s sessions executable through persistence and export',
    async (operation) => {
      const result =
        operation === 'generate'
          ? await runGenerateStructuredWorkout({
              workoutTemplateId: 'template-1',
              generatorOverride: 'legacy_json',
              quotaCheckedAtEnqueue: true
            })
          : await runAdjustStructuredWorkout({
              workoutTemplateId: 'template-1',
              adjustments: {},
              generatorOverride: 'legacy_json',
              quotaCheckedAtEnqueue: true
            })
      expect(result.success).toBe(true)
      expect(io.prompts[0]).toContain('ftp: unknown')
      const saved = io.writes[0]
      expect(saved.tss).toBeNull()
      expect(saved.workIntensity).toBeNull()
      expect(saved.structuredWorkout.steps[0]).toMatchObject({
        primaryTarget: 'rpe',
        rpe: 4,
        durationSeconds: 3600
      })
      expect(saved.structuredWorkout.steps[0].power).toBeUndefined()
      expect(saved.structuredWorkout.steps[0].heartRate).toBeUndefined()
      expect(
        serializeCanonicalForIntervals({
          title: 'Endurance',
          description: '',
          type: 'Ride',
          structure: saved.structuredWorkout
        })
      ).toContain('RPE 4')
    }
  )

  it.each([
    { type: 'Ride', settings: { ftp: 280 }, metric: 'power', status: 'configured', stress: true },
    { type: 'Run', settings: { lthr: 172 }, metric: 'heartRate', status: 'unknown', stress: true },
    { type: 'Run', settings: {}, metric: 'rpe', status: 'unknown', stress: false },
    {
      type: 'Ride',
      settings: {
        ftp: 280,
        zoneConfiguration: {
          physiologyReferences: {
            ftp: { value: 280, status: 'measured', measuredAt: '2025-01-01' }
          }
        }
      },
      metric: 'rpe',
      status: 'stale',
      stress: false
    },
    {
      type: 'Ride',
      settings: { ftp: 280, referenceConflicts: { ftp: [300] } },
      metric: 'power',
      status: 'conflicting',
      stress: true
    }
  ])(
    'persists and exports a planned $type session with $metric targets ($status FTP)',
    async ({ type, settings, metric, status, stress }) => {
      io.workout.type = type
      io.settings = settings
      const result = await runGenerateStructuredWorkout({
        plannedWorkoutId: 'planned-1',
        generatorOverride: 'legacy_json',
        quotaCheckedAtEnqueue: true,
        generationRevision: 1
      })
      expect(result.success).toBe(true)
      const saved = io.writes[0]
      expect(saved.structuredWorkout.steps[0].primaryTarget).toBe(metric)
      expect(saved.structuredWorkout.physiology.references.ftp.status).toBe(status)
      expect(saved.lastGenerationSettingsSnapshot.physiology.references.ftp.status).toBe(status)
      if (stress) expect(saved.tss).toBeGreaterThan(0)
      else expect(saved.tss).toBeNull()
      const exported = serializeCanonicalForIntervals({
        title: 'Endurance',
        description: '',
        type,
        structure: saved.structuredWorkout,
        workout: saved,
        liveUserFtp: 300
      })
      expect(exported).toContain(stress ? '%' : 'RPE 4')
    }
  )
})
