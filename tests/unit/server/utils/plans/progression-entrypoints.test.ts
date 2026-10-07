import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ plan: null as any, id: 0 }))
vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('getRouterParam', (event: any, key: string) => event.params?.[key])
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('createError', (value: any) => Object.assign(new Error(value.message), value))
vi.mock('../../../../../server/utils/auth-guard', () => ({
  requireAuth: async () => ({ id: 'athlete' })
}))
vi.mock('../../../../../server/utils/date', () => ({
  getUserTimezone: async () => 'UTC',
  getUserLocalDate: (_tz: string, date: Date) => date
}))
vi.mock('../../../../../server/utils/gemini', () => ({
  generateStructuredAnalysis: async () => ({
    rationale: 'Base',
    blocks: [{ name: 'Base', type: 'BASE', focus: 'AEROBIC_ENDURANCE', durationWeeks: 4 }]
  })
}))
vi.mock('../../../../../server/utils/plan-logic', () => ({ shiftPlanDates: async () => {} }))
vi.mock('../../../../../server/utils/db', () => {
  const prisma: any = {
    goal: {
      findUnique: async () => ({
        id: 'goal',
        userId: 'athlete',
        title: '5k',
        targetDate: new Date('2026-11-04Z'),
        events: []
      })
    },
    user: { findUnique: async () => ({ id: 'athlete' }) },
    workout: {
      findMany: async () =>
        [2, 9, 16, 23].map((days) => ({
          id: `run-${days}`,
          type: 'Run',
          isDuplicate: false,
          durationSec: 3600,
          date: new Date(Date.now() - days * 86400000)
        }))
    },
    trainingAvailability: { findMany: async () => [] },
    plannedWorkout: { deleteMany: async () => ({ count: 0 }) },
    trainingPlan: {
      findMany: async () => [],
      findFirst: async () =>
        state.plan
          ? {
              ...state.plan,
              blocks: [...state.plan.blocks].sort((a: any, b: any) => a.order - b.order)
            }
          : null,
      create: async ({ data }: any) => {
        state.plan = {
          ...data,
          id: 'plan',
          blocks: data.blocks.create.map((block: any) => ({
            ...block,
            id: `block-${++state.id}`,
            trainingPlanId: 'plan',
            weeks: block.weeks.create.map((week: any) => ({ ...week, id: `week-${++state.id}` }))
          }))
        }
        return state.plan
      },
      update: async ({ data }: any) => Object.assign(state.plan, data)
    },
    trainingBlock: {
      findMany: async () => [...state.plan.blocks].sort((a: any, b: any) => a.order - b.order),
      updateMany: async ({ where, data }: any) => {
        for (const block of state.plan.blocks) {
          if (where.id && block.id !== where.id) continue
          if (where.order?.gt !== undefined && block.order <= where.order.gt) continue
          if (where.order?.gte !== undefined && block.order < where.order.gte) continue
          if (typeof data.order === 'number') block.order = data.order
          else if (data.order?.decrement) block.order -= data.order.decrement
          else if (data.order?.increment) block.order += data.order.increment
        }
        return { count: 1 }
      },
      delete: async ({ where }: any) => {
        state.plan.blocks = state.plan.blocks.filter((b: any) => b.id !== where.id)
      },
      findUnique: async ({ where }: any) => ({
        ...state.plan.blocks.find((b: any) => b.id === where.id),
        plan: state.plan
      }),
      create: async ({ data }: any) => {
        const block = { ...data, id: `block-${++state.id}`, weeks: [] }
        state.plan.blocks.push(block)
        return block
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          state.plan.blocks.find((b: any) => b.id === where.id),
          Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))
        )
    },
    trainingWeek: {
      create: async ({ data }: any) => {
        const week = { ...data, id: `week-${++state.id}` }
        state.plan.blocks.find((b: any) => b.id === data.blockId).weeks.push(week)
        return week
      },
      update: async ({ where, data }: any) =>
        Object.assign(
          state.plan.blocks.flatMap((b: any) => b.weeks).find((w: any) => w.id === where.id),
          data
        )
    },
    $executeRawUnsafe: async () => 0
  }
  prisma.$transaction = async (fn: any) => fn(prisma)
  return { prisma }
})

