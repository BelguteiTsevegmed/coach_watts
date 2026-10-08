import { classifySportFamily, type SportFamily } from './coaching/sport'
import { computeSampleExposure, identifyZone, type Zone } from './zones'
import {
  estimateStepDistanceMeters,
  estimateStepDurationSeconds,
  estimateStrengthExerciseDurationSec
} from './structured-workout-persistence'
import {
  deriveMetricUsabilitySignals,
  getActualIntervalsForAnalysis,
  getHrStats,
  type WorkoutAnalysisFactsV2
} from './workout-analysis-facts'
import {
  adaptStructuredWorkout,
  validateStructuredWorkoutLimits,
  type ZoneProfileSnapshot,
  type ZoneRange
} from '../../shared/structured-workout-contract'

export const STIMULUS_VERSION = 'training-stimulus-v1'
type Metric = 'power' | 'heartRate' | 'pace'
type Domain = 'easy' | 'moderate' | 'hard' | 'unknown'
export type IntensityBand = 'recovery' | 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'unknown'
export type StimulusRefs = { ftp: number; lthr: number; maxHr: number; thresholdPace: number }
export type StimulusProfile = Partial<StimulusRefs> & {
  hrZones?: ZoneRange[]
  powerZones?: ZoneRange[]
  paceZones?: ZoneRange[]
}
export type TrainingStimulus = {
  version: typeof STIMULUS_VERSION
  sport: SportFamily
  source:
    | 'planned_structure'
    | 'completed_stream'
    | 'completed_intervals'
    | 'planning_estimate'
    | 'completed_summary'
  confidence: 'medium' | 'low'
  durationSeconds: number
  distanceMeters: number | null
  domainSeconds: Record<Domain, number>
  intensitySeconds: Record<IntensityBand, number>
  prescribedQualitySeconds: number
  hardSession: boolean | null
  strength: {
    sets: number
    repetitions: number
    durationSeconds: number
    source: 'planned_estimate' | 'completed_sets' | 'unknown'
  }
  coverage: { classifiedSeconds: number; fraction: number; unresolvedSteps: number }
  tss: {
    value: number | null
    source: 'structure_estimate' | 'reported' | 'coarse_estimate' | 'unknown'
    coverage: number
  }
  mapping: 'explicit_zone_domains'
}

const positive = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
const nonnegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null

function emptyStimulus(
  type: string | null | undefined,
  source: TrainingStimulus['source']
): TrainingStimulus {
  return {
    version: STIMULUS_VERSION,
    sport: classifySportFamily(type),
    source,
    confidence: 'low',
    durationSeconds: 0,
    distanceMeters: null,
    domainSeconds: { easy: 0, moderate: 0, hard: 0, unknown: 0 },
    intensitySeconds: { recovery: 0, endurance: 0, tempo: 0, threshold: 0, vo2max: 0, unknown: 0 },
    prescribedQualitySeconds: 0,
    hardSession: null,
    strength: { sets: 0, repetitions: 0, durationSeconds: 0, source: 'unknown' },
    coverage: { classifiedSeconds: 0, fraction: 0, unresolvedSteps: 0 },
    tss: { value: null, source: 'unknown', coverage: 0 },
    mapping: 'explicit_zone_domains'
  }
}

export function intensityBand(intensity: number | null): IntensityBand {
  if (intensity === null || !Number.isFinite(intensity) || intensity < 0) return 'unknown'
  if (intensity < 0.7) return 'recovery'
  if (intensity < 0.85) return 'endurance'
  if (intensity < 0.95) return 'tempo'
  if (intensity <= 1.05) return 'threshold'
  return 'vo2max'
}

function zonesFor(
  metric: Metric,
  profile: StimulusProfile,
  snapshot?: ZoneProfileSnapshot
): ZoneRange[] {
  const zones =
    snapshot?.[metric]?.ranges ??
    (metric === 'power'
      ? profile.powerZones
      : metric === 'pace'
        ? profile.paceZones
        : profile.hrZones) ??
    []
  return Array.isArray(zones) ? zones : []
}

function mappedDomain(value: number, zones: ZoneRange[]): Domain {
  const zone = identifyZone(value, zones as Zone[]) as ZoneRange | undefined
  return zone?.domain === 'easy' || zone?.domain === 'moderate' || zone?.domain === 'hard'
    ? zone.domain
    : 'unknown'
}

