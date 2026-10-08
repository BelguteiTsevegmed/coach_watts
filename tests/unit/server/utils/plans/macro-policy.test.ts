import { describe, expect, it } from 'vitest'
import { buildPlanProgression } from '../../../../../server/utils/plans/progression-policy'
import {
  buildMacroPlan,
  macroWeekPolicy,
  macroBlocks,
  macroWeekTargets
} from '../../../../../server/utils/plans/macro-policy'

const now = new Date('2026-10-05T00:00:00Z')
const start = new Date('2026-10-05T00:00:00Z')
const end = new Date('2026-12-27T00:00:00Z')
function progression(sport = 'Run', complete = true, active = true) {
  return buildPlanProgression({
    now,
    activityTypes: [sport],
    requestedVolumeMinutes: 240,
    availabilityMinutes: 240,
    historyCompleteness: complete ? 'COMPLETE' : 'UNKNOWN',
    workouts: active
      ? Array.from({ length: 12 }, (_, i) => ({
          id: `w-${i}`,
          type: sport,
          date: new Date(now.getTime() - (i * 2 + 1) * 86400000),
          durationSec: 4800,
          isDuplicate: false,
          tss: 60
        }))
      : []
  })
}
const event = (subType: string, date = end, priority = 'A', type = 'Run') => ({
  id: `${subType}-${priority}`,
  title: subType,
  type,
  subType,
  date,
  priority,
  distance: null,
  expectedDuration: null,
  terrain: 'Road',
  elevation: 0
})
function build(events = [event('Marathon')], extra: Record<string, unknown> = {}) {
  return buildMacroPlan({
    start,
    end,
    activityTypes: ['Run'],
    progression: progression(),
    requestedPhase: 'BASE',
    recoveryRhythm: 4,
    strategy: 'LINEAR',
    events,
    ...extra
  })
}

