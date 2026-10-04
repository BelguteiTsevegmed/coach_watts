import { z } from 'zod/v3'
import { requireAuth } from '../../utils/auth-guard'
import { injuryService, serializeInjury } from '../../utils/services/injuryService'

defineRouteMeta({
  openAPI: {
    tags: ['Injuries'],
    summary: 'List injuries',
    description:
      'Returns the athlete-logged injuries and niggles. `status=active` (default) returns ACTIVE and RECOVERING injuries; `status=all` includes RESOLVED. Sorted by status, then onset date (newest first).',
    parameters: [
      {
        in: 'query',
        name: 'status',
        required: false,
        schema: { type: 'string', enum: ['active', 'all'], default: 'active' }
      }
    ],
    responses: {
      200: {
        description: 'Success',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                injuries: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      bodyArea: { type: 'string' },
                      side: { type: 'string', nullable: true, enum: ['LEFT', 'RIGHT', 'BOTH'] },
                      title: { type: 'string', nullable: true },
                      description: { type: 'string', nullable: true },
                      painLevel: { type: 'integer', minimum: 0, maximum: 10 },
                      status: { type: 'string', enum: ['ACTIVE', 'RECOVERING', 'RESOLVED'] },
                      onsetDate: { type: 'string', format: 'date-time' },
                      resolvedAt: { type: 'string', format: 'date-time', nullable: true },
                      affectedSports: { type: 'array', items: { type: 'string' } },
                      notes: { type: 'string', nullable: true },
                      createdAt: { type: 'string', format: 'date-time' },
                      updatedAt: { type: 'string', format: 'date-time' }
                    }
                  }
                }
              }
            }
          }
        }
      },
      400: { description: 'Invalid query' },
      401: { description: 'Unauthorized' }
    }
  }
})

const querySchema = z.object({
  status: z.enum(['active', 'all']).optional().default('active')
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['health:read'])
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'status must be "active" or "all"' })
  }

  const injuries = await injuryService.list(user.id, { status: parsed.data.status })
  return { injuries: injuries.map(serializeInjury) }
})
