import { requireAuth } from '../../utils/auth-guard'
import { getUserLocalDate } from '../../utils/date'
import {
  createInjurySchema,
  formatInjuryValidationError,
  injuryService,
  serializeInjury
} from '../../utils/services/injuryService'

defineRouteMeta({
  openAPI: {
    tags: ['Injuries'],
    summary: 'Log an injury',
    description:
      'Creates an injury or niggle. `bodyArea` accepts a normalized key (knee, achilles, calf, shin, foot, ankle, hamstring, quad, hip, glute, it_band, lower_back, upper_back, neck, shoulder, elbow, wrist, other) or common synonyms. `onsetDate` (YYYY-MM-DD) defaults to today in the athlete timezone.',
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['bodyArea', 'painLevel'],
            properties: {
              bodyArea: { type: 'string' },
              side: { type: 'string', enum: ['LEFT', 'RIGHT', 'BOTH'], nullable: true },
              title: { type: 'string', nullable: true },
              description: { type: 'string', nullable: true },
              painLevel: { type: 'integer', minimum: 0, maximum: 10 },
              status: { type: 'string', enum: ['ACTIVE', 'RECOVERING', 'RESOLVED'] },
              onsetDate: { type: 'string', format: 'date' },
              affectedSports: {
                type: 'array',
                items: { type: 'string', enum: ['run', 'ride', 'swim', 'strength'] }
              },
              loadRestriction: {
                type: 'string',
                enum: ['NO_LOADING', 'MODIFIED_ONLY'],
                nullable: true
              },
              redFlags: { type: 'array', items: { type: 'string' } },
              notes: { type: 'string', nullable: true }
            }
          }
        }
      }
    },
    responses: {
      200: { description: 'Created injury: `{ injury }`' },
      400: { description: 'Validation error' },
      401: { description: 'Unauthorized' }
    }
  }
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event, ['health:write'])
  const parsed = createInjurySchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: formatInjuryValidationError(parsed.error) })
  }

  const injury = await injuryService.create(user.id, parsed.data, {
    today: getUserLocalDate(user.timezone || 'UTC')
  })
  return { injury: serializeInjury(injury) }
})
