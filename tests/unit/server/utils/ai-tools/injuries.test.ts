import { beforeEach, describe, expect, it, vi } from 'vitest'

import { prisma } from '../../../../../server/utils/db'
import { injuryTools } from '../../../../../server/utils/ai-tools/injuries'

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    injury: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
  }
}))

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'inj-1',
  userId: 'user-1',
  bodyArea: 'achilles',
  side: 'LEFT',
  title: null,
  description: 'Sore on first steps',
  painLevel: 4,
  status: 'ACTIVE',
  onsetDate: new Date('2026-09-28T00:00:00.000Z'),
  resolvedAt: null,
  affectedSports: [],
  notes: null,
  createdAt: new Date('2026-09-28T08:00:00.000Z'),
  updatedAt: new Date('2026-09-28T08:00:00.000Z'),
  ...overrides
})

const opts = { toolCallId: '1', messages: [] } as any

describe('injuryTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-04T12:00:00.000Z'))
  })

  it('does not require approval (low-friction health logging)', () => {
    const tools = injuryTools('user-1', 'UTC') as Record<string, any>
    expect(tools.log_injury.needsApproval).toBeUndefined()
    expect(tools.update_injury.needsApproval).toBeUndefined()
  })

  it('log_injury normalizes free text and defaults onset to the athlete today', async () => {
    vi.mocked(prisma.injury.create).mockResolvedValue(row() as any)
    const tools = injuryTools('user-1', 'Pacific/Auckland')
    const result: any = await tools.log_injury.execute!(
      { body_area: 'left achilles tendon', side: 'LEFT', pain_level: 4.4 } as any,
      opts
    )

    expect(prisma.injury.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        bodyArea: 'achilles',
        painLevel: 4,
        // 12:00 UTC on Oct 4 is already Oct 5 in Auckland
        onsetDate: new Date('2026-10-05T00:00:00.000Z')
      })
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('left achilles')
    expect(result.injury).toMatchObject({ onsetDate: '2026-09-28', days_since_onset: 7 })
  })

  it('update_injury reports a missing/foreign injury instead of throwing', async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(row({ userId: 'other' }) as any)
    const tools = injuryTools('user-1', 'UTC')
    const result: any = await tools.update_injury.execute!(
      { injury_id: 'inj-1', pain_level: 2 } as any,
      opts
    )
    expect(result).toEqual({
      success: false,
      error: 'Injury not found. Call get_injuries to find the ID.'
    })
  })

  it('update_injury resolves an injury', async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(row() as any)
    vi.mocked(prisma.injury.update).mockResolvedValue(
      row({ status: 'RESOLVED', painLevel: 0 }) as any
    )
    const tools = injuryTools('user-1', 'UTC')
    const result: any = await tools.update_injury.execute!(
      { injury_id: 'inj-1', status: 'RESOLVED', pain_level: 0 } as any,
      opts
    )
    expect(prisma.injury.update).toHaveBeenCalledWith({
      where: { id: 'inj-1' },
      data: { painLevel: 0, status: 'RESOLVED', resolvedAt: expect.any(Date) }
    })
    expect(result.message).toBe('Updated left achilles: RESOLVED, pain 0/10.')
  })

  it('get_injuries returns a friendly empty result', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([] as any)
    const tools = injuryTools('user-1', 'UTC')
    const result: any = await tools.get_injuries.execute!({} as any, opts)
    expect(result).toEqual({ count: 0, injuries: [], message: 'No active injuries or niggles.' })
  })
})
