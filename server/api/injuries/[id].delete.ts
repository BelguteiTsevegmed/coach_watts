import { requireAuth } from '../../utils/auth-guard'
import { InjuryNotFoundError, injuryService } from '../../utils/services/injuryService'

defineRouteMeta({
  openAPI: {
    tags: ['Injuries'],
    summary: 'Delete an injury',
    parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
    responses: {
      200: { description: '`{ success: true }`' },
      401: { description: 'Unauthorized' },
      404: { description: 'Injury not found' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['health:write'])
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, message: 'Missing injury id' })

  try {
    await injuryService.remove(user.id, id)
    return { success: true }
  } catch (error) {
    if (error instanceof InjuryNotFoundError) {
      throw createError({ statusCode: 404, message: 'Injury not found' })
    }
    throw error
  }
})
