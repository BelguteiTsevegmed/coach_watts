import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requireAuth } from '../../../../../server/utils/auth-guard'
import { trainingPlanRepository } from '../../../../../server/utils/repositories/trainingPlanRepository'
import { dispatchTask } from '../../../../../server/utils/task-dispatcher'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('createError', (options: any) => Object.assign(new Error(options.message), options))
vi.mock('../../../../../server/utils/auth-guard', () => ({ requireAuth: vi.fn() }))
vi.mock('../../../../../server/utils/repositories/trainingPlanRepository', () => ({
  trainingPlanRepository: { getById: vi.fn() }
}))
vi.mock('../../../../../server/utils/task-dispatcher', () => ({ dispatchTask: vi.fn() }))
vi.mock('../../../../../server/utils/task-run-events', () => ({
  publishTaskRunStartedEvent: vi.fn()
}))
const handler = async (body: unknown) =>
  (await import('../../../../../server/api/plans/adapt.post')).default({ body } as any)

describe('POST /api/plans/adapt', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1' } as any)
    vi.mocked(trainingPlanRepository.getById).mockResolvedValue({ id: 'plan-1' } as any)
    vi.mocked(dispatchTask).mockResolvedValue({ id: 'run-1' })
  })

  it.each([
    null,
    {},
    { planId: 'plan-1', adaptationType: 'DELETE_ALL' },
    { planId: 123, adaptationType: 'RECALCULATE_WEEK' }
  ])('rejects invalid or unsupported operations before dispatch (%j)', async (body) => {
    await expect(handler(body)).rejects.toMatchObject({ statusCode: 400 })
    expect(dispatchTask).not.toHaveBeenCalled()
  })

  it('rejects foreign plans', async () => {
    vi.mocked(trainingPlanRepository.getById).mockResolvedValue(null)
    await expect(
      handler({ planId: 'foreign', adaptationType: 'RECALCULATE_WEEK' })
    ).rejects.toMatchObject({ statusCode: 404 })
    expect(trainingPlanRepository.getById).toHaveBeenCalledWith('foreign', 'user-1')
    expect(dispatchTask).not.toHaveBeenCalled()
  })

  it('dispatches the authenticated athlete with a stable request key and plan tag', async () => {
    expect(
      await handler({
        planId: 'plan-1',
        adaptationType: 'RECALCULATE_WEEK',
        requestId: 'request-1',
        userId: 'foreign'
      })
    ).toMatchObject({ success: true, jobId: 'run-1', requestId: 'request-1' })
    expect(dispatchTask).toHaveBeenCalledWith(
      'adapt-training-plan',
      expect.objectContaining({
        userId: 'user-1',
        planId: 'plan-1',
        requestId: 'request-1',
        anchorWorkoutIds: []
      }),
      expect.objectContaining({
        idempotencyKey: 'adapt_request-1',
        tags: ['user:user-1', 'plan:plan-1']
      })
    )
  })
})