function reference(metric: Metric, profile: StimulusProfile): number | null {
  // Max HR is not a substitute for LTHR in threshold-relative exposure.
  return positive(
    metric === 'power' ? profile.ftp : metric === 'pace' ? profile.thresholdPace : profile.lthr
  )
}

/** Explicit targets only. No IF fabricated from a vendor zone number, RPE, or a step label. */
function targetBounds(
  step: any,
  metric: Metric,
  profile: StimulusProfile,
  snapshot?: ZoneProfileSnapshot
) {
  const target = step?.[metric]
  if (!target) return null
  const ref = reference(metric, profile)
  if (metric === 'pace' && target.rangeMps) {
    const min = positive(target.rangeMps.min)
    const max = positive(target.rangeMps.max)
    return min !== null && max !== null ? { min, max, relative: null } : null
  }
  const min = nonnegative(target.range?.start ?? target.value)
  const max = nonnegative(target.range?.end ?? target.value)
  if (min === null || max === null || max < min) return null
  const units = String(target.units || '')
    .trim()
    .toLowerCase()
  if (units.includes('zone')) {
    const zones = zonesFor(metric, profile, snapshot)
    const lower = zones[min - 1]
    const upper = zones[max - 1]
    return Number.isInteger(min) && Number.isInteger(max) && lower && upper
      ? { min: lower.min, max: upper.max, relative: null }
      : null
  }
  const absolute = metric === 'power' ? ['w', 'watts'] : metric === 'heartRate' ? ['bpm'] : ['m/s']
  if (absolute.includes(units)) return { min, max, relative: null }
  if (metric === 'pace' && units === '/km' && min > 0 && max > 0)
    return { min: 1000 / (max * 60), max: 1000 / (min * 60), relative: null }
  const relativeUnits =
    metric === 'heartRate'
      ? ['lthr', '%lthr']
      : metric === 'pace'
        ? ['pace', '%pace', 'threshold_pace']
        : ['%', 'relative', 'pct', '%ftp']
  if (relativeUnits.includes(units)) {
    const scale = min > 2 || max > 2 ? 100 : 1
    const relative = { min: min / scale, max: max / scale }
    return { min: ref ? relative.min * ref : null, max: ref ? relative.max * ref : null, relative }
  }
  return null
}

function addExposure(
  summary: TrainingStimulus,
  seconds: number,
  domain: Domain,
  intensity: number | null
) {
  summary.domainSeconds[domain] += seconds
  summary.intensitySeconds[intensityBand(intensity)] += seconds
}

function finish(summary: TrainingStimulus) {
  summary.coverage.classifiedSeconds = summary.durationSeconds - summary.domainSeconds.unknown
  summary.coverage.fraction =
    summary.durationSeconds > 0 ? summary.coverage.classifiedSeconds / summary.durationSeconds : 0
  summary.confidence =
    summary.coverage.fraction >= 0.8 && summary.coverage.unresolvedSteps === 0 ? 'medium' : 'low'
  summary.hardSession =
    summary.domainSeconds.hard > 0 || summary.prescribedQualitySeconds > 0
      ? true
      : summary.coverage.fraction === 1
        ? false
        : null
  return summary
}

