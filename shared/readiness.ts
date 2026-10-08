/** Bounded coaching policy, not a diagnostic model or medical clearance. */
export const READINESS_POLICY = {
  version: 'readiness-v1',
  baselineDays: 28,
  recentDays: 3,
  minimumBaselineSamples: 7,
  minimumTrendSamples: 2,
  hrvDropFraction: 0.15,
  restingHrRiseBpm: 5,
  subjectiveHigh: 7,
  shortSleepHours: 6,
  adviceHorizonDays: 2,
  reducedSessionMinutes: 30
} as const
export const READINESS_FIELDS = [
  'hrv',
  'hrvSdnn',
  'restingHr',
  'sleepHours',
  'recoveryScore',
  'soreness',
  'fatigue',
  'stress',
  'motivation'
] as const
export type ReadinessField = (typeof READINESS_FIELDS)[number]
export type MeasurementOrigin = { source: string; device: string | null; method: string | null }
export type ReadinessWellness = {
  id: string
  date: Date | string
  lastSource?: string | null
  rawJson?: unknown
  history?: unknown
  tags?: string | null
  injury?: string | null
  comments?: string | null
} & Partial<Record<ReadinessField, number | null>>
export type ReadinessCheckin = {
  id: string
  date: Date | string
  questions: unknown
  userNotes?: string | null
}
export type ReadinessEvent = {
  id: string
  startDate: Date | string
  endDate?: Date | string | null
  category?: string | null
  source?: string | null
  title: string
  description?: string | null
}
const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const day = (value: Date | string) => new Date(value).toISOString().slice(0, 10)
const age = (asOf: string, value: Date | string) =>
  (Date.parse(asOf) - Date.parse(day(value))) / 86400000
const round = (n: number) => Math.round(n * 100) / 100
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length ? (sorted[middle]! + sorted[sorted.length - 1 - middle]!) / 2 : null
}
export function validReadinessValue(field: ReadinessField, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return false
  if (['hrv', 'hrvSdnn', 'restingHr', 'sleepHours'].includes(field)) return value > 0
  return value >= 0 && value <= (field === 'recoveryScore' ? 100 : 10)
}
/** Legacy mixed rows cannot safely be attributed using lastSource alone. */
export function measurementOrigin(
  row: ReadinessWellness,
  field: ReadinessField
): MeasurementOrigin | null {
  const stored = object(object(row.rawJson)._readinessProvenance)[field]
  if (stored?.source && stored.source !== 'unknown') {
    return { source: stored.source, device: stored.device ?? null, method: stored.method ?? null }
  }
  const history = Array.isArray(row.history) ? row.history : []
  const sources = new Set(history.map((entry) => object(entry).source).filter(Boolean))
  if (
    sources.size === 1 &&
    row.lastSource &&
    sources.has(row.lastSource) &&
    row.lastSource !== 'unknown'
  ) {
    return { source: row.lastSource, device: null, method: null }
  }
  return null
}
/** Persist attribution for every supplied field, even if its numerical value is unchanged. */
export function readinessProvenance(raw: unknown, data: Record<string, any>, source: string) {
  const incoming = object(data.rawJson)
  const prior = object(object(raw)._readinessProvenance)
  const origins = { ...prior }
  let changed = false
  for (const field of READINESS_FIELDS) {
    if (data[field] === undefined) continue
    changed = true
    origins[field] =
      data[field] === null
        ? null
        : {
            source,
            device: incoming.deviceId ?? incoming.device_id ?? null,
            method: incoming.measurementMethod ?? incoming.measurement_method ?? null
          }
  }
  return changed || Object.keys(prior).length ? origins : null
}

