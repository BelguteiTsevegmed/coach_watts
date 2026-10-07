import { normalizeWorkoutSport, type WorkoutSport } from './workout-support-matrix'

export const PHYSIOLOGY_METRICS = ['ftp', 'lthr', 'maxHr', 'thresholdPace'] as const
export type PhysiologyMetric = (typeof PHYSIOLOGY_METRICS)[number]
export type PhysiologyRefs = Record<PhysiologyMetric, number>
export type ReferenceProvenance = {
  value: number | null
  status: 'unknown' | 'configured' | 'measured' | 'estimated' | 'stale' | 'conflicting'
  source: string | null
  sport: WorkoutSport
  measuredAt: string | null
  confidence: 'unknown' | 'low' | 'medium' | 'high'
  sufficientlyCurrent: boolean | null
  usable: boolean
  alternatives: number[]
}
export type PhysiologyResolution = {
  version: 1
  sport: WorkoutSport
  refs: PhysiologyRefs
  references: Record<PhysiologyMetric, ReferenceProvenance>
  guidance: string[]
  calibrationOptions: Array<{ id: string; description: string; requires: string }>
}

export function positiveReference(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : null
}

// A product review horizon, not a claim about physiological validity.
export const REFERENCE_REVIEW_DAYS = 90

/** Resolve accepted settings only. Pending threshold nominations are never inputs. */
export function resolvePhysiologyReferences(input: {
  workoutType?: string | null
  sportSettings?: any
  user?: any
  now?: Date
}): PhysiologyResolution {
  const sport = normalizeWorkoutSport(input.workoutType)
  const settings = input.sportSettings || {}
  const profileSports = (settings.types || []).map(normalizeWorkoutSport)
  const wrongSport =
    !settings.isDefault && profileSports.length > 0 && !profileSports.includes(sport)
  const guidance: string[] = []
  const references = {} as PhysiologyResolution['references']
  const refs = {} as PhysiologyRefs
  const now = (input.now || new Date()).getTime()
  for (const metric of PHYSIOLOGY_METRICS) {
    // The legacy user FTP is a cycling setting, never a running power reference.
    const allowLegacy =
      !wrongSport &&
      (!settings.id || settings.isDefault) &&
      metric !== 'thresholdPace' &&
      (metric !== 'ftp' || sport === 'ride')
    const profileValue =
      wrongSport || (settings.isDefault && metric === 'ftp' && sport !== 'ride')
        ? null
        : positiveReference(settings[metric])
    const legacyValue = allowLegacy ? positiveReference(input.user?.[metric]) : null
    const value = profileValue ?? legacyValue
    const metadata = settings.zoneConfiguration?.physiologyReferences?.[metric]
    // Metadata must describe this exact accepted value, not a previous edit.
    const evidence = metadata && positiveReference(metadata.value) === value ? metadata : null
    const date = evidence?.measuredAt ? new Date(evidence.measuredAt) : null
    const measuredAt = date && Number.isFinite(date.getTime()) ? date.toISOString() : null
    const sufficientlyCurrent = measuredAt
      ? now >= date!.getTime() && now - date!.getTime() <= REFERENCE_REVIEW_DAYS * 86400000
      : null
    const estimated = evidence?.status === 'estimated'
    const qualified =
      (!estimated || Boolean(evidence?.evidenceQualified && evidence?.workoutId)) &&
      (!evidence?.sport || evidence.sport === 'other' || evidence.sport === sport)
    const alternatives = Array.from(
      new Set<number>([
        ...(profileValue && legacyValue && profileValue !== legacyValue ? [legacyValue] : []),
        ...(settings.referenceConflicts?.[metric] || [])
          .map(positiveReference)
          .filter((n: number | null) => n !== null && n !== value)
      ])
    )
    const usable = value !== null && qualified && sufficientlyCurrent !== false
    const status: ReferenceProvenance['status'] =
      value === null || !qualified
        ? 'unknown'
        : sufficientlyCurrent === false
          ? 'stale'
          : alternatives.length
            ? 'conflicting'
            : estimated
              ? 'estimated'
              : evidence?.status === 'measured'
                ? 'measured'
                : 'configured'
    references[metric] = {
      value,
      status,
      source: value === null ? null : evidence?.source || settings.source || 'user_settings',
      sport: evidence?.sport || (settings.isDefault ? 'other' : sport),
      measuredAt,
      confidence: evidence?.confidence || 'unknown',
      sufficientlyCurrent,
      usable,
      alternatives
    }
    // Zero is only the legacy arithmetic boundary's unknown sentinel. Snapshots use null.
    refs[metric] = usable ? value! : 0
    if (!usable)
      guidance.push(`${metric}: ${status}; use effort cues and calibrate before precise targets.`)
    else if (alternatives.length)
      guidance.push(
        `${metric}: selected profile ${settings.id || 'default'} takes precedence; review conflicting settings and regenerate affected sessions.`
      )
    else if (sufficientlyCurrent === null)
      guidance.push(`${metric}: configured reference; measurement date and freshness are unknown.`)
  }
  const calibrationOptions =
    sport === 'ride'
      ? [
          {
            id: 'cycling_ftp_benchmark',
            description:
              'Use a dedicated cycling FTP benchmark with a reliable power meter, or enter a recent tested FTP.',
            requires:
              'A benchmark effort; automatic first estimates also require sustained threshold-intensity corroboration. Ordinary easy rides do not qualify.'
          }
        ]
      : sport === 'run'
        ? [
            {
              id: 'running_threshold_benchmark',
              description:
                'Enter a recent running threshold benchmark or review a sustained 40-minute running effort.',
              requires:
                'Reliable speed and adequate HR coverage at independently established threshold intensity for a first automatic estimate. Ordinary easy runs do not qualify.'
            }
          ]
        : []
  return { version: 1, sport, refs, references, guidance, calibrationOptions }
}

