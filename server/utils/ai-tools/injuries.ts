import { tool } from 'ai'
import { z } from 'zod/v3'
import {
  INJURY_BODY_AREAS,
  INJURY_SIDES,
  INJURY_SPORTS,
  INJURY_STATUSES,
  formatInjuryLocation
} from '../../../shared/injuries'
import { getUserLocalDate } from '../date'
import {
  InjuryNotFoundError,
  createInjurySchema,
  formatInjuryValidationError,
  injuryService,
  serializeInjury,
  updateInjurySchema
} from '../services/injuryService'
import { daysSinceOnset } from '../coaching/injury-context'

const bodyAreaDescription = `Body area. One of: ${INJURY_BODY_AREAS.join(', ')}. Common words are mapped automatically (e.g. "plantar fascia" -> foot, "ITB" -> it_band).`

function toToolInjury(injury: Parameters<typeof serializeInjury>[0], today: Date) {
  const dto = serializeInjury(injury)
  return {
    ...dto,
    location: formatInjuryLocation(dto.bodyArea, dto.side),
    onsetDate: dto.onsetDate.slice(0, 10),
    days_since_onset: daysSinceOnset(injury.onsetDate, today)
  }
}

/**
 * Injury tools. Logging or updating an injury the athlete just described is a
 * low-risk, user-owned health write (like record_wellness_event), so these do
 * not require approval: the athlete should be able to say "my left Achilles is
 * sore, 4/10" and have the coach take note immediately.
 */
export const injuryTools = (userId: string, timezone: string) => ({
  get_injuries: tool({
    description:
      "List the athlete's logged injuries and niggles (body area, side, pain 0-10, status, onset). Use before giving training advice when pain is relevant, or to find the ID for update_injury.",
    inputSchema: z.object({
      status: z
        .enum(['active', 'all'])
        .optional()
        .describe('active (default) = ACTIVE and RECOVERING; all = include RESOLVED history')
    }),
    execute: async ({ status }) => {
      const today = getUserLocalDate(timezone)
      const injuries = await injuryService.list(userId, { status: status || 'active' })
      if (injuries.length === 0) {
        return {
          count: 0,
          injuries: [],
          message:
            status === 'all' ? 'No injuries have been logged.' : 'No active injuries or niggles.'
        }
      }
      return {
        count: injuries.length,
        injuries: injuries.map((injury) => toToolInjury(injury, today))
      }
    }
  }),

  log_injury: tool({
    description:
      'Log a NEW injury or niggle the athlete describes (e.g. "my left Achilles has been sore since Monday, about 4/10"). Check the Injuries & Niggles context first: if the same area/side is already listed, use update_injury instead.',
    inputSchema: z.object({
      body_area: z.string().describe(bodyAreaDescription),
      side: z
        .enum(INJURY_SIDES)
        .optional()
        .describe('LEFT, RIGHT or BOTH (omit if not applicable)'),
      pain_level: z
        .number()
        .min(0)
        .max(10)
        .describe('Current pain 0-10 as reported by the athlete. Ask if unknown.'),
      title: z.string().max(120).optional().describe('Short label, e.g. "Achilles tightness"'),
      description: z.string().max(2000).optional().describe("The athlete's own description"),
      onset_date: z
        .string()
        .optional()
        .describe('When it started, YYYY-MM-DD. Resolve relative dates first. Defaults to today.'),
      affected_sports: z
        .array(z.enum(INJURY_SPORTS))
        .optional()
        .describe('Sports it affects: run, ride, swim, strength'),
      status: z.enum(INJURY_STATUSES).optional().describe('Defaults to ACTIVE'),
      notes: z.string().max(2000).optional()
    }),
    execute: async (args) => {
      const parsed = createInjurySchema.safeParse({
        bodyArea: args.body_area,
        side: args.side,
        painLevel: Math.round(args.pain_level),
        title: args.title,
        description: args.description,
        onsetDate: args.onset_date,
        affectedSports: args.affected_sports,
        status: args.status,
        notes: args.notes
      })
      if (!parsed.success) {
        return { success: false, error: formatInjuryValidationError(parsed.error) }
      }

      const today = getUserLocalDate(timezone)
      const injury = await injuryService.create(userId, parsed.data, { today })
      return {
        success: true,
        message: `Logged ${formatInjuryLocation(injury.bodyArea, injury.side).toLowerCase()} (pain ${injury.painLevel}/10). The coach will adapt recommendations and plans around it.`,
        injury: toToolInjury(injury, today)
      }
    }
  }),

  update_injury: tool({
    description:
      'Update an existing injury: new pain level, status (ACTIVE -> RECOVERING -> RESOLVED), notes or affected sports. Use when the athlete gives a pain update or says it has healed. Setting status RESOLVED records the resolution date.',
    inputSchema: z.object({
      injury_id: z.string().describe('Injury ID from the context or get_injuries'),
      pain_level: z.number().min(0).max(10).optional(),
      status: z.enum(INJURY_STATUSES).optional(),
      notes: z
        .string()
        .max(2000)
        .optional()
        .describe('Replaces the notes; include previous notes if they still matter'),
      affected_sports: z.array(z.enum(INJURY_SPORTS)).optional(),
      side: z.enum(INJURY_SIDES).optional(),
      title: z.string().max(120).optional()
    }),
    execute: async (args) => {
      const parsed = updateInjurySchema.safeParse({
        painLevel: args.pain_level === undefined ? undefined : Math.round(args.pain_level),
        status: args.status,
        notes: args.notes,
        affectedSports: args.affected_sports,
        side: args.side,
        title: args.title
      })
      if (!parsed.success) {
        return { success: false, error: formatInjuryValidationError(parsed.error) }
      }

      try {
        const injury = await injuryService.update(userId, args.injury_id, parsed.data)
        const today = getUserLocalDate(timezone)
        return {
          success: true,
          message: `Updated ${formatInjuryLocation(injury.bodyArea, injury.side).toLowerCase()}: ${injury.status}, pain ${injury.painLevel}/10.`,
          injury: toToolInjury(injury, today)
        }
      } catch (error) {
        if (error instanceof InjuryNotFoundError) {
          return { success: false, error: 'Injury not found. Call get_injuries to find the ID.' }
        }
        throw error
      }
    }
  })
})
