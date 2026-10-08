import { describe, expect, it, vi } from 'vitest'
import {
  summarizePlannedStimulus,
  summarizeCompletedStimulus,
  aggregateStimulus
} from '../../../../server/utils/training-stimulus'
import {
  adaptStructuredWorkout,
  createZoneProfileSnapshot
} from '../../../../shared/structured-workout-contract'
import { summarizeWeekStimulus } from '../../../../server/utils/plans/stimulus-summary'
import { assessStructureDose } from '../../../../server/utils/plans/structure-dose'

vi.mock('../../../../server/utils/db', () => ({ prisma: {} }))
const profile = {
  ftp: 300,
  thresholdPace: 4,
  powerZones: [
    { min: 0, max: 200, domain: 'easy' },
    { min: 201, max: 300, domain: 'moderate' },
    { min: 301, max: 1000, domain: 'hard' }
  ],
  paceZones: [
    { min: 0, max: 3, domain: 'easy' },
    { min: 3.01, max: 4, domain: 'moderate' },
    { min: 4.01, max: 20, domain: 'hard' }
  ]
} as const
const canonical = (steps: any[], settings: any = profile) =>
  adaptStructuredWorkout(
    { steps },
    { source: 'AI_GENERATION', zoneProfileSnapshot: createZoneProfileSnapshot(settings) }
  )!
const powerStep = (seconds: number, watts: number, type = 'Active') => ({
  type,
  durationSeconds: seconds,
  power: { value: watts, units: 'w' }
})

