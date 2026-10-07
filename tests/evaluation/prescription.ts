import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import {
  buildPlanProgression,
  calculateProgressionWeekTargets,
  remainingProgressionBudgets
} from '../../server/utils/plans/progression-policy'
import {
  clampGeneratedBlockWeeks,
  validateGeneratedBlockWeeks
} from '../../server/utils/plans/block-volume'
import { validateRecalculationProposal } from '../../server/utils/plans/week-recalculation'
import {
  compileWorkoutPlanDraftToStructure,
  type WorkoutPlanDraftStep
} from '../../server/utils/structured-workout-draft'
import { hasValidRepeatBlockRecovery } from '../../server/utils/structured-workout-validation'
import { classifySportFamily } from '../../server/utils/coaching/sport'

export const ENTRYPOINTS = [
  'initialize',
  'block',
  'week',
  'ad-hoc',
  'chat',
  'structure',
  'adaptation'
] as const
export type Entrypoint = (typeof ENTRYPOINTS)[number]
export const BENCHMARK_VERSION = 'prescription-benchmark-v1'
export const AUDIT_VERSION = 'prescription-audit-v1'

const sport = z.enum(['Run', 'Ride', 'Swim', 'Gym'])
const sessionSchema = z.object({
  day: z.number().int().min(0).max(6),
  type: sport,
  minutes: z.number().finite().positive().max(1440),
  intensity: z.enum(['easy', 'moderate', 'hard']),
  description: z.string().min(1),
  // Explicit numerical claims avoid pretending a text regex is a coaching review.
  claimedMinutes: z.number().positive(),
  claimedQualityMinutes: z.number().nonnegative(),
  steps: z
    .array(
      z.object({
        type: z.enum(['Warmup', 'Active', 'Rest', 'Cooldown']),
        intent: z.string(),
        durationSeconds: z.number().positive().optional(),
        distanceMeters: z.number().positive().optional(),
        reps: z.number().int().positive().max(50).optional(),
        target: z.object({ metric: z.literal('rpe'), value: z.number().min(1).max(10) }).optional(),
        steps: z
          .array(
            z.object({
              type: z.enum(['Warmup', 'Active', 'Rest', 'Cooldown']),
              intent: z.string(),
              durationSeconds: z.number().positive(),
              target: z
                .object({ metric: z.literal('rpe'), value: z.number().min(1).max(10) })
                .optional()
            })
          )
          .optional()
      })
    )
    .min(1)
})

export const scenarioSchema = z
  .object({
    id: z.string().min(1),
    tags: z.array(z.string()).min(1),
    now: z.string().datetime(),
    sports: z.array(sport).min(1),
    requestedMinutes: z.number().nonnegative(),
    availability: z.array(z.number().nonnegative()).length(7),
    historyCompleteness: z.enum(['COMPLETE', 'UNKNOWN']),
    history: z.array(
      z.object({
        type: sport,
        daysAgo: z.number().int().nonnegative(),
        minutes: z.number().positive()
      })
    ),
    committed: z.array(
      z.object({
        day: z.number().int().min(0).max(6),
        type: sport,
        minutes: z.number().positive(),
        source: z.enum(['completed', 'extra', 'locked', 'external'])
      })
    ),
    missedMinutes: z.number().nonnegative(),
    restrictions: z.array(sport),
    eventWeeks: z.number().int().positive(),
    expectedFirstWeekMinutes: z.number().nonnegative(),
    expectedHistoryStatus: z.string(),
    reference: z.array(sessionSchema),
    coachReview: z.object({
      status: z.enum(['pending', 'approved', 'rejected']),
      reviewer: z.string().nullable(),
      reviewedAt: z.string().datetime().nullable(),
      rubricVersion: z.literal('coaching-rubric-v1'),
      notes: z.string()
    })
  })
  .superRefine((value, context) => {
    if (
      value.coachReview.status !== 'pending' &&
      (!value.coachReview.reviewer || !value.coachReview.reviewedAt)
    )
      context.addIssue({
        code: 'custom',
        message: 'A human review requires a reviewer and review date'
      })
  })
export type Scenario = z.infer<typeof scenarioSchema>
export type Session = z.infer<typeof sessionSchema>

