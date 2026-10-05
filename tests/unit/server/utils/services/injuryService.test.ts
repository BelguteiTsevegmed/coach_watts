import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../../server/utils/db'
import {
  InjuryNotFoundError,
  createInjurySchema,
  injuryService,
  parseInjuryDate,
  resolveResolvedAt,
  serializeInjury,
  sortInjuries,
  updateInjurySchema
} from '../../../../../server/utils/services/injuryService'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    injury: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}))

const record = {
  id: 'inj-1',
  userId: 'user-1',
  bodyArea: 'achilles',
  side: 'LEFT',
  title: null,
  description: null,
  painLevel: 4,
  status: 'ACTIVE',
  onsetDate: new Date('2026-09-28T00:00:00.000Z'),
  resolvedAt: null,
  affectedSports: ['run'],
  notes: null,
  createdAt: new Date('2026-09-28T08:00:00.000Z'),
  updatedAt: new Date('2026-09-28T08:00:00.000Z')
}

describe('injury validation', () => {
  it('normalizes the body area and accepts the documented fields', () => {
    const parsed = createInjurySchema.parse({
      bodyArea: 'IT band',
      side: 'RIGHT',
      painLevel: 4,
      onsetDate: '2026-10-01',
      affectedSports: ['RUN', 'ride', 'run'],
      notes: '  '
    })
    expect(parsed).toMatchObject({
      bodyArea: 'it_band',
      side: 'RIGHT',
      painLevel: 4,
      onsetDate: '2026-10-01',
      affectedSports: ['run', 'ride'],
      notes: null
    })
  })

  it('rejects out-of-range pain, unknown sides and bad dates', () => {
    expect(createInjurySchema.safeParse({ bodyArea: 'knee', painLevel: 11 }).success).toBe(false)
    expect(createInjurySchema.safeParse({ bodyArea: 'knee', painLevel: 2.5 }).success).toBe(false)
    expect(
      createInjurySchema.safeParse({ bodyArea: 'knee', painLevel: 2, side: 'UP' }).success
    ).toBe(false)
    expect(
      createInjurySchema.safeParse({ bodyArea: 'knee', painLevel: 2, onsetDate: '2026-02-30' })
        .success
    ).toBe(false)
  })

  it('requires at least one field on update', () => {
    expect(updateInjurySchema.safeParse({}).success).toBe(false)
    expect(updateInjurySchema.safeParse({ status: 'RESOLVED' }).success).toBe(true)
  })

  it('parses calendar dates to UTC midnight', () => {
    expect(parseInjuryDate('2026-10-01')?.toISOString()).toBe('2026-10-01T00:00:00.000Z')
    expect(parseInjuryDate('2026-10-01T22:30:00.000Z')?.toISOString()).toBe(
      '2026-10-01T00:00:00.000Z'
    )
    expect(parseInjuryDate('yesterday')).toBe(null)
  })
})

describe('resolveResolvedAt', () => {
  const now = new Date('2026-10-04T10:00:00.000Z')
  it('stamps on RESOLVED, clears on reopen, leaves other transitions alone', () => {
    expect(resolveResolvedAt('ACTIVE', 'RESOLVED', now)).toBe(now)
    expect(resolveResolvedAt('RESOLVED', 'ACTIVE', now)).toBe(null)
    expect(resolveResolvedAt('ACTIVE', 'RECOVERING', now)).toBe(undefined)
    expect(resolveResolvedAt('RESOLVED', 'RESOLVED', now)).toBe(undefined)
    expect(resolveResolvedAt('ACTIVE', undefined, now)).toBe(undefined)
  })
})

describe('sortInjuries / serializeInjury', () => {
  it('orders ACTIVE, RECOVERING, RESOLVED then newest onset first', () => {
    const sorted = sortInjuries([
      { id: 'a', status: 'RESOLVED', onsetDate: '2026-09-30' },
      { id: 'b', status: 'RECOVERING', onsetDate: '2026-09-01' },
      { id: 'c', status: 'ACTIVE', onsetDate: '2026-08-01' },
      { id: 'd', status: 'ACTIVE', onsetDate: '2026-09-15' }
    ])
    expect(sorted.map((injury) => injury.id)).toEqual(['d', 'c', 'b', 'a'])
  })

  it('serializes dates as ISO strings', () => {
    expect(serializeInjury(record as any)).toMatchObject({
      id: 'inj-1',
      onsetDate: '2026-09-28T00:00:00.000Z',
      resolvedAt: null,
      createdAt: '2026-09-28T08:00:00.000Z'
    })
  })
})

describe('injuryService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists only open injuries by default', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([record] as any)
    await injuryService.list('user-1')
    expect(prisma.injury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: { in: ['ACTIVE', 'RECOVERING'] } }
      })
    )
    await injuryService.list('user-1', { status: 'all' })
    expect(vi.mocked(prisma.injury.findMany).mock.calls[1]![0]).toMatchObject({
      where: { userId: 'user-1' }
    })
  })

  it('creates with defaults (ACTIVE, onset = provided today)', async () => {
    vi.mocked(prisma.injury.create).mockResolvedValue(record as any)
    const today = new Date('2026-10-04T00:00:00.000Z')
    await injuryService.create(
      'user-1',
      createInjurySchema.parse({ bodyArea: 'calf', painLevel: 3 }),
      {
        today
      }
    )
    expect(prisma.injury.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        bodyArea: 'calf',
        painLevel: 3,
        status: 'ACTIVE',
        onsetDate: today,
        resolvedAt: null,
        affectedSports: []
      })
    })
  })

  it('stamps resolvedAt when an injury is resolved', async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(record as any)
    vi.mocked(prisma.injury.update).mockResolvedValue({ ...record, status: 'RESOLVED' } as any)
    await injuryService.update('user-1', 'inj-1', updateInjurySchema.parse({ status: 'RESOLVED' }))
    expect(prisma.injury.update).toHaveBeenCalledWith({
      where: { id: 'inj-1' },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) }
    })
  })

  it("refuses to touch another athlete's injury", async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue({
      ...record,
      userId: 'someone-else'
    } as any)
    await expect(
      injuryService.update('user-1', 'inj-1', updateInjurySchema.parse({ painLevel: 1 }))
    ).rejects.toBeInstanceOf(InjuryNotFoundError)
    await expect(injuryService.remove('user-1', 'inj-1')).rejects.toBeInstanceOf(
      InjuryNotFoundError
    )
    expect(prisma.injury.update).not.toHaveBeenCalled()
    expect(prisma.injury.delete).not.toHaveBeenCalled()
  })
})
