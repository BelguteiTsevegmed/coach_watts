import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { shouldHideAssistantBubble } from '../../../app/utils/chat-message-state'

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  send: vi.fn(),
  turn: {
    id: 'turn-1',
    roomId: 'room-1',
    userId: 'user-1',
    runId: 'run-1',
    userMessageId: 'user-message-1',
    assistantMessageId: null,
    room: { deletedAt: null, metadata: {}, name: 'New Chat', _count: { messages: 1 } }
  },
  draft: {
    id: 'draft-1',
    content: ' ',
    createdAt: new Date(),
    metadata: { isDraft: true, hideUntilContent: true }
  },
  updateTurn: vi.fn(),
  updateDraft: vi.fn(),
  updateUsage: vi.fn(),
  event: vi.fn()
}))

vi.mock('../db', () => ({
  prisma: {
    chatTurn: { findUnique: vi.fn(() => mocks.turn), updateMany: mocks.updateTurn },
    llmUsage: { updateMany: mocks.updateUsage }
  }
}))
vi.mock('../services/chatContextService', () => ({ buildAthleteContext: mocks.context }))
vi.mock('../quotas/engine', () => ({ checkQuota: vi.fn() }))
vi.mock('../ws-state', () => ({ sendToUser: mocks.send }))
vi.mock('../services/chatTurnService', () => ({
  chatTurnService: {
    getRequestSnapshot: () => ({ content: 'Discuss my planned workout', messages: [] }),
    mergeTurnMetadata: (_turn: any, metadata: any) => metadata,
    tryStartExecution: vi.fn(() => mocks.turn),
    recordEvent: mocks.event,
    heartbeatWithTelemetry: vi.fn(async () => ({ count: 1 })),
    startLlmUsage: vi.fn(() => ({ id: 'usage-1' })),
    createAssistantDraft: vi.fn(() => mocks.draft),
    updateAssistantDraft: mocks.updateDraft
  }
}))

const { executeChatTurn } = await import('./turn-executor')

describe('chat preparation failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.updateTurn.mockResolvedValue({ count: 1 })
    mocks.updateDraft.mockImplementation(async (params) => ({ ...mocks.draft, ...params }))
    mocks.updateUsage.mockResolvedValue({ count: 1 })
    mocks.event.mockResolvedValue({})
    mocks.send.mockResolvedValue(undefined)
  })
  afterEach(() => vi.useRealTimers())

  it('persists and broadcasts a visible retry message when preparation fails', async () => {
    mocks.context.mockRejectedValueOnce(new Error('Context unavailable'))
    await expect(executeChatTurn('turn-1', 'run-1')).rejects.toThrow('Context unavailable')
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: 'draft-1',
        content: expect.stringMatching(/retry/i),
        metadata: expect.objectContaining({
          isDraft: false,
          turnStatus: 'FAILED',
          hideUntilContent: false
        })
      })
    )
    const upsert = mocks.send.mock.calls
      .map((call) => call[1])
      .find((event) => event.type === 'chat_message_upsert')
    expect(
      upsert?.message.parts.some((part: any) => part.type === 'text' && part.text.trim())
    ).toBe(true)
    expect(shouldHideAssistantBubble(upsert.message)).toBe(false)
    expect(mocks.updateUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ success: false, errorType: 'FAILED' })
      })
    )
    expect(mocks.event).toHaveBeenCalledWith(
      'turn-1',
      'turn_failed',
      expect.objectContaining({ phase: 'building_context' })
    )
  })

  it('records timeout telemetry when preparation finishes after the turn deadline', async () => {
    vi.useFakeTimers()
    let finishContext!: (value: any) => void
    mocks.context.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishContext = resolve
        })
    )
    const execution = executeChatTurn('turn-1', 'run-1')
    const rejected = expect(execution).rejects.toThrow(/response.*60 seconds/i)
    await vi.advanceTimersByTimeAsync(60_000)
    finishContext({ systemInstruction: 'Coach' })
    await rejected
    expect(mocks.updateTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          metadata: expect.objectContaining({
            timeoutReason: 'first_output_timeout',
            executionPhase: 'building_context'
          })
        })
      })
    )
    expect(mocks.updateDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ timeoutReason: 'first_output_timeout', isDraft: false })
      })
    )
    expect(mocks.updateUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ errorType: 'FIRST_OUTPUT_TIMEOUT' })
      })
    )
  })

  it('does not publish a failure after another runner takes ownership', async () => {
    mocks.context.mockRejectedValueOnce(new Error('Context unavailable'))
    mocks.updateTurn.mockResolvedValueOnce({ count: 0 })
    await expect(executeChatTurn('turn-1', 'run-1')).rejects.toThrow('Context unavailable')
    expect(mocks.updateDraft).not.toHaveBeenCalled()
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.updateUsage).not.toHaveBeenCalled()
  })
})
