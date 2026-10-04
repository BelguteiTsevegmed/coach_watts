import { describe, expect, it } from 'vitest'
import { detectRecommendationPlanDrift } from '../../../../server/utils/recommendation-guardrails'

const snapshot = {
  id: 'pw-1',
  date: '2026-10-04T00:00:00.000Z',
  title: 'Easy Run',
  type: 'Run',
  durationSec: 2700,
  tss: 37,
  updatedAt: '2026-10-04T05:00:00.000Z'
}
const analysisJson = { guardrails: { targetPlannedWorkout: snapshot } }

describe('detectRecommendationPlanDrift', () => {
  it('is unchanged when the planned workout still matches', () => {
    expect(
      detectRecommendationPlanDrift({
        analysisJson,
        todayWorkouts: [{ ...snapshot, durationSec: 2730, tss: 37.4 }]
      })
    ).toEqual({ changed: false, reason: null })
  })

  it('detects a workout replaced by a different session (e.g. 60 min ride)', () => {
    expect(
      detectRecommendationPlanDrift({
        analysisJson,
        todayWorkouts: [{ ...snapshot, type: 'Ride', durationSec: 3600, tss: 47 }]
      })
    ).toEqual({ changed: true, reason: 'workout_changed' })
  })

  it('detects a removed workout and a workout added after a rest-day recommendation', () => {
    expect(
      detectRecommendationPlanDrift({
        analysisJson,
        todayWorkouts: [{ id: 'pw-2', type: 'Ride', durationSec: 3600, tss: 47 }]
      })
    ).toEqual({ changed: true, reason: 'workout_removed' })
    expect(
      detectRecommendationPlanDrift({
        analysisJson: { guardrails: { targetPlannedWorkout: null } },
        todayWorkouts: [{ id: 'pw-2', type: 'Ride', durationSec: 3600, tss: 47 }]
      })
    ).toEqual({ changed: true, reason: 'workout_added' })
  })

  it('treats the accepted modification as the expected state', () => {
    expect(
      detectRecommendationPlanDrift({
        analysisJson: {
          ...analysisJson,
          suggested_modifications: { new_type: 'Run', new_duration_min: 30, new_tss: 22 }
        },
        userAccepted: true,
        todayWorkouts: [{ ...snapshot, durationSec: 1800, tss: 22 }]
      })
    ).toEqual({ changed: false, reason: null })
  })

  it('cannot judge legacy recommendations without guardrails', () => {
    expect(
      detectRecommendationPlanDrift({ analysisJson: {}, todayWorkouts: [{ id: 'x' }] })
    ).toEqual({ changed: false, reason: null })
  })
})
