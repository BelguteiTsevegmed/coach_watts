import { beforeEach, describe, expect, it, vi } from 'vitest'

import { athleteMetricsService } from '../../../../server/utils/athleteMetricsService'

const {
  findUniqueUserMock,
  updateUserMock,
  findUniqueWorkoutMock,
  findManySportSettingsMock,
  updateSportSettingsMock,
  findManyGoalMock,
  updateManyMock
} = vi.hoisted(() => ({
  findUniqueUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  findUniqueWorkoutMock: vi.fn(),
  findManySportSettingsMock: vi.fn(),
  updateSportSettingsMock: vi.fn(),
  findManyGoalMock: vi.fn(),
  updateManyMock: vi.fn()
}))

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    user: {
      findUnique: findUniqueUserMock,
      update: updateUserMock
    },
    workout: {
      findUnique: findUniqueWorkoutMock
    },
    sportSettings: {
      findMany: findManySportSettingsMock,
      update: updateSportSettingsMock
    },
    goal: {
      findMany: findManyGoalMock
    },
    recommendation: {
      updateMany: updateManyMock
    }
  }
}))

vi.mock('../../../../server/utils/repositories/userRepository', () => ({
  userRepository: {
    getById: vi.fn()
  }
}))

vi.mock('../../../../server/utils/repositories/sportSettingsRepository', () => ({
  sportSettingsRepository: {
    getDefault: vi.fn(),
    getForActivityType: vi.fn()
  }
}))

vi.mock('../../../../server/utils/zones', () => ({
  calculatePowerZones: vi.fn(() => [{ name: 'Z1', min: 0, max: 100 }]),
  calculateHrZones: vi.fn(() => [{ name: 'HRZ1', min: 0, max: 120 }]),
  calculatePaceZones: vi.fn(() => [{ name: 'PZ1', min: 0, max: 4 }])
}))

vi.mock('../../../../server/utils/services/metabolicService', () => ({
  metabolicService: {
    calculateFuelingPlanForDate: vi.fn()
  }
}))

vi.mock('../../../../server/utils/date', () => ({
  getUserLocalDate: vi.fn(),
  getUserTimezone: vi.fn()
}))

vi.mock('../../../../server/utils/nutrition/feature', () => ({
  isNutritionTrackingEnabled: vi.fn()
}))

describe('athleteMetricsService.resolveThresholdRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateManyMock.mockResolvedValue({ count: 1 })
    findManyGoalMock.mockResolvedValue([])
  })

  it('resolves workout recommendations for max hr and threshold pace', async () => {
    await athleteMetricsService.resolveThresholdRecommendations('user-1', {
      maxHr: 190,
      thresholdPace: 4.1
    })

    expect(updateManyMock).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        metric: { in: ['MAX_HR', 'THRESHOLD_PACE'] },
        status: 'ACTIVE',
        sourceType: 'workout'
      },
      data: {
        status: 'COMPLETED',
        completedAt: expect.any(Date)
      }
    })
  })

  it('accepts threshold pace in m/s with running evidence provenance', async () => {
    findUniqueUserMock.mockResolvedValue({ id: 'user-1' })
    findUniqueWorkoutMock.mockResolvedValue({ type: 'Run', date: new Date('2026-10-01') })
    findManySportSettingsMock.mockResolvedValue([])
    updateSportSettingsMock.mockResolvedValue({})
    const { sportSettingsRepository } =
      await import('../../../../server/utils/repositories/sportSettingsRepository')
    vi.mocked(sportSettingsRepository.getDefault).mockResolvedValue({ id: 'default' } as any)
    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({ id: 'run' } as any)
    expect(
      await athleteMetricsService.applyThresholdRecommendation({
        userId: 'user-1',
        sourceType: 'workout',
        metric: 'THRESHOLD_PACE',
        history: { newValue: 250, workoutId: 'benchmark-run' }
      })
    ).toBe(true)
    expect(updateSportSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run' },
        data: expect.objectContaining({
          thresholdPace: 4,
          zoneConfiguration: {
            physiologyReferences: {
              thresholdPace: expect.objectContaining({
                value: 4,
                sport: 'run',
                status: 'estimated',
                measuredAt: '2026-10-01T00:00:00.000Z',
                workoutId: 'benchmark-run'
              })
            }
          }
        })
      })
    )
  })

  it('applies completed FTP recommendations to user, default profile, matching sport profile, and goals', async () => {
    findUniqueUserMock.mockResolvedValue({ id: 'user-1', ftp: 150, lthr: 160, maxHr: 180 })
    findUniqueWorkoutMock.mockResolvedValue({ type: 'Ride', date: new Date('2026-10-01') })
    findManySportSettingsMock.mockResolvedValue([])
    updateUserMock.mockResolvedValue({ id: 'user-1', ftp: 166 })
    updateSportSettingsMock.mockResolvedValue({})

    const { sportSettingsRepository } =
      await import('../../../../server/utils/repositories/sportSettingsRepository')
    vi.mocked(sportSettingsRepository.getDefault).mockResolvedValue({
      id: 'default-profile'
    } as any)
    vi.mocked(sportSettingsRepository.getForActivityType).mockResolvedValue({
      id: 'ride-profile'
    } as any)

    const applied = await athleteMetricsService.applyThresholdRecommendation({
      userId: 'user-1',
      sourceType: 'workout',
      metric: 'FTP',
      history: {
        newValue: 166,
        workoutId: 'workout-1'
      }
    })

    expect(applied).toBe(true)
    expect(updateUserMock).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { ftp: 166 }
    })
    expect(updateSportSettingsMock).toHaveBeenCalledWith({
      where: { id: 'default-profile' },
      data: {
        ftp: 166,
        powerZones: [{ name: 'Z1', min: 0, max: 100 }],
        zoneConfiguration: {
          physiologyReferences: {
            ftp: {
              value: 166,
              status: 'estimated',
              source: 'accepted_threshold_detection',
              sport: 'ride',
              measuredAt: '2026-10-01T00:00:00.000Z',
              confidence: 'medium',
              evidenceQualified: true,
              workoutId: 'workout-1'
            }
          }
        }
      }
    })
    expect(updateSportSettingsMock).toHaveBeenCalledWith({
      where: { id: 'ride-profile' },
      data: {
        ftp: 166,
        powerZones: [{ name: 'Z1', min: 0, max: 100 }],
        zoneConfiguration: {
          physiologyReferences: {
            ftp: {
              value: 166,
              status: 'estimated',
              source: 'accepted_threshold_detection',
              sport: 'ride',
              measuredAt: '2026-10-01T00:00:00.000Z',
              confidence: 'medium',
              evidenceQualified: true,
              workoutId: 'workout-1'
            }
          }
        }
      }
    })
    expect(findManyGoalMock).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        status: 'ACTIVE'
      }
    })
  })
})
