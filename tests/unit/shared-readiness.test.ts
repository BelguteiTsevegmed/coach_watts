import { describe, expect, it } from 'vitest'
import {
  resolveReadiness,
  formatReadinessForPrompt,
  isExplicitEasyReadinessStructure,
  type ReadinessWellness
} from '../../shared/readiness'
import { applyReadinessAdvice } from '../../server/utils/coaching/readiness-advice'
import {
  assessTrainingPrescription,
  type PrescriptionSnapshot
} from '../../server/utils/training-prescription/assessment'
const asOf = '2026-10-08'
const date = (offset: number) => new Date(Date.parse(asOf) - offset * 86400000)
function row(
  offset: number,
  values: Partial<ReadinessWellness> = {},
  source = 'whoop'
): ReadinessWellness {
  return {
    id: `w-${offset}`,
    date: date(offset),
    lastSource: source,
    history: [{ source, changes: 'created' }],
    hrv: 60,
    restingHr: 50,
    sleepHours: 8,
    ...values
  }
}
const history = Array.from({ length: 31 }, (_, i) => row(i))
const resolve = (wellness: ReadinessWellness[], extra = {}) =>
  resolveReadiness({ asOf, wellness, ...extra })
const trend = (r: ReturnType<typeof resolve>, field = 'hrv') =>
  r.trends.find((t) => t.metric === field)!