describe('training stimulus', () => {
  it('allocates warmup, nested repeat work/recovery and cooldown separately despite low overall IF', () => {
    const summary = summarizePlannedStimulus(
      {
        type: 'Ride',
        structuredWorkout: canonical([
          powerStep(600, 150, 'Warmup'),
          {
            reps: 3,
            steps: [
              { reps: 2, steps: [{ ...powerStep(60, 330), intent: 'vo2' }] },
              powerStep(180, 150, 'Rest')
            ]
          },
          powerStep(300, 150, 'Cooldown')
        ])
      },
      profile as any
    )
    expect(summary.durationSeconds).toBe(1800)
    expect(summary.domainSeconds).toEqual({ easy: 1440, moderate: 0, hard: 360, unknown: 0 })
    expect(summary.prescribedQualitySeconds).toBe(360)
    expect(summary.intensitySeconds.vo2max).toBe(360)
    expect(summary.tss.value).toBe(22)
    expect(summary.hardSession).toBe(true)
    expect(summary.coverage.fraction).toBe(1)
  })

  it('expands distance-based repeats using explicit canonical pace', () => {
    const summary = summarizePlannedStimulus(
      {
        type: 'Run',
        structuredWorkout: canonical([
          { reps: 2, steps: [{ reps: 3, distance: 400, pace: { value: 4, units: 'm/s' } }] }
        ])
      },
      profile as any
    )
    expect(summary.durationSeconds).toBe(600)
    expect(summary.distanceMeters).toBe(2400)
    expect(summary.domainSeconds.moderate).toBe(600)
  })

  it('does not invent duration for unknown distance references; retains remaining planned budget', () => {
    const summary = summarizePlannedStimulus({
      type: 'Run',
      durationSec: 1800,
      structuredWorkout: canonical([powerStep(600, 150), { distance: 2000 }], {})
    })
    expect(summary.durationSeconds).toBe(1800)
    expect(summary.coverage.unresolvedSteps).toBe(1)
    expect(summary.domainSeconds.unknown).toBe(1800)
    expect(summary.tss.value).toBeNull()
  })

  it('requires an explicit zone-domain mapping and does not assume vendor Z2 means easy', () => {
    const summary = summarizePlannedStimulus(
      {
        type: 'Ride',
        structuredWorkout: canonical(
          [{ durationSeconds: 600, power: { value: 2, units: 'power_zone' } }],
          {
            powerZones: [
              { min: 0, max: 150 },
              { min: 151, max: 250 }
            ]
          }
        )
      },
      { ftp: 300 }
    )
    expect(summary.domainSeconds.unknown).toBe(600)
    expect(summary.coverage.fraction).toBe(0)
    expect(summary.tss.value).toBe(7)
    expect(summary.hardSession).toBeNull()
  })

  it('keeps target ranges spanning domains unclassified', () => {
    const summary = summarizePlannedStimulus(
      {
        type: 'Ride',
        structuredWorkout: canonical([
          { durationSeconds: 600, power: { range: { start: 150, end: 330 }, units: 'w' } }
        ])
      },
      profile as any
    )
    expect(summary.domainSeconds.unknown).toBe(600)
  })

  it('does not use absolute power without FTP to manufacture IF or TSS', () => {
    const summary = summarizePlannedStimulus({
      type: 'Ride',
      structuredWorkout: canonical([powerStep(600, 150)], {})
    })
    expect(summary.intensitySeconds.unknown).toBe(600)
    expect(summary.tss.value).toBeNull()
  })

  it('weights completed samples by elapsed time and preserves gaps and invalid values', () => {
    const summary = summarizeCompletedStimulus(
      {
        type: 'Ride',
        durationSec: 20,
        tss: 40,
        streams: { time: [0, 2, 4, 6, 16, 18], watts: [150, 330, null, 330, 0, 150] }
      },
      profile as any
    )
    expect(summary.source).toBe('completed_stream')
    expect(summary.domainSeconds).toEqual({ easy: 5, moderate: 0, hard: 2, unknown: 13 })
    expect(summary.coverage.fraction).toBe(0.35)
    expect(summary.tss).toMatchObject({ value: 40, source: 'reported' })
    expect(Object.values(summary.intensitySeconds).reduce((a, b) => a + b, 0)).toBe(20)
  })

  it('uses completed intervals instead of classifying the whole session by IF', () => {
    const summary = summarizeCompletedStimulus(
      {
        type: 'Ride',
        durationSec: 1800,
        intensity: 0.6,
        rawJson: {
          icu_intervals: [
            { moving_time: 600, average_watts: 150 },
            { moving_time: 300, average_watts: 330 },
            { moving_time: 600, average_watts: 150 }
          ]
        }
      },
      profile as any
    )
    expect(summary.domainSeconds).toEqual({ easy: 1200, moderate: 0, hard: 300, unknown: 300 })
    expect(summary.hardSession).toBe(true)
  })

  it('rejects low-confidence interval evidence and unusable sensor data', () => {
    const summary = summarizeCompletedStimulus(
      {
        type: 'Ride',
        durationSec: 600,
        aiAnalysisJson: {
          guardrails: {
            telemetry: {
              powerAbsoluteUsable: false,
              powerRelativeUsable: false,
              hrUsable: false,
              paceUsable: false
            },
            archetype: {}
          }
        },
        streams: { watts: [330, 330], heartrate: [180, 180] },
        rawJson: {
          icu_intervals: [{ moving_time: 600, average_watts: 330, detection_confidence: 0.2 }]
        }
      },
      profile as any
    )
    expect(summary.domainSeconds.unknown).toBe(600)
    expect(summary.hardSession).toBeNull()
  })

  it('tracks strength dose separately from physiological endurance domains', () => {
    const summary = summarizePlannedStimulus({
      type: 'Gym',
      structuredWorkout: { exercises: [{ sets: 3, reps: 8, value: 8, rest: '60s' }] }
    })
    expect(summary.strength.sets).toBe(3)
    expect(summary.strength.repetitions).toBe(24)
    expect(summary.strength.durationSeconds).toBe(300)
    expect(summary.domainSeconds.unknown).toBe(300)
  })

  it('keeps running mechanical exposure separate from cycling fatigue', () => {
    const run = summarizeCompletedStimulus({
      type: 'Run',
      durationSec: 1800,
      distanceMeters: 5000,
      tss: 30
    })
    const ride = summarizeCompletedStimulus({
      type: 'Ride',
      durationSec: 3600,
      distanceMeters: 30000,
      tss: 80
    })
    const total = aggregateStimulus([run, ride])
    expect(total.totalTss).toBe(110)
    expect(total.sports.run?.minutes).toBe(30)
    expect(total.sports.run?.distanceMeters).toBe(5000)
    expect(total.sports.ride?.distanceMeters).toBe(30000)
  })

  it('reconciles final vs coarse estimates and actual load, including unplanned sessions counted once', () => {
    const planned = [
      { id: 'planned', type: 'Run', durationSec: 1200, distanceMeters: null, tss: 20 }
    ]
    const coarse = summarizeWeekStimulus(planned, [])
    expect(coarse.scheduled.sports.run?.minutes).toBe(20)
    expect(coarse.scheduled.sessions[0]?.source).toBe('planning_estimate')
    const final = {
      ...planned[0]!,
      durationSec: 1800,
      structuredWorkout: canonical([{ durationSeconds: 1800, pace: { value: 3, units: 'm/s' } }])
    }
    const actual = [
      {
        type: 'Run',
        durationSec: 2400,
        distanceMeters: 6000,
        tss: 35,
        plannedWorkoutId: 'planned'
      },
      { type: 'Ride', durationSec: 3600, tss: 60 }
    ]
    const summary = summarizeWeekStimulus([final], actual)
    expect(summary.scheduled.sports.run?.minutes).toBe(30)
    expect(summary.completed.sports.run?.minutes).toBe(40)
    expect(summary.combined.sports.run?.minutes).toBe(40)
    expect(summary.combined.totalTss).toBe(95)
  })
})

