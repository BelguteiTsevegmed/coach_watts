import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ clients: [] as any[], options: [] as any[] }))
vi.mock('ioredis', () => ({
  default: class extends EventEmitter {
    status = 'wait'
    connect = vi.fn(async () => {
      this.status = 'ready'
      this.emit('ready')
    })
    publish = vi.fn(async () => 1)
    subscribe = vi.fn(async () => 1)
    unsubscribe = vi.fn(async () => 1)
    quit = vi.fn(async () => undefined)
    disconnect = vi.fn()
    constructor(_url: string, options: any) {
      super()
      mocks.clients.push(this)
      mocks.options.push(options)
    }
  }
}))
beforeEach(() => {
  vi.resetModules()
  mocks.clients.length = 0
  mocks.options.length = 0
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379')
  vi.stubEnv('NITRO_BUILD', '')
})
afterEach(() => vi.unstubAllEnvs())
it('resubscribes after a dropped connection becomes ready again', async () => {
  const bus = await import('../../../../server/utils/realtime-bus')
  await bus.startRealtimeSubscription(vi.fn())
  const client = mocks.clients[0]
  expect(client.subscribe).toHaveBeenCalledTimes(1)
  client.emit('ready')
  await Promise.resolve()
  expect(client.subscribe).toHaveBeenCalledTimes(2)
  expect(mocks.options[0].retryStrategy(10)).toBeGreaterThan(0)
  expect(mocks.options[0].commandTimeout).toBeLessThanOrEqual(1000)
  await bus.stopRealtimeSubscription()
})
it('recreates an ended publisher so an outage does not permanently disable events', async () => {
  const bus = await import('../../../../server/utils/realtime-bus')
  await bus.publishRealtimeEvent('user-1', { type: 'chat_turn_status' })
  mocks.clients[0].status = 'end'
  await bus.publishRealtimeEvent('user-1', { type: 'chat_turn_status' })
  expect(mocks.clients).toHaveLength(2)
  expect(mocks.clients[1].publish).toHaveBeenCalledOnce()
  await bus.stopRealtimeSubscription()
})
