import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dailyCheckinRepository } from '../../../../server/utils/repositories/dailyCheckinRepository'
import { dispatchTask } from '../../../../server/utils/task-dispatcher'
import { mainTaskQueue } from '../../../../server/utils/queue'

vi.mock('h3', async (original) => ({
  ...(await original<typeof import('h3')>()),
  readBody: vi.fn().mockResolvedValue({})
}))
vi.mock('../../../../server/utils/auth-guard', () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: 'u1' })
}))
vi.mock('../../../../server/utils/date', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
  getUserLocalDate: vi.fn(() => new Date('2026-10-07T00:00:00Z'))
}))
vi.mock('../../../../server/utils/quotas/http', () => ({ assertQuotaAllowed: vi.fn() }))
vi.mock('../../../../server/utils/task-run-events', () => ({ publishTaskRunStartedEvent: vi.fn() }))
vi.mock('../../../../server/utils/task-dispatcher', () => ({
  getTaskDriver: () => 'redis',
  dispatchTask: vi.fn().mockResolvedValue({ id: 'redis:1' })
}))
vi.mock('../../../../server/utils/queue', () => ({ mainTaskQueue: { getWorkers: vi.fn() } }))
vi.mock('../../../../server/utils/repositories/dailyCheckinRepository', () => ({
  dailyCheckinRepository: { getByDate: vi.fn(), ensurePending: vi.fn(), update: vi.fn() }
}))

// Nuxt normally supplies these globals to API handlers.
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('readBody', async () => ({}))
const handler = (await import('../../../../server/api/checkin/generate.post')).default
const pending = {
  id: 'checkin-1',
  status: 'PENDING',
  date: new Date('2026-10-07'),
  questions: [],
  updatedAt: new Date()
}

describe('Daily check-in dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mainTaskQueue.getWorkers).mockResolvedValue([{ id: 'worker' }] as any)
    vi.mocked(dailyCheckinRepository.getByDate).mockResolvedValue(null)
    vi.mocked(dailyCheckinRepository.ensurePending).mockResolvedValue(pending as any)
  })
  it('reports a stopped worker instead of leaving an invisible queued request', async () => {
    vi.mocked(mainTaskQueue.getWorkers).mockResolvedValue([])
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('reports an unavailable Redis service without creating a pending check-in', async () => {
    vi.mocked(mainTaskQueue.getWorkers).mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    await expect(handler({} as any)).rejects.toMatchObject({ statusCode: 503 })
    expect(dailyCheckinRepository.ensurePending).not.toHaveBeenCalled()
    expect(dispatchTask).not.toHaveBeenCalled()
  })
  it('returns a durable pending check-in and deduplicates repeated requests', async () => {
    await expect(handler({} as any)).resolves.toMatchObject({ id: 'checkin-1', status: 'PENDING' })
    expect(dispatchTask).toHaveBeenCalledWith(
      'generate-daily-checkin',
      expect.objectContaining({ checkinId: 'checkin-1' }),
      expect.objectContaining({ idempotencyKey: 'u1-1791331200000' })
    )
  })
  it('makes enqueue failures visible in the persisted check-in', async () => {
    vi.mocked(dispatchTask).mockRejectedValueOnce(new Error('Queue offline'))
    await expect(handler({} as any)).rejects.toThrow('Queue offline')
    expect(dailyCheckinRepository.update).toHaveBeenCalledWith('checkin-1', { status: 'FAILED' })
  })
  it('persists pending status before retrying a failed check-in', async () => {
    vi.mocked(dailyCheckinRepository.getByDate).mockResolvedValue({
      ...pending,
      status: 'FAILED'
    } as any)
    await handler({} as any)
    expect(dailyCheckinRepository.update).toHaveBeenCalledWith('checkin-1', { status: 'PENDING' })
    expect(vi.mocked(dailyCheckinRepository.update).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(dispatchTask).mock.invocationCallOrder[0]!
    )
  })
})
