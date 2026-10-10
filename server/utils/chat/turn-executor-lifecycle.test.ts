import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  summary: vi.fn(),
  extract: vi.fn(),
  save: vi.fn(),
  updateStatus: vi.fn(),
  updateDraft: vi.fn(),
  send: vi.fn(),
  mutation: vi.fn(),
  updateUsage: vi.fn(),
  turn: {
    id: 'turn-1',
    userId: 'user-1',
    roomId: 'room-1',
    runId: 'run-1',
    lineageId: 'lineage-1',
    userMessageId: 'message-1',
    assistantMessageId: null,
    room: { deletedAt: null, metadata: {}, name: 'New Chat', _count: { messages: 1 } }
  },
  draft: { id: 'draft-1', content: ' ', createdAt: new Date(), metadata: {} }
}))
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  streamText: mocks.stream
}))
vi.mock('../db', () => ({
  prisma: {
    chatTurn: {
      findUnique: vi.fn(() => mocks.turn),
      updateMany: vi.fn(async () => ({ count: 0 }))
    },
    llmUsage: { create: vi.fn(async () => ({})), update: mocks.updateUsage }
  }
}))
vi.mock('../quotas/engine', () => ({ checkQuota: vi.fn() }))
vi.mock('../services/chatContextService', () => ({
  buildAthleteContext: vi.fn(async () => ({ systemInstruction: 'Coach' }))
}))
vi.mock('../date', () => ({ getUserTimezone: vi.fn(async () => 'UTC') }))
vi.mock('../ai-user-settings', () => ({
  getUserAiSettings: vi.fn(async () => ({ aiMemoryEnabled: true }))
}))
vi.mock('../ai-operation-settings', () => ({
  getLlmOperationSettings: vi.fn(async () => ({
    modelId: 'gemini-test',
    model: 'flash',
    maxSteps: 4
  }))
}))
vi.mock('../ai-tools', () => ({
  getToolsWithContext: () => ({ update_planned_workout: { execute: mocks.mutation } })
}))
vi.mock('../ai-history', () => ({ transformHistoryToCoreMessages: vi.fn(async () => []) }))
vi.mock('./skills', () => ({
  classifyChatSkills: vi.fn(async () => ({ skillIds: [], useTools: true, extractMemories: true })),
  expandSkillSelectionForRequest: (value: any) => value,
  selectToolsForSkills: (tools: any) => tools,
  resolveApprovalToolNamesForSelection: vi.fn(async () => []),
  composeSkillInstructions: (value: any) => value
}))
vi.mock('../services/userMemoryService', () => ({
  userMemoryService: {
    composePromptMemoryBlock: vi.fn(async () => ({})),
    listMemories: vi.fn(async () => []),
    saveMemoryCandidates: mocks.save
  }
}))
vi.mock('./memory-extraction', () => ({ extractMemoryCandidatesFromConversation: mocks.extract }))
vi.mock('../task-dispatcher', () => ({ dispatchTask: mocks.summary }))
vi.mock('../ws-state', () => ({ sendToUser: mocks.send }))
vi.mock('../services/chatTurnService', () => ({
  chatTurnService: {
    getRequestSnapshot: () => ({ content: 'I prefer mornings', messages: [] }),
    mergeTurnMetadata: (_turn: any, metadata: any) => metadata,
    tryStartExecution: vi.fn(async () => mocks.turn),
    recordEvent: vi.fn(async () => ({})),
    heartbeatWithTelemetry: vi.fn(async () => ({ count: 1 })),
    heartbeat: vi.fn(async () => ({ count: 1 })),
    startLlmUsage: vi.fn(async () => ({ id: 'usage-1' })),
    createAssistantDraft: vi.fn(async () => mocks.draft),
    updateStatusIfOwned: mocks.updateStatus,
    updateAssistantDraft: mocks.updateDraft
  }
}))
const { executeChatTurn } = await import('./turn-executor')

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mocks.updateStatus.mockResolvedValue({ count: 1 })
  mocks.updateDraft.mockImplementation(async (params) => ({ ...mocks.draft, ...params }))
  mocks.send.mockResolvedValue(undefined)
  mocks.updateUsage.mockResolvedValue({})
  mocks.save.mockResolvedValue([])
  mocks.summary.mockResolvedValue({})
  mocks.extract.mockResolvedValue({ candidates: [] })
})
afterEach(() => vi.useRealTimers())

