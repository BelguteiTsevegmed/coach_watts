/**
 * Injury / niggle vocabulary shared by the API, the AI coach tools, the coach
 * prompts and the Injuries page. Keys are stored verbatim in `Injury.bodyArea`,
 * `Injury.side`, `Injury.status` and `Injury.affectedSports`.
 */

export const INJURY_BODY_AREAS = [
  'knee',
  'achilles',
  'calf',
  'shin',
  'foot',
  'ankle',
  'hamstring',
  'quad',
  'hip',
  'glute',
  'it_band',
  'lower_back',
  'upper_back',
  'neck',
  'shoulder',
  'elbow',
  'wrist',
  'other'
] as const

export type InjuryBodyArea = (typeof INJURY_BODY_AREAS)[number]

export const INJURY_BODY_AREA_LABELS: Record<InjuryBodyArea, string> = {
  knee: 'Knee',
  achilles: 'Achilles',
  calf: 'Calf',
  shin: 'Shin',
  foot: 'Foot',
  ankle: 'Ankle',
  hamstring: 'Hamstring',
  quad: 'Quad',
  hip: 'Hip',
  glute: 'Glute',
  it_band: 'IT band',
  lower_back: 'Lower back',
  upper_back: 'Upper back',
  neck: 'Neck',
  shoulder: 'Shoulder',
  elbow: 'Elbow',
  wrist: 'Wrist',
  other: 'Other'
}

export const INJURY_SIDES = ['LEFT', 'RIGHT', 'BOTH'] as const
export type InjurySide = (typeof INJURY_SIDES)[number]

export const INJURY_STATUSES = ['ACTIVE', 'RECOVERING', 'RESOLVED'] as const
export type InjuryStatus = (typeof INJURY_STATUSES)[number]

/** Statuses the coach must take into account ("active" filter). */
export const OPEN_INJURY_STATUSES: readonly InjuryStatus[] = ['ACTIVE', 'RECOVERING']

/** Sport keys an injury can affect. Matches the coach's sport families. */
export const INJURY_SPORTS = ['run', 'ride', 'swim', 'strength'] as const
export type InjurySport = (typeof INJURY_SPORTS)[number]

export const INJURY_SPORT_LABELS: Record<InjurySport, string> = {
  run: 'Running',
  ride: 'Cycling',
  swim: 'Swimming',
  strength: 'Strength'
}

export const INJURY_PAIN_MIN = 0
export const INJURY_PAIN_MAX = 10

/**
 * Pain at or above this level on an active injury means a session that loads
 * the area must be modified, replaced or skipped as a product default.
 * This is not a validated safety boundary: low pain does not clear training,
 * and red flags or clinician restrictions take precedence at any pain score.
 */
export const INJURY_MODIFY_PAIN_THRESHOLD = 4

const BODY_AREA_SYNONYMS: Array<[RegExp, InjuryBodyArea]> = [
  [/\b(it[\s_-]?band|itb|iliotibial)\b/, 'it_band'],
  [/\bachilles\b/, 'achilles'],
  [/\b(plantar|heel|arch|toes?|metatarsal|forefoot|feet|foot)\b/, 'foot'],
  [/\b(shins?|tibia|shin[\s_-]?splints?)\b/, 'shin'],
  [/\b(calf|calves|soleus|gastroc\w*)\b/, 'calf'],
  [/\bankles?\b/, 'ankle'],
  [/\b(hamstrings?|hammy)\b/, 'hamstring'],
  [/\b(quads?|quadriceps|thigh)\b/, 'quad'],
  [/\b(knees?|patella\w*|kneecap)\b/, 'knee'],
  [/\b(glutes?|buttocks?|piriformis)\b/, 'glute'],
  [/\b(hips?|hip[\s_-]?flexors?|groin|adductors?)\b/, 'hip'],
  [/\b(lower[\s_-]?back|lumbar|sciatica|back)\b/, 'lower_back'],
  [/\b(upper[\s_-]?back|thoracic|shoulder[\s_-]?blade)\b/, 'upper_back'],
  [/\bneck\b/, 'neck'],
  [/\b(shoulders?|rotator)\b/, 'shoulder'],
  [/\belbows?\b/, 'elbow'],
  [/\b(wrists?|hands?)\b/, 'wrist']
]

/**
 * Map free text ("IT band", "left achilles tendon", "Lower-Back") to a body-area
 * key. Unknown input maps to `other`; non-strings are returned unchanged so a
 * schema can still reject them.
 */