// Captures are supplied by a separately configured generator, never by this offline harness.
export const captureSchema = z.object({
  version: z.literal(BENCHMARK_VERSION),
  records: z
    .array(
      z.object({
        scenarioId: z.string(),
        inputHash: z.string(),
        entrypoint: z.enum(ENTRYPOINTS),
        provenance: z.object({
          model: z.string().min(1),
          prompt: z.string().min(1),
          policy: z.string().min(1),
          family: z.string().min(1),
          capture: z.enum(['recorded', 'live-capture'])
        }),
        generatorLatencyMs: z.number().finite().nonnegative(),
        decision: z.enum(['accepted', 'rejected', 'adjusted', 'failed']),
        sessions: z.array(sessionSchema),
        failure: z.string().optional()
      })
    )
    .min(1)
})
export type Capture = z.infer<typeof captureSchema>['records'][number]

export function inputHash(scenario: Scenario): string {
  const { reference, coachReview, ...input } = scenario
  return createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

export function validateCaptures(scenarios: Scenario[], value: unknown): Capture[] {
  const records = captureSchema.parse(value).records
  const keys = new Set<string>()
  for (const record of records) {
    const scenario = scenarios.find((row) => row.id === record.scenarioId)
    if (!scenario || record.inputHash !== inputHash(scenario))
      throw new Error(`Unknown scenario or changed snapshot: ${record.scenarioId}`)
    const key = `${record.scenarioId}:${record.entrypoint}`
    if (keys.has(key)) throw new Error(`Duplicate capture: ${key}`)
    keys.add(key)
  }
  for (const scenario of scenarios)
    for (const path of ENTRYPOINTS)
      if (!keys.has(`${scenario.id}:${path}`))
        throw new Error(`Missing capture: ${scenario.id}:${path}`)
  return records
}

export function resolveScenario(scenario: Scenario) {
  const now = new Date(scenario.now)
  const progression = buildPlanProgression({
    now,
    workouts: scenario.history.map((row, index) => ({
      id: `${scenario.id}-${index}`,
      type: row.type,
      durationSec: row.minutes * 60,
      date: new Date(now.getTime() - row.daysAgo * 86400000),
      isDuplicate: false
    })),
    activityTypes: scenario.sports,
    requestedVolumeMinutes: scenario.requestedMinutes,
    availabilityMinutes: scenario.availability.reduce((sum, minutes) => sum + minutes, 0),
    historyCompleteness: scenario.historyCompleteness,
    planWeeks: scenario.eventWeeks
  })
  const targets = [1, 2, 3].map((ordinal) =>
    calculateProgressionWeekTargets(progression, {
      blockType: 'BASE',
      weekNumber: ordinal,
      blockDurationWeeks: 3,
      isRecovery: false,
      loadingWeekOrdinal: ordinal
    })
  )
  const first = targets[0]!
  const budgets = remainingProgressionBudgets(
    first.volumeTargetMinutes,
    first.sportVolumeTargets,
    scenario.committed.map((row) => ({ type: row.type, durationSec: row.minutes * 60 }))
  )
  return { progression, targets, budgets }
}

const QUALITY_INTENTS = new Set(['tempo', 'threshold', 'vo2', 'anaerobic', 'sprint', 'strides'])

function stepDose(steps: WorkoutPlanDraftStep[]): {
  seconds: number
  qualitySeconds: number
  unknown: number
} {
  return steps.reduce(
    (sum, step) => {
      const reps = step.reps ?? 1
      const dose = step.steps?.length
        ? stepDose(step.steps)
        : {
            seconds: step.durationSeconds ?? 0,
            qualitySeconds: QUALITY_INTENTS.has(step.intent ?? '')
              ? (step.durationSeconds ?? 0)
              : 0,
            unknown: step.durationSeconds ? 0 : 1
          }
      return {
        seconds: sum.seconds + dose.seconds * reps,
        qualitySeconds: sum.qualitySeconds + dose.qualitySeconds * reps,
        unknown: sum.unknown + dose.unknown * reps
      }
    },
    { seconds: 0, qualitySeconds: 0, unknown: 0 }
  )
}

/** Independent observational checks, never a substitute for a production validator. */
export function auditSessions(scenario: Scenario, sessions: Session[]) {
  const { budgets } = resolveScenario(scenario)
  const violations: string[] = []
  const dayTotals = new Map<number, number>()
  const sportTotals: Record<string, number> = {}
  let unknownSteps = 0
  let qualityMinutes = 0
  for (const session of sessions) {
    const key = classifySportFamily(session.type)
    sportTotals[key] = (sportTotals[key] ?? 0) + session.minutes
    dayTotals.set(session.day, (dayTotals.get(session.day) ?? 0) + session.minutes)
    if (scenario.committed.some((row) => row.day === session.day)) violations.push('protected_day')
    if (scenario.restrictions.includes(session.type)) violations.push('restricted_sport')
    const structure = compileWorkoutPlanDraftToStructure({
      steps: session.steps,
      coachInstructions: session.description
    })
    const dose = stepDose(structure.steps)
    unknownSteps += dose.unknown
    qualityMinutes += dose.qualitySeconds / 60
    if (!dose.unknown && Math.abs(dose.seconds / 60 - session.minutes) > 0.1)
      violations.push('structure_duration')
    if (Math.abs(session.claimedMinutes - session.minutes) > 0.1)
      violations.push('description_duration')
    if (!dose.unknown && Math.abs(session.claimedQualityMinutes - dose.qualitySeconds / 60) > 0.1)
      violations.push('quality_dose')
    if (!hasValidRepeatBlockRecovery(structure.steps).valid) violations.push('repeat_recovery')
  }
  for (const [day, minutes] of dayTotals)
    if (minutes > scenario.availability[day]!) violations.push('availability')
  for (const [key, minutes] of Object.entries(sportTotals))
    if (
      minutes > (budgets.sportVolumeTargets?.[key as keyof typeof budgets.sportVolumeTargets] ?? 0)
    )
      violations.push('sport_budget')
  const totalMinutes = sessions.reduce((sum, session) => sum + session.minutes, 0)
  if (totalMinutes > (budgets.volumeTargetMinutes ?? 0)) violations.push('weekly_budget')
  return {
    violations: [...new Set(violations)].sort(),
    totalMinutes,
    sportTotals,
    qualityMinutes,
    unknownSteps
  }
}

export function replay(scenario: Scenario, entrypoint: Entrypoint, capture?: Capture) {
  const started = performance.now()
  const resolved = resolveScenario(scenario)
  const sessions = structuredClone(capture?.sessions ?? scenario.reference)
  let observedDecision: Capture['decision'] | 'not-exercised' = capture?.decision ?? 'accepted'
  let final = sessions
  let failure: string | null = null
  let adapter: string
  const target = {
    weekNumber: 1,
    ...resolved.budgets,
    availability: scenario.availability.map((duration, dayOfWeek) => ({
      dayOfWeek,
      id: `${scenario.id}-availability-${dayOfWeek}`,
      userId: scenario.id,
      createdAt: new Date(scenario.now),
      updatedAt: new Date(scenario.now),
      morning: duration > 0,
      afternoon: false,
      evening: false,
      preferredTypes: null,
      indoorOnly: false,
      outdoorOnly: false,
      gymAccess: false,
      bikeAccess: false,
      notes: null,
      slots: [{ duration, activityTypes: scenario.sports }]
    }))
  }
  try {
    if (capture && ['rejected', 'failed'].includes(capture.decision)) {
      // Preserve actual endpoint failures/rejections; never turn a failed capture
      // into a successful local clamp or empty rest plan.
      adapter = 'captured-endpoint-outcome'
    } else if (entrypoint === 'initialize') {
      adapter = 'production-progression-kernel'
    } else if (entrypoint === 'block' || entrypoint === 'week') {
      adapter = 'production-volume-kernel'
      const week = {
        weekNumber: 1,
        workouts: sessions.map((session) => ({
          dayOfWeek: session.day,
          type: session.type,
          title: session.description,
          durationMinutes: session.minutes
        }))
      }
      if (validateGeneratedBlockWeeks([week], [target]).length) {
        observedDecision = 'adjusted'
        const clamped = clampGeneratedBlockWeeks([week], [target]).weeks[0]!
        final = clamped.workouts!.flatMap((row, index) =>
          row.type === 'Rest' ? [] : [{ ...sessions[index]!, minutes: row.durationMinutes! }]
        )
        if (validateGeneratedBlockWeeks([clamped], [target]).length) observedDecision = 'rejected'
      }
    } else if (entrypoint === 'structure') {
      adapter = 'production-draft-compiler-and-recovery-kernel'
      for (const session of sessions) {
        const structure = compileWorkoutPlanDraftToStructure({
          steps: session.steps,
          coachInstructions: session.description
        })
        const recovery = hasValidRepeatBlockRecovery(structure.steps)
        if (!recovery.valid) {
          observedDecision = 'rejected'
          failure = recovery.reason
        }
      }
    } else if (entrypoint === 'adaptation') {
      adapter = 'production-recalculation-validator'
      const start = new Date(scenario.now)
      start.setUTCDate(start.getUTCDate() - start.getUTCDay())
      const date = (day: number) =>
        new Date(start.getTime() + day * 86400000).toISOString().slice(0, 10)
      const eligible = scenario.availability
        .map((_, day) => day)
        .filter((day) => !scenario.committed.some((row) => row.day === day))
      if (new Set(sessions.map((session) => session.day)).size !== sessions.length)
        throw new Error('Multiple sessions on one adaptation day')
      validateRecalculationProposal(
        {
          weekSummary: 'Synthetic replay',
          days: eligible
            .map((day) => {
              const session = sessions.find((row) => row.day === day)
              return {
                date: date(day),
                workoutType: session?.type ?? 'Rest',
                durationMinutes: session?.minutes ?? 0,
                targetTSS: 0,
                title: session?.description ?? 'Rest',
                description: session?.description ?? '',
                reasoningText: 'Recorded scenario'
              }
            })
            .concat(
              sessions
                .filter((session) => !eligible.includes(session.day))
                .map((session) => ({
                  date: date(session.day),
                  workoutType: session.type,
                  durationMinutes: session.minutes,
                  targetTSS: 0,
                  title: session.description,
                  description: session.description,
                  reasoningText: 'Recorded scenario'
                }))
            )
        },
        {
          remainingSportVolumeTargets: resolved.budgets.sportVolumeTargets,
          remainingVolumeMinutes: resolved.budgets.volumeTargetMinutes!,
          remainingTSS: 2000,
          eligibleDays: eligible.map(date),
          availability: target.availability,
          boundary: date(0),
          end: date(6),
          replaceable: [],
          preserved: [],
          committedMinutes: 0,
          committedTSS: 0
        }
      )
    } else {
      adapter = 'recorded-output-boundary-only'
      if (!capture) observedDecision = 'not-exercised'
    }
  } catch (error) {
    adapter =
      entrypoint === 'adaptation' ? 'production-recalculation-validator' : 'production-kernel'
    const expectedRejection =
      entrypoint === 'adaptation' &&
      (error instanceof z.ZodError ||
        (error instanceof Error &&
          /^(Multiple sessions|Proposal |Duplicate proposal|Rest days|Training sessions|No training availability|Session exceeds|Unavailable training)/.test(
            error.message
          )))
    observedDecision = expectedRejection ? 'rejected' : 'failed'
    failure = error instanceof Error ? error.message : String(error)
  }
  const before = auditSessions(scenario, sessions)
  const after = auditSessions(scenario, final)
  const constraintsPass =
    observedDecision === 'rejected' ||
    (observedDecision !== 'failed' && after.violations.length === 0)
  return {
    scenarioId: scenario.id,
    entrypoint,
    adapter,
    inputHash: inputHash(scenario),
    provenance: capture?.provenance ?? {
      model: 'synthetic-reference-v1',
      prompt: 'synthetic-reference-v1',
      family: 'effort-reference-v1',
      policy: resolved.progression.version,
      capture: 'recorded'
    },
    observedDecision,
    capturedDecision: capture?.decision ?? null,
    failure: capture?.failure ?? failure,
    violationsBefore: before.violations,
    violationsAfter: after.violations,
    metrics: after,
    constraintsPass,
    progression: {
      firstWeekMinutes: resolved.targets[0]!.volumeTargetMinutes,
      loadingWeeks: resolved.targets.map((row) => row.volumeTargetMinutes),
      history: resolved.progression.history,
      sports: resolved.progression.sports,
      explanations: resolved.progression.explanations
    },
    timing: {
      evaluatorMs: performance.now() - started,
      generatorMs: capture?.generatorLatencyMs ?? null
    },
    coachingReview: scenario.coachReview
  }
}

export function buildReport(scenarios: Scenario[], captures?: Capture[]) {
  const results = scenarios.flatMap((scenario) =>
    ENTRYPOINTS.map((entrypoint) =>
      replay(
        scenario,
        entrypoint,
        captures?.find((row) => row.scenarioId === scenario.id && row.entrypoint === entrypoint)
      )
    )
  )
  const regressions = results.filter((row) => !row.constraintsPass)
  const missingPaths = results.filter((row) => row.observedDecision === 'not-exercised')
  const pendingReviews = scenarios
    .filter((scenario) => scenario.coachReview.status !== 'approved')
    .map((scenario) => scenario.id)
  const generatorTimes = results
    .flatMap((row) => (row.timing.generatorMs === null ? [] : [row.timing.generatorMs]))
    .sort((a, b) => a - b)
  const generatorP95Ms = generatorTimes.length
    ? generatorTimes[Math.ceil(generatorTimes.length * 0.95) - 1]!
    : null
  // Baseline reference review cannot approve outputs from a different generator.
  const candidateReviewRequired = Boolean(captures)
  return {
    version: BENCHMARK_VERSION,
    auditVersion: AUDIT_VERSION,
    generatedAt: new Date().toISOString(),
    mode: captures ? 'candidate-capture' : 'offline-reference',
    results,
    summary: {
      cases: results.length,
      regressions: regressions.length,
      missingPaths: missingPaths.length,
      failures: results.filter((row) => row.observedDecision === 'failed').length,
      rejectionRate:
        results.filter((row) => row.observedDecision === 'rejected').length / results.length,
      generatorP95Ms,
      pendingReviews
    },
    rollout: {
      eligible:
        regressions.length === 0 &&
        missingPaths.length === 0 &&
        pendingReviews.length === 0 &&
        !candidateReviewRequired,
      reasons: [
        ...(regressions.length ? ['constraint_regression'] : []),
        ...(missingPaths.length ? ['entrypoint_capture_missing'] : []),
        ...(pendingReviews.length ? ['human_coaching_review_pending'] : []),
        ...(candidateReviewRequired ? ['candidate_coaching_review_required'] : [])
      ]
    }
  }
}

const baselineSchema = z.object({
  version: z.literal(BENCHMARK_VERSION),
  auditVersion: z.literal(AUDIT_VERSION),
  summary: z.object({
    cases: z.number(),
    regressions: z.number(),
    failures: z.number(),
    rejectionRate: z.number(),
    generatorP95Ms: z.number().nullable()
  }),
  results: z.array(
    z.object({ scenarioId: z.string(), entrypoint: z.enum(ENTRYPOINTS), inputHash: z.string() })
  )
})

export function compareReports(report: ReturnType<typeof buildReport>, baselineValue: unknown) {
  const baseline = baselineSchema.parse(baselineValue)
  const keys = (rows: Array<{ scenarioId: string; entrypoint: string; inputHash: string }>) =>
    rows.map((row) => `${row.scenarioId}:${row.entrypoint}:${row.inputHash}`).sort()
  if (JSON.stringify(keys(report.results)) !== JSON.stringify(keys(baseline.results)))
    throw new Error('Baseline scenario snapshots differ; establish a new reviewed baseline')
  const reasons: string[] = []
  if (report.summary.regressions > baseline.summary.regressions)
    reasons.push('constraint_regression')
  if (report.summary.failures > baseline.summary.failures)
    reasons.push('generator_failure_regression')
  if (report.summary.rejectionRate > baseline.summary.rejectionRate + 0.05)
    reasons.push('rejection_rate_regression')
  const latencyComparable =
    report.summary.generatorP95Ms !== null && baseline.summary.generatorP95Ms !== null
  if (latencyComparable && report.summary.generatorP95Ms! > baseline.summary.generatorP95Ms! * 1.2)
    reasons.push('generator_latency_regression')
  return {
    pass: reasons.length === 0,
    reasons,
    latencyComparable,
    latencyThresholdRatio: 1.2,
    rejectionRateAllowance: 0.05
  }
}

export function renderReport(report: ReturnType<typeof buildReport>): string {
  return [
    `# Training prescription evaluation`,
    '',
    `Version: ${report.version}; audit: ${report.auditVersion}; mode: ${report.mode}.`,
    '',
    `${report.summary.cases} cases; ${report.summary.regressions} regressions; ${report.summary.failures} generator failures; ${report.summary.missingPaths} paths without captures.`,
    '',
    `Rollout eligible: ${report.rollout.eligible}. Gates: ${report.rollout.reasons.join(', ') || 'none'}.`,
    '',
    '| Scenario | Path | Decision | Findings |',
    '| --- | --- | --- | --- |',
    ...report.results.map(
      (row) =>
        `| ${row.scenarioId} | ${row.entrypoint} | ${row.observedDecision} | ${row.violationsAfter.join(', ') || 'none'} |`
    ),
    '',
    'Kernel replays do not execute database writes, full prompts, exports or publication. Generator latency is null for synthetic references; evaluator time is measured separately. Coaching reviews and observational outcomes are separate gates.',
    ''
  ].join('\n')
}
