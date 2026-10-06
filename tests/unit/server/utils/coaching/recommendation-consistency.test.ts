import { describe, expect, it } from 'vitest'
import {
  applyRecommendationConsistency,
  checkRationaleGrounding,
  toRecommendationType
} from '../../../../../server/utils/coaching/recommendation-consistency'

const plannedRide = { title: 'Endurance Ride', type: 'Ride', durationSec: 3600, tss: 47 }

describe('checkRationaleGrounding', () => {
  it('removes duration/TSS figures that contradict the plan on screen', () => {
    // The dashboard showed "60 min · 47 TSS · Ride" while the text said 45 min / 37 TSS.
    const result = checkRationaleGrounding(
      'Your HRV is down, so keep it to a short, easy 45-minute run (37 TSS) today.',
      [plannedRide]
    )
    expect(result.text).toBe('Your HRV is down, so keep it to a short, easy run today.')
    expect(result.adjusted).toBe(true)
    expect(result.issues).toEqual([
      { kind: 'tss', value: 37, text: '37 TSS', stripped: true },
      { kind: 'duration', value: 45, text: '45-minute', stripped: true }
    ])
  })

  it('keeps figures that match the plan exactly (or within 1)', () => {
    const text = 'Your planned 60-minute ride (47 TSS) is fine — about 60 min at endurance pace.'
    const result = checkRationaleGrounding(text, [plannedRide])
    expect(result).toEqual({ text, issues: [], adjusted: false })
    expect(checkRationaleGrounding('A 61-minute ride (46 TSS).', [plannedRide]).issues).toEqual([])
  })

  it('allows extra grounded values such as the suggested modification', () => {
    const text = 'Shorten it to a 40-minute easy ride (30 TSS).'
    const result = checkRationaleGrounding(text, [plannedRide], { durationsMin: [40], tss: [30] })
    expect(result.issues).toEqual([])
    expect(result.text).toBe(text)
  })

  it('only flags figures it cannot remove cleanly', () => {
    const text = 'Ride for 45 minutes and aim for TSS 37.'
    const result = checkRationaleGrounding(text, [plannedRide])
    expect(result.text).toBe(text)
    expect(result.adjusted).toBe(false)
    expect(result.issues.map((issue) => [issue.kind, issue.value, issue.stripped])).toEqual([
      ['duration', 45, false],
      ['tss', 37, false]
    ])
  })

  it('leaves non-session numbers alone (sleep, fuelling windows)', () => {
    const text =
      'You slept 5.5 hours (5.5 h), so eat within 30 minutes after a 30-minute window of rest.'
    const result = checkRationaleGrounding(text, [plannedRide])
    expect(result.text).toBe(text)
    expect(result.issues.every((issue) => !issue.stripped)).toBe(true)
  })
})

describe('toRecommendationType', () => {
  it('maps planned types to the recommendation vocabulary', () => {
    expect(toRecommendationType('Run')).toBe('Run')
    expect(toRecommendationType('TrailRun')).toBe('Run')
    expect(toRecommendationType('VirtualRide')).toBe('Ride')
    expect(toRecommendationType('WeightTraining')).toBe('Gym')
    expect(toRecommendationType('Rest')).toBe('Rest')
    expect(toRecommendationType('Yoga')).toBe(null)
  })
})

describe('applyRecommendationConsistency', () => {
  it('copies the real planned values into planned_workout', () => {
    const result = applyRecommendationConsistency({
      analysis: {
        recommendation: 'proceed',
        reasoning: 'Go ahead.',
        planned_workout: { original_title: 'Run', original_tss: 37, original_duration_min: 45 }
      },
      primaryPlannedWorkout: plannedRide,
      plannedWorkouts: [plannedRide]
    })
    expect(result.planned_workout).toEqual({
      original_title: 'Endurance Ride',
      original_tss: 47,
      original_duration_min: 60
    })
  })

  it('keeps the planned sport when a modification omits new_type', () => {
    const plannedRun = { title: 'Easy Run', type: 'Run', durationSec: 2400, tss: 33 }
    const result = applyRecommendationConsistency({
      analysis: {
        recommendation: 'modify',
        reasoning: 'Shorten it.',
        suggested_modifications: { new_duration_min: 30, new_tss: 25 }
      },
      primaryPlannedWorkout: plannedRun,
      plannedWorkouts: [plannedRun]
    })
    expect(result.suggested_modifications?.new_type).toBe('Run')
  })

  it('never lets an injury conflict end in "proceed"', () => {
    const plannedRun = { title: 'Easy Run', type: 'Run', durationSec: 2400, tss: 33 }
    const result = applyRecommendationConsistency({
      analysis: { recommendation: 'proceed', reasoning: 'You are fresh — enjoy it.' },
      primaryPlannedWorkout: plannedRun,
      plannedWorkouts: [plannedRun],
      injuryConflicts: [
        {
          injury: {
            bodyArea: 'achilles',
            side: 'LEFT',
            painLevel: 5,
            status: 'ACTIVE',
            onsetDate: '2026-09-28T00:00:00.000Z'
          },
          sport: 'run',
          sessionTitle: 'Easy Run',
          sessionType: 'Run'
        }
      ]
    })
    expect(result.recommendation).toBe('modify')
    expect(result.reasoning.startsWith('Your left achilles is logged at 5/10')).toBe(true)
    expect(result.reasoning).toContain('You are fresh — enjoy it.')
    expect((result as any).injury_guard).toMatchObject({ overridden: 'proceed' })
  })

  it('records a rationale_check when it had to adjust the text', () => {
    const result = applyRecommendationConsistency({
      analysis: { recommendation: 'proceed', reasoning: 'Enjoy a 45-minute run (37 TSS).' },
      primaryPlannedWorkout: plannedRide,
      plannedWorkouts: [plannedRide]
    })
    expect(result.reasoning).toBe('Enjoy a run.')
    expect((result as any).rationale_check.adjusted).toBe(true)
  })

  it('accepts figures from completed workouts', () => {
    const result = applyRecommendationConsistency({
      analysis: {
        recommendation: 'proceed',
        reasoning: "Yesterday's 90-minute long run (72 TSS) went well."
      },
      primaryPlannedWorkout: plannedRide,
      plannedWorkouts: [plannedRide],
      completedWorkouts: [{ title: 'Long Run', type: 'Run', durationSec: 5400, tss: 72 }]
    })
    expect(result.reasoning).toBe("Yesterday's 90-minute long run (72 TSS) went well.")
    expect((result as any).rationale_check).toBeUndefined()
  })
})
