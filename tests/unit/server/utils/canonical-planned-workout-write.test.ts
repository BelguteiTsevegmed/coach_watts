import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../server/utils/db'
import {
  buildCanonicalPlannedWorkoutWriteData,
  buildIntervalsImportPersistenceFields,
  persistIntervalsPlannedWorkoutImport,
  writeCanonicalPlannedWorkoutStructure
} from '../../../../server/utils/canonical-planned-workout-write'
import { createZoneProfileSnapshot } from '../../../../shared/structured-workout-contract'

vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message)
  ;(error as any).statusCode = err.statusCode
  ;(error as any).data = err.data
  return error
})

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([]),
    trainingWeek: { findUnique: vi.fn() },
    trainingAvailability: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findUnique: vi.fn().mockResolvedValue({ timezone: 'UTC' }) },
    workout: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (callback: any) => callback({ ...prisma })),
    plannedWorkout: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    }
  }
}))

vi.mock('../../../../server/utils/planned-workout-structure-sync', () => ({
  computeStructuredWorkoutHash: vi.fn().mockReturnValue('remote-hash'),
  buildStructureEditFields: vi.fn((structure: unknown, source: string) => ({
    structuredWorkout: structure,
    lastStructureEditSource: source,
    structureHash: 'hash',
    modifiedLocally: source !== 'REMOTE_IMPORT',
    syncConflict: false
  }))
}))

describe('canonical planned workout write', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue(null)
  })

  it('builds atomic structure, metrics, hash, and revision fields together', () => {
    const snapshot = createZoneProfileSnapshot({
      thresholdPace: 2.75,
      paceZones: [{ min: 2.2, max: 2.4, name: 'Z2' }]
    })
    const { canonical, data } = buildCanonicalPlannedWorkoutWriteData({
      source: 'MANUAL_EDIT',
      structure: {
        steps: [
          {
            duration: 3600,
            pace: {
              metric: 'pace',
              kind: 'zone',
              zone: 2,
              rangeMps: { min: 2.2, max: 2.4 },
              units: 'm/s'
            }
          }
        ]
      },
      workoutType: 'Run',
      zoneProfileSnapshot: snapshot,
      refs: { ftp: 250, lthr: 170, maxHr: 190, thresholdPace: 2.75 }
    })

    expect(canonical?.schemaVersion).toBe(1)
    expect(data).toMatchObject({
      durationSec: 3600,
      distanceMeters: 8280,
      tss: 70,
      workIntensity: 0.84,
      structureRevision: { increment: 1 },
      syncStatus: 'PENDING'
    })
  })

  it('rejects stale generation revision writes', async () => {
    vi.mocked(prisma.plannedWorkout.updateMany).mockResolvedValue({ count: 0 } as any)
    const result = await writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: 'pw-1',
      source: 'AI_GENERATION',
      structure: { steps: [{ duration: 600, power: { value: 0.7, units: '%' } }] },
      expectedGenerationRevision: 3
    })
    expect(result.stale).toBe(true)
    expect(prisma.plannedWorkout.update).not.toHaveBeenCalled()
  })

  it('upserts Intervals planned workouts by userId and externalId', async () => {
    vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.plannedWorkout.upsert).mockResolvedValue({ id: 'pw-1' } as any)

    await persistIntervalsPlannedWorkoutImport(prisma, {
      userId: 'user-1',
      existingRecord: null,
      normalizedPlanned: {
        userId: 'user-1',
        externalId: 'i123',
        title: 'Endurance',
        date: new Date('2026-07-12')
      },
      sportSettings: {},
      seenAt: new Date('2026-07-12T12:00:00Z')
    })

    expect(prisma.plannedWorkout.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_externalId: { userId: 'user-1', externalId: 'i123' } }
      })
    )
    expect(prisma.plannedWorkout.update).not.toHaveBeenCalled()
  })
})

it('persists final structure duration instead of the coarse planning estimate and clears unresolved distance/TSS', () => {
  const result = buildCanonicalPlannedWorkoutWriteData({
    source: 'AI_GENERATION',
    workoutType: 'Ride',
    structure: {
      steps: [{ type: 'Active', durationSeconds: 2400, power: { value: 180, units: 'w' } }]
    },
    preservePlannedDuration: 1800,
    extra: { durationSec: 9999, tss: 9999 }
  })
  expect(result.data).toMatchObject({
    durationSec: 2400,
    distanceMeters: null,
    tss: null,
    workIntensity: null,
    stimulusSummary: { source: 'planned_structure', durationSeconds: 2400 }
  })
  expect(result.metrics.durationSec).toBe(2400)
})

it('preserves imported reported totals while storing the separate structure estimate', () => {
  const result = buildIntervalsImportPersistenceFields({
    existingRecord: null,
    sportSettings: { ftp: 300 },
    seenAt: new Date(),
    normalizedPlanned: {
      type: 'Ride',
      durationSec: 3600,
      distanceMeters: 20000,
      tss: 85,
      structuredWorkout: { steps: [{ durationSeconds: 1800, power: { value: 150, units: 'w' } }] }
    }
  })
  expect(result).toMatchObject({
    durationSec: 3600,
    distanceMeters: 20000,
    tss: 85,
    stimulusSummary: {
      source: 'planned_structure',
      durationSeconds: 1800,
      tss: { value: 13, source: 'structure_estimate' }
    }
  })
})

it('checks final weekly dose before any structure write', async () => {
  vi.mocked(prisma.plannedWorkout.findUnique).mockResolvedValue({
    id: 'pw',
    userId: 'user',
    type: 'Run',
    date: new Date('2026-10-06'),
    durationSec: 1800,
    tss: 25,
    trainingWeekId: 'week',
    generationRevision: 3
  } as any)
  vi.mocked(prisma.trainingWeek.findUnique).mockResolvedValue({
    startDate: new Date('2026-10-05'),
    endDate: new Date('2026-10-11'),
    volumeTargetMinutes: 30,
    sportVolumeTargets: { run: 30 },
    tssTarget: 40
  } as any)
  vi.mocked(prisma.plannedWorkout.findMany).mockResolvedValue([])
  vi.mocked(prisma.plannedWorkout.updateMany).mockClear()
  await expect(
    writeCanonicalPlannedWorkoutStructure({
      plannedWorkoutId: 'pw',
      source: 'AI_GENERATION',
      expectedGenerationRevision: 3,
      structure: {
        steps: [{ type: 'Active', durationSeconds: 3600, pace: { value: 3, units: 'm/s' } }]
      },
      refs: { ftp: 0, lthr: 0, maxHr: 0, thresholdPace: 4 }
    })
  ).rejects.toMatchObject({ statusCode: 422 })
  expect(prisma.$queryRaw).toHaveBeenCalled()
  expect(prisma.plannedWorkout.updateMany).not.toHaveBeenCalled()
})

vi.mock('../../../../server/utils/training-prescription/service', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ...(await import('../../helpers/prescription-boundary-double')).prescriptionBoundaryDouble
}))