export function summarizePlannedStimulus(
  workout: {
    type?: string | null
    durationSec?: number | null
    distanceMeters?: number | null
    tss?: number | null
    structuredWorkout?: unknown
  },
  profile: StimulusProfile = {}
): TrainingStimulus {
  const summary = emptyStimulus(workout.type, 'planned_structure')
  const canonical = adaptStructuredWorkout(workout.structuredWorkout)
  if (!canonical || validateStructuredWorkoutLimits(canonical).length) {
    summary.source = 'planning_estimate'
    summary.durationSeconds = positive(workout.durationSec) ?? 0
    summary.domainSeconds.unknown = summary.durationSeconds
    summary.intensitySeconds.unknown = summary.durationSeconds
    summary.distanceMeters = nonnegative(workout.distanceMeters)
    summary.tss = { value: nonnegative(workout.tss), source: 'coarse_estimate', coverage: 0 }
    return finish(summary)
  }
  const snapshot = canonical.zoneProfileSnapshot
  const resolvedProfile = {
    ...profile,
    thresholdPace: snapshot.pace?.thresholdMps ?? profile.thresholdPace
  }
  const refs: StimulusRefs = {
    ftp: resolvedProfile.ftp ?? 0,
    lthr: resolvedProfile.lthr ?? 0,
    maxHr: resolvedProfile.maxHr ?? 0,
    thresholdPace: resolvedProfile.thresholdPace ?? 0
  }
  let distance = 0
  let hasDistance = false
  let tss = 0
  let tssSeconds = 0
  const walk = (steps: any[], multiplier = 1) => {
    for (const step of steps) {
      const repetitions = multiplier * Math.max(1, Math.trunc(step.reps ?? step.repeat ?? 1))
      if (Array.isArray(step.steps) && step.steps.length) {
        walk(step.steps, repetitions)
        continue
      }
      const order: Metric[] =
        summary.sport === 'ride' ? ['power', 'heartRate'] : ['pace', 'heartRate', 'power']
      if (order.includes(step.primaryTarget)) order.unshift(step.primaryTarget)
      let intensity: number | null = null
      let domain: Domain = 'unknown'
      let paceMps: number | null = null
      for (const metric of [...new Set(order)]) {
        const bounds = targetBounds(step, metric, resolvedProfile, snapshot)
        if (!bounds) continue
        const ref = reference(metric, resolvedProfile)
        if (metric === 'pace' && bounds.min !== null && bounds.max !== null)
          paceMps = (bounds.min + bounds.max) / 2
        intensity = bounds.relative
          ? (bounds.relative.min + bounds.relative.max) / 2
          : ref && bounds.min !== null && bounds.max !== null
            ? (bounds.min + bounds.max) / (2 * ref)
            : null
        if (bounds.min !== null && bounds.max !== null) {
          const lower = mappedDomain(bounds.min, zonesFor(metric, resolvedProfile, snapshot))
          const upper = mappedDomain(bounds.max, zonesFor(metric, resolvedProfile, snapshot))
          domain = lower === upper ? lower : 'unknown'
        }
        break
      }
      const explicitDuration = positive(step.durationSeconds ?? step.duration)
      const stepDistance = positive(step.distance ?? step.distanceMeters)
      const context = { refs, fallbackOrder: ['pace' as const], workoutType: workout.type }
      const seconds =
        explicitDuration ??
        (stepDistance && paceMps
          ? estimateStepDurationSeconds(
              { distance: stepDistance, pace: { value: paceMps, units: 'm/s' } },
              context
            )
          : null)
      if (stepDistance) {
        distance += stepDistance * repetitions
        hasDistance = true
      } else if (explicitDuration && paceMps && summary.sport === 'run') {
        distance +=
          estimateStepDistanceMeters(
            { durationSeconds: explicitDuration, pace: { value: paceMps, units: 'm/s' } },
            context
          ) * repetitions
        hasDistance = true
      }
      if (seconds === null) {
        summary.coverage.unresolvedSteps += repetitions
        continue
      }
      const duration = seconds * repetitions
      summary.durationSeconds += duration
      addExposure(summary, duration, domain, intensity)
      const intent = String(step.intent || '').toLowerCase()
      if (['tempo', 'threshold', 'vo2', 'anaerobic', 'sprint', 'strides'].includes(intent))
        summary.prescribedQualitySeconds += duration
      if (intensity !== null) {
        tss += (duration * intensity ** 2) / 36
        tssSeconds += duration
      }
    }
  }
  walk(canonical.steps)
  const exercises = canonical.blocks?.length
    ? canonical.blocks.flatMap((b) => b.steps || [])
    : canonical.exercises || []
  if (exercises.length) summary.strength.source = 'planned_estimate'
  for (const exercise of exercises) {
    const sets = Array.isArray(exercise.setRows)
      ? exercise.setRows.length
      : (positive(exercise.sets) ?? 1)
    summary.strength.sets += sets
    if (
      !String(exercise.prescriptionMode || exercise.prescriptionType || '').match(
        /duration|distance/
      )
    ) {
      const reps = Array.isArray(exercise.setRows)
        ? exercise.setRows.reduce(
            (sum: number, row: any) => sum + (positive(Number(row.value)) ?? 0),
            0
          )
        : (positive(Number(exercise.value ?? exercise.reps)) ?? 0) * sets
      summary.strength.repetitions += reps
    }
    summary.strength.durationSeconds += estimateStrengthExerciseDurationSec(exercise)
  }
  summary.durationSeconds += summary.strength.durationSeconds
  addExposure(summary, summary.strength.durationSeconds, 'unknown', null)
  // Unresolved distance steps retain their planned time budget in the denominator.
  if (summary.coverage.unresolvedSteps && (workout.durationSec || 0) > summary.durationSeconds) {
    const residual = workout.durationSec! - summary.durationSeconds
    summary.durationSeconds += residual
    addExposure(summary, residual, 'unknown', null)
  }
  summary.distanceMeters = hasDistance ? Math.round(distance) : nonnegative(workout.distanceMeters)
  summary.tss = {
    value: tssSeconds === summary.durationSeconds && tssSeconds > 0 ? Math.round(tss) : null,
    source: tssSeconds > 0 ? 'structure_estimate' : 'unknown',
    coverage: summary.durationSeconds > 0 ? tssSeconds / summary.durationSeconds : 0
  }
  return finish(summary)
}

