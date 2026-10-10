import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDevServices, superviseDevServices } from '../../../scripts/utils/dev-supervisor'

const child = () => Object.assign(new EventEmitter(), { pid: 123, kill: vi.fn() })

describe('development process supervision', () => {
  afterEach(() => vi.useRealTimers())

  it('starts web and a worker with shared environment and preserves Nuxt arguments', () => {
    const services = getDevServices({ TASK_QUEUE_DRIVER: 'redis', NUXT_PORT: '3217' }, ['--host'])
    expect(services.map((s) => s.name)).toEqual(['web', 'worker'])
    expect(services[0]!.args).toContain('--host')
    expect(services[1]!.env).toEqual(services[0]!.env)
    expect(services[1]!.env.NODE_ENV).toBe('development')
    expect(services[1]!.env.NUXT_PORT).toBe('3217')
    expect(services[1]!.env.CW_WORKER_HEALTH_PORT).toBe('0')
  })

  it('does not launch a Redis worker for an explicit Trigger or inline driver', () => {
    expect(getDevServices({ TASK_QUEUE_DRIVER: 'trigger' })).toHaveLength(1)
    expect(getDevServices({ TASK_QUEUE_DRIVER: 'inline' })).toHaveLength(1)
    expect(getDevServices({ TRIGGER_SECRET_KEY: 'configured' })).toHaveLength(1)
    expect(getDevServices({})).toHaveLength(2)
  })

  it('restarts a crashed worker with backoff and cancels restarts on shutdown', () => {
    vi.useFakeTimers()
    const children: ReturnType<typeof child>[] = []
    const spawn = vi.fn(() => {
      const c = child()
      children.push(c)
      return c
    })
    const kill = vi.fn()
    const finish = vi.fn()
    const supervisor = superviseDevServices(getDevServices({}), {
      spawn,
      kill,
      finish,
      log: vi.fn()
    })
    children[1]!.emit('exit', 1)
    expect(spawn).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1000)
    expect(spawn).toHaveBeenCalledTimes(3)
    children[2]!.emit('exit', 1)
    supervisor.stop()
    vi.advanceTimersByTime(30_000)
    expect(spawn).toHaveBeenCalledTimes(3)
    expect(kill).toHaveBeenCalled()
  })

  it('cleans the exiting process group before replacing a crashed service', () => {
    vi.useFakeTimers()
    const children: ReturnType<typeof child>[] = []
    const kill = vi.fn()
    const spawn = vi.fn(() => {
      const c = child()
      children.push(c)
      return c
    })
    superviseDevServices(getDevServices({}), { spawn, kill, finish: vi.fn(), log: vi.fn() })
    children[1]!.emit('exit', 1)
    expect(kill).toHaveBeenCalledWith(children[1], 'SIGKILL')
    vi.advanceTimersByTime(1000)
    expect(spawn).toHaveBeenCalledTimes(3)
  })

  it('stops the worker when web exits instead of leaving orphan processes', () => {
    vi.useFakeTimers()
    const children: ReturnType<typeof child>[] = []
    const spawn = vi.fn(() => {
      const c = child()
      children.push(c)
      return c
    })
    const kill = vi.fn()
    const finish = vi.fn()
    superviseDevServices(getDevServices({}), { spawn, kill, finish, log: vi.fn() })
    children[0]!.emit('exit', 1)
    expect(kill).toHaveBeenCalledWith(children[1], 'SIGTERM')
    children[1]!.emit('exit', 0)
    expect(finish).toHaveBeenCalledWith(1)
    vi.advanceTimersByTime(30_000)
    expect(spawn).toHaveBeenCalledTimes(2)
  })
})
