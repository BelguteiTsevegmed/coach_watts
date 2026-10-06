import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../../server/utils/db'
import {
  classifySportFamily,
  derivePrimarySport,
  getAthletePrimarySport,
  getCoachRole,
  getDefaultActivityTypes,
  getDefaultWorkoutType,
  inferSportFromText
} from '../../../../../server/utils/coaching/sport'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    workout: { groupBy: vi.fn() },
    plannedWorkout: { groupBy: vi.fn() },
    goal: { findMany: vi.fn() }
  }
}))

const hours = (h: number) => h * 3600

describe('classifySportFamily', () => {
  it.each([
    ['Run', 'run'],
    ['TrailRun', 'run'],
    ['VirtualRun', 'run'],
    ['Ride', 'ride'],
    ['VirtualRide', 'ride'],
    ['GravelRide', 'ride'],
    ['EBikeRide', 'ride'],
    ['Swim', 'swim'],
    ['WeightTraining', 'strength'],
    ['Gym', 'strength'],
    ['Walk', 'other'],
    ['Rest', 'other'],
    [null, 'other']
  ])('%s -> %s', (type, family) => {
    expect(classifySportFamily(type as string | null)).toBe(family)
  })
})

describe('derivePrimarySport', () => {
  it('picks the sport with most of the endurance time', () => {
    expect(
      derivePrimarySport([
        { type: 'Run', durationSec: hours(20) },
        { type: 'Ride', durationSec: hours(3) },
        { type: 'WeightTraining', durationSec: hours(10) }
      ])
    ).toBe('running')
  })

  it('calls a balanced mix multisport', () => {
    expect(
      derivePrimarySport([
        { type: 'Run', durationSec: hours(8) },
        { type: 'Ride', durationSec: hours(10) },
        { type: 'Swim', durationSec: hours(4) }
      ])
    ).toBe('multisport')
  })

  it('falls back to general without enough data', () => {
    expect(derivePrimarySport([])).toBe('general')
    expect(derivePrimarySport([{ type: 'Run', durationSec: 1200 }])).toBe('general')
  })
})

describe('inferSportFromText', () => {
  it.each([
    ['Sub-1:45 Half Marathon', 'running'],
    ['Spring 10k', 'running'],
    ['Ironman 70.3', 'multisport'],
    ['Gran Fondo', 'cycling'],
    ['Criterium', 'cycling'],
    ['Open water swim', 'swimming'],
    ['Lose 3 kg', null]
  ])('%s -> %s', (text, sport) => {
    expect(inferSportFromText(text)).toBe(sport)
  })
})

describe('getAthletePrimarySport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.plannedWorkout.groupBy).mockResolvedValue([] as any)
    vi.mocked(prisma.goal.findMany).mockResolvedValue([])
  })

  it('uses the last 60 days of training', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue([
      { type: 'Run', _sum: { durationSec: hours(15) } },
      { type: 'Ride', _sum: { durationSec: hours(2) } }
    ] as any)
    await expect(getAthletePrimarySport('user-1')).resolves.toBe('running')
    expect(prisma.workout.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        by: ['type'],
        where: expect.objectContaining({ userId: 'user-1', isDuplicate: false })
      })
    )
  })

  it('falls back to planned sessions, then goal wording', async () => {
    vi.mocked(prisma.workout.groupBy).mockResolvedValue([] as any)
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { title: 'Sub-1:45 Half Marathon', eventType: null, description: null }
    ] as any)
    await expect(getAthletePrimarySport('user-1')).resolves.toBe('running')
  })

  it('returns general when the lookup fails', async () => {
    vi.mocked(prisma.workout.groupBy).mockRejectedValue(new Error('boom'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(getAthletePrimarySport('user-1')).resolves.toBe('general')
    warn.mockRestore()
  })
})

describe('sport defaults', () => {
  it('maps sports to roles and default workout types', () => {
    expect(getCoachRole('running')).toBe('running coach')
    expect(getCoachRole('general')).toBe('endurance coach')
    expect(getDefaultActivityTypes('running')).toEqual(['Run'])
    expect(getDefaultActivityTypes('general')).toEqual(['Ride'])
    expect(getDefaultWorkoutType('multisport')).toBe('Run')
  })
})
