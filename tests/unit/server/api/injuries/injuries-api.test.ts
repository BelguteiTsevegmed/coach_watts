import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requireAuth } from '../../../../../server/utils/auth-guard'
import { prisma } from '../../../../../server/utils/db'

vi.stubGlobal('defineEventHandler', (fn: any) => fn)
vi.stubGlobal('defineRouteMeta', () => {})
vi.stubGlobal('readBody', async (event: any) => event.body)
vi.stubGlobal('getQuery', (event: any) => event.query || {})
vi.stubGlobal('getRouterParam', (event: any, name: string) => event.context?.params?.[name])
vi.stubGlobal('createError', (err: any) => {
  const error = new Error(err.message)
  ;(error as any).statusCode = err.statusCode
  return error
})

vi.mock('../../../../../server/utils/auth-guard', () => ({
  requireAuth: vi.fn()
}))

vi.mock('../../../../../server/utils/db', () => ({
  prisma: {
    injury: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
  }
}))

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'inj-1',
  userId: 'user-1',
  bodyArea: 'achilles',
  side: 'LEFT',
  title: 'Achilles tightness',
  description: null,
  painLevel: 4,
  status: 'ACTIVE',
  onsetDate: new Date('2026-09-28T00:00:00.000Z'),
  resolvedAt: null,
  affectedSports: ['run'],
  notes: null,
  createdAt: new Date('2026-09-28T08:00:00.000Z'),
  updatedAt: new Date('2026-09-28T08:00:00.000Z'),
  ...overrides
})

const load = async (path: string) =>
  (await import(`../../../../../server/api/injuries/${path}`)).default

describe('/api/injuries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ id: 'user-1', timezone: 'UTC' } as any)
  })

  it('GET returns active injuries as { injuries } with ISO dates, sorted by status', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([
      row({ id: 'b', status: 'RECOVERING', onsetDate: new Date('2026-09-30T00:00:00.000Z') }),
      row({ id: 'a' })
    ] as any)
    const handler = await load('index.get')
    const result = await handler({ query: { status: 'active' } } as any)

    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ['health:read'])
    expect(prisma.injury.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', status: { in: ['ACTIVE', 'RECOVERING'] } }
      })
    )
    expect(result.injuries.map((injury: any) => injury.id)).toEqual(['a', 'b'])
    expect(result.injuries[0]).toMatchObject({
      id: 'a',
      bodyArea: 'achilles',
      side: 'LEFT',
      title: 'Achilles tightness',
      painLevel: 4,
      status: 'ACTIVE',
      onsetDate: '2026-09-28T00:00:00.000Z',
      affectedSports: ['run']
    })
  })

  it('GET status=all includes resolved; invalid status is a 400', async () => {
    vi.mocked(prisma.injury.findMany).mockResolvedValue([] as any)
    const handler = await load('index.get')
    await handler({ query: { status: 'all' } } as any)
    expect(vi.mocked(prisma.injury.findMany).mock.calls[0]![0]).toMatchObject({
      where: { userId: 'user-1' }
    })
    await expect(handler({ query: { status: 'old' } } as any)).rejects.toMatchObject({
      statusCode: 400
    })
  })

  it('POST validates and creates for the authenticated user', async () => {
    vi.mocked(prisma.injury.create).mockResolvedValue(row() as any)
    const handler = await load('index.post')
    const result = await handler({
      body: { bodyArea: 'Achilles', side: 'LEFT', painLevel: 4, onsetDate: '2026-09-28' }
    } as any)

    expect(requireAuth).toHaveBeenCalledWith(expect.anything(), ['health:write'])
    expect(prisma.injury.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        bodyArea: 'achilles',
        onsetDate: new Date('2026-09-28T00:00:00.000Z')
      })
    })
    expect(result.injury.id).toBe('inj-1')

    await expect(
      handler({ body: { bodyArea: 'knee', painLevel: 12 } } as any)
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it('PATCH resolves an owned injury and returns { injury }', async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(row() as any)
    vi.mocked(prisma.injury.update).mockResolvedValue(
      row({ status: 'RESOLVED', resolvedAt: new Date('2026-10-04T09:00:00.000Z') }) as any
    )
    const handler = await load('[id].patch')
    const result = await handler({
      context: { params: { id: 'inj-1' } },
      body: { status: 'RESOLVED' }
    } as any)

    expect(prisma.injury.update).toHaveBeenCalledWith({
      where: { id: 'inj-1' },
      data: { status: 'RESOLVED', resolvedAt: expect.any(Date) }
    })
    expect(result.injury).toMatchObject({
      status: 'RESOLVED',
      resolvedAt: '2026-10-04T09:00:00.000Z'
    })
  })

  it("PATCH and DELETE return 404 for another athlete's injury", async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(row({ userId: 'victim' }) as any)
    const patch = await load('[id].patch')
    const del = await load('[id].delete')

    await expect(
      patch({ context: { params: { id: 'inj-1' } }, body: { painLevel: 1 } } as any)
    ).rejects.toMatchObject({ statusCode: 404 })
    await expect(del({ context: { params: { id: 'inj-1' } } } as any)).rejects.toMatchObject({
      statusCode: 404
    })
    expect(prisma.injury.update).not.toHaveBeenCalled()
    expect(prisma.injury.delete).not.toHaveBeenCalled()
  })

  it('DELETE removes an owned injury', async () => {
    vi.mocked(prisma.injury.findUnique).mockResolvedValue(row() as any)
    const handler = await load('[id].delete')
    await expect(handler({ context: { params: { id: 'inj-1' } } } as any)).resolves.toEqual({
      success: true
    })
    expect(prisma.injury.delete).toHaveBeenCalledWith({ where: { id: 'inj-1' } })
  })
})
