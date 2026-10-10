import type { Queue } from 'bullmq'
import { describe, expect, it, vi } from 'vitest'
import { getQueueWorkers } from '../../../../server/utils/queue-workers'

function queueWithWorkers(workers: Array<Record<string, string>>, database?: number) {
  return {
    client: Promise.resolve({ options: { db: database } }) as Queue['client'],
    getWorkers: vi.fn().mockResolvedValue(workers)
  }
}

describe('queue worker database isolation', () => {
  it('does not count a database 0 worker for a database 2 queue', async () => {
    const queue = queueWithWorkers([{ id: 'main-checkout-worker', db: '0' }], 2)

    expect(await getQueueWorkers(queue)).toEqual([])
  })

  it('returns only matching workers when identical queue names exist in several databases', async () => {
    const matching = { id: 'worktree-worker', db: '2' }
    const queue = queueWithWorkers(
      [{ id: 'main-checkout-worker', db: '0' }, matching, { id: 'other-worker', db: '3' }],
      2
    )

    expect(await getQueueWorkers(queue)).toEqual([matching])
  })

  it('uses database 0 when the connection does not specify a database', async () => {
    const matching = { id: 'default-worker', db: '0' }
    const queue = queueWithWorkers([matching, { id: 'worktree-worker', db: '2' }])

    expect(await getQueueWorkers(queue)).toEqual([matching])
  })

  it('does not treat missing or invalid worker database data as readiness', async () => {
    const queue = queueWithWorkers([
      { name: 'GCP does not support client list' },
      { db: '' },
      { db: ' ' },
      { db: 'invalid' }
    ])

    expect(await getQueueWorkers(queue)).toEqual([])
  })

  it('propagates inspection failures instead of reporting that a queue is ready', async () => {
    const queue = queueWithWorkers([])
    queue.getWorkers.mockRejectedValue(new Error('Redis unavailable'))

    await expect(getQueueWorkers(queue)).rejects.toThrow('Redis unavailable')
  })
})