export function summarizeCompletedStimulus(
  workout: any,
  profile: StimulusProfile = {}
): TrainingStimulus {
  const summary = emptyStimulus(workout.type, 'completed_summary')
  summary.durationSeconds = positive(workout.durationSec) ?? 0
  summary.distanceMeters = nonnegative(workout.distanceMeters)
  summary.tss = {
    value: nonnegative(workout.tss),
    source: nonnegative(workout.tss) !== null ? 'reported' : 'unknown',
    coverage: nonnegative(workout.tss) !== null ? 1 : 0
  }
  const completedSets = Array.isArray(workout.exercises)
    ? workout.exercises.flatMap((e: any) => (Array.isArray(e.sets) ? e.sets : []))
    : []
  if (completedSets.length) {
    summary.strength.source = 'completed_sets'
    summary.strength.sets = completedSets.length
    summary.strength.repetitions = completedSets.reduce(
      (sum: number, set: any) => sum + (nonnegative(set.reps) ?? 0),
      0
    )
    summary.strength.durationSeconds = completedSets.reduce(
      (sum: number, set: any) => sum + (nonnegative(set.durationSec) ?? 0),
      0
    )
  }
  const usability = deriveMetricUsabilitySignals(
    workout.aiAnalysisJson?.guardrails?.telemetry
      ? (workout.aiAnalysisJson as WorkoutAnalysisFactsV2)
      : null,
    workout.type
  )
  const metrics: Array<{ metric: Metric; key: string; usable: boolean }> =
    summary.sport === 'ride'
      ? [
          {
            metric: 'power',
            key: 'watts',
            usable:
              usability?.powerUsable !== false &&
              workout.aiAnalysisJson?.guardrails?.telemetry?.powerAbsoluteUsable !== false
          },
          {
            metric: 'heartRate',
            key: 'heartrate',
            usable:
              usability?.hrUsable !== false &&
              (!Array.isArray(workout.streams?.heartrate) || getHrStats(workout).usable)
          }
        ]
      : [
          { metric: 'pace', key: 'velocity', usable: usability?.paceUsable !== false },
          {
            metric: 'heartRate',
            key: 'heartrate',
            usable:
              usability?.hrUsable !== false &&
              (!Array.isArray(workout.streams?.heartrate) || getHrStats(workout).usable)
          },
          {
            metric: 'power',
            key: 'watts',
            usable:
              usability?.powerUsable !== false &&
              workout.aiAnalysisJson?.guardrails?.telemetry?.powerAbsoluteUsable !== false
          }
        ]
  const candidates = metrics
    .filter((m) => m.usable)
    .map((m) => ({
      ...m,
      exposure: computeSampleExposure(
        workout.streams?.[m.key],
        workout.streams?.time,
        summary.durationSeconds,
        { allowZero: m.metric === 'power' }
      )
    }))
  // Use one trace for a session, avoiding double-counting complementary sensors.
  const candidate =
    candidates.find(
      (c) =>
        c.exposure.length &&
        (reference(c.metric, profile) || zonesFor(c.metric, profile).some((z) => z.domain))
    ) ?? candidates.find((c) => c.exposure.length)
  let covered = 0
  if (candidate) {
    summary.source = 'completed_stream'
    const ref = reference(candidate.metric, profile)
    for (const sample of candidate.exposure) {
      covered += sample.seconds
      addExposure(
        summary,
        sample.seconds,
        mappedDomain(sample.value, zonesFor(candidate.metric, profile)),
        ref ? sample.value / ref : null
      )
    }
  } else {
    const refs = { ftp: 0, lthr: 0, maxHr: 0, thresholdPace: 0, ...profile }
    const intervals = getActualIntervalsForAnalysis(workout, undefined, refs)
    // Provider/engine intervals must form a non-overlapping, bounded partition.
    const total = intervals.reduce(
      (sum, interval) => sum + (positive(interval.durationSeconds) ?? 0),
      0
    )
    const indexed = intervals
      .filter((i) => i.startIndex !== null && i.endIndex !== null)
      .sort((a, b) => a.startIndex! - b.startIndex!)
    const overlapping = indexed.some(
      (i, index) => index > 0 && i.startIndex! <= indexed[index - 1]!.endIndex!
    )
    if (!overlapping && total > 0 && total <= summary.durationSeconds) {
      summary.source = 'completed_intervals'
      for (const interval of intervals) {
        if (interval.confidence !== null && interval.confidence < 0.5) continue
        const seconds = positive(interval.durationSeconds) ?? 0
        const metric = metrics.find(
          (m) =>
            m.usable &&
            positive(
              m.metric === 'power'
                ? interval.avgPower
                : m.metric === 'pace'
                  ? interval.avgSpeed
                  : interval.avgHr
            )
        )
        const value =
          metric?.metric === 'power'
            ? interval.avgPower
            : metric?.metric === 'pace'
              ? interval.avgSpeed
              : interval.avgHr
        const ref = metric ? reference(metric.metric, profile) : null
        addExposure(
          summary,
          seconds,
          metric && value !== null
            ? mappedDomain(value, zonesFor(metric.metric, profile))
            : 'unknown',
          ref && value !== null ? value / ref : null
        )
        covered += seconds
      }
    }
  }
  addExposure(summary, Math.max(0, summary.durationSeconds - covered), 'unknown', null)
  return finish(summary)
}

