import { describe, expect, it } from 'vitest'
import { resolveWorkoutChartSportSettings } from '../../../../app/utils/workoutChartContext'
import { resolvePhysiologyReferences } from '../../../../shared/physiology-references'

describe('frozen chart physiology', () => {
  it('keeps frozen unknown references unknown after live settings improve', () => {
    const effective = resolveWorkoutChartSportSettings(
      {
        structuredWorkout: {},
        lastGenerationSettingsSnapshot: {
          thresholds: { ftp: null, lthr: null, maxHr: null, thresholdPace: null },
          zones: { power: [], heartRate: [], pace: [] }
        }
      },
      { ftp: 300, lthr: 170, maxHr: 190, thresholdPace: 3 }
    )
    expect([effective.ftp, effective.lthr, effective.maxHr, effective.thresholdPace]).toEqual([
      0, 0, 0, 0
    ])
  })

  it('renders standalone templates with accepted references from their provenance', () => {
    const effective = resolveWorkoutChartSportSettings(
      {
        physiology: resolvePhysiologyReferences({
          workoutType: 'Ride',
          sportSettings: { ftp: 280 }
        })
      },
      { ftp: 300 }
    )
    expect(effective.ftp).toBe(280)
  })
})
