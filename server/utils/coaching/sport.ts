import { prisma } from '../db'

/** Coarse sport family of a workout / planned workout type. */
export type SportFamily = 'run' | 'ride' | 'swim' | 'strength' | 'other'

/** The athlete's main discipline, used to pick the coach's voice and principles. */
export type PrimarySport = 'running' | 'cycling' | 'swimming' | 'multisport' | 'general'

const RIDE_TOKENS = ['ride', 'bike', 'cycl', 'gravel', 'mtb', 'velomobile', 'handcycle']
const RUN_TOKENS = ['run', 'jog', 'treadmill']
const SWIM_TOKENS = ['swim']
const STRENGTH_TOKENS = ['gym', 'weight', 'strength', 'crossfit', 'lift']

export function classifySportFamily(type: string | null | undefined): SportFamily {
  const lower = String(type || '').toLowerCase()
  if (!lower) return 'other'
  if (RIDE_TOKENS.some((token) => lower.includes(token))) return 'ride'
  if (RUN_TOKENS.some((token) => lower.includes(token))) return 'run'
  if (SWIM_TOKENS.some((token) => lower.includes(token))) return 'swim'
  if (STRENGTH_TOKENS.some((token) => lower.includes(token))) return 'strength'
  return 'other'
}

const FAMILY_TO_SPORT: Record<'run' | 'ride' | 'swim', PrimarySport> = {
  run: 'running',
  ride: 'cycling',
  swim: 'swimming'
}

/** Below this much endurance time we don't trust the history to name a sport. */
const MIN_ENDURANCE_SECONDS = 60 * 60
const DOMINANT_SHARE = 0.6
const MULTISPORT_MIN_SHARE = 0.2

/**
 * Pick the athlete's primary sport from time spent per workout type.
 * A family with >= 60% of endurance time wins; two or more families with
 * >= 20% each make the athlete a multisport athlete; too little data -> general.
 */
export function derivePrimarySport(
  rows: Array<{ type: string | null | undefined; durationSec: number | null | undefined }>
): PrimarySport {
  const totals = { run: 0, ride: 0, swim: 0 }
  for (const row of rows) {
    const family = classifySportFamily(row.type)
    if (family === 'run' || family === 'ride' || family === 'swim') {
      totals[family] += Math.max(0, Number(row.durationSec) || 0)
    }
  }

  const total = totals.run + totals.ride + totals.swim
  if (total < MIN_ENDURANCE_SECONDS) return 'general'

  const ranked = (Object.entries(totals) as Array<['run' | 'ride' | 'swim', number]>).sort(
    (a, b) => b[1] - a[1]
  )
  const [topFamily, topSeconds] = ranked[0]!
  if (topSeconds / total >= DOMINANT_SHARE) return FAMILY_TO_SPORT[topFamily]

  const significant = ranked.filter(([, seconds]) => seconds / total >= MULTISPORT_MIN_SHARE)
  if (significant.length >= 2) return 'multisport'
  return FAMILY_TO_SPORT[topFamily]
}

/** Infer a sport from goal/event wording when there is no training history. */
export function inferSportFromText(text: string | null | undefined): PrimarySport | null {
  const lower = String(text || '').toLowerCase()
  if (!lower.trim()) return null
  if (/(triathlon|ironman|70\.3|duathlon|aquathlon|multisport|\btri\b)/.test(lower)) {
    return 'multisport'
  }
  if (
    /(marathon|\brun\b|running|\d+\s?k\b|trail|ultra|parkrun|cross[\s-]?country|steeple)/.test(
      lower
    )
  ) {
    return 'running'
  }
  if (
    /(ride|cycl|bike|gran fondo|granfondo|criterium|crit\b|road race|time trial|sportive|cyclotour|toertocht|gravel|mtb|velo)/.test(
      lower
    )
  ) {
    return 'cycling'
  }
  if (/(swim|open water)/.test(lower)) return 'swimming'
  return null
}

/**
 * The athlete's primary sport: training history of the last `lookbackDays`
 * (by time per sport), then upcoming planned sessions, then active goal wording.
 * Never throws — falls back to `general`.
 */
export async function getAthletePrimarySport(
  userId: string,
  options: { lookbackDays?: number; now?: Date } = {}
): Promise<PrimarySport> {
  const lookbackDays = options.lookbackDays ?? 60
  const now = options.now ?? new Date()
  const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000)

  try {
    const history = await prisma.workout.groupBy({
      by: ['type'],
      where: { userId, isDuplicate: false, date: { gte: since } },
      _sum: { durationSec: true }
    })
    const fromHistory = derivePrimarySport(
      history.map((row) => ({ type: row.type, durationSec: row._sum.durationSec }))
    )
    if (fromHistory !== 'general') return fromHistory

    const horizon = new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000)
    const planned = await prisma.plannedWorkout.groupBy({
      by: ['type'],
      where: { userId, date: { gte: since, lte: horizon } },
      _sum: { durationSec: true }
    })
    const fromPlan = derivePrimarySport(
      planned.map((row) => ({ type: row.type, durationSec: row._sum.durationSec }))
    )
    if (fromPlan !== 'general') return fromPlan

    const goals = await prisma.goal.findMany({
      where: { userId, status: 'ACTIVE' },
      select: { title: true, eventType: true, description: true },
      take: 5
    })
    for (const goal of goals) {
      const inferred =
        inferSportFromText(goal.eventType) ||
        inferSportFromText(goal.title) ||
        inferSportFromText(goal.description)
      if (inferred) return inferred
    }
  } catch (error) {
    console.warn('[coaching] Failed to determine primary sport', { userId, error })
  }

  return 'general'
}

export function getSportLabel(sport: PrimarySport): string {
  switch (sport) {
    case 'running':
      return 'running'
    case 'cycling':
      return 'cycling'
    case 'swimming':
      return 'swimming'
    case 'multisport':
      return 'triathlon / multisport'
    default:
      return 'endurance sport'
  }
}

/** "running coach", "cycling coach", "triathlon coach", "endurance coach". */
export function getCoachRole(sport: PrimarySport): string {
  switch (sport) {
    case 'running':
      return 'running coach'
    case 'cycling':
      return 'cycling coach'
    case 'swimming':
      return 'swim coach'
    case 'multisport':
      return 'triathlon and endurance coach'
    default:
      return 'endurance coach'
  }
}

/**
 * Default workout types for plans when the athlete did not pick any.
 * Keeps the historic cycling default only when nothing points elsewhere.
 */
export function getDefaultActivityTypes(sport: PrimarySport): string[] {
  switch (sport) {
    case 'running':
      return ['Run']
    case 'swimming':
      return ['Swim']
    case 'multisport':
      return ['Run', 'Ride', 'Swim']
    case 'cycling':
    default:
      return ['Ride']
  }
}

/** Default single workout type (ad-hoc sessions, fallbacks). */
export function getDefaultWorkoutType(sport: PrimarySport): 'Run' | 'Ride' | 'Swim' {
  if (sport === 'running' || sport === 'multisport') return 'Run'
  if (sport === 'swimming') return 'Swim'
  return 'Ride'
}
