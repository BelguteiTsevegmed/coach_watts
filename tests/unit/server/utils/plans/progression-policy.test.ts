import { describe, expect, it } from 'vitest'
import {
  buildPlanProgression,
  calculateProgressionWeekTargets
} from '../../../../../server/utils/plans/progression-policy'

const now = new Date('2026-10-07T12:00:00Z')
const run = (daysAgo: number, minutes: number, extra = {}) => ({
  id: `run-${daysAgo}`,
  type: 'Run',
  durationSec: minutes * 60,
  date: new Date(now.getTime() - daysAgo * 86400000),
  isDuplicate: false,
  ...extra
})
const history = [run(2, 60), run(9, 60), run(16, 60), run(23, 60)]
const build = (workouts = history, extra = {}) =>
  buildPlanProgression({
    now,
    workouts,
    activityTypes: ['Run'],
    requestedVolumeMinutes: 450,
    historyCompleteness: 'COMPLETE',
    ...extra
  })
const targets = (progression: ReturnType<typeof build>, extra = {}) =>
  calculateProgressionWeekTargets(progression, {
    blockType: 'BASE',
    weekNumber: 1,
    blockDurationWeeks: 4,
    isRecovery: false,
    loadingWeekOrdinal: 1,
    ...extra
  })

describe('sport-specific initial progression', () => {
  it('uses 60 minutes of recent running to prescribe 72, with availability as a ceiling', () => {
    const context = build()
    expect(targets(context)).toMatchObject({
      volumeTargetMinutes: 72,
      sportVolumeTargets: { run: 72 }
    })
    expect(context.requestedVolumeMinutes).toBe(450)
    expect(context.sports.run?.recentWeeklyAvgMinutes).toBe(60)
    expect(context.explanations.join(' ')).toContain('reduced')
  })
  it('does not spend riding, swimming or strength history on running', () => {
    const mixed = [
      ...history,
      ...['Ride', 'Swim', 'Gym'].map((type) => run(1, 600, { id: type, type }))
    ]
    expect(targets(build(mixed)).sportVolumeTargets.run).toBe(72)
    const multi = targets(build(mixed, { activityTypes: ['Run', 'Ride'] }))
    expect(multi.sportVolumeTargets.run).toBeLessThanOrEqual(72)
  })
  it('excludes duplicates, future and out-of-window activities and records coverage', () => {
    const context = build([
      ...history,
      run(1, 600, { isDuplicate: true }),
      run(-1, 600),
      run(40, 600),
      history[0]!
    ])
    expect(context.sports.run?.recentWeeklyAvgMinutes).toBe(60)
    expect(context.history).toMatchObject({
      completeness: 'COMPLETE',
      source: 'ATHLETE_CONFIRMED',
      includedWorkouts: 4
    })
    expect(context.sports.run?.lastWorkoutAt).toBe('2026-10-05T12:00:00.000Z')
  })
  it('distinguishes unknown imports from confirmed inactivity without inventing a baseline', () => {
    const missing = build([], { historyCompleteness: 'UNKNOWN' })
    const inactive = build([])
    expect(missing.sports.run?.status).toBe('UNKNOWN_HISTORY')
    expect(inactive.sports.run?.status).toBe('INACTIVE')
    expect(targets(missing).volumeTargetMinutes).toBe(60)
    expect(targets(inactive).volumeTargetMinutes).toBe(60)
    expect(missing.sports.run?.recentWeeklyAvgMinutes).toBe(0)
  })
  it('tightens the allowance after a recent break and records incomplete history', () => {
    const interrupted = build([run(15, 60), run(22, 60)])
    expect(targets(interrupted).volumeTargetMinutes).toBe(18)
    expect(interrupted.sports.run?.status).toBe('RETURNING')
    const partial = build(history, { historyCompleteness: 'UNKNOWN' })
    expect(targets(partial).volumeTargetMinutes).toBeLessThanOrEqual(60)
    expect(partial.history.completeness).toBe('UNKNOWN')
  })
  it('keeps total and sport ceilings below availability, then applies recovery and taper', () => {
    const context = build(history, { availabilityMinutes: 50 })
    expect(targets(context).volumeTargetMinutes).toBe(50)
    expect(targets(context, { isRecovery: true }).volumeTargetMinutes).toBe(30)
    expect(targets(context, { blockType: 'PEAK', blockDurationWeeks: 2 }).volumeTargetMinutes).toBe(
      37
    )
    expect(targets(build(history, { requestedVolumeMinutes: 0 })).volumeTargetMinutes).toBe(0)
  })
  it('records policy parameters and explains a timeline too short to reach the request', () => {
    const context = build(history, { planWeeks: 4 })
    expect(context.version).toBe('sport-progression-v1')
    expect(context.explanations.join(' ')).toContain('timeline')
    expect(targets(context, { loadingWeekOrdinal: 2 }).sportVolumeTargets.run).toBe(79)
    expect(targets(JSON.parse(JSON.stringify(context)))).toEqual(targets(context))
  })
})

it('subtracts preserved sessions from their own sport and the total remaining budget', async () => {
  const { remainingProgressionBudgets } =
    await import('../../../../../server/utils/plans/progression-policy')
  expect(
    remainingProgressionBudgets(200, { run: 72, ride: 128 }, [
      { type: 'Run', durationSec: 30 * 60 }
    ])
  ).toEqual({ volumeTargetMinutes: 170, sportVolumeTargets: { run: 42, ride: 128 } })
})

it('uses sport-specific observed TSS/hour only with adequate samples and coverage', () => {
  const rows = history.map((w) => ({ ...w, tss: 80 }))
  const context = build(rows)
  expect(context.sports.run?.tssEstimate).toMatchObject({
    perHour: 80,
    source: 'sport_history',
    sampleCount: 4,
    coverage: 1
  })
  expect(targets(context).tssTarget).toBe(96)
  const sparse = build(history.map((w, index) => ({ ...w, tss: index === 0 ? 80 : null })))
  expect(sparse.sports.run?.tssEstimate?.source).toBe('coarse_default')
  expect(targets(sparse).tssTarget).toBe(60)
})