const initialize = async () => {
  const handler = (await import('../../../../../server/api/plans/initialize.post')).default
  await handler({
    body: {
      goalId: 'goal',
      startDate: '2026-10-07T00:00:00.000Z',
      volumeHours: 7.5,
      preferredActivityTypes: ['Run'],
      historyCompleteness: 'COMPLETE'
    }
  } as any)
}

beforeEach(() => {
  state.plan = null
  state.id = 0
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-07T00:00:00Z'))
})
afterEach(() => vi.useRealTimers())

describe('plan entrypoints preserve captured progression', () => {
  it('initializes and persists the requested volume, running provenance and reduced targets', async () => {
    await initialize()
    expect(state.plan.progressionContext).toMatchObject({
      requestedVolumeMinutes: 450,
      history: { completeness: 'COMPLETE' },
      sports: { run: { recentWeeklyAvgMinutes: 60 } }
    })
    expect(state.plan.blocks[0].weeks.map((w: any) => w.volumeTargetMinutes)).toEqual([
      72, 79, 87, 52
    ])
  })
  it.each(['replan', 'add', 'extend'])(
    '%s uses the same loading ordinal and saved baseline instead of a default or reduced-week maximum',
    async (operation) => {
      await initialize()
      const originalContext = structuredClone(state.plan.progressionContext)
      const firstBlock = state.plan.blocks[0]
      if (operation === 'replan') {
        const { planService } = await import('../../../../../server/utils/services/planService')
        await planService.replanStructure('athlete', 'plan', [
          { ...firstBlock, durationWeeks: 5, recoveryWeekIndex: 4 }
        ])
      } else if (operation === 'add') {
        const handler = (await import('../../../../../server/api/plans/[id]/blocks/index.post'))
          .default
        await handler({
          params: { id: 'plan' },
          body: {
            name: 'More base',
            type: 'BASE',
            primaryFocus: 'AEROBIC_ENDURANCE',
            durationWeeks: 1
          }
        } as any)
      } else {
        const handler = (
          await import('../../../../../server/api/plans/[id]/blocks/[blockId].patch')
        ).default
        await handler({
          params: { id: 'plan', blockId: firstBlock.id },
          body: { durationWeeks: 5 }
        } as any)
      }
      const weeks = state.plan.blocks.flatMap((b: any) => b.weeks)
      expect(weeks.map((w: any) => w.volumeTargetMinutes)).toEqual([72, 79, 87, 52, 95])
      expect(weeks[4].sportVolumeTargets).toEqual({ run: 95 })
      expect(state.plan.progressionContext).toEqual(originalContext)
    }
  )
})

it.each(['reorder', 'delete'])(
  '%s recalculates a later block against its new loading ordinal',
  async (operation) => {
    await initialize()
    const first = state.plan.blocks[0]
    const add = (await import('../../../../../server/api/plans/[id]/blocks/index.post')).default
    await add({
      params: { id: 'plan' },
      body: { name: 'Later', type: 'BASE', primaryFocus: 'AEROBIC_ENDURANCE', durationWeeks: 1 }
    } as any)
    const later = state.plan.blocks[1]
    expect(later.weeks[0].sportVolumeTargets).toEqual({ run: 95 })
    if (operation === 'delete') {
      const handler = (await import('../../../../../server/api/plans/[id]/blocks/[blockId].delete'))
        .default
      await handler({ params: { id: 'plan', blockId: first.id } } as any)
    } else {
      const handler = (await import('../../../../../server/api/plans/[id]/blocks/reorder.put'))
        .default
      await handler({
        params: { id: 'plan' },
        body: {
          blocks: [
            { id: later.id, order: 1 },
            { id: first.id, order: 2 }
          ]
        }
      } as any)
    }
    expect(later.weeks[0].sportVolumeTargets).toEqual({ run: 72 })
  }
)
