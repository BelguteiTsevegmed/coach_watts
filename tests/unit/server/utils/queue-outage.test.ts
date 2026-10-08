import { createServer, type Server, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('Queue requests during a Redis outage', () => {
  let disconnect: (() => void) | undefined
  let port: number
  let stalledServer: Server | undefined
  const sockets = new Set<Socket>()

  beforeEach(async () => {
    vi.resetModules()
    // Reserve then release a local port, so this exercises a real refused connection.
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as { port: number }
    port = address.port
    await new Promise<void>((resolve) => server.close(() => resolve()))
    vi.stubEnv('REDIS_URL', `redis://127.0.0.1:${address.port}`)
  })

  afterEach(async () => {
    disconnect?.()
    for (const socket of sockets) socket.destroy()
    sockets.clear()
    if (stalledServer) {
      await new Promise<void>((resolve) => stalledServer!.close(() => resolve()))
      stalledServer = undefined
    }
    vi.unstubAllEnvs()
  })

  it('rejects worker discovery instead of waiting forever for Redis readiness', async () => {
    const { mainTaskQueue, getRedisConnection } = await import('../../../../server/utils/queue')
    disconnect = () => getRedisConnection().disconnect()
    const request = mainTaskQueue.getWorkers().then(
      () => 'resolved',
      () => 'rejected'
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      request,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('still waiting'), 2500)
      })
    ])
    clearTimeout(timer)
    expect(result).toBe('rejected')
  })

  it('bounds requests when the Redis socket accepts connections but never responds', async () => {
    stalledServer = createServer((socket) => sockets.add(socket))
    await new Promise<void>((resolve, reject) => {
      stalledServer!.once('error', reject)
      stalledServer!.listen(port, '127.0.0.1', resolve)
    })
    const { mainTaskQueue, getRedisConnection } = await import('../../../../server/utils/queue')
    disconnect = () => getRedisConnection().disconnect()
    const request = mainTaskQueue.getWorkers().then(
      () => 'resolved',
      () => 'rejected'
    )
    let timer: ReturnType<typeof setTimeout> | undefined
    const result = await Promise.race([
      request,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('still waiting'), 6000)
      })
    ])
    clearTimeout(timer)
    expect(result).toBe('rejected')
  })
})
