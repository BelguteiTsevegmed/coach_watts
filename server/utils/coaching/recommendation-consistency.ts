import { formatInjuryLocation } from '../../../shared/injuries'
import type { InjuryConflict } from './injury-context'
import { classifySportFamily } from './sport'

/**
 * Keeps AI recommendation text consistent with the structured plan data shown
 * on screen. The model is told to quote planned numbers verbatim or not at all;
 * these deterministic checks catch the cases where it doesn't.
 */

export type SessionNumbers = {
  title?: string | null
  type?: string | null
  durationSec?: number | null
  tss?: number | null
}

export type GroundingIssue = {
  kind: 'duration' | 'tss'
  value: number
  text: string
  stripped: boolean
}

export type GroundingResult = {
  text: string
  issues: GroundingIssue[]
  adjusted: boolean
}

type Allowed = { durationsMin: number[]; tss: number[] }

const NUMBER = String.raw`(\d{1,3}(?:\.\d)?)`
const MINUTE_UNIT = String.raw`(?:minutes?|mins?)`
/** Words that make a duration/TSS figure refer to a training session. */
const SESSION_NOUN = String.raw`(?:run|runs|jog|ride|rides|spin|session|workout|swim|walk|hike|effort|intervals?|tempo|outing|commute|trainer|turbo)`
const SESSION_ADJECTIVE = String.raw`(?:easy|short|steady|gentle|light|relaxed|recovery|endurance|aerobic|flat|indoor|outdoor)`
// "45-minute run", "45 min easy ride": only adjectives between figure and session noun
const DURATION_ADJECTIVE = new RegExp(
  String.raw`\b${NUMBER}(?:-|\s)(?:minute|min)\b(?=\s+(?:${SESSION_ADJECTIVE}\s+){0,2}${SESSION_NOUN}\b)`,
  'gi'
)
// "45 minutes", "45 min", "45min", "45-minute"
const DURATION_PLAIN = new RegExp(String.raw`\b${NUMBER}(?:\s|-)?${MINUTE_UNIT}(?![\w-])`, 'gi')
const DURATION_HYPHEN = new RegExp(String.raw`\b${NUMBER}-minute\b`, 'gi')
// "37 TSS", "~37 TSS", "TSS 37", "TSS: 37", "TSS of 37"
const TSS_AFTER = new RegExp(String.raw`\b${NUMBER}\s?TSS\b`, 'gi')
const TSS_BEFORE = new RegExp(String.raw`\bTSS(?:\s*(?:of|:|=|≈|~))?\s*~?${NUMBER}\b`, 'gi')
const PARENTHETICAL = /\s?\(([^()]{1,80})\)/g
const SESSION_CONTEXT = new RegExp(String.raw`${SESSION_NOUN}\b[^.!?()]{0,25}$`, 'i')

function isAllowed(value: number, allowed: number[], tolerance: number) {
  return allowed.some((candidate) => Math.abs(candidate - value) <= tolerance)
}

function collectAllowed(sessions: SessionNumbers[], extra?: Partial<Allowed>): Allowed {
  const durationsMin: number[] = [...(extra?.durationsMin || [])]
  const tss: number[] = [...(extra?.tss || [])]
  for (const session of sessions) {
    if (typeof session.durationSec === 'number' && session.durationSec > 0) {
      durationsMin.push(Math.round(session.durationSec / 60))
    }
    if (typeof session.tss === 'number' && session.tss > 0) tss.push(Math.round(session.tss))
  }
  return { durationsMin, tss }
}

type Mention = { kind: 'duration' | 'tss'; value: number; text: string; index: number }

