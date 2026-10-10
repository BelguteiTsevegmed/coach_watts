import { beforeEach, describe, expect, it, vi } from 'vitest'
const publish = vi.hoisted(() => vi.fn())
vi.mock('../../../../server/utils/realtime-bus', () => ({ publishRealtimeEvent: publish }))
const { peerContext, sendToUser } = await import('../../../../server/utils/ws-state')
beforeEach(() => {
  peerContext.clear()
  publish.mockReset()
})
it('delivers local chat immediately when Redis publication never finishes', async () => {
  const peer = { send: vi.fn() }
  peerContext.set(peer, { userId: 'user-1', scopes: null })
  publish.mockImplementation(() => new Promise(() => {}))
  let finished = false
  void sendToUser('user-1', { type: 'chat_message_upsert' }).then(() => {
    finished = true
  })
  await Promise.resolve()
  expect(peer.send).toHaveBeenCalledOnce()
  expect(finished).toBe(true)
})
it('handles failed publication without rejecting the local delivery', async () => {
  publish.mockRejectedValue(new Error('Redis unavailable'))
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
  await expect(sendToUser('user-1', { type: 'chat_turn_status' })).resolves.toBeUndefined()
  await Promise.resolve()
  log.mockRestore()
})
