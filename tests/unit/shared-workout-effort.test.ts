import { describe, expect, it } from 'vitest'
import { getWorkoutEffortProfile } from '../../shared/workout-effort'

describe('effort-only presentation model', () => {
  it('uses actual timed effort instead of a default physiological percentage', () => {
    const profile = getWorkoutEffortProfile({
      steps: [
        { name: 'Warmup', durationSeconds: 300, rpe: 2 },
        { name: 'Easy', durationSeconds: 600, rpe: 3, notes: 'Full sentences' },
        { name: 'Cooldown', durationSeconds: 300, rpe: 2 }
      ]
    })!
    expect(profile.averageRpe).toBe(2.5)
    expect(profile.rows[1]).toMatchObject({ rpe: 3, durationSeconds: 600, notes: 'Full sentences' })
  })

  it('retains repeat counts and duration weighting for nested blocks', () => {
    const profile = getWorkoutEffortProfile({
      steps: [
        {
          reps: 3,
          steps: [
            { name: 'Run', durationSeconds: 120, rpe: 4 },
            { name: 'Walk', durationSeconds: 60, rpe: 2 }
          ]
        }
      ]
    })!
    expect(profile.rows.map((row) => row.repetitions)).toEqual([3, 3])
    expect(profile.averageRpe).toBeCloseTo(10 / 3)
  })

  it('leaves calibrated or mixed physiological targets on their existing view', () => {
    expect(getWorkoutEffortProfile({ steps: [{ rpe: 3, heartRate: { value: 0.75 } }] })).toBeNull()
    expect(getWorkoutEffortProfile({ steps: [{ rpe: 3 }, { pace: { value: 0.8 } }] })).toBeNull()
  })
})
