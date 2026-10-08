import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getReadinessContext,
  buildReadinessContext
} from '../../../../../server/utils/services/readinessContextService'
import { prisma } from '../../../../../server/utils/db'
vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    wellness: { findMany: vi.fn() },
    dailyCheckin: { findMany: vi.fn() },
    calendarNote: { findMany: vi.fn() },
    injury: { findMany: vi.fn() },
    workout: { findMany: vi.fn() }
  }
}))
const asOf = new Date('2026-10-08T00:00:00Z')
describe('one readiness snapshot for coach entrypoints and write validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.wellness.findMany).mockResolvedValue([
      {
        id: 'w',
        date: asOf,
        fatigue: 8,
        hrv: 60,
        ctl: 50,
        atl: 60,
        tsb: -10,
        history: [{ source: 'whoop', changes: 'created' }],
        lastSource: 'whoop'
      }
    ] as any)
    vi.mocked(prisma.dailyCheckin.findMany).mockResolvedValue([
      {
        id: 'c',
        date: asOf,
        questions: [{ text: 'Ready?', answer: 'Exhausted' }],
        userNotes: 'Poor sleep'
      }
    ] as any)
    vi.mocked(prisma.calendarNote.findMany).mockResolvedValue([])
    vi.mocked(prisma.injury.findMany).mockResolvedValue([])
    vi.mocked(prisma.workout.findMany).mockResolvedValue([
      {
        id: 'actual-extra',
        date: new Date('2026-10-07T22:30:00Z'),
        type: 'Run',
        durationSec: 900,
        tss: null
      }
    ] as any)
  })
  it('resolves identical facts through prompt and transaction loaders, including extra actual training', async () => {
    const prompt = await buildReadinessContext('user', asOf, 'Europe/Warsaw')
    const transaction = await getReadinessContext('user', asOf, prisma, 'Europe/Warsaw')
    expect(prompt.context).toEqual(transaction)
    expect(JSON.parse(prompt.prompt.split('\n')[1]!)).toEqual(transaction)
    expect(transaction.decision).toBe('reduce')
    expect(transaction.recentCompletedLoad).toEqual([
      { id: 'actual-extra', date: '2026-10-08', type: 'Run', durationSec: 900, tss: null }
    ])
    expect(transaction.checkins[0]?.answers[0]?.answer).toBe('Exhausted')
    expect(prisma.dailyCheckin.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'COMPLETED',
          date: { gte: new Date('2026-10-06'), lte: asOf }
        })
      })
    )
    expect(prisma.workout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user', isDuplicate: false })
      })
    )
  })
  it('keeps @db.Date keys at UTC midnight in western timezones', async () => {
    const r = await getReadinessContext('user', asOf, prisma, 'America/Los_Angeles')
    expect(r.asOf).toBe('2026-10-08')
    expect(prisma.wellness.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user', date: { gte: new Date('2026-09-08'), lte: asOf } }
      })
    )
  })
})
