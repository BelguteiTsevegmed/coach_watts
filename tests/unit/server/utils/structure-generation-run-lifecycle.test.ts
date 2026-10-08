import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getCurrentTaskExecution } from '../../../../server/utils/task-registry'

import {
  finishStructureGenerationTask,
  startStructureGenerationTask,
  failStructureGenerationTaskFromPayload
} from '../../../../server/utils/structure-generation-run-lifecycle'
import {
  isStructureGenerationRunCurrent,
  markStructureGenerationRunCompleted,
  markStructureGenerationRunFailed,
  markStructureGenerationRunRunning,
  markStructureGenerationRunStale
} from '../../../../server/utils/structure-generation-run'

vi.mock('../../../../server/utils/structure-generation-run', () => ({
  isStructureGenerationRunCurrent: vi.fn(),
  markStructureGenerationRunCompleted: vi.fn(),
  markStructureGenerationRunFailed: vi.fn(),
  markStructureGenerationRunRunning: vi.fn(),
  markStructureGenerationRunStale: vi.fn()
}))

vi.mock('../../../../server/utils/task-registry', () => ({
  getCurrentTaskExecution: vi.fn()
}))

describe('structure generation run lifecycle', () => {
  const payload = { generationRunId: 'run-1', generationRevision: 2 }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getCurrentTaskExecution).mockReturnValue(undefined)
  })

  it('keeps the lifecycle active when the Redis worker will retry the failed attempt', async () => {
    vi.mocked(getCurrentTaskExecution).mockReturnValue({
      taskId: 'generate-structured-workout',
      attemptNumber: 1,
      maxAttempts: 3
    })
    await failStructureGenerationTaskFromPayload(payload, new Error('Temporary timeout'))
    expect(markStructureGenerationRunFailed).not.toHaveBeenCalled()
  })

  it('records the failure when the Redis worker has exhausted its attempts', async () => {
    vi.mocked(getCurrentTaskExecution).mockReturnValue({
      taskId: 'generate-structured-workout',
      attemptNumber: 3,
      maxAttempts: 3
    })
    await failStructureGenerationTaskFromPayload(payload, new Error('Generation failed'))
    expect(markStructureGenerationRunFailed).toHaveBeenCalledWith('run-1', 'Generation failed')
  })

  it('marks stale when the run revision is no longer current', async () => {
    vi.mocked(isStructureGenerationRunCurrent).mockResolvedValue(false)

    const result = await startStructureGenerationTask(payload, 'trigger-1')

    expect(result).toEqual({ stale: true })
    expect(markStructureGenerationRunStale).toHaveBeenCalledWith('run-1')
    expect(markStructureGenerationRunRunning).not.toHaveBeenCalled()
  })

  it('marks running when the run revision is current', async () => {
    vi.mocked(isStructureGenerationRunCurrent).mockResolvedValue(true)

    const result = await startStructureGenerationTask(payload, 'trigger-1')

    expect(result).toEqual({ stale: false })
    expect(markStructureGenerationRunRunning).toHaveBeenCalledWith('run-1', 'trigger-1')
  })

  it('terminates skipped quota outcomes as failed runs', async () => {
    await finishStructureGenerationTask(payload, {
      success: false,
      skipped: true,
      reason: 'QUOTA_EXCEEDED'
    })

    expect(markStructureGenerationRunFailed).toHaveBeenCalledWith('run-1', 'QUOTA_EXCEEDED')
  })

  it('terminates free-tier skips with the user-facing message', async () => {
    await finishStructureGenerationTask(payload, {
      success: false,
      skipped: true,
      reason: 'FREE_TIER_LIMIT',
      message: 'Structured workout generation is limited to 4 weeks in advance for free users.'
    })

    expect(markStructureGenerationRunFailed).toHaveBeenCalledWith(
      'run-1',
      'Structured workout generation is limited to 4 weeks in advance for free users.'
    )
  })

  it('terminates missing-workout outcomes as failed runs', async () => {
    await finishStructureGenerationTask(payload, {
      success: false,
      error: 'Workout not found'
    })

    expect(markStructureGenerationRunFailed).toHaveBeenCalledWith('run-1', 'Workout not found')
  })

  it('marks completed on success', async () => {
    await finishStructureGenerationTask(payload, { success: true })

    expect(markStructureGenerationRunCompleted).toHaveBeenCalledWith('run-1')
  })

  it('marks stale on stale write outcomes', async () => {
    await finishStructureGenerationTask(payload, { stale: true })

    expect(markStructureGenerationRunStale).toHaveBeenCalledWith('run-1')
  })

  it('marks failed from thrown task errors', async () => {
    await failStructureGenerationTaskFromPayload(
      payload,
      new Error('Adjusted workout contains unresolved target units')
    )

    expect(markStructureGenerationRunFailed).toHaveBeenCalledWith(
      'run-1',
      'Adjusted workout contains unresolved target units'
    )
  })

  it('no-ops when no generation run id is present', async () => {
    await finishStructureGenerationTask({}, { success: true })
    await failStructureGenerationTaskFromPayload({}, new Error('boom'))

    expect(markStructureGenerationRunCompleted).not.toHaveBeenCalled()
    expect(markStructureGenerationRunFailed).not.toHaveBeenCalled()
  })
})
