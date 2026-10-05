import { prisma } from '../db'
import {
  INJURY_MODIFY_PAIN_THRESHOLD,
  INJURY_SPORT_LABELS,
  OPEN_INJURY_STATUSES,
  formatInjuryLocation,
  getEffectiveAffectedSports,
  type InjurySport
} from '../../../shared/injuries'
import { classifySportFamily } from './sport'

/** The injury fields the coach prompts need. */
export type InjuryPromptInput = {
  id?: string
  bodyArea: string
  side?: string | null
  title?: string | null
  description?: string | null
  painLevel: number
  status: string
  onsetDate: Date | string
  affectedSports?: string[] | null
  notes?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

function toUtcDay(value: Date | string): number {
  const date = value instanceof Date ? value : new Date(value)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/** Whole days between onset and `today` (both calendar dates at UTC midnight). */
export function daysSinceOnset(onsetDate: Date | string, today: Date): number {
  return Math.max(0, Math.round((toUtcDay(today) - toUtcDay(onsetDate)) / DAY_MS))
}

function truncate(text: string, max: number) {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

function formatSports(sports: InjurySport[]) {
  return sports.map((sport) => INJURY_SPORT_LABELS[sport] || sport).join(', ')
}

/** One prompt line per injury, e.g. `Left achilles "Tight" | pain 4/10 | ACTIVE | ...`. */
export function formatInjuryLine(injury: InjuryPromptInput, today: Date): string {
  const location = formatInjuryLocation(injury.bodyArea, injury.side)
  const days = daysSinceOnset(injury.onsetDate, today)
  const onset = new Date(toUtcDay(injury.onsetDate)).toISOString().slice(0, 10)
  const { sports, inferred } = getEffectiveAffectedSports({
    bodyArea: injury.bodyArea,
    affectedSports: injury.affectedSports
  })

  const parts = [
    `${location}${injury.title ? ` "${truncate(injury.title, 80)}"` : ''}`,
    `pain ${injury.painLevel}/10`,
    injury.status,
    `since ${onset} (${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`})`,
    `affects: ${formatSports(sports)}${inferred ? ' (inferred from body area)' : ''}`
  ]
  if (injury.description) parts.push(`details: ${truncate(injury.description, 160)}`)
  if (injury.notes) parts.push(`notes: ${truncate(injury.notes, 160)}`)
  return `- ${parts.join(' | ')}`
}

export const INJURY_RULES_PROMPT = `Injury rules (pain-monitoring model):
- An ACTIVE injury with pain >= ${INJURY_MODIFY_PAIN_THRESHOLD}/10 that affects a session's sport: do NOT prescribe that session as-is. Modify it (shorter/easier/lower impact), replace it with cross-training that doesn't load the area, or rest — and say why, naming the injury.
- Pain <= 3/10 that settles by next morning: training can continue, monitored. RECOVERING: progress gradually, keep within the pain rules.
- Red flags (sharp/worsening pain, swelling, night pain, limping, suspected bone stress) → advise seeing a physio/doctor. Never diagnose.`

/**
 * Prompt block for the athlete's open injuries. Always returns a block (even when
 * empty) so the model knows injuries were checked rather than unknown.
 */
export function formatInjuriesForPrompt(
  injuries: InjuryPromptInput[],
  options: { today: Date; heading?: string; includeRules?: boolean } = { today: new Date() }
): string {
  const heading = options.heading ?? 'ACTIVE INJURIES & NIGGLES (logged by the athlete)'
  const open = injuries.filter((injury) =>
    (OPEN_INJURY_STATUSES as readonly string[]).includes(injury.status)
  )

  if (open.length === 0) {
    return `${heading}:\n- None logged. If the athlete mentions pain, take it seriously and adapt.`
  }

  const lines = open
    .slice()
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : 1
      return b.painLevel - a.painLevel
    })
    .map((injury) => formatInjuryLine(injury, options.today))

  const rules = options.includeRules === false ? '' : `\n${INJURY_RULES_PROMPT}`
  return `${heading}:\n${lines.join('\n')}${rules}`
}

export type InjuryConflict = {
  injury: InjuryPromptInput
  sport: InjurySport
  sessionTitle: string | null
  sessionType: string | null
}

/**
 * Sessions that must not go ahead as planned: an ACTIVE injury with pain at or
 * above the modify threshold whose (explicit or inferred) affected sports include
 * the session's sport. Rest days and unknown sports never conflict.
 */
export function findInjuryConflicts(
  injuries: InjuryPromptInput[],
  sessions: Array<{ title?: string | null; type?: string | null }>
): InjuryConflict[] {
  const conflicts: InjuryConflict[] = []
  for (const session of sessions) {
    const family = classifySportFamily(session.type)
    if (family === 'other') continue
    for (const injury of injuries) {
      if (injury.status !== 'ACTIVE') continue
      if (injury.painLevel < INJURY_MODIFY_PAIN_THRESHOLD) continue
      const { sports } = getEffectiveAffectedSports(injury)
      if (sports.includes(family as InjurySport)) {
        conflicts.push({
          injury,
          sport: family as InjurySport,
          sessionTitle: session.title ?? null,
          sessionType: session.type ?? null
        })
      }
    }
  }
  return conflicts
}

export function formatInjuryConflictsForPrompt(conflicts: InjuryConflict[]): string {
  if (conflicts.length === 0) return ''
  const lines = conflicts.map(
    (conflict) =>
      `- "${conflict.sessionTitle || conflict.sessionType || 'Session'}" (${conflict.sessionType || 'unknown type'}) loads the ${formatInjuryLocation(conflict.injury.bodyArea, conflict.injury.side).toLowerCase()} (ACTIVE, pain ${conflict.injury.painLevel}/10).`
  )
  return `INJURY CONFLICT — MUST ACT:
${lines.join('\n')}
- Your recommendation for these sessions MUST be "modify", "reduce_intensity" or "rest" — never "proceed" as planned. Offer cross-training that doesn't load the area, a reduced version within the pain rules, or rest, and explain why in one sentence naming the injury.`
}

/**
 * Fetch the athlete's open (ACTIVE/RECOVERING) injuries for prompts. Never throws:
 * a failure here must not block a recommendation, so it logs and returns [].
 */
export async function fetchOpenInjuries(userId: string): Promise<InjuryPromptInput[]> {
  try {
    const injuries = await prisma.injury.findMany({
      where: { userId, status: { in: [...OPEN_INJURY_STATUSES] } },
      orderBy: [{ status: 'asc' }, { onsetDate: 'desc' }],
      take: 10,
      select: {
        id: true,
        bodyArea: true,
        side: true,
        title: true,
        description: true,
        painLevel: true,
        status: true,
        onsetDate: true,
        affectedSports: true,
        notes: true
      }
    })
    return Array.isArray(injuries) ? injuries : []
  } catch (error) {
    console.warn('[coaching] Failed to load injuries for prompt', { userId, error })
    return []
  }
}

/** Convenience: fetch + format in one call. */
export async function buildInjuryContext(
  userId: string,
  today: Date,
  options: { heading?: string; includeRules?: boolean } = {}
) {
  const injuries = await fetchOpenInjuries(userId)
  return {
    injuries,
    prompt: formatInjuriesForPrompt(injuries, { today, ...options })
  }
}
