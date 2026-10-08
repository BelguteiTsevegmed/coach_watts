import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { adaptTrainingPlanTask } from '../../../trigger/adapt-training-plan'
import { prisma } from '../../../server/utils/db'
import { dispatchTask } from '../../../server/utils/task-dispatcher'
import { executeRegisteredTask } from '../../../server/utils/task-registry'
import { runGenerateWeeklyPlan } from '../../../trigger/generate-weekly-plan'

vi.mock('../../../trigger/init', () => ({}))
vi.mock('@trigger.dev/sdk/v3', () => ({
  task: (definition: any) => definition,
  queue: (definition: any) => definition,
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('../../../server/utils/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    trainingPlan: { findUnique: vi.fn() },
    plannedWorkout: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    workout: { findMany: vi.fn() },
    trainingAvailability: { findMany: vi.fn() },
    trainingPlanAdaptation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    workoutStructureGenerationRun: { createMany: vi.fn(), update: vi.fn() },
    syncQueue: { createMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn()
  }
}))
vi.mock('../../../trigger/generate-weekly-plan', () => ({ runGenerateWeeklyPlan: vi.fn() }))
vi.mock('../../../server/utils/task-dispatcher', () => ({ dispatchTask: vi.fn() }))
vi.mock('../../../server/utils/task-run-events', () => ({ publishTaskRunStartedEvent: vi.fn() }))
vi.mock('../../../server/utils/queue', () => ({ mainTaskQueue: {} }))
vi.mock('../../../server/utils/intervals', () => ({
  isIntervalsEventId: (id: string) => /^\d+$/.test(id.trim())
}))

const payload = {
  planId: 'plan-1',
  userId: 'user-1',
  adaptationType: 'RECALCULATE_WEEK',
  requestId: 'request-1'
}
const week = {
  id: 'week-1',
  startDate: new Date('2026-10-05Z'),
  endDate: new Date('2026-10-11Z'),
  volumeTargetMinutes: 300,
  tssTarget: 250,
  focus: 'Aerobic',
  updatedAt: new Date('2026-10-01Z'),
  workouts: []
}
const plan = {
  id: 'plan-1',
  userId: 'user-1',
  status: 'ACTIVE',
  updatedAt: new Date('2026-10-01Z'),
  blocks: [{ id: 'block-1', startDate: week.startDate, durationWeeks: 4, weeks: [week] }]
}
const day = (date: string, durationMinutes = 60, workoutType = 'Ride') => ({
  date,
  durationMinutes,
  workoutType,
  targetTSS: workoutType === 'Rest' ? 0 : 40,
  title: workoutType,
  description: 'Aerobic session',
  reasoningText: 'Current week focus'
})
const validProposal = () => ({
  weekSummary: 'Aerobic',
  days: [day('2026-10-08'), day('2026-10-09', 0, 'Rest'), day('2026-10-10'), day('2026-10-11')]
})
const localWorkout = (
  id: string,
  date = '2026-10-08',
  overrides: Record<string, unknown> = {}
) => ({
  id,
  userId: 'user-1',
  trainingWeekId: 'week-1',
  date: new Date(`${date}T00:00:00Z`),
  title: id,
  externalId: `ai_gen_${id}`,
  type: 'Ride',
  durationSec: 3600,
  tss: 40,
  completed: false,
  completionStatus: 'PENDING',
  managedBy: 'COACH_WATTS',
  modifiedLocally: false,
  syncStatus: 'LOCAL_ONLY',
  updatedAt: new Date('2026-10-01Z'),
  ...overrides
})
let schedule: any[]
let receipts: Map<string, any>
let events: string[]
let txDelete: ReturnType<typeof vi.fn>
let txCreate: ReturnType<typeof vi.fn>
const run = (input = payload) =>
  (adaptTrainingPlanTask as any).run(input, { ctx: { run: { id: 'run-1' } } })

describe('safe weekly recalculation', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-07T12:00:00Z'))
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone: 'UTC' } as any)
    vi.mocked(prisma.trainingPlan.findUnique).mockResolvedValue(plan as any)
    schedule = [localWorkout('original')]
    receipts = new Map()
    events = []
    vi.mocked(prisma.plannedWorkout.findMany).mockImplementation(async ({ where }: any) =>
      where?.id?.in ? schedule.filter((w) => where.id.in.includes(w.id)) : (schedule as any)
    )
    vi.mocked(runGenerateWeeklyPlan).mockResolvedValue({
      success: true,
      proposal: validProposal()
    } as any)
    vi.mocked(dispatchTask).mockImplementation(async () => {
      events.push('dispatch')
      return { id: 'run-structure' }
    })
    ;(prisma as any).trainingPlanAdaptation.findUnique.mockImplementation(
      async ({ where }: any) => receipts.get(where.requestId) || null
    )
    ;(prisma as any).trainingPlanAdaptation.update.mockImplementation(
      async ({ where, data }: any) => {
        const next = { ...receipts.get(where.requestId), ...data }
        receipts.set(where.requestId, next)
        return next
      }
    )
    txDelete = vi.fn()
    txCreate = vi.fn()
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      let draft = [...schedule]
      let receipt: any
      txDelete.mockImplementation(async ({ where }: any) => {
        const previous = draft.length
        draft = draft.filter((w) => !where.id.in.includes(w.id))
        events.push('delete')
        return { count: previous - draft.length }
      })
      txCreate.mockImplementation(async ({ data }: any) => {
        draft.push(...data)
        events.push('create')
        return { count: data.length }
      })
      const tx = {
        ...prisma,
        plannedWorkout: { findMany: async () => draft, deleteMany: txDelete, createMany: txCreate },
        trainingPlanAdaptation: {
          findUnique: (prisma as any).trainingPlanAdaptation.findUnique,
          create: async ({ data }: any) => (receipt = { followUpsQueued: false, ...data })
        }
      }
      const result = await callback(tx)
      schedule = draft
      if (receipt) receipts.set(receipt.requestId, receipt)
      events.push('commit')
      return result
    })
    vi.mocked(prisma.workout.findMany).mockResolvedValue([])
    vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([])
  })
  afterEach(() => vi.useRealTimers())

  it('leaves the original schedule intact when generation fails', async () => {
    vi.mocked(runGenerateWeeklyPlan).mockRejectedValue(new Error('Generation unavailable'))
    await expect(run()).rejects.toThrow('Generation unavailable')
    expect(prisma.plannedWorkout.deleteMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('independently rejects a plan owned by another athlete', async () => {
    vi.mocked(prisma.trainingPlan.findUnique).mockResolvedValue({ ...plan, userId: 'other' } as any)
    expect(await run()).toMatchObject({
      success: false,
      outcome: 'failed',
      reason: 'PLAN_NOT_FOUND'
    })
    expect(prisma.plannedWorkout.deleteMany).not.toHaveBeenCalled()
    expect(runGenerateWeeklyPlan).not.toHaveBeenCalled()
  })

  it('replaces only eligible workouts atomically and dispatches design after commit', async () => {
    const result = await executeRegisteredTask('adapt-training-plan', payload, {
      runId: 'redis:adapt-1'
    })
    expect(result).toMatchObject({
      success: true,
      outcome: 'changed',
      createdCount: 4,
      removedCount: 1
    })
    expect(schedule.map((w) => w.title)).not.toContain('original')
    expect(schedule.map((w) => w.date.toISOString().slice(0, 10))).toEqual([
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11'
    ])
    expect(events.slice(0, 4)).toEqual(['delete', 'create', 'commit', 'dispatch'])
    expect(dispatchTask).toHaveBeenCalledTimes(3)
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 15000
    })
    const generated = vi.mocked(runGenerateWeeklyPlan).mock.calls[0]![0]
    expect(generated).toMatchObject({ proposalOnly: true, trainingWeekId: 'week-1' })
  })

  it('retries a committed request without generating or duplicating workouts', async () => {
    await run()
    const accepted = structuredClone(schedule)
    await run()
    expect(schedule).toEqual(accepted)
    expect(runGenerateWeeklyPlan).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(dispatchTask).toHaveBeenCalledTimes(3)
  })

  it('recalculates published Coach Watts sessions and queues remote cleanup only after commit', async () => {
    schedule[0] = localWorkout('published', '2026-10-08', {
      externalId: '123456',
      syncStatus: 'SYNCED',
      lastStructureEditSource: 'PUBLISH',
      lastStructurePublishedAt: new Date('2026-10-01Z')
    })
    expect(await run()).toMatchObject({
      outcome: 'changed',
      removedCount: 1,
      remoteCleanupCount: 1
    })
    expect((prisma as any).syncQueue.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          entityId: 'published',
          operation: 'DELETE',
          status: 'PENDING',
          structureRevision: null,
          payload: expect.objectContaining({ externalId: '123456' })
        })
      ]
    })
    expect(vi.mocked(dispatchTask).mock.calls[0]![0]).toBe('process-sync-queue')
    expect(events.indexOf('commit')).toBeLessThan(events.indexOf('dispatch'))
    await run()
    expect((prisma as any).syncQueue.createMany).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch a superseded design revision on retry', async () => {
    vi.mocked(dispatchTask).mockRejectedValueOnce(new Error('Queue unavailable'))
    await expect(run()).rejects.toThrow('Replacements were saved')
    schedule.forEach((w) => {
      w.generationRevision = 2
      w.managedBy = 'USER'
    })
    vi.mocked(dispatchTask).mockClear()
    await run()
    expect(dispatchTask).not.toHaveBeenCalled()
    expect(runGenerateWeeklyPlan).toHaveBeenCalledTimes(1)
  })

  it('runs through the real inline dispatcher with mocked generation', async () => {
    const dispatcher = await vi.importActual<
      typeof import('../../../server/utils/task-dispatcher')
    >('../../../server/utils/task-dispatcher')
    const handle = await dispatcher.dispatchTask('adapt-training-plan', payload)
    const record = await dispatcher.getTaskRun(handle.id)
    expect(record).toMatchObject({
      status: 'COMPLETED',
      output: { outcome: 'changed', success: true }
    })
    expect(schedule).toHaveLength(4)
  })

  it('rolls back deletion when replacement persistence fails', async () => {
    const original = structuredClone(schedule)
    vi.mocked(prisma.$transaction).mockImplementationOnce(async (callback: any) => {
      return callback({
        ...prisma,
        plannedWorkout: {
          findMany: async () => schedule,
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          createMany: vi.fn().mockRejectedValue(new Error('Database write failed'))
        }
      })
    })
    await expect(run()).rejects.toThrow('Database write failed')
    expect(schedule).toEqual(original)
    expect(receipts.size).toBe(0)
    expect(dispatchTask).not.toHaveBeenCalled()
  })

  it('rejects a proposal when a workout changes during generation', async () => {
    vi.mocked(runGenerateWeeklyPlan).mockImplementationOnce(async () => {
      schedule[0].title = 'Coach edit during generation'
      return { success: true, proposal: validProposal() } as any
    })
    expect(await run()).toMatchObject({ outcome: 'failed', reason: 'CONCURRENT_EDIT' })
    expect(schedule).toHaveLength(1)
    expect(schedule[0].title).toBe('Coach edit during generation')
    expect(txDelete).not.toHaveBeenCalled()
    expect(dispatchTask).not.toHaveBeenCalled()
  })

  it('rejects a proposal when availability changes during generation', async () => {
    vi.mocked(runGenerateWeeklyPlan).mockImplementationOnce(async () => {
      vi.mocked(prisma.trainingAvailability.findMany).mockResolvedValue([
        { id: 'new-availability' }
      ] as any)
      return { success: true, proposal: validProposal() } as any
    })
    expect(await run()).toMatchObject({ outcome: 'failed', reason: 'CONCURRENT_EDIT' })
    expect(txDelete).not.toHaveBeenCalled()
  })

  it.each([
    [],
    [day('2026-10-07')],
    [day('2026-10-12')],
    [day('2026-10-08'), day('2026-10-08')],
    [day('2026-10-08', 400), day('2026-10-09', 0, 'Rest'), day('2026-10-10'), day('2026-10-11')],
    [day('2026-10-08', -1)],
    [day('2026-02-30')]
  ])(
    'rejects invalid or incomplete proposals without modifying the schedule (%j)',
    async (days) => {
      vi.mocked(runGenerateWeeklyPlan).mockResolvedValue({
        success: true,
        proposal: { weekSummary: 'Invalid', days }
      } as any)
      expect(await run()).toMatchObject({ outcome: 'failed', reason: 'INVALID_PROPOSAL' })
      expect(prisma.$transaction).not.toHaveBeenCalled()
      expect(schedule[0].title).toBe('original')
    }
  )

  it('preserves past, today, completed, manual, coach-edited, anchored and external sessions', async () => {
    const protectedWorkouts = [
      localWorkout('past', '2026-10-06'),
      localWorkout('today', '2026-10-07'),
      localWorkout('completed', '2026-10-09', { completed: true }),
      localWorkout('manual', '2026-10-09', { managedBy: 'USER' }),
      localWorkout('coach', '2026-10-09', { lastStructureEditSource: 'USER' }),
      localWorkout('anchor', '2026-10-09'),
      localWorkout('external', '2026-10-09', {
        externalId: 'intervals-123',
        syncStatus: 'SYNCED',
        managedBy: 'USER'
      })
    ]
    // Keep the consumed weekly budget within the target for this preservation test.
    protectedWorkouts.forEach((w) => {
      w.durationSec = 600
      w.tss = 10
    })
    schedule.push(...protectedWorkouts)
    vi.mocked(runGenerateWeeklyPlan).mockResolvedValue({
      success: true,
      proposal: {
        weekSummary: 'Aerobic',
        days: [day('2026-10-08'), day('2026-10-10'), day('2026-10-11')]
      }
    } as any)
    expect(await run({ ...payload, anchorWorkoutIds: ['anchor'] } as any)).toMatchObject({
      outcome: 'changed'
    })
    for (const original of protectedWorkouts)
      expect(schedule.find((w) => w.id === original.id)).toEqual(original)
    expect(vi.mocked(runGenerateWeeklyPlan).mock.calls[0]![0].anchorWorkoutIds).toEqual(
      protectedWorkouts.map((w) => w.id)
    )
  })

  it('accounts for actual completed load once, rather than its linked planned estimate', async () => {
    schedule.push(
      localWorkout('completed-plan', '2026-10-06', { completed: true, durationSec: 3000, tss: 20 })
    )
    vi.mocked(prisma.workout.findMany).mockResolvedValue([
      {
        id: 'completed-actual',
        plannedWorkoutId: 'completed-plan',
        date: new Date('2026-10-06T12:00Z'),
        durationSec: 6000,
        tss: 70
      }
    ] as any)
    await run()
    expect(vi.mocked(runGenerateWeeklyPlan).mock.calls[0]![0].replacementContext).toMatchObject({
      committedMinutes: 100,
      committedTSS: 70,
      remainingVolumeMinutes: 200,
      remainingTSS: 180
    })
  })

  it.each([
    ['Pacific/Kiritimati', '2026-10-08', '2026-10-09'],
    ['America/Los_Angeles', '2026-10-07', '2026-10-08']
  ])('uses the athlete calendar date in %s', async (timezone, today, boundary) => {
    vi.setSystemTime(new Date('2026-10-08T00:30:00Z'))
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ timezone } as any)
    schedule = [localWorkout('today', today, { durationSec: 600, tss: 10 })]
    const days =
      today === '2026-10-08'
        ? [day('2026-10-09'), day('2026-10-10'), day('2026-10-11')]
        : validProposal().days
    vi.mocked(runGenerateWeeklyPlan).mockResolvedValue({
      success: true,
      proposal: { weekSummary: 'Aerobic', days }
    } as any)
    expect(await run()).toMatchObject({ outcome: 'changed' })
    expect(vi.mocked(runGenerateWeeklyPlan).mock.calls[0]![0].replacementContext?.boundary).toBe(
      boundary
    )
    expect(schedule.find((w) => w.id === 'today')).toBeDefined()
  })

  it('returns unchanged when no active week exists', async () => {
    vi.mocked(prisma.trainingPlan.findUnique).mockResolvedValue({ ...plan, blocks: [] } as any)
    expect(await run()).toMatchObject({ outcome: 'unchanged', reason: 'NO_ACTIVE_WEEK' })
    expect(runGenerateWeeklyPlan).not.toHaveBeenCalled()
  })

  it('returns unchanged on the last local day of the week', async () => {
    vi.setSystemTime(new Date('2026-10-11T12:00Z'))
    expect(await run()).toMatchObject({ outcome: 'unchanged', reason: 'NO_ELIGIBLE_DAYS' })
    expect(runGenerateWeeklyPlan).not.toHaveBeenCalled()
  })

  it('resumes follow-up dispatch after failure without replacing the accepted schedule again', async () => {
    vi.mocked(dispatchTask).mockRejectedValueOnce(new Error('Queue unavailable'))
    await expect(run()).rejects.toThrow('Replacements were saved')
    const accepted = structuredClone(schedule)
    expect(receipts.get(payload.requestId).followUpError).toBe('Queue unavailable')
    await run()
    expect(schedule).toEqual(accepted)
    expect(runGenerateWeeklyPlan).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(receipts.get(payload.requestId).followUpsQueued).toBe(true)
  })

  it('returns an explicit outcome for unsupported operations', async () => {
    expect(await run({ ...payload, adaptationType: 'UNKNOWN' })).toMatchObject({
      success: false,
      outcome: 'failed',
      reason: 'UNSUPPORTED_ADAPTATION'
    })
    expect(runGenerateWeeklyPlan).not.toHaveBeenCalled()
  })
})

vi.mock('../../../server/utils/training-prescription/service', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  ...(await import('../helpers/prescription-boundary-double')).prescriptionBoundaryDouble
}))