function findMentions(text: string): Mention[] {
  const mentions: Mention[] = []
  const push = (kind: Mention['kind'], value: number, match: RegExpExecArray) => {
    if (!Number.isFinite(value)) return
    if (mentions.some((m) => match.index >= m.index && match.index < m.index + m.text.length)) {
      return
    }
    mentions.push({ kind, value, text: match[0], index: match.index })
  }

  for (const match of text.matchAll(DURATION_HYPHEN)) {
    push('duration', Number(match[1]), match as RegExpExecArray)
  }
  for (const match of text.matchAll(DURATION_PLAIN)) {
    push('duration', Number(match[1]), match as RegExpExecArray)
  }
  for (const match of text.matchAll(TSS_AFTER)) {
    push('tss', Number(match[1]), match as RegExpExecArray)
  }
  for (const match of text.matchAll(TSS_BEFORE)) {
    push('tss', Number(match[1]), match as RegExpExecArray)
  }
  return mentions.sort((a, b) => a.index - b.index)
}

function isUngrounded(mention: Mention, allowed: Allowed) {
  return mention.kind === 'duration'
    ? !isAllowed(mention.value, allowed.durationsMin, 1)
    : !isAllowed(mention.value, allowed.tss, 1)
}

function tidy(text: string) {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim()
}

/**
 * Find session duration (minutes) and TSS figures in `text` that match none of
 * the given sessions (± 1). Two forms are removed because the sentence still
 * reads well without them: a purely numeric parenthetical attached to a session
 * ("easy run (45 min, 37 TSS)") and a duration adjective before a session noun
 * ("a 45-minute run" -> "a run"). Every other ungrounded figure is only flagged.
 * Hours are ignored on purpose (sleep is reported in hours).
 */
export function checkRationaleGrounding(
  text: string,
  sessions: SessionNumbers[],
  extra?: Partial<Allowed>
): GroundingResult {
  if (!text) return { text, issues: [], adjusted: false }
  const allowed = collectAllowed(sessions, extra)
  const issues: GroundingIssue[] = []
  let output = text

  // 1. Purely numeric parentheticals with an ungrounded figure: drop them.
  output = output.replace(PARENTHETICAL, (whole, inner: string, offset: number, full: string) => {
    const mentions = findMentions(inner)
    if (mentions.length === 0) return whole
    const leftover = mentions
      .reduce((acc, mention) => acc.replace(mention.text, ''), inner)
      .replace(/\b(?:approx\.?|about|around|ca\.?|and)\b/gi, '')
      .replace(/[\s,;·|/~≈+-]/g, '')
    const bad = mentions.filter((mention) => isUngrounded(mention, allowed))
    if (leftover.length > 0 || bad.length === 0) return whole
    const aboutSession =
      mentions.some((mention) => mention.kind === 'tss') ||
      SESSION_CONTEXT.test(full.slice(Math.max(0, offset - 40), offset))
    if (!aboutSession) return whole
    for (const mention of bad) {
      issues.push({ kind: mention.kind, value: mention.value, text: mention.text, stripped: true })
    }
    return ''
  })

  // 2. Duration adjectives before a session noun ("a 45-minute run"): drop the figure.
  output = output.replace(DURATION_ADJECTIVE, (whole, value: string) => {
    const mention: Mention = { kind: 'duration', value: Number(value), text: whole, index: 0 }
    if (!isUngrounded(mention, allowed)) return whole
    issues.push({ kind: 'duration', value: mention.value, text: whole, stripped: true })
    return ''
  })

  // 3. Everything else: flag only.
  for (const mention of findMentions(output)) {
    if (isUngrounded(mention, allowed)) {
      issues.push({ kind: mention.kind, value: mention.value, text: mention.text, stripped: false })
    }
  }

  const adjusted = issues.some((issue) => issue.stripped)
  return { text: adjusted ? tidy(output) : text, issues, adjusted }
}

const RECOMMENDATION_TYPES = ['Ride', 'Run', 'Gym', 'Swim', 'Rest'] as const
type RecommendationType = (typeof RECOMMENDATION_TYPES)[number]