export function resolveReadiness(input: {
  asOf: Date | string
  wellness: ReadinessWellness[]
  checkins?: ReadinessCheckin[]
  events?: ReadinessEvent[]
  injuries?: Array<{ id?: string; bodyArea: string; painLevel: number; status: string }>
  load?: { ctl: number | null; atl: number | null; tsb: number | null }
}) {
  const asOf = day(input.asOf)
  const rows = input.wellness
    .filter((row) => age(asOf, row.date) >= 0 && age(asOf, row.date) < 31)
    .sort((a, b) => day(b.date).localeCompare(day(a.date)) || a.id.localeCompare(b.id))
  const trends = (['hrv', 'hrvSdnn', 'restingHr', 'sleepHours'] as const).map((metric) => {
    const valid = rows.filter((r) => validReadinessValue(metric, r[metric]))
    const latest = valid[0]
    const origin = latest ? measurementOrigin(latest, metric) : null
    const key = JSON.stringify(origin)
    const comparable = origin
      ? valid.filter((r) => JSON.stringify(measurementOrigin(r, metric)) === key)
      : []
    const baselineRows = comparable.filter((r) => age(asOf, r.date) >= 3)
    const recentRows = comparable.filter((r) => age(asOf, r.date) < 3)
    const baseline = median(baselineRows.map((r) => r[metric]!))
    const recent = median(recentRows.map((r) => r[metric]!))
    const eligible =
      baselineRows.length >= READINESS_POLICY.minimumBaselineSamples &&
      !!latest &&
      age(asOf, latest.date) === 0
    const adverse = (n: number) =>
      baseline !== null &&
      (metric === 'restingHr'
        ? n >= baseline + READINESS_POLICY.restingHrRiseBpm
        : metric === 'sleepHours'
          ? n < READINESS_POLICY.shortSleepHours
          : n <= baseline * (1 - READINESS_POLICY.hrvDropFraction))
    const adverseRows = eligible ? recentRows.filter((r) => adverse(r[metric]!)) : []
    const persistent =
      adverseRows.length >= READINESS_POLICY.minimumTrendSamples && adverse(latest![metric]!)
    return {
      metric,
      origin,
      latest: latest
        ? {
            value: latest[metric]!,
            date: day(latest.date),
            recordId: latest.id,
            ageDays: age(asOf, latest.date)
          }
        : null,
      baseline: {
        median: baseline === null ? null : round(baseline),
        samples: baselineRows.length,
        missingDays: 28 - baselineRows.length
      },
      recent: {
        median: recent === null ? null : round(recent),
        samples: recentRows.length,
        missingDays: 3 - recentRows.length
      },
      excludedSamples: valid.length - comparable.length,
      status: !eligible
        ? 'insufficient'
        : persistent
          ? 'persistent_adverse'
          : adverseRows.length
            ? 'isolated_adverse'
            : 'usual',
      evidenceIds: adverseRows.map((r) => r.id)
    }
  })
  const today = rows.find((r) => day(r.date) === asOf)
  const subjective = (['soreness', 'fatigue', 'stress', 'motivation'] as const).map((metric) => {
    const origin = today ? measurementOrigin(today, metric) : null
    // Device stress is not an athlete report, even when stored on a similar numeric scale.
    const reported =
      metric !== 'stress' ||
      (!!origin &&
        (['manual', 'user', 'intervals'].includes(origin.source) ||
          origin.source.startsWith('oauth:')))
    return {
      metric,
      value:
        reported && today && validReadinessValue(metric, today[metric]) ? today[metric]! : null,
      origin,
      recordId: today?.id ?? null,
      interpretation: reported ? 'athlete_report' : 'unverified_or_device_stress'
    }
  })
  const high = subjective.filter(
    (s) =>
      s.value !== null && s.metric !== 'motivation' && s.value >= READINESS_POLICY.subjectiveHigh
  )
  const lowMotivation = subjective.some(
    (s) => s.metric === 'motivation' && s.value !== null && s.value <= 3
  )
  const shortSleep =
    today &&
    validReadinessValue('sleepHours', today.sleepHours) &&
    today.sleepHours < READINESS_POLICY.shortSleepHours
  const activeEvents = (input.events || []).filter(
    (e) => day(e.startDate) <= asOf && day(e.endDate || e.startDate) >= asOf
  )
  const illness =
    activeEvents.some((e) => e.category?.toUpperCase() === 'SICK') ||
    !!today?.tags?.split(',').some((tag) => /^(sick|ill|illness)$/i.test(tag.trim())) ||
    today?.injury?.toUpperCase() === 'SICK'
  const persistent = trends.filter(
    (t) => t.metric !== 'sleepHours' && t.status === 'persistent_adverse'
  )
  const reasons: string[] = []
  let decision: 'unknown' | 'usual' | 'monitor' | 'reduce' | 'rest' = 'unknown'
  if (illness) {
    decision = 'rest'
    reasons.push(
      'Illness is explicitly recorded for this date; propose rest and reassess symptoms.'
    )
  } else if (high.length) {
    decision = 'reduce'
    reasons.push(
      `Athlete-reported ${high.map((s) => `${s.metric} ${s.value}/10`).join(', ')} supports reducing the next key session, even with usual sensors.`
    )
  } else if (persistent.length && (lowMotivation || shortSleep)) {
    decision = 'reduce'
    reasons.push(
      'A persistent comparable sensor trend coincides with low motivation or short sleep; propose easy work in place of intensity.'
    )
  } else if (
    persistent.length ||
    shortSleep ||
    lowMotivation ||
    trends.some((t) => t.status === 'isolated_adverse')
  ) {
    decision = 'monitor'
    reasons.push(
      'Review symptoms and measurement conditions. An isolated reading or sensors alone do not authorize an automatic session change.'
    )
  } else if (subjective.some((s) => s.value !== null) || trends.some((t) => t.status === 'usual')) {
    decision = 'usual'
    reasons.push(
      'Available signals show no policy trigger; this does not establish clearance for training.'
    )
  } else {
    reasons.push(
      'Current comparable recovery and subjective evidence are missing; confirm readiness with the athlete.'
    )
  }
  const conflicts =
    high.length &&
    trends.some((t) => ['hrv', 'hrvSdnn', 'restingHr'].includes(t.metric) && t.status === 'usual')
      ? [
          'Athlete reports poor readiness while comparable sensors are usual; prioritize the athlete report.'
        ]
      : []
  const checkins = (input.checkins || [])
    .filter((c) => age(asOf, c.date) >= 0 && age(asOf, c.date) < 3)
    .sort((a, b) => day(b.date).localeCompare(day(a.date)))
    .map((c) => ({
      id: c.id,
      date: day(c.date),
      ageDays: age(asOf, c.date),
      userNotes: c.userNotes ?? null,
      answers: (Array.isArray(c.questions) ? c.questions : [])
        .filter((q) => object(q).answer != null && object(q).answer !== '')
        .map((q) => ({
          text: String(object(q).text || ''),
          answer: String(object(q).answer)
        }))
    }))
  return {
    version: READINESS_POLICY.version,
    asOf,
    policy: READINESS_POLICY,
    windows: {
      baseline: {
        from: new Date(Date.parse(asOf) - 30 * 86400000).toISOString().slice(0, 10),
        through: new Date(Date.parse(asOf) - 3 * 86400000).toISOString().slice(0, 10)
      },
      recent: {
        from: new Date(Date.parse(asOf) - 2 * 86400000).toISOString().slice(0, 10),
        through: asOf
      }
    },
    trends,
    subjective,
    checkins,
    recoveryScores: rows
      .filter((r) => age(asOf, r.date) < 3 && validReadinessValue('recoveryScore', r.recoveryScore))
      .map((r) => ({
        recordId: r.id,
        date: day(r.date),
        value: r.recoveryScore!,
        origin: measurementOrigin(r, 'recoveryScore')
      })),
    events: activeEvents.map((e) => ({
      id: e.id,
      category: e.category,
      source: e.source ?? null,
      title: e.title,
      description: e.description
    })),
    injuries: input.injuries || [],
    load: input.load || { ctl: null, atl: null, tsb: null },
    decision,
    reasons,
    conflicts,
    uncertainty: [
      ...trends
        .filter((t) => t.status === 'insufficient')
        .map((t) => `${t.metric}: insufficient comparable baseline or no fresh reading`),
      ...subjective.filter((s) => s.value === null).map((s) => `${s.metric}: missing today`),
      ...(checkins.length
        ? [
            'Check-in answers are athlete reports for coach interpretation; free text is not a numeric or diagnostic trigger.'
          ]
        : ['No completed check-in in the last 3 days.']),
      'Device/method identity is unknown where not supplied; confirm comparability after a device or protocol change.'
    ],
    application: {
      status: 'advice_only' as const,
      horizonThrough: new Date(Date.parse(asOf) + READINESS_POLICY.adviceHorizonDays * 86400000)
        .toISOString()
        .slice(0, 10),
      requiresValidation: true,
      preserveCompletedAndLocked: true
    }
  }
}
export type ResolvedReadiness = ReturnType<typeof resolveReadiness>
export function formatReadinessForPrompt(context: ResolvedReadiness) {
  return `RESOLVED PERSONAL READINESS (authoritative facts; ${context.version}):\n${JSON.stringify(context)}\nRules: Keep rMSSD and SDNN separate. Never pool recovery scores or device baselines. Check-in answers can justify proposing a reduction even with usual sensors; explain disagreement and uncertainty. Do not diagnose from text or sensors. CTL/ATL/TSB describe load, not race readiness, illness, overtraining or injury risk. Apply current advice only within its horizon, then reassess; do not reduce every future week from today's reading. Show the original session, proposed change and reason; suggestions have not changed the calendar. Preserve completed/locked sessions. Any accepted edit must pass the validated prescription/adaptation flow. No automatic change from a lone sensor reading.\n`
}

/** Explicit effort instruction, not a threshold or physiological domain estimate. */
export function isExplicitEasyReadinessStructure(structure: unknown): boolean {
  const steps = object(structure).steps
  if (!Array.isArray(steps) || !steps.length) return false
  const easy = (step: any, depth: number): boolean => {
    if (depth > 10) return false
    if (Array.isArray(step.steps) && step.steps.length)
      return step.steps.every((s: any) => easy(s, depth + 1))
    const target = typeof step.rpe === 'number' ? step.rpe : object(step.rpe).value
    return (
      step.primaryTarget === 'rpe' &&
      !step.power &&
      !step.heartRate &&
      !step.pace &&
      typeof target === 'number' &&
      target > 0 &&
      target <= 3 &&
      ['easy', 'recovery', 'warmup', 'cooldown'].includes(step.intent)
    )
  }
  return steps.every((step) => easy(step, 0))
}
