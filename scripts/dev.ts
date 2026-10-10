import 'dotenv/config'
import { spawn } from 'node:child_process'
import { getDevServices, superviseDevServices } from './utils/dev-supervisor'

const supervisor = superviseDevServices(getDevServices(process.env, process.argv.slice(2)), {
  spawn: (service) =>
    spawn(process.execPath, service.args, {
      env: service.env,
      stdio: 'inherit',
      detached: process.platform !== 'win32'
    }),
  kill: (child, signal) => {
    if (!child.pid) return
    try {
      // Stop the entire process group, including Nuxt's child server.
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal)
    } catch (error: any) {
      if (error.code !== 'ESRCH') console.error(error)
    }
  },
  finish: (code) => {
    process.exitCode = code
  },
  log: (message) => console.log(`[dev] ${message}`)
})
process.once('SIGINT', () => supervisor.stop())
process.once('SIGTERM', () => supervisor.stop())
