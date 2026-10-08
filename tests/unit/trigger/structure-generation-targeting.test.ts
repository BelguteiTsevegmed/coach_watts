import { describe, expect, it } from 'vitest'
import { resolveStructureTargeting } from '../../../trigger/utils/structure-generation-targeting'
import { applyTargetPolicyToStep } from '../../../trigger/utils/workout-targeting'
import {
  adaptStructuredWorkout,
  createZoneProfileSnapshot
} from '../../../shared/structured-workout-contract'
import { validateCanonicalForDestination } from '../../../shared/workout-support-matrix'

describe('swim structure targeting', () => {
  it('generates exportable swim targets from an imported power-first profile', () => {
    const { targetPolicy } = resolveStructureTargeting({ loadPreference: 'POWER_HR_PACE' }, 'Swim')
    const step = { type: 'Active', durationSeconds: 600 } as any
    applyTargetPolicyToStep(step, targetPolicy)
    const canonical = adaptStructuredWorkout(
      { steps: [step] },
      {
        zoneProfileSnapshot: createZoneProfileSnapshot({})
      }
    )!
    expect(step.power).toBeUndefined()
    expect(step.heartRate).toBeDefined()
    expect(validateCanonicalForDestination(canonical, 'Swim', 'intervals')).toEqual([])
  })

  it('preserves explicit swim pace preferences while removing unsupported power fallbacks', () => {
    const result = resolveStructureTargeting({}, 'OpenWaterSwim', {
      targetPolicy: { primaryMetric: 'pace', strictPrimary: false }
    })
    expect(result.targetPolicy.primaryMetric).toBe('pace')
    expect(result.targetPolicy.fallbackOrder).not.toContain('power')
    expect(result.priorityText).not.toContain('POWER')
  })

  it('preserves power targeting for cycling', () => {
    expect(
      resolveStructureTargeting({ loadPreference: 'POWER_HR_PACE' }, 'Ride').targetPolicy
        .primaryMetric
    ).toBe('power')
  })
})
