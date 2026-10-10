import { describe, expect, it, vi } from 'vitest'
import {
  WORKER_MONITORING_THRESHOLDS,
  collectWorkerMonitoringSnapshot,
  evaluateWorkerHealth,
  summarizeChatRecoveryEvents,
  workerMonitoringHttpStatus
} from '../../../../server/utils/worker-monitoring'

vi.mock('../../../../server/utils/task-dispatcher', () => ({
  getTaskDriver: () => 'redis'
}))

vi.mock('../../../../server/utils/db', () => ({
  prisma: {
    webhookLog: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null)
    },
    chatTurn: { count: vi.fn().mockResolvedValue(0) },
    chatTurnEvent: { findMany: vi.fn().mockResolvedValue([]) }
  }
}))

vi.mock('../../../../server/utils/queue', () => {
  const queue = (database: number) => ({
    client: Promise.resolve({ options: { db: database } }),
    getWorkers: vi.fn().mockResolvedValue([{ db: '0' }]),
    getJobCounts: vi.fn().mockResolvedValue({ waiting: 1, active: 0 }),
    isPaused: vi.fn().mockResolvedValue(false)
  })
  return {
    getRedisConnection: () => ({
      status: 'ready',
      info: vi.fn().mockResolvedValue('used_memory:100\r\nmaxmemory_human:1KB')
    }),
    webhookQueue: queue(0),
    pingQueue: queue(0),
    streamsQueue: queue(0),
    mainTaskQueue: queue(2)
  }
})

describe('worker monitoring', () => {
  it('reports coaching backlog as critical when only another Redis database has a worker', async () => {
    const snapshot = await collectWorkerMonitoringSnapshot()

    expect(snapshot.status).toBe('critical')
    expect(snapshot.queues.mainTasks).toMatchObject({ waiting: 1, workers: 0, isPaused: false })
    expect(snapshot.queues.webhook.workers).toBe(1)
    expect(snapshot.alerts).toContainEqual({
      level: 'critical',
      message: 'No active coaching task workers'
    })
  })

  const healthyInput = () => ({
    redis: {
      status: 'ready',
      usedMemoryBytes: 100,
      maxMemoryBytes: 1000,
      usedMemoryPercent: 10,
      usedMemoryHuman: '100B',
      maxMemoryHuman: '1KB'
    },
    webhook: {
      name: 'webhook' as const,
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
      workers: 1,
      isPaused: false
    },
    mainTasks: {
      name: 'mainTasks' as const,
      counts: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
      workers: 1,
      isPaused: false
    },
    mainTasksRequired: true,
    webhooks: { pending: 0, processedLast10Min: 0, lastActivityAt: null }
  })

  it('detects missing coaching workers even when Redis and webhook workers are healthy', () => {
    const input = healthyInput()
    input.mainTasks.workers = 0
    input.mainTasks.counts.waiting = 1

    expect(evaluateWorkerHealth(input)).toEqual({
      status: 'critical',
      alerts: [{ level: 'critical', message: 'No active coaching task workers' }]
    })
  })

  it('detects a paused coaching queue with an otherwise healthy worker', () => {
    const input = healthyInput()
    input.mainTasks.isPaused = true

    expect(evaluateWorkerHealth(input)).toEqual({
      status: 'critical',
      alerts: [{ level: 'critical', message: 'Coaching task queue is paused' }]
    })
  })

  it('does not require Redis coaching consumers when using another task driver', () => {
    const input = healthyInput()
    input.mainTasksRequired = false
    input.mainTasks.workers = 0
    input.mainTasks.isPaused = true

    expect(evaluateWorkerHealth(input)).toEqual({ status: 'ok', alerts: [] })
  })

  it('reports healthy when required consumers are ready', () => {
    expect(evaluateWorkerHealth(healthyInput())).toEqual({ status: 'ok', alerts: [] })
  })

  it('maps critical status to HTTP 503', () => {
    expect(workerMonitoringHttpStatus('critical')).toBe(503)
  })

  it('maps ok and degraded status to HTTP 200', () => {
    expect(workerMonitoringHttpStatus('ok')).toBe(200)
    expect(workerMonitoringHttpStatus('degraded')).toBe(200)
  })

  it('uses practical queue and redis thresholds', () => {
    expect(WORKER_MONITORING_THRESHOLDS.webhookWaitingCritical).toBeGreaterThan(
      WORKER_MONITORING_THRESHOLDS.webhookWaitingDegraded
    )
    expect(WORKER_MONITORING_THRESHOLDS.redisMemoryPercentCritical).toBeGreaterThan(
      WORKER_MONITORING_THRESHOLDS.redisMemoryPercentDegraded
    )
  })

  it('reports heartbeat and exhaustion rates by deployment', () => {
    const snapshot = summarizeChatRecoveryEvents(100, [
      {
        data: {
          recoveryReason: 'heartbeat_timeout',
          reason: 'turn_requeued_for_recovery',
          deploymentId: 'deploy-a'
        }
      },
      {
        data: {
          recoveryReason: 'heartbeat_timeout',
          reason: 'recovery_attempts_exhausted',
          deploymentId: 'deploy-a'
        }
      },
      { data: { reason: 'slow_response' } }
    ])

    expect(snapshot).toMatchObject({
      totalTurns: 100,
      heartbeatTimeouts: 2,
      heartbeatTimeoutRate: 2,
      recoveryExhaustions: 1,
      recoveryExhaustionRate: 1,
      byDeployment: {
        'deploy-a': { heartbeatTimeouts: 2, recoveryExhaustions: 1 }
      }
    })
  })
})
