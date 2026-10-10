import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../../../server/utils/db'
import { writeCanonicalPlannedWorkoutStructure } from '../../../../server/utils/canonical-planned-workout-write'

vi.mock('../../../../server/utils/training-prescription/service', () => ({
  lockPrescriptionSchedule: async () => {},
  validatePrescriptionWrite: async () => ({ id: 'assessment' }),
  withPrescriptionAssessment: (raw: unknown) => raw
}))

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
    trainingWeek: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    workout: { findMany: vi.fn() },
    trainingAvailability: { findMany: vi.fn() },
    plannedWorkout: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn()
    }
  }
}))

// Regression: ISSUE-001 — parallel first-week generation surfaced TransactionWriteConflict.
// Found by /qa on 2026-10-10.
// Report: .gstack/qa-reports/qa-report-localhost-2026-10-10.md
describe('serializable structure persistence retries', () => {
  const options = {
    plannedWorkoutId: 'doctor-run',
    source: 'AI_GENERATION' as const,
    expectedGenerationRevision: 1,
    structure: { steps: [{ type: 'Active', durationSeconds: 1500, rpe: 3 }] }
  }
  const persist = (callback: any) => callback(prisma)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({
      id: 'doctor-run',
      type: 'Run',
      generationRevision: 1,
      durationSec: 1500,
      trainingWeekId: null
    } as any)
    vi.mocked(prisma.plannedWorkout.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.$transaction).mockImplementation(persist)
  })

  it.each([
    { code: 'P2034' },
    { name: 'DriverAdapterError', cause: { kind: 'TransactionWriteConflict' } }
  ])('retries a rolled-back conflict with a fresh serializable transaction: %j', async (error) => {
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      await callback(prisma)
      throw error // PostgreSQL can abort on COMMIT after the update ran.
    })
    const result = await writeCanonicalPlannedWorkoutStructure(options)
    expect(result.stale).toBe(false)
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable'
    })
    expect(prisma.plannedWorkout.findUnique).toHaveBeenCalledTimes(4)
    expect(prisma.plannedWorkout.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'doctor-run', generationRevision: 1 },
        data: expect.objectContaining({ durationSec: 1500 })
      })
    )
  })

  it('does not overwrite a newer edit discovered after a conflict', async () => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce({ code: 'P2034' })
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({ generationRevision: 2 } as any)
    expect((await writeCanonicalPlannedWorkoutStructure(options)).stale).toBe(true)
    expect(prisma.plannedWorkout.updateMany).not.toHaveBeenCalled()
  })

  it('rechecks the weekly budget after a sibling commits during the aborted transaction', async () => {
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({
      id: 'doctor-run',
      userId: 'doctor',
      type: 'Run',
      generationRevision: 1,
      durationSec: 1200,
      trainingWeekId: 'week',
      date: new Date('2026-10-13')
    } as any)
    vi.mocked(prisma.$queryRaw).mockResolvedValue([])
    vi.mocked(prisma.trainingWeek.findUnique).mockResolvedValue({
      startDate: new Date('2026-10-12'),
      endDate: new Date('2026-10-18'),
      volumeTargetMinutes: 30,
      sportVolumeTargets: { run: 30 },
      tssTarget: 40
    } as any)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'Europe/Warsaw' } as any)
    vi.mocked(prisma.workout.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
    vi.mocked(prisma.plannedWorkout.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'sibling', type: 'Run', durationSec: 600 }] as any)
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      await callback(prisma)
      throw { code: 'P2034' }
    })
    await expect(writeCanonicalPlannedWorkoutStructure(options)).rejects.toMatchObject({
      statusCode: 422
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(prisma.plannedWorkout.findMany).toHaveBeenCalledTimes(2)
    expect(prisma.plannedWorkout.updateMany).toHaveBeenCalledTimes(1)
  })

  it('stops after four conflicts and preserves the original error', async () => {
    const error = { code: 'P2034' }
    vi.mocked(prisma.$transaction).mockRejectedValue(error)
    await expect(writeCanonicalPlannedWorkoutStructure(options)).rejects.toBe(error)
    expect(prisma.$transaction).toHaveBeenCalledTimes(4)
  })

  it.each([{ statusCode: 422 }, { code: 'P2002' }, new Error('Connection closed')])(
    'does not retry validation or unrelated database errors: %j',
    async (error) => {
      vi.mocked(prisma.$transaction).mockRejectedValue(error)
      await expect(writeCanonicalPlannedWorkoutStructure(options)).rejects.toBe(error)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    }
  )

  it('leaves retries of caller-owned transactions to their owner', async () => {
    const error = { code: 'P2034' }
    vi.mocked(prisma.plannedWorkout.updateMany).mockRejectedValue(error)
    await expect(writeCanonicalPlannedWorkoutStructure({ ...options, tx: prisma })).rejects.toBe(
      error
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.plannedWorkout.updateMany).toHaveBeenCalledTimes(1)
  })
})