export function formatPhysiologyReferencePrompt(resolution: PhysiologyResolution): string {
  return `ATHLETE REFERENCES (unknown values must stay unknown):\n${PHYSIOLOGY_METRICS.map(
    (metric) => {
      const ref = resolution.references[metric]
      return `${metric}: ${ref.usable ? ref.value : 'unknown'}; status=${ref.status}, source=${ref.source || 'unknown'}, sport=${ref.sport}, date=${ref.measuredAt || 'unknown'}, confidence=${ref.confidence}`
    }
  ).join(
    '\n'
  )}\nUse only usable references. If a target reference is unknown, use duration, RPE (1–10), and talk-test/effort cues. Never invent watts, bpm, pace, or athlete thresholds. Effort cues take precedence over target-format preferences and older workout text.\n${resolution.guidance.join('\n')}\n${resolution.calibrationOptions.map((option) => `${option.description} ${option.requires}`).join('\n')}`
}

/** Server-owned fallback after AI output; recurse through repeat blocks. */
export function applyAvailableReferenceTargets(step: any, refs: PhysiologyRefs) {
  if (Array.isArray(step?.steps) && step.steps.length) {
    step.steps.forEach((child: any) => applyAvailableReferenceTargets(child, refs))
    return
  }
  if (!step || typeof step !== 'object') return
  const hrUnits = String(step.heartRate?.units || 'LTHR').toLowerCase()
  const available = {
    power: refs.ftp > 0,
    heartRate: hrUnits === 'hr' || hrUnits.includes('max') ? refs.maxHr > 0 : refs.lthr > 0,
    pace: refs.thresholdPace > 0
  }
  if (!available.power) delete step.power
  if (!available.heartRate) delete step.heartRate
  if (!available.pace) delete step.pace
  const primary = step.primaryTarget
  if (primary && primary !== 'rpe' && step[primary] !== undefined) return
  const metric = (['power', 'heartRate', 'pace'] as const).find((metric) => step[metric])
  if (metric) {
    step.primaryTarget = metric
    return
  }
  const intent = String(step.intent || step.type || 'endurance').toLowerCase()
  const rpeByIntent: Record<string, number> = {
    warmup: 2,
    cooldown: 2,
    rest: 2,
    recovery: 2,
    easy: 3,
    endurance: 4,
    tempo: 6,
    threshold: 7,
    vo2: 8,
    anaerobic: 9,
    sprint: 10,
    strides: 8,
    drills: 3
  }
  step.primaryTarget = 'rpe'
  step.rpe =
    typeof step.rpe === 'number' && Number.isFinite(step.rpe)
      ? Math.min(10, Math.max(1, step.rpe))
      : rpeByIntent[intent] || 4
  const unsupportedNumbers =
    /(?:\d+:)?\d+(?:\.\d+)?\s*(?:watts\b|w\b|bpm\b|%\s*(?:FTP|LTHR|HR|Pace)?|\/km\b|\/mi\b|m\/s\b)/gi
  step.name =
    String(step.name || step.type || 'Effort')
      .replace(unsupportedNumbers, '')
      .trim() || 'Effort'
  step.description = String(step.description || '')
    .replace(unsupportedNumbers, '')
    .trim()
  const cue =
    step.rpe <= 4
      ? 'Speak comfortably in full sentences.'
      : step.rpe <= 7
        ? 'Controlled effort; speak in short phrases.'
        : 'Hard effort; only a few words at a time.'
  if (!String(step.description || '').endsWith(cue))
    step.description = `${step.description || ''}${step.description ? ' ' : ''}RPE ${step.rpe}/10. ${cue}`
}

export function isEffortOnlyWorkout(structure: any): boolean {
  const leaves: any[] = []
  const visit = (steps: any[]) => {
    for (const step of steps || []) {
      if (step.steps?.length) visit(step.steps)
      else leaves.push(step)
    }
  }
  visit(structure?.steps || [])
  return (
    leaves.length > 0 &&
    leaves.every(
      (step) => typeof step.rpe === 'number' && !step.power && !step.heartRate && !step.pace
    )
  )
}
