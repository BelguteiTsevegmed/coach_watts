import { describe, expect, it } from 'vitest'
import { validateStructuredCoverage } from '../../../trigger/utils/structure-generation-coverage'

describe('structure generation duration coverage', () => {
  it('rejects a swim expansion before persistence when its duration belongs to a training week', () => {
    const result = validateStructuredCoverage({
      plannedDurationSec: 3600,
      actualDurationSec: 3900,
      steps: [{ type: 'Active', durationSeconds: 3900 }],
      workout: { type: 'Swim', title: 'Technique Swim', trainingWeekId: 'week-1' }
    })
    expect(result.valid).toBe(false)
    expect(result.reason).toContain('duration overshoot')
  })

  it('accepts a swim within its allocated time even when preserving a structure', () => {
    expect(
      validateStructuredCoverage({
        plannedDurationSec: 3600,
        actualDurationSec: 3600,
        steps: [{ type: 'Active', durationSeconds: 3600 }],
        workout: { type: 'Swim', trainingWeekId: 'week-1' },
        preserveStructure: true
      }).valid
    ).toBe(true)
    expect(
      validateStructuredCoverage({
        plannedDurationSec: 3600,
        actualDurationSec: 3700,
        steps: [{ type: 'Active', durationSeconds: 3700 }],
        workout: { type: 'Swim', trainingWeekId: 'week-1' },
        preserveStructure: true
      }).valid
    ).toBe(false)
  })

  it('retains sport-specific tolerance for standalone swims', () => {
    expect(
      validateStructuredCoverage({
        plannedDurationSec: 3600,
        actualDurationSec: 3900,
        steps: [{ type: 'Active', durationSeconds: 3900 }],
        workout: { type: 'Swim' }
      }).valid
    ).toBe(true)
  })
})