describe('final structure dose budgets', () => {
  const budget = {
    prior: { type: 'Run', durationSec: 1800 },
    proposed: { type: 'Run', durationSec: 2400 },
    committed: [
      { type: 'Run', durationSec: 1800 },
      { type: 'Ride', durationSec: 3600 }
    ],
    volumeTargetMinutes: 120,
    sportVolumeTargets: { run: 60, ride: 60 }
  }
  it('rejects final dose drift above both total and running budgets', () => {
    const assessment = assessStructureDose(budget)
    expect(assessment.accepted).toBe(false)
    expect(assessment.violations).toHaveLength(2)
  })
  it('allows reductions of an already overloaded schedule without increasing it', () => {
    expect(
      assessStructureDose({ ...budget, prior: { type: 'Run', durationSec: 3600 } }).accepted
    ).toBe(true)
  })
  it('checks actual availability rather than only weekly aggregate', () => {
    expect(
      assessStructureDose({
        ...budget,
        volumeTargetMinutes: 180,
        sportVolumeTargets: { run: 120, ride: 60 },
        availableMinutes: 35
      }).violations
    ).toEqual(['Final structure exceeds the available session time.'])
  })
})

it('rejects a final TSS increase outside the weekly budget without treating unknown TSS as zero', () => {
  const input = {
    prior: { type: 'Ride', durationSec: 1800, tss: 20 },
    proposed: { type: 'Ride', durationSec: 1800, tss: 60 },
    committed: [{ type: 'Run', durationSec: 1800, tss: 30 }],
    volumeTargetMinutes: 60,
    sportVolumeTargets: null,
    tssTarget: 80
  }
  expect(assessStructureDose(input).violations).toEqual([
    'Final structure exceeds the weekly TSS budget.'
  ])
  expect(
    assessStructureDose({ ...input, proposed: { ...input.proposed, tss: null } }).tssBudgetAssessed
  ).toBe(false)
})

it('keeps overlapping completed intervals entirely unknown', () => {
  const result = summarizeCompletedStimulus(
    {
      type: 'Ride',
      durationSec: 600,
      rawJson: {
        icu_intervals: [
          { moving_time: 200, average_watts: 330, start_index: 0, end_index: 200 },
          { moving_time: 200, average_watts: 330, start_index: 100, end_index: 300 }
        ]
      }
    },
    profile as any
  )
  expect(result.domainSeconds.unknown).toBe(600)
})

it('uses logged completed strength sets without inventing repetitions or set duration', () => {
  const result = summarizeCompletedStimulus({
    type: 'Gym',
    durationSec: 1800,
    exercises: [{ sets: [{ reps: 8 }, { reps: 8 }, { durationSec: 30 }] }]
  })
  expect(result.strength).toEqual({
    sets: 3,
    repetitions: 16,
    durationSeconds: 30,
    source: 'completed_sets'
  })
  expect(result.durationSeconds).toBe(1800)
  expect(result.domainSeconds.unknown).toBe(1800)
})