describe('chat turn lifecycle', () => {
  it('releases a timed-out turn when failure accounting never resolves', async () => {
    mocks.updateUsage.mockImplementation(() => new Promise(() => {}))
    mocks.stream.mockImplementation(() => ({ consumeStream: () => new Promise(() => {}) }))
    let settled = false
    const execution = executeChatTurn('turn-1', 'run-1').catch(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(60_001)
    expect(settled).toBe(true)
    await execution
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(15_001)
    errorLog.mockRestore()
  })

  it('does not publish completion when an already-entered completion callback resumes after timeout', async () => {
    let finishCompletion!: (value: any) => void
    mocks.updateStatus.mockImplementation(async (_id, _run, status) => {
      if (status === 'COMPLETED')
        return new Promise((resolve) => {
          finishCompletion = resolve
        })
      return { count: 1 }
    })
    mocks.stream.mockImplementation((options) => ({
      consumeStream: async () =>
        options.onEnd({ text: 'Keep today easy.', usage: {}, toolCalls: [], toolResults: [] })
    }))
    const execution = executeChatTurn('turn-1', 'run-1')
    const rejected = expect(execution).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(60_001)
    await rejected
    mocks.send.mockClear()
    finishCompletion({ count: 1 })
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.send).not.toHaveBeenCalled()
    expect(mocks.summary).not.toHaveBeenCalled()
    expect(mocks.extract).not.toHaveBeenCalled()
  })

  it('releases a completed response even if the provider never closes its stream', async () => {
    let callbacks: any
    mocks.stream.mockImplementation((options) => {
      callbacks = options
      return {
        consumeStream: async () => {
          await options.onEnd({
            text: 'Keep today easy.',
            usage: {},
            toolCalls: [],
            toolResults: []
          })
          await new Promise(() => {})
        }
      }
    })
    await expect(executeChatTurn('turn-1', 'run-1')).resolves.toMatchObject({ success: true })
    await expect(
      callbacks.onChunk({ chunk: { type: 'text-delta', text: 'Late' } })
    ).rejects.toThrow()
    expect(() => callbacks.tools.update_planned_workout.execute({})).toThrow()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })
  it('releases a completed turn even when usage accounting stalls', async () => {
    mocks.updateUsage.mockImplementation(() => new Promise(() => {}))
    mocks.stream.mockImplementation((options) => ({
      consumeStream: async () =>
        options.onEnd({ text: 'Keep today easy.', usage: {}, toolCalls: [], toolResults: [] })
    }))
    await expect(executeChatTurn('turn-1', 'run-1')).resolves.toMatchObject({ success: true })
    expect(mocks.updateUsage).toHaveBeenCalled()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(15_001)
    expect(mocks.updateStatus).not.toHaveBeenCalledWith(
      'turn-1',
      'run-1',
      'FAILED',
      expect.anything()
    )
    errorLog.mockRestore()
  })
  it('releases the turn while optional summary dispatch and memory extraction are stalled', async () => {
    let finishExtraction!: (value: any) => void
    mocks.summary.mockImplementation(() => new Promise(() => {}))
    mocks.extract.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishExtraction = resolve
        })
    )
    mocks.stream.mockImplementation((options) => ({
      consumeStream: async () =>
        options.onEnd({
          text: 'I will keep that in mind.',
          usage: {},
          toolCalls: [],
          toolResults: []
        })
    }))
    await expect(executeChatTurn('turn-1', 'run-1')).resolves.toMatchObject({ success: true })
    expect(mocks.summary).toHaveBeenCalled()
    expect(mocks.extract).toHaveBeenCalled()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    await vi.advanceTimersByTimeAsync(15_001)
    finishExtraction({ candidates: [{ content: 'Prefers mornings' }] })
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(mocks.updateStatus).not.toHaveBeenCalledWith(
      'turn-1',
      'run-1',
      'FAILED',
      expect.anything()
    )
    errorLog.mockRestore()
  })

  it('releases a stuck provider and rejects late stream callbacks and mutations', async () => {
    let options: any
    mocks.stream.mockImplementation((input) => {
      options = input
      return { consumeStream: () => new Promise(() => {}) }
    })
    const execution = executeChatTurn('turn-1', 'run-1')
    const rejected = expect(execution).rejects.toThrow(/60 seconds/)
    await vi.advanceTimersByTimeAsync(60_001)
    await rejected
    const writes = mocks.updateDraft.mock.calls.length
    await expect(
      options.onChunk({ chunk: { type: 'text-delta', text: 'Too late' } })
    ).rejects.toThrow()
    await expect(options.onEnd({ text: 'Too late', usage: {} })).rejects.toThrow()
    expect(() => options.tools.update_planned_workout.execute({})).toThrow()
    expect(mocks.mutation).not.toHaveBeenCalled()
    expect(mocks.updateDraft).toHaveBeenCalledTimes(writes)
  })
})
