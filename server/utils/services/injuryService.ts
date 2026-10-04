import { z } from 'zod/v3'
import { prisma } from '../db'
import {
  INJURY_BODY_AREAS,
  INJURY_PAIN_MAX,
  INJURY_PAIN_MIN,
  INJURY_SIDES,
  INJURY_SPORTS,
  INJURY_STATUSES,
  OPEN_INJURY_STATUSES,
  normalizeInjuryBodyArea,
  type InjuryDTO,
  type InjurySide,
  type InjuryStatus
} from '../../../shared/injuries'

export type { InjuryDTO }

type InjuryRecord = {
  id: string
  bodyArea: string
  side: string | null
  title: string | null
  description: string | null
  painLevel: number
  status: string
  onsetDate: Date
  resolvedAt: Date | null
  affectedSports: string[]
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export function serializeInjury(injury: InjuryRecord): InjuryDTO {
  return {
    id: injury.id,
    bodyArea: injury.bodyArea,
    side: injury.side as InjurySide | null,
    title: injury.title,
    description: injury.description,
    painLevel: injury.painLevel,
    status: injury.status as InjuryStatus,
    onsetDate: injury.onsetDate.toISOString(),
    resolvedAt: injury.resolvedAt ? injury.resolvedAt.toISOString() : null,
    affectedSports: injury.affectedSports || [],
    notes: injury.notes,
    createdAt: injury.createdAt.toISOString(),
    updatedAt: injury.updatedAt.toISOString()
  }
}

const STATUS_RANK: Record<string, number> = { ACTIVE: 0, RECOVERING: 1, RESOLVED: 2 }

/** ACTIVE, then RECOVERING, then RESOLVED; newest onset first within a status. */
export function sortInjuries<T extends { status: string; onsetDate: Date | string }>(
  injuries: T[]
): T[] {
  return injuries.slice().sort((a, b) => {
    const rank = (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3)
    if (rank !== 0) return rank
    return new Date(b.onsetDate).getTime() - new Date(a.onsetDate).getTime()
  })
}

/** Accepts `YYYY-MM-DD` or a full ISO timestamp; stores the calendar date at UTC midnight. */
export function parseInjuryDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(d)) return null
  return date
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null))

const dateString = z.string().refine((value) => parseInjuryDate(value) !== null, {
  message: 'Expected a date in YYYY-MM-DD format'
})

const bodyAreaSchema = z.preprocess(normalizeInjuryBodyArea, z.enum(INJURY_BODY_AREAS))
const sportsSchema = z
  .array(
    z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(INJURY_SPORTS))
  )
  .max(INJURY_SPORTS.length)
  .transform((sports) => [...new Set(sports)])

export const createInjurySchema = z.object({
  bodyArea: bodyAreaSchema,
  side: z.enum(INJURY_SIDES).nullable().optional(),
  title: optionalText(120),
  description: optionalText(2000),
  painLevel: z.number().int().min(INJURY_PAIN_MIN).max(INJURY_PAIN_MAX),
  status: z.enum(INJURY_STATUSES).optional(),
  onsetDate: dateString.optional(),
  affectedSports: sportsSchema.optional(),
  notes: optionalText(2000)
})

export const updateInjurySchema = z
  .object({
    bodyArea: bodyAreaSchema.optional(),
    side: z.enum(INJURY_SIDES).nullable().optional(),
    title: optionalText(120),
    description: optionalText(2000),
    painLevel: z.number().int().min(INJURY_PAIN_MIN).max(INJURY_PAIN_MAX).optional(),
    status: z.enum(INJURY_STATUSES).optional(),
    onsetDate: dateString.optional(),
    affectedSports: sportsSchema.optional(),
    notes: optionalText(2000)
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Nothing to update'
  })

export type CreateInjuryInput = z.infer<typeof createInjurySchema>
export type UpdateInjuryInput = z.infer<typeof updateInjurySchema>

export class InjuryNotFoundError extends Error {
  constructor() {
    super('Injury not found')
    this.name = 'InjuryNotFoundError'
  }
}

/**
 * resolvedAt follows status: set when an injury becomes RESOLVED, cleared when
 * it is re-opened. Returns undefined when it should not change.
 */
export function resolveResolvedAt(
  previousStatus: string | null,
  nextStatus: string | undefined,
  now: Date = new Date()
): Date | null | undefined {
  if (!nextStatus || nextStatus === previousStatus) return undefined
  if (nextStatus === 'RESOLVED') return now
  if (previousStatus === 'RESOLVED') return null
  return undefined
}

export const injuryService = {
  async list(userId: string, options: { status?: 'active' | 'all' } = {}) {
    const injuries = await prisma.injury.findMany({
      where: {
        userId,
        ...(options.status === 'all' ? {} : { status: { in: [...OPEN_INJURY_STATUSES] } })
      },
      orderBy: [{ status: 'asc' }, { onsetDate: 'desc' }, { createdAt: 'desc' }]
    })
    return sortInjuries(injuries)
  },

  async getOwned(userId: string, id: string) {
    const injury = await prisma.injury.findUnique({ where: { id } })
    if (!injury || injury.userId !== userId) throw new InjuryNotFoundError()
    return injury
  },

  async create(userId: string, input: CreateInjuryInput, options: { today?: Date } = {}) {
    const status: InjuryStatus = input.status ?? 'ACTIVE'
    const onsetDate =
      (input.onsetDate ? parseInjuryDate(input.onsetDate) : null) ||
      options.today ||
      parseInjuryDate(new Date().toISOString())!

    return prisma.injury.create({
      data: {
        userId,
        bodyArea: input.bodyArea,
        side: input.side ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        painLevel: input.painLevel,
        status,
        onsetDate,
        resolvedAt: status === 'RESOLVED' ? new Date() : null,
        affectedSports: input.affectedSports ?? [],
        notes: input.notes ?? null
      }
    })
  },

  async update(userId: string, id: string, input: UpdateInjuryInput) {
    const existing = await this.getOwned(userId, id)
    const resolvedAt = resolveResolvedAt(existing.status, input.status)

    return prisma.injury.update({
      where: { id: existing.id },
      data: {
        ...(input.bodyArea !== undefined && { bodyArea: input.bodyArea }),
        ...(input.side !== undefined && { side: input.side }),
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.painLevel !== undefined && { painLevel: input.painLevel }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.onsetDate !== undefined && { onsetDate: parseInjuryDate(input.onsetDate)! }),
        ...(input.affectedSports !== undefined && { affectedSports: input.affectedSports }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(resolvedAt !== undefined && { resolvedAt })
      }
    })
  },

  async remove(userId: string, id: string) {
    const existing = await this.getOwned(userId, id)
    await prisma.injury.delete({ where: { id: existing.id } })
  }
}

/** Turn a zod error into a short client message. */
export function formatInjuryValidationError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
    .join('; ')
}