export function normalizeInjuryBodyArea(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const lower = value.trim().toLowerCase()
  if (!lower) return value
  const asKey = lower.replace(/[\s-]+/g, '_')
  if ((INJURY_BODY_AREAS as readonly string[]).includes(asKey)) return asKey

  // Synonym matching works on the spaced form so word boundaries hold.
  const spaced = lower.replace(/[_-]+/g, ' ')
  for (const [pattern, key] of BODY_AREA_SYNONYMS) {
    // "upper back" must win over the generic "back" rule.
    if (key === 'lower_back' && /\bupper[\s_-]?back\b/.test(spaced)) continue
    if (pattern.test(spaced)) return key
  }
  return 'other'
}

export function getInjuryBodyAreaLabel(bodyArea: string | null | undefined): string {
  if (!bodyArea) return 'Unknown area'
  return (INJURY_BODY_AREA_LABELS as Record<string, string>)[bodyArea] || bodyArea
}

/** "Left knee", "Both calves"-style label; falls back to the area label. */
export function formatInjuryLocation(bodyArea: string | null | undefined, side?: string | null) {
  const area = getInjuryBodyAreaLabel(bodyArea)
  if (side === 'LEFT') return `Left ${area.toLowerCase()}`
  if (side === 'RIGHT') return `Right ${area.toLowerCase()}`
  if (side === 'BOTH') return `${area} (both sides)`
  return area
}

/**
 * Sports an injury affects when the athlete did not say. Conservative defaults
 * by body area: lower-limb problems load running first, back and neck load
 * running and riding, upper-limb problems load swimming and lifting.
 */
const DEFAULT_AFFECTED_SPORTS: Record<InjuryBodyArea, InjurySport[]> = {
  knee: ['run', 'ride', 'strength'],
  achilles: ['run'],
  calf: ['run'],
  shin: ['run'],
  foot: ['run'],
  ankle: ['run'],
  hamstring: ['run', 'strength'],
  quad: ['run', 'ride', 'strength'],
  hip: ['run', 'ride', 'strength'],
  glute: ['run', 'ride', 'strength'],
  it_band: ['run', 'ride'],
  lower_back: ['run', 'ride', 'strength'],
  upper_back: ['ride', 'swim', 'strength'],
  neck: ['ride', 'swim'],
  shoulder: ['swim', 'strength'],
  elbow: ['swim', 'strength'],
  wrist: ['ride', 'strength'],
  other: ['run', 'ride', 'swim', 'strength']
}

export function getEffectiveAffectedSports(injury: {
  bodyArea: string
  affectedSports?: string[] | null
}): { sports: InjurySport[]; inferred: boolean } {
  const explicit = (injury.affectedSports || []).filter((sport): sport is InjurySport =>
    (INJURY_SPORTS as readonly string[]).includes(sport)
  )
  if (explicit.length > 0) return { sports: explicit, inferred: false }
  const fallback =
    (DEFAULT_AFFECTED_SPORTS as Record<string, InjurySport[]>)[injury.bodyArea] ||
    DEFAULT_AFFECTED_SPORTS.other
  return { sports: [...fallback], inferred: true }
}

/**
 * API shape of an injury (`GET /api/injuries`). All dates are ISO strings;
 * `onsetDate` is a calendar date stored at UTC midnight, so format it in UTC.
 */
export type InjuryDTO = {
  loadRestriction?: string | null
  redFlags?: string[]
  id: string
  bodyArea: string
  side: InjurySide | null
  title: string | null
  description: string | null
  painLevel: number
  status: InjuryStatus
  onsetDate: string
  resolvedAt: string | null
  affectedSports: string[]
  notes: string | null
  createdAt: string
  updatedAt: string
}

/** Plain-language band for a pain score (pain-monitoring model). */
export function getPainBand(pain: number): 'none' | 'mild' | 'moderate' | 'severe' {
  if (pain <= 0) return 'none'
  if (pain <= 3) return 'mild'
  if (pain <= 6) return 'moderate'
  return 'severe'
}

/** Body of `POST /api/injuries` / `PATCH /api/injuries/:id` sent by the Injuries page form. */
export type InjuryFormPayload = {
  bodyArea: string
  side: InjurySide | null
  title: string | null
  painLevel: number
  onsetDate: string
  status?: InjuryStatus
  affectedSports: string[]
  notes: string | null
}
