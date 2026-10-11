import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../../../../server/utils/db'
import { getServerSession } from '../../../../../../server/utils/session'
import { sportSettingsRepository } from '../../../../../../server/utils/repositories/sportSettingsRepository'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.params[key])
vi.mock('../../../../../../server/utils/session', () => ({ getServerSession: vi.fn() }))
vi.mock('../../../../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    plannedWorkout: { findUnique: vi.fn() },
    llmUsage: { findFirst: vi.fn() },
    workoutStructureGenerationRun: { findFirst: vi.fn() }
  }
}))
vi.mock('../../../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: { getForActivityType: vi.fn() }
}))
vi.mock('../../../../../../server/utils/structure-generation-run', () => ({
  hasActiveStructureGenerationRun: async () => false
}))

describe('planned workout effective target policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: 'runner' } } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'runner',
      ftp: null,
      lthr: null
    } as any)
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({
      id: 'run',
      userId: 'runner',
      type: 'Run',
      generationRevision: 1,
      structuredWorkout: null
    } as any)
    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      loadPreference: 'HR_PACE_POWER',
      targetPolicy: { primaryMetric: 'heartRate' },
      lthr: null,
      ftp: null,
      thresholdPace: null
    } as any)
    vi.mocked(prisma.llmUsage.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.workoutStructureGenerationRun.findFirst).mockResolvedValue(null)
  })

  it('exposes the same RPE fallback to preflight that the generation worker uses', async () => {
    const handler = (await import('../../../../../../server/api/workouts/planned/[id].get')).default
    const result = await handler({ params: { id: 'run' } } as any)
    expect(result.generationTargetPolicy).toMatchObject({
      primaryMetric: 'rpe',
      fallbackOrder: ['rpe']
    })
  })

  it('includes real legacy LTHR when selecting the effective policy', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'runner',
      ftp: null,
      lthr: 170
    } as any)
    const handler = (await import('../../../../../../server/api/workouts/planned/[id].get')).default
    const result = await handler({ params: { id: 'run' } } as any)
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ lthr: true })
      })
    )
    expect(result.generationTargetPolicy.primaryMetric).toBe('heartRate')
  })
})
