import { afterAll, describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'
import rawScenarios from './fixtures/scenarios.v1.json'
import {
  auditSessions,
  buildReport,
  compareReports,
  ENTRYPOINTS,
  inputHash,
  renderReport,
  replay,
  resolveScenario,
  scenarioSchema,
  validateCaptures,
  type Entrypoint,
  type Capture
} from './prescription'

// Any accidental service/database access fails instead of touching athlete data.
vi.mock('../../server/utils/db', () => ({
  prisma: new Proxy(
    {},
    {
      get() {
        throw new Error('Database access forbidden in prescription evaluation')
      }
    }
  )
}))
vi.stubGlobal('fetch', () => {
  throw new Error('Network access forbidden in prescription evaluation')
})

const scenarios = z.array(scenarioSchema).parse(rawScenarios)
let captures: Capture[] | undefined
if (process.env.PRESCRIPTION_REPLAY_FILE) {
  captures = validateCaptures(
    scenarios,
    JSON.parse(readFileSync(process.env.PRESCRIPTION_REPLAY_FILE, 'utf8'))
  )
}
const report = buildReport(scenarios, captures)
const comparison = process.env.PRESCRIPTION_BASELINE_FILE
  ? compareReports(report, JSON.parse(readFileSync(process.env.PRESCRIPTION_BASELINE_FILE, 'utf8')))
  : null

afterAll(() => {
  const directory = resolve(process.env.PRESCRIPTION_REPORT_DIR || '.tmp/prescription-evaluation')
  mkdirSync(directory, { recursive: true })
  writeFileSync(
    resolve(directory, 'report.json'),
    JSON.stringify({ ...report, comparison }, null, 2) + '\n'
  )
  writeFileSync(resolve(directory, 'report.md'), renderReport(report))
  console.info(
    `${report.summary.cases} replay cases; ${report.summary.regressions} regressions; rollout eligible: ${report.rollout.eligible}. Report: ${directory}`
  )
})

describe('versioned prescription scenarios', () => {
  it('has unique IDs and all required athlete/history contexts', () => {
    expect(new Set(scenarios.map((row) => row.id)).size).toBe(scenarios.length)
    const tags = scenarios.flatMap((row) => row.tags)
    for (const tag of [
      'beginner',
      'returning',
      'experienced',
      'cycling',
      'mixed-sport',
      'sparse',
      'stale',
      'injury',
      'availability',
      'extra-training',
      'missed-training',
      'event-timeline'
    ])
      expect(tags).toContain(tag)
  })
  it.each(scenarios)(
    '$id: preserves independently specified capacity and provenance',
    (scenario) => {
      const resolved = resolveScenario(scenario)
      expect(resolved.targets[0]!.volumeTargetMinutes).toBe(scenario.expectedFirstWeekMinutes)
      expect(Object.values(resolved.progression.sports).map((row) => row!.status)).toContain(
        scenario.expectedHistoryStatus
      )
      expect(resolved.progression.history.completeness).toBe(scenario.historyCompleteness)
      expect(
        resolved.targets.every((row) => row.volumeTargetMinutes <= scenario.requestedMinutes)
      ).toBe(true)
      expect(resolved.targets[0]!.volumeTargetMinutes).toBeLessThanOrEqual(
        scenario.availability.reduce((sum, minutes) => sum + minutes, 0)
      )
      expect(auditSessions(scenario, scenario.reference).violations).toEqual([])
    }
  )
  it('keeps missed training out of remaining budgets and counts extra sessions', () => {
    const scenario = scenarios.find((row) => row.id === 'extra-and-missed')!
    expect(resolveScenario(scenario).budgets.volumeTargetMinutes).toBe(135)
    expect(resolveScenario({ ...scenario, missedMinutes: 0 }).budgets).toEqual(
      resolveScenario(scenario).budgets
    )
  })
  it('reports feasibility uncertainty for short event timelines', () => {
    expect(
      resolveScenario(
        scenarios.find((row) => row.id === 'short-event-timeline')!
      ).progression.explanations.join(' ')
    ).toContain('timeline is too short')
  })
})

describe('replay regression gates', () => {
  it('passes configured baseline thresholds', () => {
    if (comparison) expect(comparison.pass, JSON.stringify(comparison)).toBe(true)
  })
  it.each(report.results)(
    '$scenarioId / $entrypoint: rejects or reports constraint regressions',
    (row) => {
      expect(row.constraintsPass, JSON.stringify(row)).toBe(true)
      if (!captures)
        expect(row.observedDecision).toBe(
          ['chat', 'ad-hoc'].includes(row.entrypoint) ? 'not-exercised' : 'accepted'
        )
    }
  )
  it('never presents missing endpoint captures or pending reviews as rollout approval', () => {
    const baseline = buildReport(scenarios)
    expect(baseline.rollout.eligible).toBe(false)
    expect(baseline.summary.missingPaths).toBe(scenarios.length * 2)
    expect(baseline.summary.pendingReviews).toHaveLength(scenarios.length)
    expect(baseline.results.every((row) => row.timing.generatorMs === null)).toBe(true)
  })
  it('does not fabricate human sign-off', () => {
    expect(() =>
      scenarioSchema.parse({
        ...scenarios[0],
        coachReview: { ...scenarios[0]!.coachReview, status: 'approved' }
      })
    ).toThrow('human review')
  })
  it('detects the historical four-hour low-history prescription', () => {
    const scenario = scenarios[0]!
    const bad = { ...scenario.reference[0]!, minutes: 240 }
    expect(auditSessions(scenario, [bad]).violations).toEqual(
      expect.arrayContaining([
        'sport_budget',
        'weekly_budget',
        'availability',
        'structure_duration',
        'description_duration'
      ])
    )
    const result = replay(scenario, 'week', {
      scenarioId: scenario.id,
      inputHash: inputHash(scenario),
      entrypoint: 'week',
      provenance: {
        model: 'bad-fixture',
        prompt: 'v1',
        family: 'v1',
        policy: 'v1',
        capture: 'recorded'
      },
      generatorLatencyMs: 100,
      decision: 'accepted',
      sessions: [bad]
    })
    expect(result.observedDecision).toBe('adjusted')
    // Clamping time alone leaves description and structure promises behind.
    expect(result.constraintsPass).toBe(false)
    expect(result.violationsAfter).toContain('description_duration')
  })
  it('detects restricted sport and protected-day overwrite independently of volume', () => {
    const injury = scenarios.find((row) => row.id === 'injured-runner')!
    expect(auditSessions(injury, scenarios[0]!.reference).violations).toContain('restricted_sport')
    const extra = scenarios.find((row) => row.id === 'extra-and-missed')!
    expect(auditSessions(extra, [{ ...extra.reference[0]!, day: 2 }]).violations).toContain(
      'protected_day'
    )
  })
  it('detects lost interval recovery and quality dose', () => {
    const scenario = scenarios.find((row) => row.id === 'experienced-runner')!
    const session = {
      ...scenario.reference[0]!,
      minutes: 30,
      claimedMinutes: 30,
      claimedQualityMinutes: 16,
      steps: [
        {
          type: 'Active' as const,
          intent: 'threshold',
          reps: 3,
          steps: [{ type: 'Active' as const, intent: 'threshold', durationSeconds: 600 }]
        }
      ]
    }
    expect(auditSessions(scenario, [session]).violations).toEqual(
      expect.arrayContaining(['repeat_recovery', 'quality_dose'])
    )
  })
  it('keeps distance-only steps explicitly unknown instead of estimating their time', () => {
    const scenario = scenarios[0]!
    const session = {
      ...scenario.reference[0]!,
      steps: [{ type: 'Active' as const, intent: 'easy', distanceMeters: 5000 }]
    }
    const result = auditSessions(scenario, [session])
    expect(result.unknownSteps).toBe(1)
    expect(result.violations).not.toContain('structure_duration')
  })
  const validCapture = (
    scenario = scenarios[0]!,
    entrypoint: Entrypoint = ENTRYPOINTS[0]
  ): Capture => ({
    scenarioId: scenario.id,
    entrypoint,
    inputHash: inputHash(scenario),
    provenance: {
      model: 'test-model-v1',
      prompt: 'test-prompt-v1',
      family: 'test-family-v1',
      policy: 'sport-progression-v1',
      capture: 'recorded'
    },
    decision: 'accepted',
    sessions: scenario.reference,
    generatorLatencyMs: 100
  })
  it('rejects incomplete, duplicate and changed-input captures', () => {
    const record = validCapture()
    const envelope = (records: Capture[]) => ({ version: 'prescription-benchmark-v1', records })
    expect(() => validateCaptures(scenarios, envelope([record]))).toThrow('Missing capture')
    expect(() => validateCaptures(scenarios, envelope([record, record]))).toThrow(
      'Duplicate capture'
    )
    expect(() =>
      validateCaptures(scenarios, envelope([{ ...record, inputHash: 'wrong' }]))
    ).toThrow('changed snapshot')
  })
  it.each(['block', 'structure', 'adaptation'] as const)(
    'retains captured generator failure on %s',
    (entrypoint) => {
      const scenario = scenarios[0]!
      const row = replay(scenario, entrypoint, {
        ...validCapture(scenario, entrypoint),
        decision: 'failed',
        sessions: [],
        failure: 'Model timed out'
      })
      expect(row.observedDecision).toBe('failed')
      expect(row.constraintsPass).toBe(false)
      expect(row.failure).toBe('Model timed out')
    }
  )
  it('compares matching captures and detects latency/failure/rejection regressions', () => {
    const records = scenarios.flatMap((scenario) =>
      ENTRYPOINTS.map((entrypoint) => validCapture(scenario, entrypoint))
    )
    const baseline = buildReport(scenarios, records)
    expect(compareReports(baseline, baseline).pass).toBe(true)
    const candidate = buildReport(
      scenarios,
      records.map((row, index) => ({
        ...row,
        generatorLatencyMs: 150,
        decision: index < 5 ? 'failed' : row.decision
      }))
    )
    expect(compareReports(candidate, baseline).reasons).toEqual(
      expect.arrayContaining([
        'generator_latency_regression',
        'generator_failure_regression',
        'constraint_regression'
      ])
    )
    const allRejected = buildReport(
      scenarios,
      records.map((row) => ({ ...row, decision: 'rejected' }))
    )
    expect(compareReports(allRejected, baseline).reasons).toContain('rejection_rate_regression')
    expect(baseline.rollout.reasons).toContain('candidate_coaching_review_required')
  })
  it('refuses comparisons across changed scenarios or policy versions', () => {
    expect(() => compareReports(report, { ...report, version: 'old' })).toThrow()
    expect(() => compareReports(report, { ...report, results: report.results.slice(1) })).toThrow(
      'snapshots differ'
    )
  })
})
