import { describe, expect, it } from 'vitest'
import { resolveStructureTargeting } from '../../../trigger/utils/structure-generation-targeting'
import {
  applyTargetPolicyToStep,
  applyStepIntentGuard
} from '../../../trigger/utils/workout-targeting'
import {
  adaptStructuredWorkout,
  createZoneProfileSnapshot
} from '../../../shared/structured-workout-contract'
import { validateCanonicalForDestination } from '../../../shared/workout-support-matrix'

describe('swim structure targeting', () => {
  it('generates exportable swim targets from an imported power-first profile', () => {
    const { targetPolicy } = resolveStructureTargeting(
      { loadPreference: 'POWER_HR_PACE', lthr: 170 },
      'Swim'
    )
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
    const result = resolveStructureTargeting({ thresholdPace: 1.2 }, 'OpenWaterSwim', {
      targetPolicy: { primaryMetric: 'pace', strictPrimary: false }
    })
    expect(result.targetPolicy.primaryMetric).toBe('pace')
    expect(result.targetPolicy.fallbackOrder).not.toContain('power')
    expect(result.priorityText).not.toContain('POWER')
  })

  it('preserves power targeting for cycling', () => {
    expect(
      resolveStructureTargeting({ loadPreference: 'POWER_HR_PACE', ftp: 250 }, 'Ride').targetPolicy
        .primaryMetric
    ).toBe('power')
  })
})

describe('beginner structure targeting', () => {
  it('removes uncalibrated metrics from a strict HR-first running policy', () => {
    const result = resolveStructureTargeting(
      { loadPreference: 'HR_PACE_POWER', lthr: null, ftp: null, thresholdPace: null },
      'Run'
    )
    expect(result.targetPolicy).toMatchObject({
      primaryMetric: 'rpe',
      fallbackOrder: ['rpe'],
      strictPrimary: true,
      allowMixedTargetsPerStep: false
    })
    expect(result.priorityText).toBe('RPE')
    const step: any = {
      type: 'Active',
      intent: 'easy',
      durationSeconds: 1200,
      heartRate: { range: { start: 0.73, end: 0.77 }, units: 'LTHR' },
      rpe: 3
    }
    applyTargetPolicyToStep(step, result.targetPolicy)
    expect(step).toMatchObject({ primaryTarget: 'rpe', rpe: 3, durationSeconds: 1200 })
    expect(step.heartRate).toBeUndefined()
  })

  it('uses the next calibrated preference rather than inventing HR thresholds', () => {
    const result = resolveStructureTargeting(
      { loadPreference: 'HR_PACE_POWER', thresholdPace: 3 },
      'Run'
    )
    expect(result.targetPolicy.primaryMetric).toBe('pace')
    expect(result.targetPolicy.fallbackOrder).toEqual(['pace', 'rpe'])
  })

  it('accepts real legacy user thresholds while preserving sport-specific precedence', () => {
    const result = resolveStructureTargeting({ loadPreference: 'HR_PACE_POWER' }, 'Run', null, {
      lthr: 170
    })
    expect(result.targetPolicy.primaryMetric).toBe('heartRate')
  })

  it('keeps a per-workout effort-only override even when HR is calibrated', () => {
    const result = resolveStructureTargeting({ lthr: 170 }, 'Run', {
      targetPolicy: { primaryMetric: 'rpe', strictPrimary: true, allowMixedTargetsPerStep: false }
    })
    const step: any = { type: 'Active', intent: 'easy', rpe: 3, heartRate: { value: 0.75 } }
    applyTargetPolicyToStep(step, result.targetPolicy)
    expect(step).toMatchObject({ primaryTarget: 'rpe', rpe: 3 })
    expect(step.heartRate).toBeUndefined()
  })

  it('supplies an easy effort when the model emits HR only for a no-watch run', () => {
    const result = resolveStructureTargeting({}, 'Run')
    const step: any = { type: 'Active', intent: 'easy', heartRate: { value: 0.75 } }
    applyTargetPolicyToStep(step, result.targetPolicy)
    expect(step).toMatchObject({ primaryTarget: 'rpe', rpe: 3 })
    expect(step.heartRate).toBeUndefined()
  })
})

describe('effort normalization', () => {
  it('preserves an easy RPE cue through the intent guard without treating it as percent HR', () => {
    const step: any = { type: 'Active', intent: 'easy', primaryTarget: 'rpe', rpe: 3 }
    applyStepIntentGuard(step, { ftp: 0, lthr: 0, thresholdPace: 0 })
    expect(step).toMatchObject({ intent: 'easy', rpe: 3 })
  })

  it('does not raise a watch-free warmup effort to a percentage-derived RPE', () => {
    const step: any = { type: 'Warmup', primaryTarget: 'rpe', rpe: 2 }
    applyStepIntentGuard(step, { ftp: 0, lthr: 0, thresholdPace: 0 })
    expect(step).toMatchObject({ intent: 'warmup', rpe: 2 })
  })
})

describe('RPE-scale safety', () => {
  it.each([
    ['Warmup', 'warmup', 10, 3],
    ['Active', 'easy', 10, 4],
    ['Active', 'easy', -2, 2],
    ['Active', 'threshold', 7, 7]
  ])('bounds %s / %s effort %s using the RPE scale', (type, intent, rpe, expected) => {
    const step: any = { type, intent, primaryTarget: 'rpe', rpe }
    applyStepIntentGuard(step, { ftp: 0, lthr: 0, thresholdPace: 0 })
    expect(step.rpe).toBe(expected)
    expect(step.intent).toBe(intent)
  })

  it('replaces a malformed numerical RPE with a usable easy effort', () => {
    const step: any = { type: 'Active', intent: 'easy', rpe: Number.NaN }
    applyTargetPolicyToStep(step, resolveStructureTargeting({}, 'Run').targetPolicy)
    applyStepIntentGuard(step, { ftp: 0, lthr: 0, thresholdPace: 0 })
    expect(step.rpe).toBe(3)
  })
})
