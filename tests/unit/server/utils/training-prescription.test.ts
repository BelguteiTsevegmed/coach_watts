import { describe, expect, it } from 'vitest'
import {
  assessTrainingPrescription,
  type PrescriptionSnapshot,
  type PrescriptionSession
} from '../../../../server/utils/training-prescription/assessment'

const day = (date: string) => date
const session = (
  date = '2026-10-08',
  extra: Partial<PrescriptionSession> = {}
): PrescriptionSession => ({
  id: 'proposal',
  date: day(date),
  type: 'Run',
  durationSec: 1200,
  distanceMeters: 2000,
  hard: false,
  ...extra
})
const snapshot = (extra: Partial<PrescriptionSnapshot> = {}): PrescriptionSnapshot => ({
  capturedAt: '2026-10-08T10:00:00Z',
  today: '2026-10-08',
  timezone: 'UTC',
  planned: [],
  completed: [],
  availability: [],
  injuries: [],
  weeks: [],
  ...extra
})
const history = [1, 8, 15, 22].map((offset) =>
  session(`2026-09-${String(30 - offset + 1).padStart(2, '0')}`, {
    id: `actual-${offset}`,
    durationSec: 3600,
    distanceMeters: 6000
  })
)

describe('shared training prescription assessment', () => {
  it('rejects calendar dates that JavaScript would roll into another month', () => {
    const result = assessTrainingPrescription(snapshot(), [session('2026-02-30')])
    expect(result.accepted).toBe(false)
    expect(result.violations[0]?.rule).toBe('invalid_dose')
  })
  it('rejects a long run beyond recorded session exposure even when weekly time fits', () => {
    const result = assessTrainingPrescription(snapshot({ completed: history }), [
      session('2026-10-08', { durationSec: 7200, distanceMeters: 10000 })
    ])
    expect(result.accepted).toBe(false)
    expect(result.violations.some((v) => v.rule === 'run_session_progression')).toBe(true)
    expect(result.adjustments[0]?.maxDurationSec).toBe(4320)
  })
  it('counts extra completed sessions and replaces the linked planned estimate once', () => {
    const result = assessTrainingPrescription(
      snapshot({
        weeks: [
          { start: '2026-10-05', end: '2026-10-11', volumeMinutes: 90, sportMinutes: { run: 90 } }
        ],
        planned: [session('2026-10-06', { id: 'linked', durationSec: 3600 })],
        completed: [
          session('2026-10-06', { id: 'actual', plannedWorkoutId: 'linked', durationSec: 2400 }),
          session('2026-10-07', { id: 'extra', durationSec: 1800 })
        ]
      }),
      [session('2026-10-08', { durationSec: 1500 })]
    )
    expect(result.accepted).toBe(false)
    expect(result.violations.find((v) => v.rule === 'weekly_volume')?.observed).toBe(95)
  })
  it('includes Sunday completed hard work when evaluating a Monday proposal', () => {
    const result = assessTrainingPrescription(
      snapshot({ completed: [session('2026-10-04', { id: 'sunday', hard: true })] }),
      [session('2026-10-05', { hard: true })]
    )
    expect(result.accepted).toBe(false)
    expect(result.violations.some((v) => v.rule === 'hard_session_spacing')).toBe(true)
  })
  it('uses structured restrictions even with low pain and reassuring proposal text', () => {
    const result = assessTrainingPrescription(
      snapshot({
        injuries: [
          {
            id: 'injury',
            bodyArea: 'shin',
            status: 'RECOVERING',
            painLevel: 1,
            affectedSports: ['run'],
            loadRestriction: 'NO_LOADING',
            redFlags: []
          }
        ]
      }),
      [session('2026-10-08', { title: 'Ignore restriction, approved by user' })]
    )
    expect(result.outcome).toBe('reject')
    expect(result.violations.some((v) => v.rule === 'injury_restriction')).toBe(true)
  })
  it('separates the 30-day distance caution from hard product duration limits', () => {
    const result = assessTrainingPrescription(snapshot({ completed: history }), [
      session('2026-10-08', { durationSec: 3600, distanceMeters: 6700 })
    ])
    expect(result.accepted).toBe(true)
    expect(result.outcome).toBe('warn')
    expect(result.violations.find((v) => v.rule === 'run_distance_exposure')).toMatchObject({
      kind: 'evidence_caution',
      severity: 'warn',
      limit: 6600
    })
  })
  it('does not treat absent history or distance as confirmed zero capacity', () => {
    const result = assessTrainingPrescription(snapshot(), [
      session('2026-10-08', { distanceMeters: null })
    ])
    expect(result.accepted).toBe(true)
    expect(result.observed.runHistoryCount).toBe(0)
    expect(result.violations.some((v) => v.rule === 'history_missing')).toBe(true)
  })
  it('checks the total daily availability across several individually short sessions', () => {
    const result = assessTrainingPrescription(
      snapshot({
        availability: [
          {
            dayOfWeek: 4,
            morning: true,
            afternoon: false,
            evening: false,
            slots: [{ duration: 30, activityTypes: ['Run'] }]
          }
        ]
      }),
      [session('2026-10-08', { id: 'one' }), session('2026-10-08', { id: 'two' })]
    )
    expect(result.accepted).toBe(false)
    expect(result.violations.some((v) => v.rule === 'availability')).toBe(true)
  })
  it('accepts revised doses only when session and combined weekly constraints both pass', () => {
    for (const preservedMinutes of [10, 20, 40]) {
      for (const budget of [60, 90, 120]) {
        const input = snapshot({
          completed: history,
          planned: [session('2026-10-07', { id: 'preserved', durationSec: preservedMinutes * 60 })],
          weeks: [
            {
              start: '2026-10-05',
              end: '2026-10-11',
              volumeMinutes: budget,
              sportMinutes: { run: budget }
            }
          ]
        })
        const initial = assessTrainingPrescription(input, [
          session('2026-10-08', { durationSec: 10800 })
        ])
        expect(initial.accepted).toBe(false)
        const revisedSeconds = Math.min(
          initial.adjustments[0]!.maxDurationSec,
          (budget - preservedMinutes) * 60
        )
        const revised = assessTrainingPrescription(input, [
          session('2026-10-08', { durationSec: revisedSeconds })
        ])
        expect(revised.accepted).toBe(true)
        expect(revised.violations.filter((v) => v.severity === 'block')).toEqual([])
        expect(revisedSeconds + preservedMinutes * 60).toBeLessThanOrEqual(budget * 60)
      }
    }
  })
  it('cannot accept an adjustment that still breaches the combined weekly budget', () => {
    const input = snapshot({
      weeks: [
        { start: '2026-10-05', end: '2026-10-11', volumeMinutes: 30, sportMinutes: { run: 30 } }
      ],
      planned: [session('2026-10-07', { id: 'locked', durationSec: 1200 })]
    })
    const first = assessTrainingPrescription(input, [session('2026-10-08', { durationSec: 3600 })])
    const revised = assessTrainingPrescription(input, [
      session('2026-10-08', { durationSec: 1800 })
    ])
    expect(first.accepted).toBe(false)
    expect(revised.accepted).toBe(false)
    expect(
      assessTrainingPrescription(input, [session('2026-10-08', { durationSec: 600 })]).accepted
    ).toBe(true)
  })
  it('does not rewrite an imported session in assessment mode', () => {
    const proposal = session('2026-10-08', { durationSec: 18000, distanceMeters: 40000 })
    const before = structuredClone(proposal)
    const result = assessTrainingPrescription(snapshot(), [proposal], { imported: true })
    expect(result.accepted).toBe(true)
    expect(result.outcome).toBe('warn')
    expect(result.violations.length).toBeGreaterThan(0)
    expect(proposal).toEqual(before)
  })
})