describe('event-aware macro calendar', () => {
  it.each([
    ['Running (5k)', 'run-5k', 1],
    ['Running (10k)', 'run-10k', 1],
    ['Half Marathon', 'run-half', 2],
    ['Marathon', 'run-marathon', 3]
  ])('resolves %s and places its taper on the actual event', (subType, kind, taperWeeks) => {
    const plan = build([event(subType)])
    expect(plan.events[0]).toMatchObject({ sport: 'run', kind, taperWeeks, priority: 'A' })
    const blocks = macroBlocks(plan)
    expect(blocks.reduce((n, b) => n + b.durationWeeks, 0)).toBe(12)
    expect(blocks.some((b) => b.focus === 'SWEET_SPOT')).toBe(false)
    const weeks = Array.from({ length: 12 }, (_, i) => macroWeekPolicy(plan, i + 1))
    expect(weeks.filter((w) => ['TAPER', 'RACE'].includes(w.kind))).toHaveLength(taperWeeks)
    expect(weeks[11]).toMatchObject({ kind: 'RACE', qualityDoseFactor: 0.25, frequencyFactor: 1 })
  })
  it.each([
    'Road Race',
    'Criterium',
    'Time Trial',
    'Gran Fondo',
    'MTB (XC)',
    'MTB (Marathon)',
    'Gravel',
    'Cyclocross',
    'Social Ride',
    'Cyclotour'
  ])('resolves the exposed cycling type %s', (subType) => {
    const plan = build([event(subType, end, 'A', 'Ride')], {
      activityTypes: ['Ride'],
      progression: progression('Ride')
    })
    expect(plan.events[0]).toMatchObject({ sport: 'ride', supported: true })
    expect(plan.warnings.some((w) => w.includes('unsupported'))).toBe(false)
  })
  it('does not mistake MTB marathon for running or trail races for road marathons', () => {
    expect(build([event('MTB (Marathon)', end, 'A', 'Ride')]).events[0]?.sport).toBe('ride')
    const trail = build(
      [event('Marathon', end, 'A', 'Run')].map((e) => ({ ...e, terrain: 'Trail' }))
    )
    expect(trail.events[0]?.supported).toBe(false)
  })
  it('keeps unknown event duration explicit and includes the target day in a partial last week', () => {
    const plan = build([event('Running (5k)', new Date('2026-11-02Z'))], {
      end: new Date('2026-11-02Z')
    })
    expect(plan.totalWeeks).toBe(5)
    expect(macroWeekPolicy(plan, 5)).toMatchObject({
      days: 1,
      eventLoadMinutes: null,
      kind: 'RACE'
    })
  })
  it('keeps recovery on the global timeline even when blocks are shorter than the rhythm', () => {
    const plan = build([])
    expect(macroWeekPolicy(plan, 4).isRecovery).toBe(true)
    expect(macroWeekPolicy(plan, 8).isRecovery).toBe(true)
    expect(macroWeekPolicy(plan, 12).isRecovery).toBe(true)
  })
  it.each(['BUILD', 'PEAK'])(
    'downgrades %s when history is missing and never automatically adds hard work',
    (requestedPhase) => {
      const plan = build(undefined, {
        progression: progression('Run', false, false),
        requestedPhase
      })
      expect(plan.resolvedPhase).toBe('BASE')
      expect(plan.capacityVerified).toBe(false)
      expect(plan.warnings.join(' ')).toMatch(/history|capacity/)
      expect(macroWeekPolicy(plan, 6).qualityDoseFactor).toBe(0)
    }
  )
  it('honours a supported advanced start only with comparable current exposure', () => {
    expect(build(undefined, { requestedPhase: 'BUILD' }).resolvedPhase).toBe('BUILD')
    expect(build(undefined, { requestedPhase: 'PEAK' }).resolvedPhase).toBe('PEAK')
  })
  it('reports a short preparation timeline as a goal adjustment', () => {
    const plan = build([event('Marathon', new Date('2026-11-01Z'))], {
      end: new Date('2026-11-01Z')
    })
    expect(plan.warnings.join(' ')).toMatch(/timeline|preparation/)
    expect(plan.goalAdjustmentRequired).toBe(true)
  })
  it('places A, B, and C events and post-event transition without resetting recovery', () => {
    const plan = build([
      event('Running (10k)', new Date('2026-10-25Z'), 'C'),
      event('Half Marathon', new Date('2026-11-08Z'), 'B'),
      event('Marathon', new Date('2026-11-29Z'), 'A'),
      event('Running (5k)', end, 'A')
    ])
    expect(macroWeekPolicy(plan, 3).kind).toBe('TRAINING_EVENT')
    expect(macroWeekPolicy(plan, 5).kind).toBe('MINI_TAPER')
    expect(macroWeekPolicy(plan, 8).kind).toBe('RACE')
    expect(macroWeekPolicy(plan, 9).kind).toBe('TRANSITION')
    expect(macroWeekPolicy(plan, 12).kind).toBe('RACE')
  })
  it('reports overlapping important events rather than promising both peaks', () => {
    const plan = build([event('Marathon', new Date('2026-12-20Z')), event('Running (5k)', end)])
    expect(plan.goalAdjustmentRequired).toBe(true)
    expect(plan.warnings.join(' ')).toMatch(/overlap|conflict/)
  })
  it('reports a taper that overlaps recovery even when race dates are three weeks apart', () => {
    const plan = build([event('Marathon', new Date('2026-12-06Z')), event('Marathon', end)])
    expect(plan.warnings.join(' ')).toMatch(/overlap/)
  })
  it('uses a conservative visible fallback for unsupported events', () => {
    const plan = build([event('Ultra')])
    expect(plan.events[0]).toMatchObject({ supported: false, kind: 'unsupported' })
    expect(plan.goalAdjustmentRequired).toBe(true)
    expect(plan.warnings.join(' ')).toMatch(/unsupported/)
  })
  it('freezes the loading allowance during taper and keeps the event separate from training', () => {
    const plan = build([{ ...event('Marathon'), expectedDuration: 3 }])
    const p = progression()
    const first = macroWeekTargets(p, macroWeekPolicy(plan, 10), 7)
    const race = macroWeekTargets(p, macroWeekPolicy(plan, 12), 7)
    expect(first.volumeTargetMinutes).toBe(180)
    expect(race.volumeTargetMinutes).toBe(240)
    expect(race.trainingVolumeMinutes).toBe(60)
    expect(race.eventLoadMinutes).toBe(180)
    expect(race.eventExceedsCapacity).toBe(false)
  })
  it('does not hide event load that exceeds capacity behind a taper factor', () => {
    const plan = build([{ ...event('Marathon'), expectedDuration: 5 }], {
      progression: progression('Run', true, false)
    })
    const targets = macroWeekTargets(progression('Run', true, false), macroWeekPolicy(plan, 12), 1)
    expect(targets.eventExceedsCapacity).toBe(true)
    expect(targets.trainingVolumeMinutes).toBe(0)
    expect(targets.volumeTargetMinutes).toBeLessThanOrEqual(60)
  })
  it('fits a known event on a partial final week without treating its dose as one seventh of capacity', () => {
    const raceDate = new Date('2026-12-28Z')
    const plan = build([{ ...event('Marathon', raceDate), expectedDuration: 3 }], { end: raceDate })
    const targets = macroWeekTargets(progression(), macroWeekPolicy(plan, 13), 7)
    expect(targets.eventExceedsCapacity).toBe(false)
    expect(targets.eventLoadMinutes).toBe(180)
    expect(targets.trainingVolumeMinutes).toBeLessThanOrEqual(14)
  })
  it('requires repeated exposure in the event sport, not cycling records plus a single long run', () => {
    const p = buildPlanProgression({
      now,
      activityTypes: ['Run', 'Ride'],
      requestedVolumeMinutes: 240,
      historyCompleteness: 'COMPLETE',
      workouts: [
        {
          id: 'run',
          type: 'Run',
          date: new Date('2026-10-04Z'),
          durationSec: 8 * 3600,
          isDuplicate: false
        },
        ...Array.from({ length: 12 }, (_, i) => ({
          id: `ride-${i}`,
          type: 'Ride',
          date: new Date(now.getTime() - (i * 2 + 1) * 86400000),
          durationSec: 3600,
          isDuplicate: false
        }))
      ]
    })
    expect(build(undefined, { progression: p, requestedPhase: 'BUILD' }).resolvedPhase).toBe('BASE')
  })
  it('downgrades an advanced phase for a distant start even when the snapshot was active', () => {
    const plan = build(undefined, { start: new Date('2026-11-02Z'), requestedPhase: 'PEAK' })
    expect(plan.resolvedPhase).toBe('BASE')
    expect(plan.capacityVerified).toBe(false)
  })
  it('never adds race-intensity work to an unsupported event fallback', () => {
    const plan = build([event('Ultra')])
    expect(macroWeekPolicy(plan, 6).qualityDoseFactor).toBe(0)
    expect(macroWeekPolicy(plan, 6).focus).toBe('AEROBIC_ENDURANCE')
  })
})
