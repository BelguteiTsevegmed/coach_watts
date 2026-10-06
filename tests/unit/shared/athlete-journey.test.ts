import { describe, expect, it } from 'vitest'
import { resolveTodayJourney } from '../../../shared/athlete-journey'

const baseline = { loading: false, checkinCompleted: true, planned: [], completed: [] }

describe('Today athlete journey', () => {
  it('starts with check-in, then prepares the first remaining session', () => {
    const day = { ...baseline, planned: [{ id: 'ride', type: 'Ride' }] }
    expect(resolveTodayJourney({ ...day, checkinCompleted: false }).phase).toBe('checkin')
    expect(resolveTodayJourney(day)).toMatchObject({ phase: 'prepare', nextWorkoutId: 'ride' })
  })

  it('continues a multi-session day instead of prematurely asking for reflection', () => {
    expect(
      resolveTodayJourney({
        ...baseline,
        planned: [
          { id: 'ride', type: 'Ride' },
          { id: 'run', type: 'Run' }
        ],
        completed: [{ id: 'actual-ride', plannedWorkoutId: 'ride' }]
      })
    ).toMatchObject({ phase: 'prepare', nextWorkoutId: 'run', remainingSessionCount: 1 })
  })

  it('offers reflection when a linked session is complete even without a morning check-in', () => {
    expect(
      resolveTodayJourney({
        ...baseline,
        checkinCompleted: false,
        planned: [{ id: 'ride', type: 'Ride', completed: true }],
        completed: [{ id: 'actual-ride', plannedWorkoutId: 'ride' }]
      })
    ).toMatchObject({ phase: 'reflect', reflectionWorkoutId: 'actual-ride' })
  })

  it('also allows reflection on an unplanned completed activity', () => {
    expect(resolveTodayJourney({ ...baseline, completed: [{ id: 'walk' }] }).phase).toBe('reflect')
  })

  it('acknowledges a completed planned session before its recorded activity arrives', () => {
    expect(
      resolveTodayJourney({
        ...baseline,
        planned: [{ id: 'ride', type: 'Ride', completed: true }]
      })
    ).toMatchObject({ phase: 'complete', reflectionWorkoutId: null })
  })

  it('distinguishes an explicit rest day from a day without a plan', () => {
    expect(
      resolveTodayJourney({ ...baseline, planned: [{ id: 'rest', type: 'Rest' }] }).phase
    ).toBe('rest')
    expect(
      resolveTodayJourney({ ...baseline, planned: [{ id: 'note', type: 'Note' }] }).phase
    ).toBe('unplanned')
    expect(resolveTodayJourney(baseline).phase).toBe('unplanned')
  })

  it('does not call a failed or unfinished fetch an empty day', () => {
    expect(resolveTodayJourney({ ...baseline, loading: true }).phase).toBe('loading')
    expect(resolveTodayJourney({ ...baseline, loadError: 'Offline' }).phase).toBe('error')
  })
})