const session = {
  id: 's',
  title: 'Key ride',
  date: asOf,
  type: 'Ride',
  durationSec: 1800,
  hard: true,
  tss: 30
}
const snapshot = (readiness: ReturnType<typeof resolve>): PrescriptionSnapshot => ({
  capturedAt: new Date(asOf).toISOString(),
  today: asOf,
  timezone: 'UTC',
  readiness,
  planned: [],
  completed: [],
  availability: [],
  injuries: [],
  weeks: []
})
describe('personal readiness policy', () => {
  it('reports distinct baseline/recent windows, missingness, records and freshness', () => {
    const r = resolve(history)
    expect(r.windows.baseline).toEqual({ from: '2026-09-08', through: '2026-10-05' })
    expect(trend(r).baseline).toEqual({ median: 60, samples: 28, missingDays: 0 })
    expect(trend(r).recent.samples).toBe(3)
    expect(trend(r).latest).toMatchObject({ ageDays: 0, recordId: 'w-0' })
    expect(r.application.status).toBe('advice_only')
  })
  it('does not change a hard session for one abnormal reading even with high ATL', () => {
    const r = resolve([row(0, { hrv: 30 }), ...history.slice(1)], {
      load: { ctl: 50, atl: 100, tsb: -50 }
    })
    expect(trend(r).status).toBe('isolated_adverse')
    expect(r.decision).toBe('monitor')
    expect(
      assessTrainingPrescription(snapshot(r), [session]).violations.some(
        (v) => v.rule === 'personal_readiness'
      )
    ).toBe(false)
    const advice = applyReadinessAdvice(
      { recommendation: 'proceed', reasoning: 'Proceed.' },
      r,
      session
    )
    expect(advice.recommendation).toBe('proceed')
  })
  it('combines a persistent HRV trend with sleep or motivation without diagnosing', () => {
    const r = resolve([
      row(0, { hrv: 40, sleepHours: 5 }),
      row(1, { hrv: 40 }),
      ...history.slice(2)
    ])
    expect(trend(r).status).toBe('persistent_adverse')
    expect(r.decision).toBe('reduce')
    expect(assessTrainingPrescription(snapshot(r), [session]).violations).toContainEqual(
      expect.objectContaining({ rule: 'personal_readiness', severity: 'block' })
    )
    const noSubjective = resolve([row(0, { hrv: 40 }), row(1, { hrv: 40 }), ...history.slice(2)])
    expect(noSubjective.decision).toBe('monitor')
  })
  it('prioritizes poor athlete reports despite usual sensors and shows conflict and a proposal', () => {
    const r = resolve([row(0, { fatigue: 8, soreness: 7 }), ...history.slice(1)])
    expect(r.decision).toBe('reduce')
    expect(r.conflicts[0]).toContain('sensors are usual')
    const advice = applyReadinessAdvice(
      { recommendation: 'proceed', reasoning: 'You are fresh.' },
      r,
      session
    )
    expect(advice.recommendation).toBe('reduce_intensity')
    expect(advice.reasoning).not.toContain('You are fresh')
    expect(advice.suggested_modifications).toMatchObject({
      new_type: 'Ride',
      intensity: 'easy',
      new_duration_min: 30
    })
    expect(advice).toHaveProperty('readiness_application.status', 'advice_only')
    expect(assessTrainingPrescription(snapshot(r), [{ ...session, hard: false }]).accepted).toBe(
      true
    )
  })
  it('records subjective zero faithfully and does not mistake missing or invalid sensors for normal', () => {
    const r = resolve([
      row(0, {
        hrv: 0,
        restingHr: null,
        sleepHours: 0,
        recoveryScore: 0,
        fatigue: 0,
        stress: null,
        soreness: NaN,
        motivation: null
      })
    ])
    expect(trend(r).latest).toBeNull()
    expect(trend(r).status).toBe('insufficient')
    expect(r.subjective.find((s) => s.metric === 'fatigue')?.value).toBe(0)
    expect(r.recoveryScores[0]?.value).toBe(0)
    expect(r.uncertainty).toContain('stress: missing today')
  })
  it('does not mistake device stress or unknown stress provenance for athlete feedback', () => {
    expect(resolve([row(0, { stress: 9 }), ...history.slice(1)]).decision).toBe('usual')
    expect(resolve([row(0, { stress: 9 }, 'manual'), ...history.slice(1)]).decision).toBe('reduce')
    const r = resolve([
      row(0, { stress: 9, history: [], lastSource: 'manual' }),
      ...history.slice(1)
    ])
    expect(r.subjective.find((s) => s.metric === 'stress')?.value).toBeNull()
  })
  it('requires explicit easy RPE instructions without competing intensity targets', () => {
    const easy = { steps: [{ intent: 'easy', primaryTarget: 'rpe', rpe: 3, duration: 900 }] }
    expect(isExplicitEasyReadinessStructure(easy)).toBe(true)
    expect(isExplicitEasyReadinessStructure({ steps: [{ ...easy.steps[0], rpe: 8 }] })).toBe(false)
    expect(
      isExplicitEasyReadinessStructure({
        steps: [{ ...easy.steps[0], power: { value: 400, units: 'w' } }]
      })
    ).toBe(false)
  })
  it('limits easy volume as well as intensity when athlete readiness is poor', () => {
    const r = resolve([row(0, { fatigue: 8 })])
    expect(
      assessTrainingPrescription(snapshot(r), [{ ...session, durationSec: 3600, hard: false }])
        .violations
    ).toContainEqual(expect.objectContaining({ rule: 'personal_readiness' }))
  })
  it('keeps rMSSD and SDNN separate with no substitution', () => {
    const r = resolve(history.map((r) => ({ ...r, hrv: null, hrvSdnn: 50 })))
    expect(trend(r, 'hrv').baseline.samples).toBe(0)
    expect(trend(r, 'hrvSdnn').baseline.samples).toBe(28)
  })
  it('does not pool different providers or recovery scores', () => {
    const r = resolve([
      row(0, { hrv: 20, recoveryScore: 10 }, 'fitbit'),
      row(1, { recoveryScore: 95 }),
      ...history.slice(2)
    ])
    expect(trend(r).baseline.samples).toBe(0)
    expect(trend(r).excludedSamples).toBe(30)
    expect(r.recoveryScores.map((s) => s.origin?.source)).toEqual(['fitbit', 'whoop'])
    expect(r).not.toHaveProperty('averageRecoveryScore')
  })
  it('separates device/protocol changes even within a provider', () => {
    const withOrigin = (r: ReadinessWellness, device: string) => ({
      ...r,
      rawJson: { _readinessProvenance: { hrv: { source: 'whoop', device, method: 'overnight' } } }
    })
    const r = resolve([
      withOrigin(row(0, { hrv: 20 }), 'new'),
      ...history.slice(1).map((r) => withOrigin(r, 'old'))
    ])
    expect(trend(r).baseline.samples).toBe(0)
    expect(trend(r).origin?.device).toBe('new')
  })
  it('declines to infer sources from a legacy mixed row lastSource', () => {
    const r = resolve(
      history.map((r) => ({
        ...r,
        lastSource: 'intervals',
        history: [
          { source: 'whoop', changes: 'created' },
          { source: 'intervals', changes: { stress: { new: 5 } } }
        ]
      }))
    )
    expect(trend(r).baseline.samples).toBe(0)
    expect(trend(r).origin).toBeNull()
  })
  it('does not use stale, sparse or future observations to authorize changes', () => {
    expect(trend(resolve(history.slice(1))).status).toBe('insufficient')
    expect(trend(resolve(history.slice(0, 5))).status).toBe('insufficient')
    const r = resolve([row(-1, { fatigue: 10, tags: 'Sick' }), ...history.slice(1)])
    expect(r.decision).toBe('unknown')
    expect(trend(r).latest?.ageDays).toBe(1)
  })
  it('uses explicitly logged illness, but not incidental words in notes or negated text', () => {
    expect(resolve([row(0, { tags: 'Sick' })]).decision).toBe('rest')
    expect(
      resolve(history, {
        events: [
          { id: 'ill', startDate: date(1), endDate: date(-1), category: 'SICK', title: 'Illness' }
        ]
      }).decision
    ).toBe('rest')
    const r = resolve(history, {
      checkins: [
        {
          id: 'c',
          date: date(0),
          questions: [{ text: 'How are you?', answer: 'Not sick but very tired' }],
          userNotes: 'No illness'
        }
      ]
    })
    expect(r.decision).toBe('usual')
    expect(r.checkins[0]?.answers[0]?.answer).toContain('very tired')
    expect(formatReadinessForPrompt(r)).toContain(
      'Check-in answers can justify proposing a reduction'
    )
  })
  it('proposes zero-dose rest for illness without mutating the calendar', () => {
    const r = resolve([row(0, { tags: 'Sick' })])
    const advice = applyReadinessAdvice(
      { recommendation: 'proceed', reasoning: 'Good sensors' },
      r,
      session
    )
    expect(advice.suggested_modifications).toEqual(
      expect.objectContaining({ new_type: 'Rest', new_duration_min: 0, new_tss: 0 })
    )
    expect(assessTrainingPrescription(snapshot(r), [session]).accepted).toBe(false)
    expect(
      assessTrainingPrescription(snapshot(r), [
        { ...session, type: 'Rest', durationSec: 0, tss: 0 }
      ]).accepted
    ).toBe(true)
    expect(session.durationSec).toBe(1800)
  })
  it('expires current advice and preserves locked/completed sessions', () => {
    const r = resolve([row(0, { fatigue: 8 })])
    const assessment = assessTrainingPrescription(snapshot(r), [{ ...session, date: '2026-10-11' }])
    expect(assessment.violations.some((v) => v.rule === 'personal_readiness')).toBe(false)
    const s = snapshot(r)
    s.planned = [{ ...session, protected: true }]
    expect(assessTrainingPrescription(s, [{ ...session, hard: false }]).violations).toContainEqual(
      expect.objectContaining({ rule: 'protected_session' })
    )
  })
})
