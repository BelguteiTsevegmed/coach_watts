import type { ChildProcess } from 'node:child_process'

type Service = { name: 'web' | 'worker'; args: string[]; env: NodeJS.ProcessEnv }
type Child = Pick<ChildProcess, 'pid' | 'on'>

export function getDevServices(env: NodeJS.ProcessEnv, args: string[] = []): Service[] {
  const sharedEnv = {
    ...env,
    NODE_ENV: 'development',
    NODE_OPTIONS: env.NODE_OPTIONS || '--max-old-space-size=8192',
    // A supervised worker does not need a fixed monitoring port. Let the OS
    // allocate one so a worktree or separately managed worker cannot collide.
    CW_WORKER_HEALTH_PORT: env.CW_WORKER_HEALTH_PORT || '0'
  }
  const services: Service[] = [
    { name: 'web', args: ['node_modules/nuxt/bin/nuxt.mjs', 'dev', ...args], env: sharedEnv }
  ]
  const driver =
    env.TASK_QUEUE_DRIVER?.toLowerCase() ||
    (env.TRIGGER_SECRET_KEY && env.E2E_MODE !== 'true' ? 'trigger' : 'redis')
  if (driver === 'redis') {
    services.push({
      name: 'worker',
      args: ['--import', 'tsx', 'cli/worker/index.ts', 'start'],
      env: sharedEnv
    })
  }
  return services
}

export function superviseDevServices(
  services: Service[],
  hooks: {
    spawn: (service: Service) => Child
    kill: (child: Child, signal: NodeJS.Signals) => void
    finish: (code: number) => void
    log: (message: string) => void
  }
) {
  const children = new Set<Child>()
  let stopping = false
  let exitCode = 0
  let restartTimer: ReturnType<typeof setTimeout> | undefined
  let killTimer: ReturnType<typeof setTimeout> | undefined
  let consecutiveFailures = 0

  const finishIfStopped = () => {
    if (!stopping || children.size) return
    clearTimeout(killTimer)
    hooks.finish(exitCode)
  }
  const stop = (code = 0) => {
    if (stopping) return
    stopping = true
    exitCode = code
    clearTimeout(restartTimer)
    for (const child of children) hooks.kill(child, 'SIGTERM')
    if (children.size) {
      killTimer = setTimeout(() => {
        for (const child of children) hooks.kill(child, 'SIGKILL')
      }, 5000)
    }
    finishIfStopped()
  }
  const launch = (service: Service) => {
    if (stopping) return
    const startedAt = Date.now()
    const child = hooks.spawn(service)
    children.add(child)
    hooks.log(`Started ${service.name}.`)
    let ended = false
    const onExit = (code: number | null) => {
      if (ended) return
      ended = true
      // The parent may have died while its Nuxt/worker descendants survived.
      // The launcher targets the process group, so remove those orphans before
      // releasing the service or starting a replacement.
      hooks.kill(child, 'SIGKILL')
      children.delete(child)
      if (stopping) {
        finishIfStopped()
        return
      }
      if (service.name === 'web') {
        stop(code ?? 1)
        return
      }
      if (Date.now() - startedAt > 60_000) consecutiveFailures = 0
      consecutiveFailures += 1
      if (consecutiveFailures > 5) {
        hooks.log('Worker repeatedly failed. Stopping the app; inspect the worker error above.')
        stop(1)
        return
      }
      const delay = Math.min(1000 * 2 ** (consecutiveFailures - 1), 15_000)
      hooks.log(`Worker exited (${code ?? 'signal'}); restarting in ${delay / 1000}s.`)
      restartTimer = setTimeout(() => launch(service), delay)
    }
    child.on('exit', onExit)
    child.on('error', (error: Error) => {
      hooks.log(`${service.name} could not start: ${error.message}`)
      onExit(1)
    })
  }
  for (const service of services) launch(service)
  return { stop }
}