/** Retain planned, structure-derived, and actual summaries separately; sports never substitute for each other. */
export function aggregateStimulus(summaries: TrainingStimulus[]) {
  const sports: Partial<
    Record<
      SportFamily,
      {
        minutes: number
        distanceMeters: number
        distanceKnownSessions: number
        domainMinutes: Record<Domain, number>
        qualityMinutes: number
        hardSessions: number
        unknownHardSessions: number
        strengthSets: number
        tss: number
        unknownTssSessions: number
      }
    >
  > = {}
  for (const summary of summaries) {
    const sport = (sports[summary.sport] ??= {
      minutes: 0,
      distanceMeters: 0,
      distanceKnownSessions: 0,
      domainMinutes: { easy: 0, moderate: 0, hard: 0, unknown: 0 },
      qualityMinutes: 0,
      hardSessions: 0,
      unknownHardSessions: 0,
      strengthSets: 0,
      tss: 0,
      unknownTssSessions: 0
    })
    sport.minutes += summary.durationSeconds / 60
    sport.distanceMeters += summary.distanceMeters ?? 0
    sport.distanceKnownSessions += summary.distanceMeters !== null ? 1 : 0
    for (const domain of ['easy', 'moderate', 'hard', 'unknown'] as const)
      sport.domainMinutes[domain] += summary.domainSeconds[domain] / 60
    sport.qualityMinutes += summary.prescribedQualitySeconds / 60
    sport.hardSessions += summary.hardSession === true ? 1 : 0
    sport.unknownHardSessions += summary.hardSession === null ? 1 : 0
    sport.strengthSets += summary.strength.sets
    sport.tss += summary.tss.value ?? 0
    sport.unknownTssSessions += summary.tss.value === null ? 1 : 0
  }
  return {
    version: STIMULUS_VERSION,
    sports,
    totalTss: summaries.reduce((sum, s) => sum + (s.tss.value ?? 0), 0),
    sessions: summaries.map((s) => ({
      source: s.source,
      confidence: s.confidence,
      coverage: s.coverage,
      tss: s.tss
    }))
  }
}
