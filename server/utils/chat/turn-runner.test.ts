import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChatTurnRunner } from './turn-runner'
const mocks = vi.hoisted(() => ({ claim: vi.fn(), recover: vi.fn(), execute: vi.fn() }))
vi.mock('./turn-executor', () => ({ executeChatTurn: mocks.execute }))
vi.mock('../services/chatTurnService', () => ({
  chatTurnService: {
    claimNextQueuedTurn: mocks.claim,
    recoverStaleTurns: mocks.recover
  }
}))
let runner: ChatTurnRunner
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  mocks.claim.mockResolvedValue(null)
  mocks.recover.mockResolvedValue(0)
  runner = new ChatTurnRunner()
})
afterEach(() => {
  runner.stop()
  vi.useRealTimers()
  vi.restoreAllMocks()
})
it('does not restart polling when a running turn settles after stop', async () => {
  let finish!: () => void
  mocks.claim.mockResolvedValueOnce({ id: 'turn-1', runId: 'run-1' })
  mocks.execute.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      })
  )
  runner.start()
  await vi.advanceTimersByTimeAsync(1)
  expect(mocks.execute).toHaveBeenCalledTimes(1)
  runner.stop()
  const claims = mocks.claim.mock.calls.length
  finish()
  await vi.advanceTimersByTimeAsync(1000)
  expect(mocks.claim).toHaveBeenCalledTimes(claims)
})
it('retries polling after a transient claim failure', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.claim.mockRejectedValueOnce(new Error('Database unavailable'))
  runner.start()
  await vi.advanceTimersByTimeAsync(251)
  expect(mocks.claim).toHaveBeenCalledTimes(2)
})
it('releases a failed execution slot for the next queued turn', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  mocks.claim
    .mockResolvedValueOnce({ id: 'turn-1', runId: 'run-1' })
    .mockResolvedValueOnce({ id: 'turn-2', runId: 'run-2' })
    .mockResolvedValueOnce({ id: 'turn-3', runId: 'run-3' })
  mocks.execute
    .mockRejectedValueOnce(new Error('Deadline exceeded'))
    .mockImplementation(() => new Promise(() => {}))
  runner.start()
  await vi.advanceTimersByTimeAsync(251)
  expect(mocks.execute.mock.calls.map((call) => call[0])).toEqual(['turn-1', 'turn-2', 'turn-3'])
})
