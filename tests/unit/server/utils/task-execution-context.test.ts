import { expect, it } from 'vitest'
import {
  executeRegisteredTask,
  getCurrentTaskExecution,
  registerTaskHandler
} from '../../../../server/utils/task-registry'

it('makes retry limits available to lifecycle hooks during Redis task execution', async () => {
  registerTaskHandler('retry-context-regression', async () => getCurrentTaskExecution())
  const result = await executeRegisteredTask(
    'retry-context-regression',
    {},
    {
      runId: 'redis:job-1',
      attemptNumber: 2,
      maxAttempts: 3
    }
  )
  expect(result).toMatchObject({ runId: 'redis:job-1', attemptNumber: 2, maxAttempts: 3 })
  expect(getCurrentTaskExecution()).toBeUndefined()
})
