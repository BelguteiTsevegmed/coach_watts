import { requireAuth } from '../../utils/auth-guard'
import {
  InjuryNotFoundError,
  formatInjuryValidationError,
  injuryService,
  serializeInjury,
  updateInjurySchema
} from '../../utils/services/injuryService'

defineRouteMeta({
  openAPI: {
    tags: ['Injuries'],
    summary: 'Update an injury',
    description:
      'Partial update (pain level, status, notes, ...). Setting status to RESOLVED stamps `resolvedAt`; re-opening a resolved injury clears it.',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      200: { description: 'Updated injury: `{ injury }`' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' },
      404: { description: 'Injury not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['health:write'])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing injury id' })

  const parsed = updateInjurySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: formatInjuryValidationError(parsed.error) })
  }

  try {
    const injury = await injuryService.update(user.id, id, parsed.data)
    return { injury: serializeInjury(injury) }
  } catch (error) {
    if (error instanceof InjuryNotFoundError) {
      throw createError({ statusCode: 404, message: 'Injury not found' })
    }
    throw error
  }
})