/** Map a planned workout type to the recommendation schema's type vocabulary. */
export function toRecommendationType(type: string | null | undefined): RecommendationType | null {
  if (!type) return null
  if ((RECOMMENDATION_TYPES as readonly string[]).includes(type)) return type as RecommendationType
  switch (classifySportFamily(type)) {
    case 'run':
      return 'Run'
    case 'ride':
      return 'Ride'
    case 'swim':
      return 'Swim'
    case 'strength':
      return 'Gym'
    default:
      return /rest/i.test(type) ? 'Rest' : null
  }
}

type RecommendationLike = {
  recommendation: string
  reasoning: string
  planned_workout?: {
    original_title?: string
    original_tss?: number
    original_duration_min?: number
  }
  suggested_modifications?: {
    new_type?: string
    new_tss?: number
    new_duration_min?: number
    [key: string]: unknown
  }
  [key: string]: unknown
}

/**
 * Post-process an activity recommendation so its text and structure agree with
 * the plan the athlete sees:
 * - `planned_workout.original_*` are overwritten with the real planned values;
 * - a suggested modification without a sport keeps the planned sport (never a
 *   silent switch to cycling);
 * - an active injury conflict can't end in "proceed";
 * - ungrounded duration/TSS figures in the reasoning are removed or flagged.
 */
export function applyRecommendationConsistency<T extends RecommendationLike>(params: {
  analysis: T
  primaryPlannedWorkout: SessionNumbers | null
  plannedWorkouts: SessionNumbers[]
  completedWorkouts?: SessionNumbers[]
  injuryConflicts?: InjuryConflict[]
}): T {
  const { primaryPlannedWorkout, plannedWorkouts } = params
  const analysis: T = { ...params.analysis }

  if (primaryPlannedWorkout) {
    analysis.planned_workout = {
      ...(analysis.planned_workout || {}),
      original_title: primaryPlannedWorkout.title || analysis.planned_workout?.original_title || '',
      ...(typeof primaryPlannedWorkout.tss === 'number' && {
        original_tss: Math.round(primaryPlannedWorkout.tss)
      }),
      ...(typeof primaryPlannedWorkout.durationSec === 'number' && {
        original_duration_min: Math.round(primaryPlannedWorkout.durationSec / 60)
      })
    }
  }

  if (analysis.suggested_modifications) {
    const mods = { ...analysis.suggested_modifications }
    if (!mods.new_type) {
      const fallbackType = toRecommendationType(primaryPlannedWorkout?.type)
      if (fallbackType) mods.new_type = fallbackType
    }
    analysis.suggested_modifications = mods
  }

  const conflicts = params.injuryConflicts || []
  if (conflicts.length > 0 && analysis.recommendation === 'proceed') {
    const first = conflicts[0]!
    const location = formatInjuryLocation(first.injury.bodyArea, first.injury.side).toLowerCase()
    analysis.recommendation = 'modify'
    analysis.reasoning = `Your ${location} is logged at ${first.injury.painLevel}/10, so don't do this session as planned: swap it for cross-training that doesn't load it, or rest. Low pain alone does not clear a return; follow symptoms and any clinician restrictions, and seek assessment for red flags.`
    ;(analysis as Record<string, unknown>).injury_guard = {
      overridden: 'proceed',
      conflicts: conflicts.map((conflict) => ({
        bodyArea: conflict.injury.bodyArea,
        side: conflict.injury.side ?? null,
        painLevel: conflict.injury.painLevel,
        session: conflict.sessionTitle,
        sport: conflict.sport
      }))
    }
  }

  const mods = analysis.suggested_modifications
  const grounding = checkRationaleGrounding(
    analysis.reasoning || '',
    [...plannedWorkouts, ...(params.completedWorkouts || [])],
    {
      durationsMin:
        typeof mods?.new_duration_min === 'number' ? [Math.round(mods.new_duration_min)] : [],
      tss: typeof mods?.new_tss === 'number' ? [Math.round(mods.new_tss)] : []
    }
  )
  if (grounding.issues.length > 0) {
    analysis.reasoning = grounding.text
    ;(analysis as Record<string, unknown>).rationale_check = {
      adjusted: grounding.adjusted,
      issues: grounding.issues
    }
  }

  return analysis
}
